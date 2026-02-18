import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withApiHandler } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logger";

const log = createLogger("pipeline-upload-url");

export const runtime = "nodejs";

/**
 * POST /api/pipeline/upload-url
 *
 * Generates a signed upload URL for Supabase Storage.
 * The client then uploads the file directly to Storage (bypassing Vercel's 4.5MB body limit).
 *
 * Request body: { fileName: string, fileSize: number }
 * Response: { signedUrl: string, token: string, storagePath: string }
 */
export const POST = withApiHandler("pipeline-upload-url", async (request) => {
  const body = await request.json();
  const { fileName, fileSize } = body as { fileName?: string; fileSize?: number };

  if (!fileName || typeof fileName !== "string") {
    return NextResponse.json(
      { error: "fileName é obrigatório." },
      { status: 400 },
    );
  }

  if (!fileSize || typeof fileSize !== "number" || fileSize <= 0) {
    return NextResponse.json(
      { error: "fileSize inválido." },
      { status: 400 },
    );
  }

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Ficheiro excede o limite de 100 MB.` },
      { status: 400 },
    );
  }

  // Build Supabase client with service role key for elevated access
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase não configurado no servidor." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Generate a unique storage path
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `pipeline-temp/${sessionId}/${sanitizedFileName}`;

  try {
    const { data, error } = await supabase.storage
      .from("pipeline-uploads")
      .createSignedUploadUrl(storagePath);

    if (error) {
      log.error("Failed to create signed upload URL", {
        error: error.message,
        storagePath,
      });
      return NextResponse.json(
        { error: "Erro ao gerar URL de upload." },
        { status: 500 },
      );
    }

    log.info("Signed upload URL created", {
      storagePath,
      fileName,
      fileSize,
    });

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      storagePath,
    });
  } catch (err) {
    log.error("Unexpected error creating signed upload URL", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Erro interno ao gerar URL de upload." },
      { status: 500 },
    );
  }
}, { errorMessage: "Erro ao processar pedido de upload." });
