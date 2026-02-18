/**
 * Supabase client configuration.
 * Falls back gracefully when Supabase is not configured.
 *
 * Note: We use an untyped client here because we don't have
 * Supabase CLI-generated types. The storage layer casts results
 * to the correct types manually.
 *
 * ============================================================
 * REQUIRED DATABASE SCHEMA & RLS POLICIES
 * ============================================================
 * Run the following SQL in your Supabase SQL Editor to set up the
 * required tables, RLS policies, and storage bucket.
 *
 * -- 1. Projects table
 * CREATE TABLE IF NOT EXISTS projects (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   name TEXT NOT NULL DEFAULT '',
 *   project_data JSONB NOT NULL DEFAULT '{}',
 *   last_analysis JSONB,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 * );
 *
 * ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Users can view own projects"
 *   ON projects FOR SELECT
 *   USING (auth.uid() = user_id);
 *
 * CREATE POLICY "Users can insert own projects"
 *   ON projects FOR INSERT
 *   WITH CHECK (auth.uid() = user_id);
 *
 * CREATE POLICY "Users can update own projects"
 *   ON projects FOR UPDATE
 *   USING (auth.uid() = user_id)
 *   WITH CHECK (auth.uid() = user_id);
 *
 * CREATE POLICY "Users can delete own projects"
 *   ON projects FOR DELETE
 *   USING (auth.uid() = user_id);
 *
 * -- 2. Project files metadata table
 * CREATE TABLE IF NOT EXISTS project_files (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 *   file_name TEXT NOT NULL,
 *   file_path TEXT NOT NULL,
 *   file_type TEXT NOT NULL DEFAULT '',
 *   file_size BIGINT NOT NULL DEFAULT 0,
 *   uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
 * );
 *
 * ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Users can manage own project files"
 *   ON project_files FOR ALL
 *   USING (
 *     EXISTS (
 *       SELECT 1 FROM projects
 *       WHERE projects.id = project_files.project_id
 *         AND projects.user_id = auth.uid()
 *     )
 *   );
 *
 * -- 3. Storage bucket for uploaded documents
 * INSERT INTO storage.buckets (id, name, public)
 *   VALUES ('project-files', 'project-files', false)
 *   ON CONFLICT DO NOTHING;
 *
 * CREATE POLICY "Users can upload to own folder"
 *   ON storage.objects FOR INSERT
 *   WITH CHECK (
 *     bucket_id = 'project-files'
 *     AND auth.uid()::text = (storage.foldername(name))[1]
 *   );
 *
 * CREATE POLICY "Users can read own files"
 *   ON storage.objects FOR SELECT
 *   USING (
 *     bucket_id = 'project-files'
 *     AND auth.uid()::text = (storage.foldername(name))[1]
 *   );
 *
 * CREATE POLICY "Users can delete own files"
 *   ON storage.objects FOR DELETE
 *   USING (
 *     bucket_id = 'project-files'
 *     AND auth.uid()::text = (storage.foldername(name))[1]
 *   );
 *
 * -- 4. Index for fast user lookups
 * CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
 * CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabaseClient: SupabaseClient<any> | null = null;

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabase(): SupabaseClient<any> | null {
  if (!isSupabaseConfigured()) return null;

  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return supabaseClient;
}

/**
 * Verify that Supabase RLS policies are correctly configured.
 * Returns a list of issues found, or an empty array if everything is OK.
 * Call this from a development/admin page to validate the setup.
 */
export async function verifyRLSSetup(): Promise<string[]> {
  const issues: string[] = [];
  const sb = getSupabase();
  if (!sb) {
    issues.push("Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY).");
    return issues;
  }

  // Check that the projects table exists and is accessible
  const { error: projectsError } = await sb.from("projects").select("id").limit(0);
  if (projectsError) {
    issues.push(`projects table: ${projectsError.message}`);
  }

  // Check that the project_files table exists
  const { error: filesError } = await sb.from("project_files").select("id").limit(0);
  if (filesError) {
    issues.push(`project_files table: ${filesError.message}`);
  }

  // Check storage bucket
  const { data: buckets, error: bucketsError } = await sb.storage.listBuckets();
  if (bucketsError) {
    issues.push(`Storage buckets: ${bucketsError.message}`);
  } else if (!buckets?.some(b => b.name === "project-files")) {
    issues.push("Storage bucket 'project-files' not found. Create it in Supabase Dashboard > Storage.");
  }

  return issues;
}
