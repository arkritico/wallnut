-- Wallnut Database Schema for Supabase
-- Run this in the Supabase SQL editor to set up the database.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Projects table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  project_data JSONB NOT NULL DEFAULT '{}',
  last_analysis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON public.projects(updated_at DESC);

-- RLS policies
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- ── SECURITY DEFINER helpers ──────────────────────────────
-- These break the circular RLS dependency between projects
-- and project_members (each table's policies referenced the
-- other, causing PostgREST 500 errors).

CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND user_id = p_user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND user_id = p_user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id
    AND role IN ('owner', 'reviewer')
  );
$$;

-- ── Project policies (use SECURITY DEFINER helpers) ───────

CREATE POLICY "Users can view accessible projects"
  ON public.projects FOR SELECT
  USING (
    public.can_access_project(id, auth.uid())
  );

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update accessible projects"
  ON public.projects FOR UPDATE
  USING (
    public.can_edit_project(id, auth.uid())
  );

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- Project files table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT '',
  file_size BIGINT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON public.project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_user_id ON public.project_files(user_id);

-- RLS policies
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own files"
  ON public.project_files FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own files"
  ON public.project_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own files"
  ON public.project_files FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- Storage bucket for project files
-- ============================================================
-- Run this separately in Supabase Dashboard > Storage:
-- 1. Create bucket "project-files" (private)
-- 2. Add policy: authenticated users can upload to their own path
-- 3. Add policy: authenticated users can read their own files

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Project members (collaboration / role-based sharing)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'reviewer', 'viewer')),
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Uses SECURITY DEFINER helpers to avoid circular RLS dependency
CREATE POLICY "Members can view project members"
  ON public.project_members FOR SELECT
  USING (
    public.can_access_project(project_id, auth.uid())
  );

CREATE POLICY "Owners can manage members"
  ON public.project_members FOR INSERT
  WITH CHECK (
    public.is_project_owner(project_id)
  );

CREATE POLICY "Owners can update members"
  ON public.project_members FOR UPDATE
  USING (
    public.is_project_owner(project_id)
  );

CREATE POLICY "Owners can remove members"
  ON public.project_members FOR DELETE
  USING (
    public.is_project_owner(project_id)
  );

-- ============================================================
-- Project comments (anchored to findings, tasks, articles)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  target_type TEXT CHECK (target_type IN ('finding', 'task', 'article', 'general')),
  target_id TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_comments_project_id ON public.project_comments(project_id);

ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view comments"
  ON public.project_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = project_id AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Reviewers and owners can add comments"
  ON public.project_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = project_id AND pm.user_id = auth.uid()
          AND pm.role IN ('owner', 'reviewer')
        )
      )
    )
  );

CREATE POLICY "Users can update own comments"
  ON public.project_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON public.project_comments FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_comment_updated_at
  BEFORE UPDATE ON public.project_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Project history (change audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  diff_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_history_project_id ON public.project_history(project_id);

ALTER TABLE public.project_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view history"
  ON public.project_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.project_members pm
          WHERE pm.project_id = project_id AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Authenticated users can insert history"
  ON public.project_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);
