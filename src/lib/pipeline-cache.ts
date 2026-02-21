/**
 * IndexedDB-backed pipeline result cache.
 *
 * Caches UnifiedPipelineResult by file fingerprint so re-processing
 * identical files returns instantly. Follows file-storage.ts patterns.
 *
 * Fingerprint = SHA-256 of sorted file names + sizes + lastModified + options.
 * Evicts oldest entries when cache exceeds MAX_ENTRIES.
 */

import type { UnifiedPipelineResult } from "./unified-pipeline";

// ============================================================================
// CONSTANTS
// ============================================================================

const DB_NAME = "wallnut_pipeline_cache";
const DB_VERSION = 1;
const STORE_NAME = "results";
const MAX_ENTRIES = 5;

// ============================================================================
// TYPES
// ============================================================================

interface CachedEntry {
  fingerprint: string;
  result: UnifiedPipelineResult;
  cachedAt: string;
  filesSummary: string;
}

interface FingerprintOptions {
  includeCosts?: boolean;
  includeSchedule?: boolean;
  includeCompliance?: boolean;
  analysisDepth?: string;
}

// ============================================================================
// INDEXEDDB HELPERS
// ============================================================================

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "fingerprint" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// In-memory fallback
const memoryCache = new Map<string, CachedEntry>();

// ============================================================================
// FINGERPRINT
// ============================================================================

/**
 * Compute a SHA-256 fingerprint from files + pipeline options.
 * Sorted by name for order-independence.
 */
export async function computeFingerprint(
  files: File[],
  options?: FingerprintOptions,
): Promise<string> {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const parts = sorted.map((f) => `${f.name}:${f.size}:${f.lastModified}`);
  const optsSuffix = `|opts:${options?.includeCosts ?? true}:${options?.includeSchedule ?? true}:${options?.includeCompliance ?? true}:${options?.analysisDepth ?? "standard"}`;
  const raw = parts.join("|") + optsSuffix;

  const data = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * Get a cached pipeline result by fingerprint. Returns null on miss.
 */
export async function getCachedResult(
  fingerprint: string,
): Promise<UnifiedPipelineResult | null> {
  if (!isIndexedDBAvailable()) {
    return memoryCache.get(fingerprint)?.result ?? null;
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(fingerprint);
      request.onsuccess = () => {
        const entry = request.result as CachedEntry | undefined;
        resolve(entry?.result ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return memoryCache.get(fingerprint)?.result ?? null;
  }
}

/**
 * Cache a pipeline result. Evicts oldest if cache exceeds MAX_ENTRIES.
 */
export async function cacheResult(
  fingerprint: string,
  result: UnifiedPipelineResult,
  filesSummary: string,
): Promise<void> {
  // Strip large binary fields — IFC raw data is too big to cache
  const cacheableResult: UnifiedPipelineResult = {
    ...result,
    ifcFileData: undefined,
    ifcFileName: undefined,
  };

  const entry: CachedEntry = {
    fingerprint,
    result: cacheableResult,
    cachedAt: new Date().toISOString(),
    filesSummary,
  };

  if (!isIndexedDBAvailable()) {
    memoryCache.set(fingerprint, entry);
    evictMemory();
    return;
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await evictIndexedDB();
  } catch {
    // Fallback to memory
    memoryCache.set(fingerprint, entry);
    evictMemory();
  }
}

// ============================================================================
// EVICTION
// ============================================================================

function evictMemory() {
  if (memoryCache.size <= MAX_ENTRIES) return;
  const sorted = [...memoryCache.entries()].sort(
    (a, b) => a[1].cachedAt.localeCompare(b[1].cachedAt),
  );
  while (sorted.length > MAX_ENTRIES) {
    const oldest = sorted.shift()!;
    memoryCache.delete(oldest[0]);
  }
}

async function evictIndexedDB(): Promise<void> {
  try {
    const db = await openDB();
    const entries = await new Promise<CachedEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });

    if (entries.length <= MAX_ENTRIES) return;

    entries.sort((a, b) => a.cachedAt.localeCompare(b.cachedAt));
    const toDelete = entries.slice(0, entries.length - MAX_ENTRIES);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const entry of toDelete) {
        store.delete(entry.fingerprint);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Eviction failure is non-fatal
  }
}
