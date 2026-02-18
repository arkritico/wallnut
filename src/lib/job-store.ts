/**
 * Pipeline Job Store
 *
 * Dual-backend storage for async pipeline jobs:
 * - InMemoryJobStore: Map-based, for local dev (no Supabase needed)
 * - SupabaseJobStore: pipeline_jobs table, for production
 *
 * Factory: getJobStore() picks the right backend automatically.
 */

import type { UnifiedStage } from "./unified-pipeline";
import { isSupabaseConfigured, getSupabase } from "./supabase";
import { createLogger } from "./logger";

const logger = createLogger("job-store");

// ============================================================
// Types
// ============================================================

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineJob {
  id: string;
  status: JobStatus;
  stage: UnifiedStage | null;
  /** Overall progress 0-100 */
  progress: number;
  /** Per-stage progress details */
  stageProgress: Record<string, { percent: number; message: string }>;
  stagesCompleted: UnifiedStage[];
  fileNames: string[];
  options: Record<string, unknown>;
  result: SerializedPipelineResult | null;
  error: string | null;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * JSON-safe version of UnifiedPipelineResult.
 * ArrayBuffer exports are base64-encoded strings.
 */
export interface SerializedPipelineResult {
  project: unknown;
  wbsProject?: unknown;
  analysis?: unknown;
  matchReport?: unknown;
  schedule?: unknown;
  laborConstraint?: unknown;
  resources?: unknown;
  generatedBoq?: { stats: unknown };
  ifcAnalyses?: unknown;
  elementMapping?: unknown;
  cashFlow?: unknown;
  budgetExcelBase64?: string;
  msProjectXml?: string;
  complianceExcelBase64?: string;
  warnings: string[];
  processingTimeMs: number;
}

export interface JobProgressUpdate {
  status?: JobStatus;
  stage?: UnifiedStage;
  progress?: number;
  stageProgress?: Record<string, { percent: number; message: string }>;
  stagesCompleted?: UnifiedStage[];
  warnings?: string[];
}

// ============================================================
// JobStore Interface
// ============================================================

export interface JobStore {
  create(
    fileNames: string[],
    options: Record<string, unknown>,
  ): Promise<PipelineJob>;
  get(id: string): Promise<PipelineJob | null>;
  updateProgress(id: string, update: JobProgressUpdate): Promise<void>;
  complete(id: string, result: SerializedPipelineResult): Promise<void>;
  fail(id: string, error: string): Promise<void>;
}

// ============================================================
// In-Memory Backend
// ============================================================

export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, PipelineJob>();
  private readonly maxJobs: number;

  constructor(maxJobs = 100) {
    this.maxJobs = maxJobs;
  }

  async create(
    fileNames: string[],
    options: Record<string, unknown>,
  ): Promise<PipelineJob> {
    // Evict oldest if at capacity
    if (this.jobs.size >= this.maxJobs) {
      const oldest = this.jobs.keys().next().value;
      if (oldest) this.jobs.delete(oldest);
    }

    const now = new Date().toISOString();
    const job: PipelineJob = {
      id: crypto.randomUUID(),
      status: "pending",
      stage: null,
      progress: 0,
      stageProgress: {},
      stagesCompleted: [],
      fileNames,
      options,
      result: null,
      error: null,
      warnings: [],
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    };

    this.jobs.set(job.id, job);
    return job;
  }

  async get(id: string): Promise<PipelineJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async updateProgress(id: string, update: JobProgressUpdate): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    if (update.status !== undefined) job.status = update.status;
    if (update.stage !== undefined) job.stage = update.stage;
    if (update.progress !== undefined) job.progress = update.progress;
    if (update.stagesCompleted !== undefined)
      job.stagesCompleted = update.stagesCompleted;
    if (update.warnings !== undefined) job.warnings = update.warnings;
    if (update.stageProgress !== undefined) {
      job.stageProgress = { ...job.stageProgress, ...update.stageProgress };
    }
    if (update.status === "running" && !job.startedAt) {
      job.startedAt = new Date().toISOString();
    }
    job.updatedAt = new Date().toISOString();
  }

  async complete(
    id: string,
    result: SerializedPipelineResult,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    const now = new Date().toISOString();
    job.status = "completed";
    job.result = result;
    job.progress = 100;
    job.completedAt = now;
    job.updatedAt = now;
  }

  async fail(id: string, error: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    const now = new Date().toISOString();
    job.status = "failed";
    job.error = error;
    job.completedAt = now;
    job.updatedAt = now;
  }
}

