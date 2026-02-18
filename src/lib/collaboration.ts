/**
 * Multi-user collaboration for Wallnut projects.
 *
 * Provides:
 * - Role-based project sharing (owner / reviewer / viewer)
 * - Comments anchored to findings, tasks, or articles
 * - Change history / audit trail
 *
 * All functions gracefully degrade when Supabase is not configured.
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";
import { getCurrentUser } from "./supabase-storage";

// ============================================================
// Types
// ============================================================

export type ProjectRole = "owner" | "reviewer" | "viewer";

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  role: ProjectRole;
  invitedBy: string | null;
  createdAt: string;
}

export interface ProjectComment {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  content: string;
  targetType: "finding" | "task" | "article" | "general" | null;
  targetId: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectHistoryEntry {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  action: string;
  summary: string;
  diffData: Record<string, unknown> | null;
  createdAt: string;
}

// ============================================================
// Permission helpers
// ============================================================

export type CollaborationAction =
  | "view"
  | "edit"
  | "comment"
  | "manage_members"
  | "delete";

const ROLE_PERMISSIONS: Record<ProjectRole, CollaborationAction[]> = {
  owner: ["view", "edit", "comment", "manage_members", "delete"],
  reviewer: ["view", "edit", "comment"],
  viewer: ["view"],
};

export function canPerformAction(
  role: ProjectRole | null,
  action: CollaborationAction,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(action);
}

// ============================================================
// Members
// ============================================================

interface MemberRow {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  invited_by: string | null;
  created_at: string;
}

export async function getProjectMembers(
  projectId: string,
): Promise<ProjectMember[]> {
  if (!isSupabaseConfigured()) return [];

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("project_members")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  // Fetch emails for each member
  const members: ProjectMember[] = [];
  for (const row of data as unknown as MemberRow[]) {
    members.push({
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      email: "", // Will be resolved below
      role: row.role as ProjectRole,
      invitedBy: row.invited_by,
      createdAt: row.created_at,
    });
  }

  // Batch resolve emails via admin or user metadata
  // In practice Supabase RLS prevents querying auth.users directly,
  // so we store email in a join or rely on the invitation email.
  // For now, we use a simple approach: email is set during addProjectMember.
  return members;
}

export async function addProjectMember(
  projectId: string,
  email: string,
  role: ProjectRole,
): Promise<ProjectMember | null> {
  if (!isSupabaseConfigured()) return null;

  const sb = getSupabase()!;
  const user = await getCurrentUser();
  if (!user) return null;

  // Look up target user by email using Supabase admin RPC or profiles table
  // Since we can't query auth.users client-side, we use a stored procedure
  // or the project owner invites by email and the system resolves on login.
  // For MVP: insert with email as a lookup hint, resolve user_id via RPC.

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Try to find user by email via RPC (must be set up in Supabase)
  const { data: targetUser } = await sb.rpc("get_user_id_by_email", {
    target_email: email,
  });

  const targetUserId = targetUser as string | null;
  if (!targetUserId) return null;

  const { error } = await sb.from("project_members").insert({
    id,
    project_id: projectId,
    user_id: targetUserId,
    role,
    invited_by: user.id,
    created_at: now,
  });

  if (error) return null;

  // Record history
  await recordHistory(
    projectId,
    "shared",
    `Membro adicionado: ${email} (${role})`,
  );

  return {
    id,
    projectId,
    userId: targetUserId,
    email,
    role,
    invitedBy: user.id,
    createdAt: now,
  };
}

export async function updateMemberRole(
  memberId: string,
  role: ProjectRole,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const sb = getSupabase()!;
  await sb.from("project_members").update({ role }).eq("id", memberId);
}

export async function removeProjectMember(memberId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const sb = getSupabase()!;
  await sb.from("project_members").delete().eq("id", memberId);
}

export async function getUserRole(
  projectId: string,
): Promise<ProjectRole | null> {
  if (!isSupabaseConfigured()) return null;

  const sb = getSupabase()!;
  const user = await getCurrentUser();
  if (!user) return null;

  // Check if owner
  const { data: project } = await sb
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .single();

  if (project && (project as unknown as { user_id: string }).user_id === user.id) {
    return "owner";
  }

  // Check membership
  const { data: membership } = await sb
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  if (membership) {
    return (membership as unknown as { role: string }).role as ProjectRole;
  }

  return null;
}

// ============================================================
// Comments
// ============================================================

interface CommentRow {
  id: string;
  project_id: string;
  user_id: string;
  content: string;
  target_type: string | null;
  target_id: string | null;
  resolved: boolean;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getProjectComments(
  projectId: string,
  targetType?: string,
  targetId?: string,
): Promise<ProjectComment[]> {
  if (!isSupabaseConfigured()) return [];

  const sb = getSupabase()!;
  let query = sb
    .from("project_comments")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (targetType) {
    query = query.eq("target_type", targetType);
  }
  if (targetId) {
    query = query.eq("target_id", targetId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as unknown as CommentRow[]).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    email: "",
    content: row.content,
    targetType: row.target_type as ProjectComment["targetType"],
    targetId: row.target_id,
    resolved: row.resolved,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function addComment(
  projectId: string,
  content: string,
  targetType?: "finding" | "task" | "article" | "general",
  targetId?: string,
): Promise<ProjectComment | null> {
  if (!isSupabaseConfigured()) return null;

  const sb = getSupabase()!;
  const user = await getCurrentUser();
  if (!user) return null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error } = await sb.from("project_comments").insert({
    id,
    project_id: projectId,
    user_id: user.id,
    content,
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    created_at: now,
    updated_at: now,
  });

  if (error) return null;

  await recordHistory(projectId, "commented", `Comentário adicionado`);

  return {
    id,
    projectId,
    userId: user.id,
    email: user.email ?? "",
    content,
    targetType: targetType ?? null,
    targetId: targetId ?? null,
    resolved: false,
    resolvedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function resolveComment(commentId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const sb = getSupabase()!;
  const user = await getCurrentUser();
  if (!user) return;

  await sb
    .from("project_comments")
    .update({ resolved: true, resolved_by: user.id })
    .eq("id", commentId);
}

export async function deleteComment(commentId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const sb = getSupabase()!;
  await sb.from("project_comments").delete().eq("id", commentId);
}

// ============================================================
// History
// ============================================================

interface HistoryRow {
  id: string;
  project_id: string;
  user_id: string;
  action: string;
  summary: string;
  diff_data: Record<string, unknown> | null;
  created_at: string;
}

export async function getProjectHistory(
  projectId: string,
  limit = 50,
): Promise<ProjectHistoryEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("project_history")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as HistoryRow[]).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    email: "",
    action: row.action,
    summary: row.summary,
    diffData: row.diff_data,
    createdAt: row.created_at,
  }));
}

export async function recordHistory(
  projectId: string,
  action: string,
  summary: string,
  diffData?: Record<string, unknown>,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const sb = getSupabase()!;
  const user = await getCurrentUser();
  if (!user) return;

  await sb.from("project_history").insert({
    id: crypto.randomUUID(),
    project_id: projectId,
    user_id: user.id,
    action,
    summary,
    diff_data: diffData ?? null,
    created_at: new Date().toISOString(),
  });
}
