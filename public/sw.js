/// <reference lib="webworker" />

const CACHE_NAME = "wallnut-v2";

// Pre-cache critical assets on install (WASM files needed for 3D viewer)
const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/wasm/web-ifc.wasm",
  "/wasm/web-ifc-mt.wasm",
  "/wasm/fragments-worker.mjs",
  "/fonts/PPMori-Regular.woff2",
  "/fonts/PPMori-SemiBold.woff2",
];

// Patterns for immutable assets — cache-first strategy (never re-fetch)
const IMMUTABLE_PATTERNS = [
  /\/wasm\//,
  /\/fonts\//,
  /\.woff2$/,
  /\.wasm$/,
];

// Model cache for offline 3D viewing
const MODEL_CACHE = "wallnut-models-v1";

// Install — pre-cache critical assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== MODEL_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — differentiated strategies per asset type
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip API calls and external requests
  if (
    url.pathname.startsWith("/api/") ||
    event.request.method !== "GET" ||
    !url.origin.includes(self.location.origin)
  ) {
    return;
  }

  // Cache-first for immutable assets (WASM, fonts) — instant offline loads
  if (IMMUTABLE_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for everything else, with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, serve the cached index page
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("Offline", { status: 503 });
        });
      })
  );
});

// Handle model caching via message from the app
self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_MODEL") {
    const { key, data } = event.data;
    caches.open(MODEL_CACHE).then((cache) => {
      const response = new Response(data, {
        headers: { "Content-Type": "application/octet-stream" },
      });
      cache.put(new Request(`/_models/${key}`), response);
    });
  }

  if (event.data?.type === "GET_CACHED_MODEL") {
    const { key } = event.data;
    caches.open(MODEL_CACHE).then(async (cache) => {
      const response = await cache.match(new Request(`/_models/${key}`));
      const clients = await self.clients.matchAll();
      const data = response ? await response.arrayBuffer() : null;
      for (const client of clients) {
        client.postMessage({ type: "CACHED_MODEL", key, data });
      }
    });
  }
});
