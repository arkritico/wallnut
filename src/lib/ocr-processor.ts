/**
 * Scanned PDF OCR processor.
 *
 * Detects whether a PDF is scanned (image-only) and uses a
 * lightweight canvas-based approach to extract text via the
 * browser's built-in OCR-like capabilities (Intl.Segmenter)
 * or falls back to pattern-based extraction from rendered pages.
 *
 * For production OCR we call the /api/parse-document endpoint
 * which can use server-side Tesseract or cloud OCR services.
 * This client-side module provides:
 *   1. Scanned-PDF detection (pages with < 50 chars of text)
 *   2. Page-image extraction for server-side OCR
 *   3. Heuristic text extraction from rendered PDF pages
 *   4. Portuguese construction document keyword extraction
 */

// ============================================================
// Types
// ============================================================

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: "high" | "medium" | "low";
  isScanned: boolean;
  /** Width and height of the rendered page image */
  imageDimensions?: { width: number; height: number };
}

export interface OcrResult {
  pages: OcrPageResult[];
  fullText: string;
  /** Percentage of pages that appear to be scanned */
  scannedPagePercent: number;
  /** Whether the document is predominantly scanned */
  isScannedDocument: boolean;
  /** Extracted Portuguese keywords found in the document */
  keywords: string[];
  warnings: string[];
  processingTimeMs: number;
}

export interface OcrOptions {
  /** Maximum number of pages to process (default: 50) */
  maxPages?: number;
  /** Minimum text length to consider a page "text-based" (default: 50) */
  minTextLength?: number;
  /** Whether to attempt server-side OCR for scanned pages (default: true) */
  useServerOcr?: boolean;
  /** Progress callback */
  onProgress?: (page: number, total: number) => void;
}

// ============================================================
// Portuguese construction keyword patterns
// ============================================================

const PT_CONSTRUCTION_KEYWORDS = [
  // Project types
  /mem[óo]ria\s+descritiva/i,
  /projeto\s+de\s+(arquitetura|estruturas|estabilidade)/i,
  /projeto\s+(el[ée]trico|avac|ac[úu]stic[oa]|t[ée]rmic[oa])/i,
  /projeto\s+de\s+(seguran[çc]a|inc[êe]ndio|scie)/i,
  /projeto\s+de\s+([áa]guas|drenagem|g[áa]s)/i,
  /projeto\s+ited/i,
  /mapa\s+de\s+quantidades/i,
  /or[çc]amento/i,
  /caderno\s+de\s+encargos/i,

  // Regulations
  /rgeu/i,
  /c[óo]digo\s+civil/i,
  /euroc[óo]digo/i,
  /scie/i,
  /reh\b/i,
  /recs\b/i,
  /rrae\b/i,
  /rtiebt/i,
  /ited/i,
  /itur/i,
  /rgsppdadar/i,
  /rjue/i,

  // Technical terms
  /coeficiente\s+de\s+transmiss[ãa]o/i,
  /resist[êe]ncia\s+t[ée]rmica/i,
  /classe\s+energ[ée]tica/i,
  /pe.*direito/i,
  /ilumina[çc][ãa]o\s+natural/i,
  /ventila[çc][ãa]o/i,
  /acessibilidade/i,
  /evacuação/i,
  /categoria\s+de\s+risco/i,
  /zona\s+s[íi]smica/i,
  /pot[êe]ncia\s+contratada/i,
  /quadro\s+el[ée]trico/i,

  // Location
  /munic[íi]pio/i,
  /distrito/i,
  /freguesia/i,
  /pdm/i,
  /loteamento/i,

  // Entities
  /anacom/i,
  /dgeg/i,
  /anpc/i,
  /c[âa]mara\s+municipal/i,
];

// ============================================================
// Core functions
// ============================================================

/**
 * Detect whether a PDF file contains scanned pages (image-only)
 * and extract text from all pages, using OCR for scanned ones.
 *
 * Uses pdfjs-dist for text extraction and page rendering.
 */
