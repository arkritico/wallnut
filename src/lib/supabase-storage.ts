/**
 * Server-side storage layer using Supabase.
 * Provides CRUD operations for projects with file storage.
 * Falls back to localStorage when Supabase is not configured.
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";
import { isAllowedEmail } from "./auth-guard";
import type { BuildingProject, AnalysisResult } from "./types";
import * as localStorage from "./storage";
import { recordHistory } from "./collaboration";

export interface CloudProject {
  id: string;
  userId: string;
  name: string;
  project: BuildingProject;
  lastAnalysis: AnalysisResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
}

// ============================================================
// Auth helpers
// ============================================================

export async function getCurrentUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

export async function signInWithEmail(email: string, password: string) {
  if (!isAllowedEmail(email)) {
    return { data: { user: null, session: null }, error: { message: "Apenas emails @wallnut.pt são permitidos." } };
  }
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  return sb.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email: string, password: string) {
  if (!isAllowedEmail(email)) {
    return { data: { user: null, session: null }, error: { message: "Apenas emails @wallnut.pt são permitidos." } };
  }
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  return sb.auth.signUp({ email, password });
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export function onAuthStateChange(callback: (user: unknown) => void) {
  const sb = getSupabase();
  if (!sb) return { data: { subscription: { unsubscribe: () => {} } } };
  return sb.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

// ============================================================
// Project CRUD (hybrid: Supabase if configured, else localStorage)
// ============================================================

export async function getAllCloudProjects(): Promise<CloudProject[]> {
  if (!isSupabaseConfigured()) {
    return localStorage.getAllProjects().map(p => ({
      id: p.id,
      userId: "local",
      name: p.name,
      project: p.project,
      lastAnalysis: p.lastAnalysis ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  const sb = getSupabase()!;
  const user = await getCurrentUser();
  if (!user) return [];

  interface ProjectRow {
    id: string;
    user_id: string;
    name: string;
    project_data: Record<string, unknown>;
    last_analysis: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  }

  // RLS returns all accessible projects (owned + shared via project_members)
  const { data, error } = await sb
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects:", error);
    return [];
  }

  return ((data ?? []) as unknown as ProjectRow[]).map(row => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    project: row.project_data as unknown as BuildingProject,
    lastAnalysis: row.last_analysis as unknown as AnalysisResult | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function saveCloudProject(project: CloudProject): Promise<void> {
  if (!isSupabaseConfigured()) {
    localStorage.saveProject({
      id: project.id,
      name: project.name,
      project: project.project,
      lastAnalysis: project.lastAnalysis ?? undefined,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
    return;
  }

  const sb = getSupabase()!;
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await sb
    .from("projects")
    .upsert({
      id: project.id,
      user_id: user.id,
      name: project.name,
      project_data: project.project as unknown as Record<string, unknown>,
      last_analysis: project.lastAnalysis as unknown as Record<string, unknown> | null,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;

  // Record change history
  await recordHistory(project.id, "updated", "Projeto atualizado");
}

export async function deleteCloudProject(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    localStorage.deleteProject(id);
    return;
  }

  const sb = getSupabase()!;
  const user = await getCurrentUser();
  if (!user) return;

  // Delete files first
  const { data: files } = await sb
    .from("project_files")
    .select("file_path")
    .eq("project_id", id);

  const fileRows = (files ?? []) as unknown as { file_path: string }[];
  if (fileRows.length > 0) {
    await sb.storage
      .from("project-files")
      .remove(fileRows.map(f => f.file_path));
    await sb.from("project_files").delete().eq("project_id", id);
  }

  await sb.from("projects").delete().eq("id", id).eq("user_id", user.id);
}

export async function createCloudProject(
  name: string,
  project: BuildingProject,
): Promise<CloudProject> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const cloudProject: CloudProject = {
    id,
    userId: "local",
    name,
    project: { ...project, name },
    lastAnalysis: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!isSupabaseConfigured()) {
    localStorage.createProject(name, project);
    return cloudProject;
  }

  const sb = getSupabase()!;
  const user = await getCurrentUser();
  if (!user) {
    // Fallback to localStorage if not authenticated
    const saved = localStorage.createProject(name, project);
    return { ...cloudProject, id: saved.id };
  }

  cloudProject.userId = user.id;

  const { error } = await sb.from("projects").insert({
    id,
    user_id: user.id,
    name,
    project_data: project as unknown as Record<string, unknown>,
    created_at: now,
    updated_at: now,
  });

  if (error) throw error;

  // Auto-add creator as owner member + record history
  await sb.from("project_members").insert({
    id: crypto.randomUUID(),
    project_id: id,
    user_id: user.id,
    role: "owner",
    created_at: now,
  });
  await recordHistory(id, "created", "Projeto criado");

  return cloudProject;
}

// ============================================================
// File storage
// ============================================================

export async function uploadProjectFile(
  projectId: string,
  file: File,
): Promise<ProjectFile | null> {
  if (!isSupabaseConfigured()) return null;

  const sb = getSupabase()!;
  const user = await getCurrentUser();
  if (!user) return null;

  const filePath = `${user.id}/${projectId}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await sb.storage
    .from("project-files")
    .upload(filePath, file);

  if (uploadError) {
    console.error("File upload error:", uploadError);
    return null;
  }

  const fileRecord: ProjectFile = {
    id: crypto.randomUUID(),
    projectId,
    fileName: file.name,
    filePath,
    fileType: file.type,
    fileSize: file.size,
    uploadedAt: new Date().toISOString(),
  };

  const { error: dbError } = await sb.from("project_files").insert({
    id: fileRecord.id,
    project_id: projectId,
    user_id: user.id,
    file_name: file.name,
    file_path: filePath,
    file_type: file.type,
    file_size: file.size,
  });

  if (dbError) {
    console.error("File record error:", dbError);
    // Clean up uploaded file
    await sb.storage.from("project-files").remove([filePath]);
    return null;
  }

  return fileRecord;
}

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  if (!isSupabaseConfigured()) return [];

  const sb = getSupabase()!;
  const { data, error } = await sb
    .from("project_files")
    .select("*")
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false });

  if (error) return [];

  interface FileRow {
    id: string;
    project_id: string;
    file_name: string;
    file_path: string;
    file_type: string;
    file_size: number;
    uploaded_at: string;
  }

  return ((data ?? []) as unknown as FileRow[]).map(row => ({
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileType: row.file_type,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at,
  }));
}

export async function deleteProjectFile(fileId: string, filePath: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const sb = getSupabase()!;
  await sb.storage.from("project-files").remove([filePath]);
  await sb.from("project_files").delete().eq("id", fileId);
}

export function getFileUrl(filePath: string): string | null {
  if (!isSupabaseConfigured()) return null;

  const sb = getSupabase()!;
  const { data } = sb.storage.from("project-files").getPublicUrl(filePath);
  return data?.publicUrl ?? null;
}
