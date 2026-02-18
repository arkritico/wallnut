import { NextResponse, type NextRequest } from "next/server";

// ============================================================
// Rate Limiting (in-memory, per-IP)
// ============================================================

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMITS: Record<string, number> = {
  "/api/ai-analyze": 10,       // 10 AI calls/min (expensive)
  "/api/ifc-analyze": 10,      // 10 IFC uploads/min (CPU-intensive parsing)
  "/api/parse-document": 15,   // 15 document parses/min
  "/api/analyze": 30,          // 30 analyses/min
  "/api/geo-proxy": 60,        // 60 geo requests/min
};
const DEFAULT_RATE_LIMIT = 60;

// Cleanup stale entries every 5 minutes
let lastCleanup = Date.now();
function cleanupRateLimits() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimits) {
    if (entry.resetAt < now) rateLimits.delete(key);
  }
}

function checkRateLimit(ip: string, path: string): { allowed: boolean; remaining: number } {
  cleanupRateLimits();

  const limit = RATE_LIMITS[path] ?? DEFAULT_RATE_LIMIT;
  const key = `${ip}:${path}`;
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: limit - 1 };
  }

  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: limit - entry.count };
}

// ============================================================
// Request Size Limits
// ============================================================

const MAX_BODY_SIZE: Record<string, number> = {
  "/api/ai-analyze": 512_000,      // 500 KB
  "/api/ifc-analyze": 52_428_800,  // 50 MB (IFC files are large)
  "/api/parse-document": 1_048_576, // 1 MB
  "/api/analyze": 256_000,         // 250 KB
  "/api/geo-proxy": 64_000,        // 64 KB
};
const DEFAULT_MAX_BODY = 1_048_576; // 1 MB

// ============================================================
// Security Headers
// ============================================================

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.anthropic.com https://*.supabase.co https://*.dgterritorio.gov.pt https://*.dgterritorio.pt https://*.icnf.pt https://*.dgadr.gov.pt https://*.dgadr.pt https://nominatim.openstreetmap.org https://inspire.lneg.pt",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

// ============================================================
// Middleware
// ============================================================

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  }

  // ── Email domain restriction (server-side defense-in-depth) ──
  const ALLOWED_DOMAIN = "wallnut.pt";
  const authToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.REQUIRE_WALLNUT_EMAIL === "true" && authToken) {
    try {
      // Decode JWT payload (middle segment) to check email domain
      const payload = JSON.parse(atob(authToken.split(".")[1]));
      const email = payload.email ?? "";
      if (email && !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        return NextResponse.json(
          { error: `Apenas emails @${ALLOWED_DOMAIN} são permitidos.` },
          { status: 403, headers: SECURITY_HEADERS },
        );
      }
    } catch {
      // Token parse failed — let Supabase RLS handle it
    }
  }

  // ── API Key Authentication (for AI routes) ───────────────
  const AI_ROUTES = new Set(["/api/ai-analyze"]);
  if (AI_ROUTES.has(pathname)) {
    const authHeader = request.headers.get("authorization");
    const apiKeyHeader = request.headers.get("x-api-key");
    const hasAuth = !!(authHeader || apiKeyHeader);
    // In production with Supabase configured, require auth on expensive AI routes
    if (process.env.REQUIRE_API_AUTH === "true" && !hasAuth) {
      return NextResponse.json(
        { error: "Autenticação necessária para este endpoint." },
        { status: 401, headers: SECURITY_HEADERS },
      );
    }
  }

  // ── Rate Limiting ─────────────────────────────────────────
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const { allowed, remaining } = checkRateLimit(ip, pathname);

  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiados pedidos. Tente novamente em 1 minuto." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Remaining": "0",
          ...SECURITY_HEADERS,
        },
      },
    );
  }

  // ── Request Size Check ────────────────────────────────────
  const contentLength = request.headers.get("content-length");
  const maxSize = MAX_BODY_SIZE[pathname] ?? DEFAULT_MAX_BODY;
  if (contentLength && parseInt(contentLength, 10) > maxSize) {
    return NextResponse.json(
      { error: `Pedido demasiado grande. Máximo: ${Math.round(maxSize / 1024)} KB.` },
      {
        status: 413,
        headers: SECURITY_HEADERS,
      },
    );
  }

  // ── CORS for API Routes ───────────────────────────────────
  const origin = request.headers.get("origin");
  const response = NextResponse.next();

  // Only allow same-origin or no origin (server-to-server)
  if (origin) {
    const requestHost = request.nextUrl.host;
    try {
      const originHost = new URL(origin).host;
      if (originHost !== requestHost) {
        return NextResponse.json(
          { error: "Origin not allowed" },
          { status: 403, headers: SECURITY_HEADERS },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid origin" },
        { status: 403, headers: SECURITY_HEADERS },
      );
    }
  }

  // ── Apply Security Headers ────────────────────────────────
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.set("X-RateLimit-Remaining", String(remaining));

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static files and _next internals
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/).*)",
  ],
};