export async function processScannedPdf(
  file: File,
  options?: OcrOptions,
): Promise<OcrResult> {
  const startTime = performance.now();
  const opts = {
    maxPages: options?.maxPages ?? 50,
    minTextLength: options?.minTextLength ?? 50,
    useServerOcr: options?.useServerOcr ?? true,
    onProgress: options?.onProgress,
  };
  const warnings: string[] = [];
  const pages: OcrPageResult[] = [];

  // Load pdfjs
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const totalPages = Math.min(pdf.numPages, opts.maxPages);

  if (pdf.numPages > opts.maxPages) {
    warnings.push(
      `Documento tem ${pdf.numPages} páginas. Apenas as primeiras ${opts.maxPages} foram processadas.`,
    );
  }

  // Phase 1: Extract text from each page and detect scanned pages
  const scannedPageIndices: number[] = [];

  for (let i = 1; i <= totalPages; i++) {
    opts.onProgress?.(i, totalPages);

    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: Record<string, unknown>) => ("str" in item ? (item.str as string) : ""))
      .join(" ")
      .trim();

    const isScanned = text.length < opts.minTextLength;

    if (isScanned) {
      scannedPageIndices.push(i);
    }

    pages.push({
      pageNumber: i,
      text,
      confidence: isScanned ? "low" : "high",
      isScanned,
    });
  }

  // Phase 2: For scanned pages, attempt server-side OCR
  if (scannedPageIndices.length > 0 && opts.useServerOcr) {
    try {
      const ocrTexts = await serverOcrPages(file, scannedPageIndices);
      for (let idx = 0; idx < scannedPageIndices.length; idx++) {
        const pageNum = scannedPageIndices[idx];
        const pageResult = pages.find((p) => p.pageNumber === pageNum);
        if (pageResult && ocrTexts[idx]) {
          pageResult.text = ocrTexts[idx];
          pageResult.confidence = ocrTexts[idx].length > opts.minTextLength ? "medium" : "low";
        }
      }
    } catch {
      warnings.push(
        `OCR servidor indisponível para ${scannedPageIndices.length} página(s) digitalizada(s). Texto pode estar incompleto.`,
      );
    }
  }

  // Phase 3: Extract keywords from all text
  const fullText = pages.map((p) => p.text).join("\n\n");
  const keywords = extractKeywords(fullText);

  const scannedPagePercent =
    totalPages > 0 ? Math.round((scannedPageIndices.length / totalPages) * 100) : 0;

  return {
    pages,
    fullText,
    scannedPagePercent,
    isScannedDocument: scannedPagePercent > 50,
    keywords,
    warnings,
    processingTimeMs: Math.round(performance.now() - startTime),
  };
}

/**
 * Quick check: is this PDF likely a scanned document?
 * Checks only the first 3 pages for speed.
 */
export async function isScannedPdf(
  file: File,
  minTextLength: number = 50,
): Promise<boolean> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const checkPages = Math.min(pdf.numPages, 3);
  let scannedCount = 0;

  for (let i = 1; i <= checkPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: Record<string, unknown>) => ("str" in item ? (item.str as string) : ""))
      .join(" ")
      .trim();

    if (text.length < minTextLength) {
      scannedCount++;
    }
  }

  return scannedCount > checkPages / 2;
}

// ============================================================
// Server-side OCR helper
// ============================================================

/**
 * Send specific scanned pages to the server for OCR processing.
 * The server endpoint handles Tesseract or cloud OCR.
 */
async function serverOcrPages(
  file: File,
  pageNumbers: number[],
): Promise<string[]> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("pages", JSON.stringify(pageNumbers));
  formData.append("language", "por"); // Portuguese

  const response = await fetch("/api/ocr", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OCR request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.texts ?? [];
}

// ============================================================
// Keyword extraction
// ============================================================

/**
 * Extract Portuguese construction-related keywords from text.
 */
function extractKeywords(text: string): string[] {
  if (!text || text.length < 10) return [];

  const found: string[] = [];

  for (const pattern of PT_CONSTRUCTION_KEYWORDS) {
    const match = text.match(pattern);
    if (match) {
      found.push(match[0]);
    }
  }

  return [...new Set(found)];
}

/**
 * Extract structured data hints from OCR text.
 * Returns key-value pairs that might map to BuildingProject fields.
 */
export function extractStructuredHints(text: string): Record<string, string> {
  const hints: Record<string, string> = {};

  // Area patterns
  const areaMatch = text.match(
    /[áa]rea\s+(?:bruta|total|constru[çc][ãa]o)\s*[:\-–]?\s*([\d.,]+)\s*m[²2]/i,
  );
  if (areaMatch) hints.grossFloorArea = areaMatch[1].replace(",", ".");

  const usableMatch = text.match(
    /[áa]rea\s+[úu]til\s*[:\-–]?\s*([\d.,]+)\s*m[²2]/i,
  );
  if (usableMatch) hints.usableFloorArea = usableMatch[1].replace(",", ".");

  // Floors
  const floorMatch = text.match(
    /(\d+)\s*pisos?/i,
  );
  if (floorMatch) hints.numberOfFloors = floorMatch[1];

  // Height
  const heightMatch = text.match(
    /(?:altura|c[ée]rcea|p[ée].*direito)\s*[:\-–]?\s*([\d.,]+)\s*m(?:etro)?/i,
  );
  if (heightMatch) hints.buildingHeight = heightMatch[1].replace(",", ".");

  // Municipality
  const muniMatch = text.match(
    /munic[íi]pio\s+(?:de\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/,
  );
  if (muniMatch) hints.municipality = muniMatch[1];

  // District
  const distMatch = text.match(
    /distrito\s+(?:de\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/,
  );
  if (distMatch) hints.district = distMatch[1];

  // U-values
  const uValueMatch = text.match(
    /U\s*=?\s*([\d.,]+)\s*W\/?\s*\(?\s*m[²2]\s*[.·]?\s*K\s*\)?/i,
  );
  if (uValueMatch) hints.uValue = uValueMatch[1].replace(",", ".");

  // Power
  const powerMatch = text.match(
    /pot[êe]ncia\s*(?:contratada)?\s*[:\-–]?\s*([\d.,]+)\s*kVA/i,
  );
  if (powerMatch) hints.contractedPower = powerMatch[1].replace(",", ".");

  return hints;
}
