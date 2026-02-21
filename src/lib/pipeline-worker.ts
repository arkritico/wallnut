/**
 * Web Worker for client-side unified pipeline execution.
 *
 * Runs the full analysis pipeline (classify → parse → analyze → cost → schedule → export)
 * off the main thread. Receives file data as transferred ArrayBuffers and posts progress
 * updates + final result back to the main thread.
 *
 * Supports two message types:
 * - "prefetch": Pre-loads the 18 MB price database into module cache
 * - "run": Executes the full pipeline (default if type is missing)
 */

import type { UnifiedPipelineResult, UnifiedProgress } from "./unified-pipeline";
import type { SpecialtyAnalysisResult } from "./ifc-specialty-analyzer";
import type { BuildingProject } from "./types";

// ── Message types ──────────────────────────────────────────

export interface PipelineWorkerRequest {
  id: string;
  files: Array<{ name: string; type: string; buffer: ArrayBuffer }>;
  options: {
    includeCosts?: boolean;
    includeSchedule?: boolean;
    includeCompliance?: boolean;
    analysisDepth?: "quick" | "standard" | "deep";
    ifcAnalyses?: SpecialtyAnalysisResult[];
    existingProject?: Partial<BuildingProject>;
  };
}

export type PipelineWorkerIncoming =
  | { type: "prefetch" }
  | ({ type: "run" } & PipelineWorkerRequest);

export interface PipelineWorkerResponse {
  id?: string;
  type: "progress" | "complete" | "error" | "prefetch_done";
  progress?: UnifiedProgress;
  result?: UnifiedPipelineResult;
  error?: string;
}

// ── Worker handler ─────────────────────────────────────────

self.addEventListener("message", async (event: MessageEvent<PipelineWorkerIncoming>) => {
  const msg = event.data;

  // Handle prefetch: pre-load the price database into module cache
  if (msg.type === "prefetch") {
    try {
      const { getPriceMatcherDatabase } = await import("./price-db-loader");
      await getPriceMatcherDatabase();
      self.postMessage({ type: "prefetch_done" } as PipelineWorkerResponse);
    } catch {
      // Prefetch failure is non-fatal — pipeline will retry on demand
    }
    return;
  }

  // Handle run (also covers messages without type for backward compat)
  const { id, files, options } = msg as PipelineWorkerRequest;

  try {
    // Reconstruct File objects from transferred ArrayBuffers
    const fileObjects = files.map(
      (f) => new File([f.buffer], f.name, { type: f.type || "application/octet-stream" }),
    );

    // Lazy-import the pipeline (Turbopack bundles all dependencies into this worker)
    const { runUnifiedPipeline } = await import("./unified-pipeline");

    const result = await runUnifiedPipeline({
      files: fileObjects,
      options: {
        ...options,
        onProgress: (progress: UnifiedProgress) => {
          self.postMessage({ id, type: "progress", progress } as PipelineWorkerResponse);
        },
      },
    });

    // Collect transferable ArrayBuffers for zero-copy transfer back
    const transferables: ArrayBuffer[] = [];
    if (result.budgetExcel) transferables.push(result.budgetExcel);
    if (result.ccpmGanttExcel) transferables.push(result.ccpmGanttExcel);
    if (result.complianceExcel) transferables.push(result.complianceExcel);

    self.postMessage(
      { id, type: "complete", result } as PipelineWorkerResponse,
      { transfer: transferables },
    );
  } catch (err) {
    self.postMessage({
      id,
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    } as PipelineWorkerResponse);
  }
});
