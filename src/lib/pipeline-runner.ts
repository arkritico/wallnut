/**
 * Pipeline Runner
 *
 * Executes the unified pipeline for a given job, writing progress
 * to the job store. Designed to be called fire-and-forget from the
 * API route handler.
 */

import {
  runUnifiedPipeline,
  type UnifiedPipelineResult,
  type UnifiedProgress,
} from "./unified-pipeline";
import {
  getJobStore,
  type SerializedPipelineResult,
} from "./job-store";
import { createLogger } from "./logger";

const logger = createLogger("pipeline-runner");

// ============================================================
// Result Serialization
// ============================================================

/**
 * Convert UnifiedPipelineResult to a JSON-safe format.
 * ArrayBuffer exports become base64 strings.
 */
export function serializeResult(
  result: UnifiedPipelineResult,
): SerializedPipelineResult {
  function toBase64(buf: ArrayBuffer): string {
    return Buffer.from(buf).toString("base64");
  }

  return {
    project: result.project,
    wbsProject: result.wbsProject,
    analysis: result.analysis,
    matchReport: result.matchReport,
    schedule: result.schedule,
    laborConstraint: result.laborConstraint,
    resources: result.resources,
    generatedBoq: result.generatedBoq
      ? { stats: result.generatedBoq.stats }
      : undefined,
    ifcAnalyses: result.ifcAnalyses
      ? result.ifcAnalyses.map((a) => ({
          specialty: a.specialty,
          summary: a.summary,
          chapters: a.chapters,
        }))
      : undefined,
    elementMapping: result.elementMapping
      ? { stats: result.elementMapping.stats }
      : undefined,
    aiSequence: result.aiSequence
      ? {
          steps: result.aiSequence.steps,
          aiRationale: result.aiSequence.aiRationale,
          unmappedCount: result.aiSequence.unmappedElements.length,
          mappedCount: result.aiSequence.elementMapping.size,
          tokenUsage: result.aiSequence.tokenUsage,
        }
      : undefined,
    cashFlow: result.cashFlow,
    budgetExcelBase64: result.budgetExcel
      ? toBase64(result.budgetExcel)
      : undefined,
    msProjectXml: result.msProjectXml,
    ccpmGanttExcelBase64: result.ccpmGanttExcel
      ? toBase64(result.ccpmGanttExcel)
      : undefined,
    complianceExcelBase64: result.complianceExcel
      ? toBase64(result.complianceExcel)
      : undefined,
    warnings: result.warnings,
    processingTimeMs: result.processingTimeMs,
  };
}

// ============================================================
// Job Execution
// ============================================================

/**
 * Run the pipeline for a given job, writing progress to the job store.
 *
 * This function is fire-and-forget: the caller starts it with `void`
 * and the client polls GET /api/pipeline/[jobId] for progress.
 */
export async function executePipelineJob(
  jobId: string,
  files: File[],
  options: {
    includeCosts?: boolean;
    includeSchedule?: boolean;
    includeCompliance?: boolean;
    ifcAnalyses?: unknown[];
  },
): Promise<void> {
  const store = getJobStore();

  try {
    await store.updateProgress(jobId, { status: "running" });

    const onProgress = (progress: UnifiedProgress) => {
      // Fire-and-forget: don't await to avoid blocking pipeline
      void store.updateProgress(jobId, {
        stage: progress.stage,
        progress: progress.percent,
        stageProgress: {
          [progress.stage]: {
            percent: progress.percent,
            message: progress.message,
          },
        },
        stagesCompleted: progress.stagesCompleted,
      });
    };

    const result = await runUnifiedPipeline({
      files,
      options: {
        includeCosts: options.includeCosts,
        includeSchedule: options.includeSchedule,
        includeCompliance: options.includeCompliance,
        ifcAnalyses: options.ifcAnalyses as import("./ifc-specialty-analyzer").SpecialtyAnalysisResult[] | undefined,
        onProgress,
      },
    });

    const serialized = serializeResult(result);
    await store.complete(jobId, serialized);

    logger.info("Pipeline job completed", {
      jobId,
      timeMs: result.processingTimeMs,
      warnings: result.warnings.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Pipeline job failed", { jobId, error: message });
    await store.fail(jobId, message);
  }
}
