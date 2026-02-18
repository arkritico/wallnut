/**
 * Lightweight error monitoring and reporting.
 * Captures errors with context for debugging.
 *
 * When NEXT_PUBLIC_SENTRY_DSN is configured, errors are sent to Sentry.
 * Otherwise, errors are logged to console with structured metadata.
 */

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

interface ErrorEntry {
  id: string;
  timestamp: string;
  message: string;
  stack?: string;
  context: ErrorContext;
  url?: string;
  userAgent?: string;
}

// In-memory error buffer (last 50 errors)
const errorBuffer: ErrorEntry[] = [];
const MAX_BUFFER = 50;

/**
 * Capture and report an error.
 */
export function captureError(error: unknown, context: ErrorContext = {}): void {
  const err = error instanceof Error ? error : new Error(String(error));

  const entry: ErrorEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message: err.message,
    stack: err.stack,
    context,
    url: typeof window !== "undefined" ? window.location.href : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };

  // Buffer locally
  errorBuffer.push(entry);
  if (errorBuffer.length > MAX_BUFFER) {
    errorBuffer.shift();
  }

  // Console logging (always)
  console.error(`[Wallnut Error] ${context.component || "unknown"}/${context.action || "unknown"}:`, err.message, context.metadata);

  // Send to Sentry if configured
  const sentryDsn = typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_SENTRY_DSN
    : undefined;

  if (sentryDsn) {
    sendToSentry(entry, sentryDsn).catch(() => {
      // Silent fail for monitoring
    });
  }
}

/**
 * Wrap an async function with error capturing.
 */
export function withErrorCapture<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context: ErrorContext,
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      captureError(error, context);
      throw error;
    }
  }) as T;
}

/**
 * Get buffered errors (for debugging).
 */
export function getRecentErrors(): ErrorEntry[] {
  return [...errorBuffer];
}

/**
 * Clear error buffer.
 */
export function clearErrors(): void {
  errorBuffer.length = 0;
}

/**
 * Minimal Sentry envelope sender (no SDK dependency).
 */
async function sendToSentry(entry: ErrorEntry, dsn: string): Promise<void> {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace("/", "");
    const publicKey = url.username;
    const host = url.hostname;

    const envelope = JSON.stringify({
      event_id: entry.id.replace(/-/g, ""),
      timestamp: entry.timestamp,
      platform: "javascript",
      level: "error",
      logger: "wallnut",
      message: { formatted: entry.message },
      exception: entry.stack ? {
        values: [{
          type: "Error",
          value: entry.message,
          stacktrace: { frames: parseStack(entry.stack) },
        }],
      } : undefined,
      tags: {
        component: entry.context.component,
        action: entry.context.action,
      },
      extra: entry.context.metadata,
      request: {
        url: entry.url,
        headers: { "User-Agent": entry.userAgent },
      },
    });

    await fetch(`https://${host}/api/${projectId}/store/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}`,
      },
      body: envelope,
    });
  } catch {
    // Silent fail
  }
}

function parseStack(stack: string): { filename: string; function: string; lineno: number; colno: number }[] {
  return stack.split("\n").slice(1, 10).map(line => {
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
    if (match) {
      return { function: match[1], filename: match[2], lineno: parseInt(match[3]), colno: parseInt(match[4]) };
    }
    return { function: "?", filename: line.trim(), lineno: 0, colno: 0 };
  });
}

/**
 * Initialize global error handlers.
 */
export function initErrorMonitoring(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    captureError(event.error || event.message, {
      component: "window",
      action: "unhandled_error",
      metadata: { filename: event.filename, lineno: event.lineno },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    captureError(event.reason, {
      component: "window",
      action: "unhandled_rejection",
    });
  });
}
