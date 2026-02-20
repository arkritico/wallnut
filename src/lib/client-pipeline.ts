/**
 * Client-side pipeline orchestrator.
 *
 * Coordinates IFC Worker (existing) + Pipeline Worker (new) to run the
 * full analysis pipeline in the browser — no server round-trip needed
 * except for AI-powered PDF parsing (/api/parse-document).
 *
 * Factory pattern: `createClientPipeline()` returns a handle with:
 *   - prefetch(): Pre-load 18 MB price database into worker cache
 *   - run(): Execute the full pipeline
 *   - cancel(): Abort a running pipeline
 *   - terminate(): Destroy the worker (call on unmount)
 */

import type { UnifiedPipelineResult, UnifiedProgress } from "./unified-pipeline";
import type { SpecialtyAnalysisResult } from "./ifc-specialty-analyzer";
import type { ClientIfcProgress } from "./client-ifc-parser";
import type { BuildingProject } from "./types";
import type {
  PipelineWorkerIncoming,
  PipelineWorkerRequest,
  PipelineWorkerResponse,
} from "./pipeline-worker";

// ── Public types ───────────────────────────────────────────

export interface ClientPipelineProgress {
  phase: "ifc_parse" | "pipeline";
  ifcProgress?: ClientIfcProgress;
  pipelineProgress?: UnifiedProgress;
}

export interface ClientPipelineOptions {
  includeCosts?: boolean;
  includeSchedule?: boolean;
  includeCompliance?: boolean;
  existingProject?: Partial<BuildingProject>;
  onProgress?: (progress: ClientPipelineProgress) => void;
}

export interface ClientPipelineHandle {
  /** Pre-load the 18 MB price database into the worker's module cache. */
  prefetch(): void;
  /** Run the full pipeline. Only one run at a time. */
  run(files: File[], options: ClientPipelineOptions): Promise<UnifiedPipelineResult>;
  /** Cancel a running pipeline. Worker is recreated and re-prefetched. */
  cancel(): void;
  /** Terminate the worker permanently. Call on unmount. */
  terminate(): void;
  /** Whether a pipeline is currently running. */
  readonly isRunning: boolean;
}

// ── Factory ────────────────────────────────────────────────

function createWorker(): Worker {
  return new Worker(
    new URL("./pipeline-worker.ts", import.meta.url),
    { type: "module" },
  );
}

export function createClientPipeline(): ClientPipelineHandle {
  let worker: Worker | null = null;
  let running = false;
  let currentReject: ((err: Error) => void) | null = null;
  let currentCleanup: (() => void) | null = null;

  function ensureWorker(): Worker {
    if (!worker) worker = createWorker();
    return worker;
  }

  const handle: ClientPipelineHandle = {
    get isRunning() {
      return running;
    },

    prefetch() {
      const w = ensureWorker();
      w.postMessage({ type: "prefetch" } satisfies PipelineWorkerIncoming);
    },

    async run(files, options) {
      if (running) throw new Error("Pipeline already running");

      // Step 1: Parse IFC client-side (existing IFC Worker)
      const ifcFiles = files.filter((f) => f.name.toLowerCase().endsWith(".ifc"));
      const nonIfcFiles = files.filter((f) => !f.name.toLowerCase().endsWith(".ifc"));

      let ifcAnalyses: SpecialtyAnalysisResult[] | undefined;
      if (ifcFiles.length > 0) {
        const { parseIfcFilesClient } = await import("./client-ifc-parser");
        const result = await parseIfcFilesClient(ifcFiles, (p) => {
          options.onProgress?.({ phase: "ifc_parse", ifcProgress: p });
        });

        if (result.errors.length > 0) {
          for (const err of result.errors) {
            console.warn(`IFC parse failed for ${err.fileName}: ${err.error}`);
          }
        }

        if (result.analyses.length > 0) {
          ifcAnalyses = result.analyses;
        }
      }

      // Step 2: Read files to ArrayBuffers for transfer
      const filesToSend = ifcAnalyses ? nonIfcFiles : [...nonIfcFiles, ...ifcFiles];
      const fileBuffers = await Promise.all(
        filesToSend.map(async (f) => ({
          name: f.name,
          type: f.type || "application/octet-stream",
          buffer: await f.arrayBuffer(),
        })),
      );

      // Step 3: Run in Pipeline Worker
      const w = ensureWorker();
      running = true;

      return new Promise<UnifiedPipelineResult>((resolve, reject) => {
        currentReject = reject;
        const id = `pipeline-${Date.now()}`;

        const onMessage = (event: MessageEvent<PipelineWorkerResponse>) => {
          const msg = event.data;
          if (msg.type === "prefetch_done") return;
          if (msg.id !== id) return;

          if (msg.type === "progress" && msg.progress) {
            options.onProgress?.({ phase: "pipeline", pipelineProgress: msg.progress });
          } else if (msg.type === "complete" && msg.result) {
            cleanup();
            resolve(msg.result);
          } else if (msg.type === "error") {
            cleanup();
            reject(new Error(msg.error ?? "Pipeline worker error"));
          }
        };

        const onError = (err: ErrorEvent) => {
          cleanup();
          // Worker crashed — recreate and re-prefetch for next run
          worker = createWorker();
          handle.prefetch();
          reject(new Error(err.message || "Pipeline worker crashed — try removing large files"));
        };

        function cleanup() {
          running = false;
          currentReject = null;
          currentCleanup = null;
          w.removeEventListener("message", onMessage);
          w.removeEventListener("error", onError);
        }

        currentCleanup = cleanup;
        w.addEventListener("message", onMessage);
        w.addEventListener("error", onError);

        // Transfer ArrayBuffers (zero-copy)
        const transferables = fileBuffers.map((f) => f.buffer);
        const request: PipelineWorkerIncoming = {
          type: "run",
          id,
          files: fileBuffers,
          options: {
            includeCosts: options.includeCosts,
            includeSchedule: options.includeSchedule,
            includeCompliance: options.includeCompliance,
            ifcAnalyses,
            existingProject: options.existingProject,
          },
        };

        w.postMessage(request, { transfer: transferables });
      });
    },

    cancel() {
      if (!running || !worker) return;

      // Terminate the running worker
      worker.terminate();
      worker = null;

      // Reject the pending promise
      currentCleanup?.();
      currentReject?.(new Error("Pipeline cancelled"));
      currentReject = null;
      running = false;

      // Re-create and re-warm a new worker immediately
      worker = createWorker();
      handle.prefetch();
    },

    terminate() {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      running = false;
      currentReject = null;
      currentCleanup = null;
    },
  };

  return handle;
}

// ── Backward-compatible wrapper ──────────────────────────

/**
 * Run the full pipeline client-side using Web Workers.
 * Creates a one-shot handle, runs, and terminates.
 */
export async function runClientPipeline(
  files: File[],
  options: ClientPipelineOptions,
): Promise<UnifiedPipelineResult> {
  const handle = createClientPipeline();
  try {
    return await handle.run(files, options);
  } finally {
    handle.terminate();
  }
}
