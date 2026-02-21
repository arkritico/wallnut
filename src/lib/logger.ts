/**
 * Structured Logger Configuration
 *
 * In Node.js: uses Winston for structured logging with console + file transports.
 * In browser/worker: falls back to console.log with module prefix.
 */

const isServer =
  typeof window === "undefined" &&
  typeof (globalThis as Record<string, unknown>).WorkerGlobalScope === "undefined";

// Minimal logger interface used throughout the codebase
interface Logger {
  error: (message: string, meta?: object | undefined) => void;
  warn: (message: string, meta?: object | undefined) => void;
  info: (message: string, meta?: object | undefined) => void;
  debug: (message: string, meta?: object | undefined) => void;
}

// --- Browser / Web Worker fallback (no winston) ---

function createConsoleLogger(module?: string): Logger {
  const prefix = module ? `[${module}]` : "";
  return {
    error: (msg, meta) => console.error(prefix, msg, meta ?? ""),
    warn: (msg, meta) => console.warn(prefix, msg, meta ?? ""),
    info: (msg, meta) => console.info(prefix, msg, meta ?? ""),
    debug: (msg, meta) => console.debug(prefix, msg, meta ?? ""),
  };
}

// Lazy-loaded winston logger (only resolved on the server)
let _winstonLogger: Logger | null = null;

async function getWinstonLogger(): Promise<Logger> {
  if (_winstonLogger) return _winstonLogger;

  try {
    // Use variable-based imports to prevent Turbopack from bundling
    // these Node.js-only modules into the client/worker chunk.
    const winstonModule = "winston";
    const pathModule = "path";
    const winston = (await import(/* webpackIgnore: true */ winstonModule)).default;
    const path = await import(/* webpackIgnore: true */ pathModule);

    const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
    const logColors = { error: "red", warn: "yellow", info: "green", debug: "blue" };

    winston.addColors(logColors);

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: "HH:mm:ss" }),
      winston.format.printf(({ timestamp, level, message, ...meta }: { timestamp: string; level: string; message: string; [key: string]: unknown }) => {
        let metaStr = "";
        if (Object.keys(meta).length > 0) {
          metaStr = ` ${JSON.stringify(meta)}`;
        }
        return `${timestamp} [${level}] ${message}${metaStr}`;
      }),
    );

    const fileFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    );

    const logsDir = path.join(process.cwd(), "logs");
    const transports: import("winston").transport[] = [
      new winston.transports.Console({
        format: consoleFormat,
        level: process.env.LOG_LEVEL || "info",
      }),
    ];

    if (process.env.VERCEL !== "1") {
      try {
        transports.push(
          new winston.transports.File({
            filename: path.join(logsDir, "error.log"),
            level: "error",
            format: fileFormat,
            maxsize: 5242880,
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: path.join(logsDir, "combined.log"),
            format: fileFormat,
            maxsize: 5242880,
            maxFiles: 5,
          }),
        );
      } catch {
        // Silently fail if file system is not available
      }
    }

    const logger = winston.createLogger({
      levels: logLevels,
      transports,
      exitOnError: false,
    });

    _winstonLogger = {
      error: (msg, meta) => logger.error(msg, meta),
      warn: (msg, meta) => logger.warn(msg, meta),
      info: (msg, meta) => logger.info(msg, meta),
      debug: (msg, meta) => logger.debug(msg, meta),
    };

    return _winstonLogger;
  } catch {
    // Winston unavailable — fall back to console
    _winstonLogger = createConsoleLogger();
    return _winstonLogger;
  }
}

// Synchronous default export: uses console initially, upgrades to winston on server
const defaultLogger: Logger = createConsoleLogger();

if (isServer) {
  // Fire-and-forget: upgrade to winston as soon as it loads
  getWinstonLogger().then((wl) => {
    Object.assign(defaultLogger, wl);
  });
}

export default defaultLogger;

/**
 * Create a child logger with a specific context/module name
 */
export function createLogger(module: string): Logger {
  if (!isServer) {
    return createConsoleLogger(module);
  }

  // Return a proxy that lazily delegates to winston once loaded
  const fallback = createConsoleLogger(module);
  let resolved: Logger | null = null;

  getWinstonLogger().then((wl) => {
    resolved = {
      error: (msg, meta) => wl.error(msg, { module, ...meta }),
      warn: (msg, meta) => wl.warn(msg, { module, ...meta }),
      info: (msg, meta) => wl.info(msg, { module, ...meta }),
      debug: (msg, meta) => wl.debug(msg, { module, ...meta }),
    };
  });

  return {
    error: (msg, meta) => (resolved ?? fallback).error(msg, meta),
    warn: (msg, meta) => (resolved ?? fallback).warn(msg, meta),
    info: (msg, meta) => (resolved ?? fallback).info(msg, meta),
    debug: (msg, meta) => (resolved ?? fallback).debug(msg, meta),
  };
}

/**
 * Log scraper activity with structured metadata
 */
export function logScraperActivity(
  action: "start" | "success" | "error" | "retry" | "cache_hit",
  details: {
    category?: string;
    itemCode?: string;
    url?: string;
    error?: unknown;
    duration?: number;
    retryCount?: number;
  },
) {
  const { category, itemCode, url, error, duration, retryCount } = details;

  const meta = {
    module: "price-scraper",
    category,
    itemCode,
    url,
    duration,
    retryCount,
  };

  switch (action) {
    case "start":
      defaultLogger.info("Scraper started", meta);
      break;
    case "success":
      defaultLogger.info("Scraper completed successfully", meta);
      break;
    case "error":
      defaultLogger.error("Scraper error", {
        ...meta,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    case "retry":
      defaultLogger.warn("Scraper retry", meta);
      break;
    case "cache_hit":
      defaultLogger.debug("Cache hit", meta);
      break;
  }
}
