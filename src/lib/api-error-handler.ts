/**
 * Unified API Error Handler
 *
 * Wraps Next.js route handlers with structured logging (Winston),
 * error monitoring (Sentry via error-monitoring.ts), and request timing.
 *
 * Usage:
 *   import { withApiHandler } from "@/lib/api-error-handler";
 *   export const POST = withApiHandler("analyze", async (request) => {
 *     const body = await request.json();
 *     return NextResponse.json({ data });
 *   });
 */

import { NextResponse } from "next/server";
import { createLogger } from "./logger";
import { captureError } from "./error-monitoring";

const log = createLogger("api");

type RouteHandler = (request: Request) => Promise<Response>;

/**
 * Wrap a Next.js API route handler with:
 * - Request timing (logged on every request)
 * - Structured Winston logging (info on success, error on failure)
 * - Sentry error capture with request context
 * - Consistent error response format
 *
 * @param routeName Short identifier for this route (e.g. "analyze", "ifc-analyze")
 * @param handler The actual route handler function
 * @param options Optional configuration
 */
export function withApiHandler(
  routeName: string,
  handler: RouteHandler,
  options?: {
    /** Custom error message for 500 responses (Portuguese) */
    errorMessage?: string;
  },
): RouteHandler {
  return async (request: Request) => {
    const start = performance.now();
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    try {
      const response = await handler(request);
      const durationMs = Math.round(performance.now() - start);

      // Log all requests (info for success, warn for client errors)
      const status = response.status;
      if (status >= 400 && status < 500) {
        log.warn(`${method} ${path} ${status}`, {
          route: routeName,
          status,
          durationMs,
          ip,
        });
      } else {
        log.info(`${method} ${path} ${status}`, {
          route: routeName,
          status,
          durationMs,
          ip,
        });
      }

      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const err = error instanceof Error ? error : new Error(String(error));

      // Winston structured log
      log.error(`${method} ${path} 500: ${err.message}`, {
        route: routeName,
        durationMs,
        ip,
        stack: err.stack,
      });

      // Sentry capture with full request context
      captureError(error, {
        component: `api/${routeName}`,
        action: `${method} ${path}`,
        metadata: { durationMs },
        request: {
          method,
          path,
          ip,
          statusCode: 500,
          durationMs,
        },
      });

      return NextResponse.json(
        {
          error:
            options?.errorMessage ?? "Erro interno do servidor.",
          ...(process.env.NODE_ENV === "development" && {
            details: err.message,
          }),
        },
        { status: 500 },
      );
    }
  };
}
