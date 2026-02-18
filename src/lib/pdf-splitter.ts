/**
 * PDF Splitting & Chunked Text Extraction
 *
 * Splits large PDFs into manageable chunks for parallel text extraction.
 * Uses pdf-lib for binary splitting and pdfjs-dist for text extraction.
 *
 * Features:
 * - Split by page count threshold (default: 50 pages per chunk)
 * - Split by file size estimate (default: 10 MB per chunk)
 * - Detect table-of-contents / logical section boundaries
 * - Parallel text extraction across chunks
 * - Reassemble extracted text with page numbers preserved
 */

import { PDFDocument } from "pdf-lib";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PdfSplitOptions {
  /** Max pages per chunk (default: 50) */
  maxPagesPerChunk?: number;
  /** Max bytes per chunk – approximate (default: 10 MB) */
  maxBytesPerChunk?: number;
  /** Try to split at logical boundaries like TOC sections (default: true) */
  detectLogicalBoundaries?: boolean;
  /** Max parallel extraction workers (default: 3) */
  concurrency?: number;
  /** Progress callback */
  onProgress?: ProgressCallback;
}

export interface PdfChunk {
  chunkIndex: number;
  /** 1-based start page (inclusive) */
  startPage: number;
  /** 1-based end page (inclusive) */
  endPage: number;
  pageCount: number;
  pdfBytes: Uint8Array;
}

export interface PageText {
  /** 1-based page number in the original document */
  page: number;
  text: string;
}

export interface PdfExtractionResult {
  /** Full concatenated text (pages joined by \\n\\n--- Página N ---\\n\\n) */
  text: string;
  /** Per-page text with original page numbers */
  pageTexts: PageText[];
  totalPages: number;
  chunks: number;
  metadata?: {
    title?: string;
    author?: string;
    tocPages?: number[];
  };
}

export type ProgressCallback = (progress: {
  stage: "splitting" | "extracting" | "reassembling";
  current: number;
  total: number;
  message: string;
}) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_PAGES = 50;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_CONCURRENCY = 3;

/**
 * Portuguese TOC / section-boundary keywords.
 * When detected at the start of a page, the splitter may place a chunk
 * boundary here instead of at an arbitrary page count.
 */
const SECTION_PATTERNS: RegExp[] = [
  // TOC headings
  /^[\s]*[ÍI]ndice/im,
  /^[\s]*(?:table\s+of\s+contents|sumário)/im,
  // Numbered chapters / parts
  /^[\s]*(?:cap[íi]tulo|parte|se[cç][çã]o|título)\s+[\dIVXLivxl]+/im,
  // Common Portuguese engineering document sections
  /^[\s]*\d+\.\s+(?:INTRODU[ÇC][ÃA]O|OBJECTO|DESCRI[ÇC][ÃA]O|REGULAMENTA[ÇC][ÃA]O|CONCLUS[ÃA]O)/im,
  /^[\s]*(?:ANEXO|APÊNDICE)\s+[A-Z\dIVX]+/im,
  // Common specialty project headings
  /^[\s]*(?:MEM[ÓO]RIA DESCRITIVA|CADERNO DE ENCARGOS|MAPA DE QUANTIDADES)/im,
  /^[\s]*(?:PROJETO DE (?:ESTABILIDADE|ARQUITETURA|[ÁA]GUAS|ESGOTOS|G[ÁA]S|ELETRICIDADE|TELECOMUNICA[ÇC][ÕO]ES))/im,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine whether a PDF needs splitting (based on page count).
 * Cheap check — only reads PDF structure, no text extraction.
 */
export async function needsSplitting(
  data: ArrayBuffer | Uint8Array,
  options?: Pick<PdfSplitOptions, "maxPagesPerChunk">,
): Promise<{ needsSplit: boolean; pageCount: number }> {
  const pdf = await PDFDocument.load(data, { ignoreEncryption: true });
  const pageCount = pdf.getPageCount();
  const threshold = options?.maxPagesPerChunk ?? DEFAULT_MAX_PAGES;
  return { needsSplit: pageCount > threshold, pageCount };
}

/**
 * Split a PDF into chunks.
 *
 * If the document is small enough, returns a single chunk containing
 * the entire document (no binary copy — just wraps the original bytes).
 */
export async function splitPdf(
  data: ArrayBuffer | Uint8Array,
  options: PdfSplitOptions = {},
): Promise<PdfChunk[]> {
  const {
    maxPagesPerChunk = DEFAULT_MAX_PAGES,
    maxBytesPerChunk = DEFAULT_MAX_BYTES,
    detectLogicalBoundaries = true,
    onProgress,
  } = options;

  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = srcPdf.getPageCount();

  onProgress?.({
    stage: "splitting",
    current: 0,
    total: totalPages,
    message: `Documento com ${totalPages} páginas`,
  });

  // If small enough by both page count AND byte size, return as a single chunk
  if (totalPages <= maxPagesPerChunk && bytes.length <= maxBytesPerChunk) {
    return [
      {
        chunkIndex: 0,
        startPage: 1,
        endPage: totalPages,
        pageCount: totalPages,
        pdfBytes: bytes,
      },
    ];
  }

  // Detect logical boundaries if enabled
  let logicalBreaks: Set<number> = new Set();
  if (detectLogicalBoundaries) {
    logicalBreaks = await detectBoundaries(srcPdf);
  }

  // Calculate split points
  const splitPoints = computeSplitPoints(
    totalPages,
    maxPagesPerChunk,
    maxBytesPerChunk,
    bytes.length,
    logicalBreaks,
  );

  // Create chunk PDFs
  const chunks: PdfChunk[] = [];

  for (let i = 0; i < splitPoints.length; i++) {
    const start = splitPoints[i]; // 0-based
    const end = i + 1 < splitPoints.length ? splitPoints[i + 1] - 1 : totalPages - 1;

    onProgress?.({
      stage: "splitting",
      current: i + 1,
      total: splitPoints.length,
      message: `A criar bloco ${i + 1}/${splitPoints.length} (páginas ${start + 1}–${end + 1})`,
    });

    const chunkPdf = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start + 1 }, (_, j) => start + j);
    const copiedPages = await chunkPdf.copyPages(srcPdf, pageIndices);
    for (const page of copiedPages) {
      chunkPdf.addPage(page);
    }

    const chunkBytes = await chunkPdf.save();

    chunks.push({
      chunkIndex: i,
      startPage: start + 1,
      endPage: end + 1,
      pageCount: end - start + 1,
      pdfBytes: chunkBytes,
    });
  }

  return chunks;
}

