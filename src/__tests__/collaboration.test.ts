import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  canPerformAction,
  type ProjectRole,
  type CollaborationAction,
  type ProjectMember,
  type ProjectComment,
  type ProjectHistoryEntry,
} from "@/lib/collaboration";
import { getTranslations } from "@/lib/i18n";

// ============================================================
// Type exports
// ============================================================

describe("type exports", () => {
  it("exports ProjectRole type", () => {
    const role: ProjectRole = "owner";
    expect(role).toBe("owner");
  });

  it("exports ProjectMember interface fields", () => {
    const member: ProjectMember = {
      id: "1",
      projectId: "p1",
      userId: "u1",
      email: "test@wallnut.pt",
      role: "reviewer",
      invitedBy: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(member.role).toBe("reviewer");
    expect(member.email).toBe("test@wallnut.pt");
  });

  it("exports ProjectComment interface fields", () => {
    const comment: ProjectComment = {
      id: "1",
      projectId: "p1",
      userId: "u1",
      email: "test@wallnut.pt",
      content: "This needs attention",
      targetType: "finding",
      targetId: "PF-001",
      resolved: false,
      resolvedBy: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(comment.targetType).toBe("finding");
    expect(comment.resolved).toBe(false);
  });

  it("exports ProjectHistoryEntry interface fields", () => {
    const entry: ProjectHistoryEntry = {
      id: "1",
      projectId: "p1",
      userId: "u1",
      email: "test@wallnut.pt",
      action: "created",
      summary: "Projeto criado",
      diffData: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(entry.action).toBe("created");
  });
});

// ============================================================
// Permission logic (canPerformAction)
// ============================================================

describe("canPerformAction", () => {
  it("owner can perform all actions", () => {
    const actions: CollaborationAction[] = [
      "view",
      "edit",
      "comment",
      "manage_members",
      "delete",
    ];
    for (const action of actions) {
      expect(canPerformAction("owner", action)).toBe(true);
    }
  });

  it("reviewer can view, edit, and comment", () => {
    expect(canPerformAction("reviewer", "view")).toBe(true);
    expect(canPerformAction("reviewer", "edit")).toBe(true);
    expect(canPerformAction("reviewer", "comment")).toBe(true);
  });

  it("reviewer cannot manage members or delete", () => {
    expect(canPerformAction("reviewer", "manage_members")).toBe(false);
    expect(canPerformAction("reviewer", "delete")).toBe(false);
  });

  it("viewer can only view", () => {
    expect(canPerformAction("viewer", "view")).toBe(true);
    expect(canPerformAction("viewer", "edit")).toBe(false);
    expect(canPerformAction("viewer", "comment")).toBe(false);
    expect(canPerformAction("viewer", "manage_members")).toBe(false);
    expect(canPerformAction("viewer", "delete")).toBe(false);
  });

  it("null role cannot perform any action", () => {
    expect(canPerformAction(null, "view")).toBe(false);
    expect(canPerformAction(null, "edit")).toBe(false);
    expect(canPerformAction(null, "comment")).toBe(false);
  });
});

// ============================================================
// Graceful degradation (Supabase not configured)
// ============================================================

describe("graceful degradation (no Supabase)", () => {
  // All functions should return empty/null since NEXT_PUBLIC_SUPABASE_URL is not set

  it("getProjectMembers returns empty array", async () => {
    const { getProjectMembers } = await import("@/lib/collaboration");
    const members = await getProjectMembers("nonexistent");
    expect(members).toEqual([]);
  });

  it("addProjectMember returns null", async () => {
    const { addProjectMember } = await import("@/lib/collaboration");
    const result = await addProjectMember("p1", "test@wallnut.pt", "reviewer");
    expect(result).toBeNull();
  });

  it("getUserRole returns null", async () => {
    const { getUserRole } = await import("@/lib/collaboration");
    const role = await getUserRole("nonexistent");
    expect(role).toBeNull();
  });

  it("getProjectComments returns empty array", async () => {
    const { getProjectComments } = await import("@/lib/collaboration");
    const comments = await getProjectComments("nonexistent");
    expect(comments).toEqual([]);
  });

  it("addComment returns null", async () => {
    const { addComment } = await import("@/lib/collaboration");
    const result = await addComment("p1", "test comment");
    expect(result).toBeNull();
  });

  it("getProjectHistory returns empty array", async () => {
    const { getProjectHistory } = await import("@/lib/collaboration");
    const history = await getProjectHistory("nonexistent");
    expect(history).toEqual([]);
  });

  it("recordHistory completes without error", async () => {
    const { recordHistory } = await import("@/lib/collaboration");
    await expect(
      recordHistory("p1", "test", "test summary"),
    ).resolves.toBeUndefined();
  });

  it("resolveComment completes without error", async () => {
    const { resolveComment } = await import("@/lib/collaboration");
    await expect(resolveComment("c1")).resolves.toBeUndefined();
  });

  it("deleteComment completes without error", async () => {
    const { deleteComment } = await import("@/lib/collaboration");
    await expect(deleteComment("c1")).resolves.toBeUndefined();
  });

  it("removeProjectMember completes without error", async () => {
    const { removeProjectMember } = await import("@/lib/collaboration");
    await expect(removeProjectMember("m1")).resolves.toBeUndefined();
  });

  it("updateMemberRole completes without error", async () => {
    const { updateMemberRole } = await import("@/lib/collaboration");
    await expect(
      updateMemberRole("m1", "reviewer"),
    ).resolves.toBeUndefined();
  });
});

// ============================================================
// Schema validation (SQL file)
// ============================================================

describe("schema.sql", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/schema.sql"),
    "utf-8",
  );

  it("contains project_members table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_members");
  });

  it("contains project_comments table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_comments");
  });

  it("contains project_history table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_history");
  });

  it("has role CHECK constraint", () => {
    expect(sql).toContain("role IN ('owner', 'reviewer', 'viewer')");
  });

  it("has target_type CHECK constraint", () => {
    expect(sql).toContain(
      "target_type IN ('finding', 'task', 'article', 'general')",
    );
  });

  it("has member-aware SELECT policy on projects", () => {
    expect(sql).toContain("Users can view accessible projects");
  });

  it("has member-aware UPDATE policy on projects", () => {
    expect(sql).toContain("Users can update accessible projects");
  });

  it("has RLS on project_members", () => {
    expect(sql).toContain(
      "ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY",
    );
  });

  it("has RLS on project_comments", () => {
    expect(sql).toContain(
      "ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY",
    );
  });

  it("has RLS on project_history", () => {
    expect(sql).toContain(
      "ALTER TABLE public.project_history ENABLE ROW LEVEL SECURITY",
    );
  });
});

