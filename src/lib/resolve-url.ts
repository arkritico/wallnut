/**
 * Resolve a relative URL to an absolute URL.
 *
 * In Web Workers, relative fetch URLs fail because the Worker's base URL
 * is the script URL, not the page origin. This helper derives the correct
 * origin from import.meta.url (bundled by Turbopack), self.location, or
 * env vars as fallback.
 *
 * Used by: unified-pipeline.ts, price-db-loader.ts, document-parser.ts
 */
export function resolveUrl(path: string): string {
  // Already absolute
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  // Best: derive origin from the current module URL (works in Workers + browser)
  try {
    const origin = new URL(import.meta.url).origin;
    if (origin && origin !== "null" && !origin.startsWith("file:")) {
      return `${origin}${path}`;
    }
  } catch { /* import.meta.url unavailable */ }

  // Fallback: self.location (Web Worker or browser)
  try {
    if (typeof self !== "undefined" && self.location?.origin && self.location.origin !== "null") {
      return `${self.location.origin}${path}`;
    }
  } catch { /* not in a Worker with a valid origin */ }

  // Server-side (Node.js) or test — use env or default
  if (typeof process !== "undefined") {
    const base = process.env?.NEXTAUTH_URL || process.env?.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    return `${base}${path}`;
  }

  return `http://localhost:3000${path}`;
}