/**
 * Extract text from PDF chunks in parallel using pdfjs-dist.
 * Returns a reassembled result with page numbers referencing the original
 * document.
 */
export async function extractTextFromChunks(
  chunks: PdfChunk[],
  options: Pick<PdfSplitOptions, "concurrency" | "onProgress"> = {},
): Promise<PdfExtractionResult> {
  const { concurrency = DEFAULT_CONCURRENCY, onProgress } = options;
  const allPageTexts: PageText[] = [];

  // Process chunks in batches of `concurrency`
  let completed = 0;
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (chunk) => {
        const pages = await extractPagesFromBytes(chunk.pdfBytes);
        return pages.map((text, idx) => ({
          page: chunk.startPage + idx,
          text,
        }));
      }),
    );

    for (const pages of batchResults) {
      allPageTexts.push(...pages);
      completed++;
      onProgress?.({
        stage: "extracting",
        current: completed,
        total: chunks.length,
        message: `Extraído bloco ${completed}/${chunks.length}`,
      });
    }
  }

  // Sort by page number (should already be in order, but be safe)
  allPageTexts.sort((a, b) => a.page - b.page);

  // Reassemble full text with page markers
  onProgress?.({
    stage: "reassembling",
    current: 0,
    total: 1,
    message: "A reunir texto extraído",
  });

  const text = allPageTexts
    .map((pt) => `--- Página ${pt.page} ---\n${pt.text}`)
    .join("\n\n");

  const totalPages = allPageTexts.length;

  return {
    text,
    pageTexts: allPageTexts,
    totalPages,
    chunks: chunks.length,
  };
}

/**
 * All-in-one: split a PDF and extract text from all chunks.
 * For small documents, skips binary splitting entirely and extracts directly.
 */
export async function splitAndExtract(
  data: ArrayBuffer | Uint8Array,
  options: PdfSplitOptions = {},
): Promise<PdfExtractionResult> {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const { onProgress } = options;

  // Quick check: does it even need splitting?
  const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = srcPdf.getPageCount();
  const threshold = options.maxPagesPerChunk ?? DEFAULT_MAX_PAGES;

  // Read metadata
  const title = srcPdf.getTitle() ?? undefined;
  const author = srcPdf.getAuthor() ?? undefined;

  if (totalPages <= threshold) {
    // Small document — extract directly without splitting
    onProgress?.({
      stage: "extracting",
      current: 0,
      total: totalPages,
      message: `A extrair texto de ${totalPages} páginas`,
    });

    const pages = await extractPagesFromBytes(bytes);
    const pageTexts = pages.map((text, idx) => ({ page: idx + 1, text }));
    const text = pageTexts
      .map((pt) => `--- Página ${pt.page} ---\n${pt.text}`)
      .join("\n\n");

    onProgress?.({
      stage: "extracting",
      current: totalPages,
      total: totalPages,
      message: "Extração completa",
    });

    return {
      text,
      pageTexts,
      totalPages,
      chunks: 1,
      metadata: { title, author },
    };
  }

  // Large document — split then extract
  const chunks = await splitPdf(bytes, options);

  const result = await extractTextFromChunks(chunks, {
    concurrency: options.concurrency,
    onProgress,
  });

  // Detect TOC pages in the result
  const tocPages = detectTocPages(result.pageTexts);

  return {
    ...result,
    metadata: {
      title,
      author,
      tocPages: tocPages.length > 0 ? tocPages : undefined,
    },
  };
}

/**
 * Get the page count of a PDF without fully parsing it.
 */
