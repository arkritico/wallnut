import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logger";

const log = createLogger("ifc-convert");

// ── Route config ─────────────────────────────────────────────
export const runtime = "nodejs";
export const maxDuration = 300; // seconds (Vercel Pro)
export const dynamic = "force-dynamic";

// ── Limits ───────────────────────────────────────────────────
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
const IFC_HEADER_PATTERN = /ISO-10303-21/;

/**
 * POST /api/ifc-convert
 *
 * Converts an IFC file to optimized Fragment binary format (~10-25x smaller).
 * The client can then load the fragment via FragmentsModels.load() instead of
 * re-parsing raw IFC every time.
 *
 * Input:  multipart/form-data with a single "file" field (.ifc)
 * Output: application/octet-stream (fragment binary)
 *
 * For files > Vercel's body limit, the client should:
 * 1. Upload IFC to Supabase Storage via /api/pipeline/upload-url
 * 2. POST { storagePath } as JSON to this route
 * 3. Server downloads from Storage, converts, returns fragment binary
 */
export const POST = withApiHandler("ifc-convert", async (request) => {
  const contentType = request.headers.get("content-type") ?? "";
  let ifcBytes: Uint8Array;
  let fileName: string;

  if (contentType.includes("multipart/form-data")) {
    // ── Direct upload via FormData ─────────────────────────
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Campo 'file' em falta. Envie um ficheiro .ifc." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".ifc")) {
      return NextResponse.json(
        { error: "Apenas ficheiros .ifc são suportados." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Ficheiro excede o limite de ${MAX_FILE_SIZE / (1024 * 1024)} MB.` },
        { status: 413 },
      );
    }

    const buffer = await file.arrayBuffer();
    ifcBytes = new Uint8Array(buffer);
    fileName = file.name;
  } else if (contentType.includes("application/json")) {
    // ── Storage-based: download from Supabase ──────────────
    const body = await request.json() as { storagePath?: string; fileName?: string };

    if (!body.storagePath || !body.fileName) {
      return NextResponse.json(
        { error: "storagePath e fileName são obrigatórios." },
        { status: 400 },
      );
    }

    const { downloadFileFromStorage } = await import("@/lib/pipeline-file-upload");
    const file = await downloadFileFromStorage(body.storagePath, body.fileName);
    const buffer = await file.arrayBuffer();
    ifcBytes = new Uint8Array(buffer);
    fileName = body.fileName;
  } else {
    return NextResponse.json(
      { error: "Content-Type não suportado. Use multipart/form-data ou application/json." },
      { status: 400 },
    );
  }

  // ── Validate IFC header ──────────────────────────────────
  const headerSlice = new TextDecoder().decode(ifcBytes.slice(0, 500));
  if (!IFC_HEADER_PATTERN.test(headerSlice)) {
    return NextResponse.json(
      { error: `"${fileName}" não parece ser um ficheiro IFC válido (cabeçalho STEP não encontrado).` },
      { status: 400 },
    );
  }

  const sizeMb = (ifcBytes.byteLength / (1024 * 1024)).toFixed(1);
  log.info(`Converting IFC to fragments: ${fileName} (${sizeMb} MB)`);

  // ── Convert IFC → Fragment binary ────────────────────────
  // Dynamic import to avoid loading heavy WASM in other routes
  const { IfcImporter } = await import("@thatopen/fragments");

  const importer = new IfcImporter();
  importer.wasm = {
    path: "https://unpkg.com/web-ifc@0.0.75/",
    absolute: true,
  };
  importer.webIfcSettings = {
    COORDINATE_TO_ORIGIN: true,
    CIRCLE_SEGMENTS: 12,
    MEMORY_LIMIT: 512,
  };

  const startTime = Date.now();

  const fragBytes = await importer.process({ bytes: ifcBytes });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const fragSizeMb = (fragBytes.byteLength / (1024 * 1024)).toFixed(1);
  const ratio = (ifcBytes.byteLength / fragBytes.byteLength).toFixed(1);

  log.info(`Conversion complete: ${fileName} ${sizeMb}MB → ${fragSizeMb}MB (${ratio}x smaller) in ${elapsed}s`);

  // ── Return fragment binary ───────────────────────────────
  return new Response(fragBytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName.replace(/\.ifc$/i, ".frag")}"`,
      "X-Fragment-Size": String(fragBytes.byteLength),
      "X-Original-Size": String(ifcBytes.byteLength),
      "X-Compression-Ratio": ratio,
    },
  });
}, { errorMessage: "Erro interno ao converter ficheiro IFC." });
