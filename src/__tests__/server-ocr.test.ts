import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies ─────────────────────────────────────

const mockRecognize = vi.fn();
const mockTerminate = vi.fn();
const mockCreateWorker = vi.fn();

vi.mock("tesseract.js", () => ({
  createWorker: (...args: unknown[]) => mockCreateWorker(...args),
}));

const mockCreateCanvas = vi.fn();

vi.mock("@napi-rs/canvas", () => ({
  createCanvas: (...args: unknown[]) => mockCreateCanvas(...args),
  DOMMatrix: class DOMMatrix {},
  DOMPoint: class DOMPoint {},
  DOMRect: class DOMRect {},
}));

const mockGetDocument = vi.fn();

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
}));

import { ocrPdfPages, renderPdfPageToImage } from "@/lib/server-ocr";

// ─── Helpers ────────────────────────────────────────────────

function setupMocks(opts?: { ocrText?: string; confidence?: number }) {
  const ocrText = opts?.ocrText ?? "Memória descritiva\nÁrea bruta: 250 m2";
  const confidence = opts?.confidence ?? 85;

  // Mock Tesseract worker
  mockRecognize.mockResolvedValue({
    data: { text: ocrText, confidence },
  });
  mockTerminate.mockResolvedValue(undefined);
  mockCreateWorker.mockResolvedValue({
    recognize: mockRecognize,
    terminate: mockTerminate,
  });

  // Mock canvas
  const mockContext = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
  };
  const mockCanvas = {
    getContext: vi.fn().mockReturnValue(mockContext),
    toBuffer: vi.fn().mockReturnValue(Buffer.from("fake-png")),
    width: 1000,
    height: 1414,
  };
  mockCreateCanvas.mockReturnValue(mockCanvas);

  // Mock pdfjs document
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 595, height: 842, scale: 2.0 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    cleanup: vi.fn(),
  };
  const mockPdf = {
    getPage: vi.fn().mockResolvedValue(mockPage),
    destroy: vi.fn().mockResolvedValue(undefined),
    numPages: 5,
  };
  mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) });

  return { mockCanvas, mockContext, mockPage, mockPdf };
}

// ─── Tests ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ocrPdfPages", () => {
  it("returns empty array for empty page list", async () => {
    const results = await ocrPdfPages(new Uint8Array(10), []);
    expect(results).toEqual([]);
    expect(mockCreateWorker).not.toHaveBeenCalled();
  });

  it("creates a Portuguese Tesseract worker by default", async () => {
    setupMocks();
    await ocrPdfPages(new Uint8Array(10), [1]);
    expect(mockCreateWorker).toHaveBeenCalledWith("por");
  });

  it("uses custom language when specified", async () => {
    setupMocks();
    await ocrPdfPages(new Uint8Array(10), [1], { language: "eng" });
    expect(mockCreateWorker).toHaveBeenCalledWith("eng");
  });

  it("returns OCR text and confidence for each page", async () => {
    setupMocks({ ocrText: "Projeto de estruturas", confidence: 92 });

    const results = await ocrPdfPages(new Uint8Array(10), [2, 5]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      pageNumber: 2,
      text: "Projeto de estruturas",
      confidence: 92,
    });
    expect(results[1]).toMatchObject({
      pageNumber: 5,
      text: "Projeto de estruturas",
      confidence: 92,
    });
    expect(results[0].processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("terminates Tesseract worker after processing", async () => {
    setupMocks();
    await ocrPdfPages(new Uint8Array(10), [1, 3]);
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it("terminates worker even when OCR fails", async () => {
    setupMocks();
    mockRecognize.mockRejectedValue(new Error("OCR crash"));

    const results = await ocrPdfPages(new Uint8Array(10), [1]);

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("");
    expect(results[0].confidence).toBe(0);
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it("reports progress for each page", async () => {
    setupMocks();
    const progressCalls: [number, number][] = [];

    await ocrPdfPages(new Uint8Array(10), [1, 3, 7], {
      onProgress: (current, total) => progressCalls.push([current, total]),
    });

    expect(progressCalls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("handles individual page failure without stopping other pages", async () => {
    setupMocks();
    // First call succeeds, second fails, third succeeds
    mockRecognize
      .mockResolvedValueOnce({ data: { text: "Page 1 text", confidence: 80 } })
      .mockRejectedValueOnce(new Error("corrupt"))
      .mockResolvedValueOnce({ data: { text: "Page 3 text", confidence: 75 } });

    const results = await ocrPdfPages(new Uint8Array(10), [1, 2, 3]);

    expect(results).toHaveLength(3);
    expect(results[0].text).toBe("Page 1 text");
    expect(results[1].text).toBe("");
    expect(results[1].confidence).toBe(0);
    expect(results[2].text).toBe("Page 3 text");
  });
});

describe("renderPdfPageToImage", () => {
  it("renders a PDF page at the specified scale", async () => {
    const { mockPage } = setupMocks();

    const result = await renderPdfPageToImage(new Uint8Array(10), 1, 3.0);

    expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 3.0 });
    expect(result).toBeInstanceOf(Buffer);
  });

  it("uses default scale of 2.0", async () => {
    const { mockPage } = setupMocks();

    await renderPdfPageToImage(new Uint8Array(10), 1);

    expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 2.0 });
  });
});