export async function getPageCount(
  data: ArrayBuffer | Uint8Array,
): Promise<number> {
  const pdf = await PDFDocument.load(data, { ignoreEncryption: true });
  return pdf.getPageCount();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Detect logical section boundaries by extracting the first line of each page
 * and matching against SECTION_PATTERNS.
 */
async function detectBoundaries(srcPdf: PDFDocument): Promise<Set<number>> {
  const breaks = new Set<number>();
  const totalPages = srcPdf.getPageCount();

  // Only check a sample of pages for large docs (every page is expensive)
  const pagesToCheck =
    totalPages <= 200
      ? Array.from({ length: totalPages }, (_, i) => i)
      : Array.from({ length: totalPages }, (_, i) => i).filter(
          (i) => i % 5 === 0 || i < 10,
        );

  const pdfBytes = await srcPdf.save();

  try {
    const pdfjs = await import("pdfjs-dist");
    configurePdfjsWorker(pdfjs);

    const loadingTask = pdfjs.getDocument({ data: pdfBytes });
    const pdf = await loadingTask.promise;

    for (const pageIdx of pagesToCheck) {
      try {
        const page = await pdf.getPage(pageIdx + 1); // 1-based
        const content = await page.getTextContent();
        const firstChars = content.items
          .slice(0, 5)
          .map((item: Record<string, unknown>) =>
            "str" in item ? (item.str as string) : "",
          )
          .join(" ")
          .slice(0, 200);

        for (const pattern of SECTION_PATTERNS) {
          if (pattern.test(firstChars)) {
            breaks.add(pageIdx);
            break;
          }
        }
      } catch {
        // Skip pages that can't be read
      }
    }
  } catch {
    // pdfjs-dist not available — skip boundary detection
  }

  return breaks;
}

/**
 * Compute split points (0-based page indices where each chunk starts).
 *
 * Strategy:
 * 1. Start with uniform chunks of maxPagesPerChunk.
 * 2. Adjust split points to nearby logical boundaries if within ±5 pages.
 * 3. Enforce maxBytesPerChunk by splitting further if estimated to exceed.
 */
function computeSplitPoints(
  totalPages: number,
  maxPages: number,
  maxBytes: number,
  totalBytes: number,
  logicalBreaks: Set<number>,
): number[] {
  const points: number[] = [0];
  let cursor = maxPages;

  while (cursor < totalPages) {
    // Look for a logical break within ±5 pages of the target
    let bestBreak = cursor;
    for (let offset = 0; offset <= 5; offset++) {
      if (logicalBreaks.has(cursor + offset) && cursor + offset < totalPages) {
        bestBreak = cursor + offset;
        break;
      }
      if (offset > 0 && logicalBreaks.has(cursor - offset) && cursor - offset > points[points.length - 1]) {
        bestBreak = cursor - offset;
        break;
      }
    }

    points.push(bestBreak);
    cursor = bestBreak + maxPages;
  }

  // Enforce byte limit via proportional estimation
  const avgBytesPerPage = totalBytes / totalPages;
  const refined: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const start = points[i];
    const end = i + 1 < points.length ? points[i + 1] : totalPages;
    const chunkPages = end - start;
    const estimatedBytes = chunkPages * avgBytesPerPage;

    if (estimatedBytes > maxBytes && chunkPages > 1) {
      const subChunkPages = Math.max(1, Math.floor(maxBytes / avgBytesPerPage));
      let subCursor = start;
      while (subCursor < end) {
        refined.push(subCursor);
        subCursor += subChunkPages;
      }
    } else {
      refined.push(start);
    }
  }

  return refined;
}

/**
 * Extract text from each page of a PDF using pdfjs-dist.
 * Returns an array of text strings, one per page, in page order.
 */
async function extractPagesFromBytes(pdfBytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  configurePdfjsWorker(pdfjs);

  const loadingTask = pdfjs.getDocument({ data: pdfBytes });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: Record<string, unknown>) =>
        "str" in item ? (item.str as string) : "",
      )
      .join(" ");
    pages.push(text);
  }

  return pages;
}

/**
 * Detect TOC pages from extracted text by checking for TOC-indicator patterns.
 */
function detectTocPages(pageTexts: PageText[]): number[] {
  const tocPages: number[] = [];
  const tocPattern = /(?:[ÍI]ndice|table\s+of\s+contents|sumário)/i;
  const pageRefPattern = /\.{3,}\s*\d+/; // "........... 12" typical in TOCs

  for (const pt of pageTexts) {
    const firstChunk = pt.text.slice(0, 300);
    if (tocPattern.test(firstChunk) || pageRefPattern.test(pt.text)) {
      tocPages.push(pt.page);
    }
  }

  return tocPages;
}

/**
 * Configure pdfjs-dist worker — supports both browser and Node environments.
 */
function configurePdfjsWorker(
  pdfjs: typeof import("pdfjs-dist"),
): void {
  if (pdfjs.GlobalWorkerOptions.workerSrc) return; // already configured

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.js/pdf.worker.min.mjs";
  } else {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
    } catch {
      // Fallback: disable worker (slower but works)
      pdfjs.GlobalWorkerOptions.workerSrc = "";
    }
  }
}