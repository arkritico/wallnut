/**
 * Client-side model caching utilities.
 * Works with the service worker (public/sw.js) to cache IFC/Fragment models
 * for offline viewing via the Cache API.
 */

/** Cache a model binary in the service worker's model cache. */
export function cacheModel(key: string, data: Uint8Array): void {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage({
    type: "CACHE_MODEL",
    key,
    data: data.buffer,
  });
}

/** Retrieve a cached model from the service worker. Returns null if not found. */
export function getCachedModel(key: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
      resolve(null);
      return;
    }

    const timeout = setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", handler);
      resolve(null);
    }, 3000);

    function handler(event: MessageEvent) {
      if (event.data?.type === "CACHED_MODEL" && event.data.key === key) {
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener("message", handler);
        resolve(event.data.data ? new Uint8Array(event.data.data) : null);
      }
    }

    navigator.serviceWorker.addEventListener("message", handler);
    navigator.serviceWorker.controller.postMessage({
      type: "GET_CACHED_MODEL",
      key,
    });
  });
}

/** Generate a cache key from a file name and size. */
export function modelCacheKey(name: string, sizeBytes: number): string {
  return `${name}-${sizeBytes}`;
}
