import { NextResponse } from "next/server";
import { getJobStore } from "@/lib/job-store";
import { executePipelineJob } from "@/lib/pipeline-runner";
import { withApiHandler } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logger";
import { captureError } from "@/lib/error-monitoring";

const log = createLogger("pipeline");

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/pipeline
 *
 * Accepts FormData with:
 *   - files[] — one or more files (IFC, PDF, XLS/XLSX, CSV)
 *   - options  — JSON string with { includeCosts, includeSchedule, includeCompliance }
 *
 * Creates a background job and returns { jobId } immediately.
 * Client polls GET /api/pipeline/[jobId] for progress.
 */
export const POST = withApiHandler("pipeline", async (request) => {
  const formData = await request.formData();

  // Extract files
  const fileEntries = formData.getAll("files");
  const files: File[] = [];
  for (const entry of fileEntries) {
    if (entry instanceof File) {
      files.push(entry);
    }
  }

  if (files.length === 0) {
    return NextResponse.json(
      { error: "Nenhum ficheiro enviado." },
      { status: 400 },
    );
  }

  // File validation
  const MAX_FILES = 20;
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
  const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200 MB

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_FILES} ficheiros por pedido.` },
      { status: 400 },
    );
  }

  let totalSize = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Ficheiro "${file.name}" excede o limite de 100 MB.` },
        { status: 400 },
      );
    }
    totalSize += file.size;
  }

  if (totalSize > MAX_TOTAL_SIZE) {
    return NextResponse.json(
      { error: "Tamanho total dos ficheiros excede o limite de 200 MB." },
      { status: 400 },
    );
  }

  // Parse options
  let options: {
    includeCosts?: boolean;
    includeSchedule?: boolean;
    includeCompliance?: boolean;
  } = {};

  const optionsStr = formData.get("options");
  if (typeof optionsStr === "string") {
    try {
      options = JSON.parse(optionsStr);
    } catch {
      return NextResponse.json(
        { error: "Opções JSON inválidas." },
        { status: 400 },
      );
    }
  }

  // Buffer all files eagerly — FormData streams may close after response
  const bufferedFiles = await Promise.all(
    files.map(async (f) => {
      const buffer = await f.arrayBuffer();
      return new File([buffer], f.name, { type: f.type });
    }),
  );

  // Create job record
  const store = getJobStore();
  const job = await store.create(
    bufferedFiles.map((f) => f.name),
    options as Record<string, unknown>,
  );

  log.info("Pipeline job created", {
    jobId: job.id,
    fileCount: bufferedFiles.length,
    fileNames: bufferedFiles.map((f) => f.name),
  });

  // Fire-and-forget: start pipeline in background
  void executePipelineJob(job.id, bufferedFiles, options).catch((err) => {
    log.error("Pipeline background execution error", {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
    });
    captureError(err, {
      component: "api/pipeline",
      action: "background-execution",
      metadata: { jobId: job.id },
    });
  });

  return NextResponse.json({ jobId: job.id });
}, { errorMessage: "Erro interno ao processar a pipeline." });
