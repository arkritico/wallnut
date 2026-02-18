/**
 * Client-side IFC parsing orchestrator.
 *
 * Reads IFC files in the browser and dispatches them to a Web Worker
 * running analyzeIfcSpecialty(). Returns SpecialtyAnalysisResult[] ready
 * to send to the server (typically 50-200 KB JSON instead of 50-500 MB raw IFC).
 */

import type { SpecialtyAnalysisResult } from "./ifc-specialty-analyzer";
import type { IfcWorkerRequest, IfcWorkerResponse } from "./ifc-worker";

// ── Progress callback types ────────────────────────────────

export interface ClientIfcProgress {
  /** Current file index (0-based) */
  fileIndex: number;
  /** Total IFC files */
  totalFiles: number;
  /** Current file name */
  fileName: string;
  /** Phase: "reading" file from disk | "parsing" in worker */
  phase: "reading" | "parsing";
}

export interface ClientIfcResult {
  analyses: SpecialtyAnalysisResult[];
  /** Files that failed client-side parsing */
  errors: { fileName: string; error: string }[];
}

// ── Main entry point ───────────────────────────────────────

/**
 * Parse multiple IFC files in the browser using a Web Worker.
 *
 * Files are processed sequentially to avoid holding multiple
 * 100-500 MB strings in memory simultaneously.
 */
export async function parseIfcFilesClient(
  ifcFiles: File[],
  onProgress?: (progress: ClientIfcProgress) => void,
): Promise<ClientIfcResult> {
  if (ifcFiles.length === 0) {
    return { analyses: [], errors: [] };
  }

  let worker: Worker;
  try {
    worker = new Worker(
      new URL("./ifc-worker.ts", import.meta.url),
      { type: "module" },
    );
  } catch {
    // Worker creation failed (e.g. CSP, no Worker support) — use main thread
    return parseIfcFilesMainThread(ifcFiles, onProgress);
  }

  const analyses: SpecialtyAnalysisResult[] = [];
  const errors: { fileName: string; error: string }[] = [];

  try {
    for (let i = 0; i < ifcFiles.length; i++) {
      const file = ifcFiles[i];

      // Phase 1: Read file as text
      onProgress?.({
        fileIndex: i,
        totalFiles: ifcFiles.length,
        fileName: file.name,
        phase: "reading",
      });

      let content: string;
      try {
        content = await file.text();
      } catch (err) {
        errors.push({
          fileName: file.name,
          error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      // Phase 2: Send to worker for parsing
      onProgress?.({
        fileIndex: i,
        totalFiles: ifcFiles.length,
        fileName: file.name,
        phase: "parsing",
      });

      try {
        const result = await runInWorker(worker, file.name, content, i);
        if (result.success && result.result) {
          analyses.push(result.result);
        } else {
          errors.push({
            fileName: file.name,
            error: result.error ?? "Unknown worker error",
          });
        }
      } catch (err) {
        errors.push({
          fileName: file.name,
          error: `Worker error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  } finally {
    worker.terminate();
  }

  return { analyses, errors };
}

// ── Worker communication ───────────────────────────────────

function runInWorker(
  worker: Worker,
  fileName: string,
  content: string,
  index: number,
): Promise<IfcWorkerResponse> {
  return new Promise((resolve, reject) => {
    const id = `ifc-${index}-${Date.now()}`;

    const onMessage = (event: MessageEvent<IfcWorkerResponse>) => {
      if (event.data.id === id) {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        resolve(event.data);
      }
    };

    const onError = (err: ErrorEvent) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      reject(new Error(err.message || "Worker crashed"));
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    const request: IfcWorkerRequest = { id, fileName, content };
    worker.postMessage(request);
  });
}

// ── Main-thread fallback ───────────────────────────────────

/**
 * Fallback: parse IFC files on the main thread when Web Workers
 * are unavailable. UI will freeze during parsing.
 */
async function parseIfcFilesMainThread(
  ifcFiles: File[],
  onProgress?: (progress: ClientIfcProgress) => void,
): Promise<ClientIfcResult> {
  const { analyzeIfcSpecialty } = await import("./ifc-specialty-analyzer");

  const analyses: SpecialtyAnalysisResult[] = [];
  const errors: { fileName: string; error: string }[] = [];

  for (let i = 0; i < ifcFiles.length; i++) {
    const file = ifcFiles[i];

    onProgress?.({
      fileIndex: i,
      totalFiles: ifcFiles.length,
      fileName: file.name,
      phase: "reading",
    });

    try {
      const content = await file.text();

      onProgress?.({
        fileIndex: i,
        totalFiles: ifcFiles.length,
        fileName: file.name,
        phase: "parsing",
      });

      const result = analyzeIfcSpecialty(content);
      analyses.push(result);
    } catch (err) {
      errors.push({
        fileName: file.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { analyses, errors };
}
