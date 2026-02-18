/**
 * Pipeline File Upload via Supabase Storage
 *
 * For files that exceed Vercel's 4.5 MB serverless body limit,
 * this module uploads them directly from the browser to Supabase Storage,
 * then passes storage paths to the pipeline API instead of raw bytes.
 *
 * Flow:
 *   Browser → Supabase Storage (direct, no size limit from Storage itself)
 *   Browser → POST /api/pipeline { storagePaths: [...], files: [small ones], ... }
 *   Server  → Downloads from Supabase Storage → runs pipeline
 *
 * Supabase free tier: 1 GB storage, 2 GB bandwidth/month
 * Supabase Pro tier: 100 GB storage, 250 GB bandwidth/month
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";

// ── Constants ─────────────────────────────────────────────────

/** Files larger than this go to Supabase Storage instead of FormData */
export const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024; // 4 MB

/** Storage bucket name (must exist in Supabase) */
const BUCKET_NAME = "pipeline-uploads";

/** Uploaded files are auto-cleaned after this TTL (cleanup via Edge Function or cron) */
const UPLOAD_PREFIX = "pipeline-temp";

// ── Types ─────────────────────────────────────────────────────

export interface StorageUploadResult {
  /** Files that were uploaded to Storage (path in bucket) */
  storagePaths: { fileName: string; storagePath: string; fileSize: number }[];
  /** Files small enough to include in FormData directly */
  smallFiles: File[];
  /** Files that failed to upload */
  errors: { fileName: string; error: string }[];
}

export interface UploadProgress {
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  phase: "uploading" | "done" | "error";
  /** Upload progress 0-100 for current file (approximate) */
  percent?: number;
}

// ── Upload files to Supabase Storage ──────────────────────────

/**
 * Separate files into "small" (FormData-safe) and "large" (needs Storage upload).
 * Upload large files to Supabase Storage and return paths.
 *
 * Falls back to including all files in FormData if Supabase is not configured.
 */
export async function uploadLargeFilesToStorage(
  files: File[],
  onProgress?: (progress: UploadProgress) => void,
): Promise<StorageUploadResult> {
  const smallFiles: File[] = [];
  const largeFiles: File[] = [];

  for (const file of files) {
    if (file.size <= LARGE_FILE_THRESHOLD) {
      smallFiles.push(file);
    } else {
      largeFiles.push(file);
    }
  }

  // If no large files or Supabase not configured, return all as small files
  if (largeFiles.length === 0) {
    return { storagePaths: [], smallFiles, errors: [] };
  }

  if (!isSupabaseConfigured()) {
    // No Supabase — include everything in FormData (will fail on Vercel for large files)
    console.warn("Supabase not configured — large files will be sent via FormData (may fail on Vercel)");
    return { storagePaths: [], smallFiles: [...smallFiles, ...largeFiles], errors: [] };
  }

  const sb = getSupabase();
  if (!sb) {
    return { storagePaths: [], smallFiles: [...smallFiles, ...largeFiles], errors: [] };
  }

  // Check auth
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return {
      storagePaths: [],
      smallFiles: [...smallFiles, ...largeFiles],
      errors: [{ fileName: "*", error: "Not authenticated — cannot upload to Storage" }],
    };
  }

  // Upload large files to Supabase Storage
  const storagePaths: StorageUploadResult["storagePaths"] = [];
  const errors: StorageUploadResult["errors"] = [];
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  for (let i = 0; i < largeFiles.length; i++) {
    const file = largeFiles[i];
    const storagePath = `${UPLOAD_PREFIX}/${user.id}/${sessionId}/${file.name}`;

    onProgress?.({
      fileName: file.name,
      fileIndex: i,
      totalFiles: largeFiles.length,
      phase: "uploading",
      percent: 0,
    });

    try {
      const { error: uploadError } = await sb.storage
        .from(BUCKET_NAME)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      storagePaths.push({
        fileName: file.name,
        storagePath,
        fileSize: file.size,
      });

      onProgress?.({
        fileName: file.name,
        fileIndex: i,
        totalFiles: largeFiles.length,
        phase: "done",
        percent: 100,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ fileName: file.name, error: message });

      onProgress?.({
        fileName: file.name,
        fileIndex: i,
        totalFiles: largeFiles.length,
        phase: "error",
      });
    }
  }

  return { storagePaths, smallFiles, errors };
}

// ── Server-side: download files from Storage ──────────────────

/**
 * Download a file from Supabase Storage and return it as a File object.
 * Used server-side in the pipeline API to retrieve large files.
 */
export async function downloadFileFromStorage(
  storagePath: string,
  fileName: string,
): Promise<File> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  const sb = getSupabase();
  if (!sb) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await sb.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error) {
    throw new Error(`Failed to download ${fileName} from Storage: ${error.message}`);
  }

  if (!data) {
    throw new Error(`No data returned for ${fileName}`);
  }

  // Supabase returns a Blob — convert to File
  const arrayBuffer = await data.arrayBuffer();
  const mimeType = guessMimeType(fileName);
  return new File([arrayBuffer], fileName, { type: mimeType });
}

/**
 * Clean up temporary pipeline upload files from Storage.
 * Call this after pipeline processing is complete.
 */
export async function cleanupStorageFiles(
  storagePaths: string[],
): Promise<void> {
  if (!isSupabaseConfigured() || storagePaths.length === 0) return;

  const sb = getSupabase();
  if (!sb) return;

  try {
    await sb.storage.from(BUCKET_NAME).remove(storagePaths);
  } catch (err) {
    console.warn("Failed to cleanup pipeline upload files:", err);
  }
}

// ── Helpers ───────────────────────────────────────────────────

function guessMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "xls": return "application/vnd.ms-excel";
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv": return "text/csv";
    case "ifc": return "application/x-step";
    default: return "application/octet-stream";
  }
}
