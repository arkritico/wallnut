import { describe, it, expect, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  needsSplitting,
  splitPdf,
  getPageCount,
  type PdfChunk,
  type ProgressCallback,
} from "@/lib/pdf-splitter";

// ---------------------------------------------------------------------------
// Helpers — create test PDFs with pdf-lib
// ---------------------------------------------------------------------------

/** Create a PDF with N pages, each containing "Page X" text. */
async function createTestPdf(
  numPages: number,
  options?: { tocOnPage?: number; sectionOnPage?: number },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < numPages; i++) {
    const page = doc.addPage([595, 842]); // A4
    let text = `Page ${i + 1}`;

    if (options?.tocOnPage === i) {
      text = `Índice\n1. Introdução ........... 3\n2. Descrição ........... 10`;
    }
    if (options?.sectionOnPage === i) {
      text = `Capítulo III - Estruturas`;
    }

    page.drawText(text, { x: 50, y: 750, size: 12, font });
  }

  return doc.save();
}

// ---------------------------------------------------------------------------
// needsSplitting
// ---------------------------------------------------------------------------

describe("needsSplitting", () => {
  it("returns false for small documents", async () => {
    const pdf = await createTestPdf(10);
    const result = await needsSplitting(pdf);
    expect(result.needsSplit).toBe(false);
    expect(result.pageCount).toBe(10);
  });

  it("returns true for documents exceeding threshold", async () => {
    const pdf = await createTestPdf(60);
    const result = await needsSplitting(pdf);
    expect(result.needsSplit).toBe(true);
    expect(result.pageCount).toBe(60);
  });

  it("respects custom maxPagesPerChunk", async () => {
    const pdf = await createTestPdf(15);
    const result = await needsSplitting(pdf, { maxPagesPerChunk: 10 });
    expect(result.needsSplit).toBe(true);
    expect(result.pageCount).toBe(15);
  });

  it("works with ArrayBuffer input", async () => {
    const pdf = await createTestPdf(5);
    const arrayBuffer = pdf.buffer.slice(
      pdf.byteOffset,
      pdf.byteOffset + pdf.byteLength,
    );
    const result = await needsSplitting(arrayBuffer);
    expect(result.needsSplit).toBe(false);
    expect(result.pageCount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getPageCount
// ---------------------------------------------------------------------------

describe("getPageCount", () => {
  it("returns correct page count", async () => {
    const pdf = await createTestPdf(25);
    expect(await getPageCount(pdf)).toBe(25);
  });

  it("returns 1 for single-page PDF", async () => {
    const pdf = await createTestPdf(1);
    expect(await getPageCount(pdf)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// splitPdf
// ---------------------------------------------------------------------------

describe("splitPdf", () => {
  it("returns single chunk for small document", async () => {
    const pdf = await createTestPdf(10);
    const chunks = await splitPdf(pdf, { maxPagesPerChunk: 50 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].startPage).toBe(1);
    expect(chunks[0].endPage).toBe(10);
    expect(chunks[0].pageCount).toBe(10);
    // Original bytes returned unchanged
    expect(chunks[0].pdfBytes).toBe(pdf);
  });

  it("splits 100-page document into 2 chunks of 50", async () => {
    const pdf = await createTestPdf(100);
    const chunks = await splitPdf(pdf, {
      maxPagesPerChunk: 50,
      detectLogicalBoundaries: false,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0].startPage).toBe(1);
    expect(chunks[0].endPage).toBe(50);
    expect(chunks[0].pageCount).toBe(50);
    expect(chunks[1].startPage).toBe(51);
    expect(chunks[1].endPage).toBe(100);
    expect(chunks[1].pageCount).toBe(50);
  });

  it("handles non-even splits correctly", async () => {
    const pdf = await createTestPdf(75);
    const chunks = await splitPdf(pdf, {
      maxPagesPerChunk: 50,
      detectLogicalBoundaries: false,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0].pageCount).toBe(50);
    expect(chunks[1].pageCount).toBe(25);
    expect(chunks[1].startPage).toBe(51);
    expect(chunks[1].endPage).toBe(75);
  });

  it("splits into many chunks for large documents", async () => {
    const pdf = await createTestPdf(200);
    const chunks = await splitPdf(pdf, {
      maxPagesPerChunk: 50,
      detectLogicalBoundaries: false,
    });

    expect(chunks).toHaveLength(4);
    // All pages covered
    const totalPages = chunks.reduce((sum, c) => sum + c.pageCount, 0);
    expect(totalPages).toBe(200);
    // No gaps between chunks
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startPage).toBe(chunks[i - 1].endPage + 1);
    }
  });

  it("produces valid PDFs for each chunk", async () => {
    const pdf = await createTestPdf(80);
    const chunks = await splitPdf(pdf, {
      maxPagesPerChunk: 30,
      detectLogicalBoundaries: false,
    });

    for (const chunk of chunks) {
      // Each chunk should be a valid PDF that pdf-lib can load
      const chunkDoc = await PDFDocument.load(chunk.pdfBytes);
      expect(chunkDoc.getPageCount()).toBe(chunk.pageCount);
    }
  });

  it("uses small maxPagesPerChunk correctly", async () => {
    const pdf = await createTestPdf(12);
    const chunks = await splitPdf(pdf, {
      maxPagesPerChunk: 5,
      detectLogicalBoundaries: false,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const totalPages = chunks.reduce((sum, c) => sum + c.pageCount, 0);
    expect(totalPages).toBe(12);
  });

  it("calls onProgress during splitting", async () => {
    const pdf = await createTestPdf(100);
    const progress = vi.fn();

    await splitPdf(pdf, {
      maxPagesPerChunk: 50,
      detectLogicalBoundaries: false,
      onProgress: progress,
    });

    expect(progress).toHaveBeenCalled();
    const calls = progress.mock.calls;
    // Should have at least the initial call + chunk creation calls
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0][0].stage).toBe("splitting");
  });

  it("chunk indices are sequential starting from 0", async () => {
    const pdf = await createTestPdf(150);
    const chunks = await splitPdf(pdf, {
      maxPagesPerChunk: 50,
      detectLogicalBoundaries: false,
    });

    chunks.forEach((chunk, idx) => {
      expect(chunk.chunkIndex).toBe(idx);
    });
  });
});

// ---------------------------------------------------------------------------
// splitPdf with byte-size limits
// ---------------------------------------------------------------------------

describe("splitPdf byte-size limits", () => {
  it("further splits large chunks when maxBytesPerChunk is small", async () => {
    // Create a 100-page PDF — each page is relatively small with pdf-lib
    const pdf = await createTestPdf(100);
    const perPage = pdf.length / 100;

    // Set byte limit to ~10 pages worth
    const chunks = await splitPdf(pdf, {
      maxPagesPerChunk: 100, // wouldn't split by page count
      maxBytesPerChunk: Math.floor(perPage * 10),
      detectLogicalBoundaries: false,
    });

    // Should have been further subdivided
    expect(chunks.length).toBeGreaterThan(1);
    const totalPages = chunks.reduce((sum, c) => sum + c.pageCount, 0);
    expect(totalPages).toBe(100);
  });
});
