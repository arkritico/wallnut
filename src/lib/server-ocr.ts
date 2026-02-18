/**
 * Server-side OCR for scanned PDFs.
 *
 * Uses pdfjs-dist (legacy build) to render PDF pages to images via
 * @napi-rs/canvas, then runs Tesseract.js OCR with Portuguese language.
 *
 * This module is lazy-imported in the unified pipeline. If dependencies
 * are missing, the import fails gracefully and the pipeline continues
 * without OCR.
 */

// ============================================================
// Types
// ============================================================

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  /** Tesseract mean confidence 0-100 */
  confidence: number;
  processingTimeMs: number;
}

export interface OcrOptions {
  /** Tesseract language code (default: "por") */
  language?: string;
  /** Render scale for PDF pages (default: 2.0 ≈ 144 DPI) */
  scale?: number;
  /** Progress callback */
  onProgress?: (current: number, total: number) => void;
}

// ============================================================
// Polyfill DOM types for pdfjs-dist in Node.js
// ============================================================

function ensureDomPolyfills() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  if (typeof globalThis.DOMMatrix === "undefined") {
    const canvas = require("@napi-rs/canvas");
    globalThis.DOMMatrix = canvas.DOMMatrix;
    (globalThis as Record<string, unknown>).DOMPoint = canvas.DOMPoint;
    (globalThis as Record<string, unknown>).DOMRect = canvas.DOMRect;
  }
  /* eslint-enable @typescript-eslint/no-require-imports */
}

// ============================================================
// Canvas factory for pdfjs-dist page rendering
// ============================================================

// Use `unknown` for canvas types — pdfjs-dist types don't match @napi-rs/canvas
// but the runtime APIs are compatible.
interface CanvasAndContext {
  canvas: unknown;
  context: unknown;
}

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { createCanvas } = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
    /* eslint-enable @typescript-eslint/no-require-imports */
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }

  reset(pair: CanvasAndContext, width: number, height: number): void {
    (pair.canvas as { width: number; height: number }).width = width;
    (pair.canvas as { width: number; height: number }).height = height;
  }

  destroy(_pair: CanvasAndContext): void {
    // Nothing to explicitly free
  }
}

// ============================================================
// PDF page rendering
// ============================================================

/**
 * Render a single PDF page to a PNG buffer.
 *
 * @param pdfBytes - Raw PDF file bytes
 * @param pageNumber - 1-based page number
 * @param scale - Render scale (2.0 = ~144 DPI for A4)
 */
export async function renderPdfPageToImage(
  pdfBytes: Uint8Array,
  pageNumber: number,
  scale: number = 2.0,
): Promise<Buffer> {
  ensureDomPolyfills();

  // Use legacy build for Node.js compatibility
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Cast needed: pdfjs-dist types don't include canvasFactory/useSystemFonts
  // but the runtime API accepts them.
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    canvasFactory: new NodeCanvasFactory(),
    useSystemFonts: true,
  } as unknown as Parameters<typeof pdfjs.getDocument>[0]);

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const factory = new NodeCanvasFactory();
  const { canvas, context } = factory.create(
    Math.floor(viewport.width),
    Math.floor(viewport.height),
  );

  // pdfjs v5 RenderParameters requires `canvas` + `canvasContext`.
  // Cast to satisfy the type while providing the runtime values.
  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
  } as unknown as Parameters<typeof page.render>[0]).promise;

  const pngBuffer = (canvas as unknown as { toBuffer(mime: string): Buffer }).toBuffer("image/png");

  // Clean up
  page.cleanup();
  await pdf.destroy();

  return pngBuffer;
}

// ============================================================
// OCR execution
// ============================================================

/**
 * Run OCR on specific pages of a PDF.
 *
 * Creates a single Tesseract worker, processes all requested pages
 * sequentially, then terminates the worker.
 *
 * @param pdfBytes - Raw PDF file bytes
 * @param scannedPageNumbers - 1-based page numbers to OCR
 * @param options - Language, scale, progress callback
 */
export async function ocrPdfPages(
  pdfBytes: Uint8Array,
  scannedPageNumbers: number[],
  options?: OcrOptions,
): Promise<OcrPageResult[]> {
  if (scannedPageNumbers.length === 0) return [];

  const language = options?.language ?? "por";
  const scale = options?.scale ?? 2.0;
  const onProgress = options?.onProgress;

  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker(language);
  const results: OcrPageResult[] = [];

  try {
    for (let i = 0; i < scannedPageNumbers.length; i++) {
      const pageNum = scannedPageNumbers[i];
      const startMs = performance.now();

      onProgress?.(i + 1, scannedPageNumbers.length);

      try {
        // Render PDF page to PNG
        const pngBuffer = await renderPdfPageToImage(pdfBytes, pageNum, scale);

        // Run Tesseract OCR
        const { data } = await worker.recognize(pngBuffer);

        results.push({
          pageNumber: pageNum,
          text: data.text.trim(),
          confidence: Math.round(data.confidence),
          processingTimeMs: Math.round(performance.now() - startMs),
        });
      } catch (err) {
        // Individual page failure doesn't stop the rest
        results.push({
          pageNumber: pageNum,
          text: "",
          confidence: 0,
          processingTimeMs: Math.round(performance.now() - startMs),
        });
        console.warn(
          `OCR failed for page ${pageNum}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  } finally {
    await worker.terminate();
  }

  return results;
}