// ============================================================
// i18n completeness
// ============================================================

describe("i18n collaboration keys", () => {
  const collabKeys = [
    "collaboration",
    "members",
    "addMember",
    "removeMember",
    "roleOwner",
    "roleReviewer",
    "roleViewer",
    "inviteMemberEmail",
    "memberAdded",
    "memberRemoved",
    "comments",
    "addComment",
    "commentPlaceholder",
    "resolve",
    "resolved",
    "unresolve",
    "history",
    "changeHistory",
    "projectCreated",
    "projectUpdated",
    "projectAnalyzed",
    "memberInvited",
    "commentAdded",
    "sharedWith",
    "noComments",
    "noHistory",
    "allComments",
    "onlyUnresolved",
    "userNotFound",
  ] as const;

  it("all collaboration keys present in Portuguese", () => {
    const pt = getTranslations("pt");
    for (const key of collabKeys) {
      expect(pt[key], `Missing pt key: ${key}`).toBeDefined();
      expect(pt[key].length).toBeGreaterThan(0);
    }
  });

  it("all collaboration keys present in English", () => {
    const en = getTranslations("en");
    for (const key of collabKeys) {
      expect(en[key], `Missing en key: ${key}`).toBeDefined();
      expect(en[key].length).toBeGreaterThan(0);
    }
  });

  it("Portuguese and English translations differ", () => {
    const pt = getTranslations("pt");
    const en = getTranslations("en");
    // At least some keys should be different (collaboration ≠ Colaboração)
    let diffCount = 0;
    for (const key of collabKeys) {
      if (pt[key] !== en[key]) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(20);
  });
});
