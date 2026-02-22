/**
 * Progressive file loading utilities for large IFC/Fragment files.
 * Provides streaming reads with progress callbacks.
 */

export interface ProgressCallback {
  (loaded: number, total: number): void;
}

/**
 * Read a File object in chunks, reporting progress.
 * Returns the complete Uint8Array when done.
 */
export function readFileWithProgress(
  file: File,
  onProgress: ProgressCallback,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded, e.total);
      }
    };
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Fetch a URL with streaming progress (for server-side conversions).
 * Falls back to regular arrayBuffer() if stream isn't available.
 */
export async function fetchWithProgress(
  url: string,
  options: RequestInit,
  onProgress: ProgressCallback,
): Promise<Uint8Array> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body || !total) {
    // Fallback: no streaming support or unknown size
    const buffer = await response.arrayBuffer();
    onProgress(buffer.byteLength, buffer.byteLength);
    return new Uint8Array(buffer);
  }

  // Stream the response body
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }

  // Merge chunks into a single Uint8Array
  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}