// ============================================================
// Supabase Backend
// ============================================================

class SupabaseJobStore implements JobStore {
  async create(
    fileNames: string[],
    options: Record<string, unknown>,
  ): Promise<PipelineJob> {
    const sb = getSupabase()!;
    const { data, error } = await sb
      .from("pipeline_jobs")
      .insert({
        status: "pending",
        file_names: fileNames,
        options,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create job: ${error.message}`);
    return this.toJob(data);
  }

  async get(id: string): Promise<PipelineJob | null> {
    const sb = getSupabase()!;
    const { data, error } = await sb
      .from("pipeline_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return this.toJob(data);
  }

  async updateProgress(id: string, update: JobProgressUpdate): Promise<void> {
    const sb = getSupabase()!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbUpdate: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (update.status !== undefined) dbUpdate.status = update.status;
    if (update.stage !== undefined) dbUpdate.stage = update.stage;
    if (update.progress !== undefined) dbUpdate.progress = update.progress;
    if (update.stageProgress !== undefined)
      dbUpdate.stage_progress = update.stageProgress;
    if (update.stagesCompleted !== undefined)
      dbUpdate.stages_completed = update.stagesCompleted;
    if (update.warnings !== undefined) dbUpdate.warnings = update.warnings;
    if (update.status === "running") {
      dbUpdate.started_at = new Date().toISOString();
    }

    const { error } = await sb
      .from("pipeline_jobs")
      .update(dbUpdate)
      .eq("id", id);

    if (error) {
      logger.warn("Failed to update job progress", { id, error: error.message });
    }
  }

  async complete(
    id: string,
    result: SerializedPipelineResult,
  ): Promise<void> {
    const sb = getSupabase()!;
    const now = new Date().toISOString();
    const { error } = await sb
      .from("pipeline_jobs")
      .update({
        status: "completed",
        result,
        progress: 100,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      logger.error("Failed to complete job", { id, error: error.message });
    }
  }

  async fail(id: string, errorMsg: string): Promise<void> {
    const sb = getSupabase()!;
    const now = new Date().toISOString();
    const { error } = await sb
      .from("pipeline_jobs")
      .update({
        status: "failed",
        error: errorMsg,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      logger.error("Failed to mark job as failed", {
        id,
        error: error.message,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toJob(row: any): PipelineJob {
    return {
      id: row.id,
      status: row.status,
      stage: row.stage ?? null,
      progress: Number(row.progress) || 0,
      stageProgress: row.stage_progress ?? {},
      stagesCompleted: row.stages_completed ?? [],
      fileNames: row.file_names ?? [],
      options: row.options ?? {},
      result: row.result ?? null,
      error: row.error ?? null,
      warnings: row.warnings ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at ?? null,
      completedAt: row.completed_at ?? null,
    };
  }
}

// ============================================================
// Factory
// ============================================================

let store: JobStore | null = null;

export function getJobStore(): JobStore {
  if (!store) {
    if (isSupabaseConfigured()) {
      logger.info("Using Supabase job store");
      store = new SupabaseJobStore();
    } else {
      logger.info("Using in-memory job store (Supabase not configured)");
      store = new InMemoryJobStore();
    }
  }
  return store;
}

/** Reset store singleton (for testing) */
export function resetJobStore(): void {
  store = null;
}
