-- Pipeline Jobs table
-- Stores async pipeline job status for polling.
-- Used by SupabaseJobStore in src/lib/job-store.ts

CREATE TABLE IF NOT EXISTS public.pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  stage TEXT,
  progress NUMERIC NOT NULL DEFAULT 0,
  stage_progress JSONB NOT NULL DEFAULT '{}',
  stages_completed JSONB NOT NULL DEFAULT '[]',
  file_names JSONB NOT NULL DEFAULT '[]',
  options JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error TEXT,
  warnings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Index for polling by job ID (primary key covers this) and cleanup by age
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_created_at
  ON public.pipeline_jobs(created_at);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status
  ON public.pipeline_jobs(status)
  WHERE status IN ('pending', 'running');

-- Auto-update updated_at on every UPDATE
CREATE TRIGGER set_pipeline_jobs_updated_at
  BEFORE UPDATE ON public.pipeline_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS: disable for now — pipeline jobs are server-side only
-- (created/read via service key or anon key from API routes).
-- If multi-tenant isolation is needed later, add user_id + policies.
ALTER TABLE public.pipeline_jobs ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anon (server-side API routes use anon key)
CREATE POLICY "Allow all access to pipeline_jobs"
  ON public.pipeline_jobs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Cleanup: auto-delete jobs older than 24 hours (optional — run via pg_cron or manually)
-- DELETE FROM public.pipeline_jobs WHERE created_at < NOW() - INTERVAL '24 hours';
