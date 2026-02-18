import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_PAGES = 50;

/**
 * POST /api/ocr
 *
 * Accepts FormData with:
 *   - file  — PDF file to OCR
 *   - pages — JSON array of 1-based page numbers to OCR
 *   - language — Tesseract language code (default: "por")
 *
 * Returns JSON with OCR'd text for each page.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Campo 'file' é obrigatório (PDF)." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Ficheiro excede o limite de ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
        { status: 400 },
      );
    }

    const pagesStr = formData.get("pages");
    if (typeof pagesStr !== "string") {
      return NextResponse.json(
        { error: "Campo 'pages' é obrigatório (JSON array de números de página)." },
        { status: 400 },
      );
    }

    let pages: number[];
    try {
      pages = JSON.parse(pagesStr);
      if (!Array.isArray(pages) || pages.some((p) => typeof p !== "number" || p < 1)) {
        throw new Error("invalid");
      }
    } catch {
      return NextResponse.json(
        { error: "Campo 'pages' deve ser um JSON array de números positivos." },
        { status: 400 },
      );
    }

    if (pages.length > MAX_PAGES) {
      return NextResponse.json(
        { error: `Máximo de ${MAX_PAGES} páginas por pedido.` },
        { status: 400 },
      );
    }

    const language = (formData.get("language") as string) ?? "por";

    const { ocrPdfPages } = await import("@/lib/server-ocr");
    const buffer = await file.arrayBuffer();
    const results = await ocrPdfPages(new Uint8Array(buffer), pages, { language });

    return NextResponse.json({
      texts: results.map((r) => r.text),
      confidences: results.map((r) => r.confidence),
    });
  } catch (error) {
    console.error("OCR error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      {
        error: "Erro ao processar OCR.",
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
