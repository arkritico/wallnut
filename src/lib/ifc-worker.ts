/**
 * Web Worker for client-side IFC parsing.
 *
 * Runs analyzeIfcSpecialty() off the main thread so the UI stays responsive
 * even for 100-500 MB IFC files.
 */

import { analyzeIfcSpecialty } from "./ifc-specialty-analyzer";
import type { SpecialtyAnalysisResult } from "./ifc-specialty-analyzer";

// ── Message types ──────────────────────────────────────────

export interface IfcWorkerRequest {
  id: string;
  fileName: string;
  content: string;
}

export interface IfcWorkerResponse {
  id: string;
  fileName: string;
  success: boolean;
  result?: SpecialtyAnalysisResult;
  error?: string;
}

// ── Worker handler ─────────────────────────────────────────

self.addEventListener("message", (event: MessageEvent<IfcWorkerRequest>) => {
  const { id, fileName, content } = event.data;
  try {
    const result = analyzeIfcSpecialty(content);
    const response: IfcWorkerResponse = { id, fileName, success: true, result };
    self.postMessage(response);
  } catch (err) {
    const response: IfcWorkerResponse = {
      id,
      fileName,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
});
