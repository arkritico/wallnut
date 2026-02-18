import { NextResponse } from "next/server";
import { getJobStore } from "@/lib/job-store";

export const runtime = "nodejs";

/**
 * GET /api/pipeline/[jobId]
 *
 * Poll endpoint for pipeline job status and results.
 * Returns progress while running, full result when completed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const store = getJobStore();
  const job = await store.get(jobId);

  if (!job) {
    return NextResponse.json(
      { error: "Job não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    stageProgress: job.stageProgress,
    stagesCompleted: job.stagesCompleted,
    warnings: job.warnings,
    error: job.error,
    result: job.status === "completed" ? job.result : undefined,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  });
}
