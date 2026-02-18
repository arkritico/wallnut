import { NextResponse } from "next/server";
import { getJobStore } from "@/lib/job-store";
import { executePipelineJob } from "@/lib/pipeline-runner";
import { withApiHandler } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logger";
import { captureError } from "@/lib/error-monitoring";
import {
  downloadFileFromStorage,
  cleanupStorageFiles,
} from "@/lib/pipeline-file-upload";

const log = createLogger("pipeline");

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/pipeline
 *
 * Accepts FormData with:
 *   - files[] — one or more small files (PDF, XLS/XLSX, CSV — IFC files parsed client-side)
 *   - storagePaths — (optional) JSON string with [{ fileName, storagePath, fileSize }]
 *                     for large files uploaded to Supabase Storage
 *   - options  — JSON string with { includeCosts, includeSchedule, includeCompliance }
 *   - ifcAnalyses — (optional) JSON string with pre-parsed SpecialtyAnalysisResult[]
 *
 * Creates a background job and returns { jobId } immediately.
 * Client polls GET /api/pipeline/[jobId] for progress.
 */
export const POST = withApiHandler("pipeline", async (request) => {
  const formData = await request.formData();

  // Extract files from FormData (small files sent directly)
  const fileEntries = formData.getAll("files");
  const files: File[] = [];
  for (const entry of fileEntries) {
    if (entry instanceof File) {
      files.push(entry);
    }
  }

  // Extract storage paths for large files uploaded to Supabase Storage
  let storagePathEntries: { fileName: string; storagePath: string; fileSize: number }[] = [];
  const storagePathsStr = formData.get("storagePaths");
  if (typeof storagePathsStr === "string") {
    try {
      const parsed = JSON.parse(storagePathsStr);
      if (!Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "storagePaths deve ser um array." },
          { status: 400 },
        );
      }
      storagePathEntries = parsed;
    } catch {
      return NextResponse.json(
        { error: "storagePaths JSON inválido." },
        { status: 400 },
      );
    }
  }

  // Extract pre-parsed IFC analyses (client-side parsed via Web Worker)
  let ifcAnalyses: unknown[] | undefined;
  const ifcAnalysesStr = formData.get("ifcAnalyses");
  if (typeof ifcAnalysesStr === "string") {
    try {
      const parsed = JSON.parse(ifcAnalysesStr);
      if (!Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "ifcAnalyses deve ser um array." },
          { status: 400 },
        );
      }
      ifcAnalyses = parsed;
    } catch {
      return NextResponse.json(
        { error: "ifcAnalyses JSON inválido." },
        { status: 400 },
      );
    }
  }

  // Must have either files, storage paths, or pre-parsed IFC analyses
  if (files.length === 0 && storagePathEntries.length === 0 && !ifcAnalyses?.length) {
    return NextResponse.json(
      { error: "Nenhum ficheiro enviado." },
      { status: 400 },
    );
  }

  // Validate total file count
  const MAX_FILES = 20;
  const totalFileCount = files.length + storagePathEntries.length;
  if (totalFileCount > MAX_FILES) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_FILES} ficheiros por pedido.` },
      { status: 400 },
    );
  }

  // Validate file sizes (FormData files only — storage files validated client-side)
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
  const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500 MB (higher now that files go through Storage)

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

  // Add storage file sizes to total
  for (const entry of storagePathEntries) {
    if (entry.fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Ficheiro "${entry.fileName}" excede o limite de 100 MB.` },
        { status: 400 },
      );
    }
    totalSize += entry.fileSize;
  }

  if (totalSize > MAX_TOTAL_SIZE) {
    return NextResponse.json(
      { error: "Tamanho total dos ficheiros excede o limite de 500 MB." },
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

  // Buffer all FormData files eagerly — streams may close after response
  const bufferedFiles = await Promise.all(
    files.map(async (f) => {
      const buffer = await f.arrayBuffer();
      return new File([buffer], f.name, { type: f.type });
    }),
  );

  // Download large files from Supabase Storage
  const storageFiles: File[] = [];
  const storagePathsToCleanup: string[] = [];

  if (storagePathEntries.length > 0) {
    log.info("Downloading large files from Supabase Storage", {
      count: storagePathEntries.length,
      fileNames: storagePathEntries.map((e) => e.fileName),
    });

    for (const entry of storagePathEntries) {
      try {
        const file = await downloadFileFromStorage(entry.storagePath, entry.fileName);
        storageFiles.push(file);
        storagePathsToCleanup.push(entry.storagePath);
      } catch (err) {
        log.error("Failed to download file from Storage", {
          fileName: entry.fileName,
          storagePath: entry.storagePath,
          error: err instanceof Error ? err.message : String(err),
        });
        return NextResponse.json(
          { error: `Erro ao obter ficheiro "${entry.fileName}" do armazenamento.` },
          { status: 500 },
        );
      }
    }
  }

  // Combine all files
  const allFiles = [...bufferedFiles, ...storageFiles];

  // Create job record
  const store = getJobStore();
  const ifcFileNames = ifcAnalyses
    ? ifcAnalyses.map((a) => {
        const obj = a as Record<string, unknown>;
        return `${(obj.specialty as string) ?? "ifc"}.ifc (pre-parsed)`;
      })
    : [];
  const job = await store.create(
    [...allFiles.map((f) => f.name), ...ifcFileNames],
    options as Record<string, unknown>,
  );

  log.info("Pipeline job created", {
    jobId: job.id,
    fileCount: allFiles.length,
    formDataFiles: bufferedFiles.length,
    storageFiles: storageFiles.length,
    ifcAnalysesCount: ifcAnalyses?.length ?? 0,
    fileNames: allFiles.map((f) => f.name),
  });

  // Fire-and-forget: start pipeline in background
  void executePipelineJob(job.id, allFiles, { ...options, ifcAnalyses })
    .catch((err) => {
      log.error("Pipeline background execution error", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
      captureError(err, {
        component: "api/pipeline",
        action: "background-execution",
        metadata: { jobId: job.id },
      });
    })
    .finally(() => {
      // Cleanup temporary Storage files after pipeline completes (or fails)
      if (storagePathsToCleanup.length > 0) {
        void cleanupStorageFiles(storagePathsToCleanup).catch((err) => {
          log.warn("Failed to cleanup storage files", {
            jobId: job.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    });

  return NextResponse.json({ jobId: job.id });
}, { errorMessage: "Erro interno ao processar a pipeline." });
