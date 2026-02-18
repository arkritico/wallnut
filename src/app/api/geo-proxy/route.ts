/**
 * Server-side proxy for Portuguese geospatial WMS/WFS services.
 * Bypasses CORS restrictions that prevent direct browser queries
 * to DGT, ICNF, DGADR, and other government GIS endpoints.
 *
 * Security:
 *  - Exact hostname matching (no subdomain bypass)
 *  - HTTPS-only enforcement
 *  - Content-type whitelisting on responses
 *  - Response size limit (10 MB)
 *  - Timeout with AbortController
 *  - No credential forwarding
 */

import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { captureError } from "@/lib/error-monitoring";

const log = createLogger("geo-proxy");

// Exact hostname set — no `.endsWith()` to prevent subdomain bypass
const ALLOWED_HOSTS = new Set([
  "geo2.dgterritorio.gov.pt",
  "servicos.dgterritorio.pt",
  "geocatalogo.icnf.pt",
  "sig.dgadr.gov.pt",
  "mapas.dgadr.pt",
  "nominatim.openstreetmap.org",
  "inspire.lneg.pt",
  "snig.dgterritorio.gov.pt",
]);

// Only pass through safe content types
const SAFE_CONTENT_TYPES = new Set([
  "application/json",
  "application/xml",
  "text/xml",
  "application/gml+xml",
  "application/vnd.ogc.wms_xml",
  "image/png",
  "image/jpeg",
  "image/gif",
  "application/octet-stream",
]);

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB
const REQUEST_TIMEOUT_MS = 15_000;

function validateTargetUrl(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  // HTTPS only (except localhost for development)
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    return null;
  }

  // Exact hostname match — prevents evil.geo2.dgterritorio.gov.pt
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return null;
  }

  // Block credentials in URL (user:pass@host)
  if (parsed.username || parsed.password) {
    return null;
  }

  return parsed;
}

function sanitizeContentType(raw: string | null): string {
  if (!raw) return "application/octet-stream";
  // Extract base type (strip charset and parameters)
  const base = raw.split(";")[0].trim().toLowerCase();
  return SAFE_CONTENT_TYPES.has(base) ? base : "application/octet-stream";
}

async function fetchWithLimits(
  url: string,
  init: RequestInit,
): Promise<NextResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      // Never send cookies or auth to upstream
      credentials: "omit",
      redirect: "error", // Don't follow redirects to prevent SSRF chains
    });

    clearTimeout(timeout);

    // Check response size before buffering
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      return NextResponse.json(
        { error: "Upstream response too large" },
        { status: 502 },
      );
    }

    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_RESPONSE_SIZE) {
      return NextResponse.json(
        { error: "Upstream response too large" },
        { status: 502 },
      );
    }

    const safeContentType = sanitizeContentType(response.headers.get("content-type"));

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type": safeContentType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      log.warn("Upstream timeout", { url: url.slice(0, 200) });
      return NextResponse.json({ error: "Upstream request timed out" }, { status: 504 });
    }
    log.error("Upstream fetch failed", {
      url: url.slice(0, 200),
      error: error instanceof Error ? error.message : String(error),
    });
    captureError(error, {
      component: "api/geo-proxy",
      action: "fetchWithLimits",
      metadata: { url: url.slice(0, 200) },
    });
    return NextResponse.json(
      { error: "Failed to fetch upstream resource" },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const validated = validateTargetUrl(targetUrl);
  if (!validated) {
    return NextResponse.json(
      { error: "URL not allowed" },
      { status: 403 },
    );
  }

  return fetchWithLimits(validated.href, {
    method: "GET",
    headers: {
      "User-Agent": "Wallnut/1.0 (Building Regulation Analyzer)",
      Accept: "application/json, application/xml, text/xml, image/png, */*",
    },
  });
}

export async function POST(request: Request) {
  let body: { url?: unknown; body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, body: reqBody } = body;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const validated = validateTargetUrl(url);
  if (!validated) {
    return NextResponse.json(
      { error: "URL not allowed" },
      { status: 403 },
    );
  }

  // Safely serialize request body
  let serializedBody: string;
  try {
    serializedBody = typeof reqBody === "string" ? reqBody : JSON.stringify(reqBody ?? "");
  } catch {
    return NextResponse.json({ error: "Request body not serializable" }, { status: 400 });
  }

  // Limit outbound body size
  if (serializedBody.length > 64_000) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  return fetchWithLimits(validated.href, {
    method: "POST",
    body: serializedBody,
    headers: {
      "Content-Type": "application/xml",
      "User-Agent": "Wallnut/1.0 (Building Regulation Analyzer)",
    },
  });
}
