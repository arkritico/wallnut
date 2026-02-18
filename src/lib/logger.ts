/**
 * Structured Logger Configuration
 *
 * Uses Winston for structured logging with:
 * - Multiple log levels (error, warn, info, debug)
 * - Console and file transports
 * - Structured JSON format
 * - Timestamps and metadata
 */

import winston from 'winston';
import path from 'path';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define colors for console output
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

winston.addColors(logColors);

// Custom format for console (human-readable)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

// Custom format for file (JSON structured)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create logs directory path
const logsDir = path.join(process.cwd(), 'logs');

// Create transports
const transports: winston.transport[] = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'info',
  }),
];

// Add file transports only in Node.js environment (not in browser/edge runtime)
if (typeof window === 'undefined' && process.env.VERCEL !== '1') {
  try {
    transports.push(
      // Error log file
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      // Combined log file
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );
  } catch (error) {
    // Silently fail if file system is not available (e.g., in edge runtime)
    console.warn('File logging unavailable:', error);
  }
}

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  transports,
  // Don't exit on error
  exitOnError: false,
});

// Export logger and utility functions
export default logger;

/**
 * Create a child logger with a specific context/module name
 */
export function createLogger(module: string) {
  return {
    error: (message: string, meta?: any) =>
      logger.error(message, { module, ...meta }),
    warn: (message: string, meta?: any) =>
      logger.warn(message, { module, ...meta }),
    info: (message: string, meta?: any) =>
      logger.info(message, { module, ...meta }),
    debug: (message: string, meta?: any) =>
      logger.debug(message, { module, ...meta }),
  };
}

/**
 * Log scraper activity with structured metadata
 */
export function logScraperActivity(
  action: 'start' | 'success' | 'error' | 'retry' | 'cache_hit',
  details: {
    category?: string;
    itemCode?: string;
    url?: string;
    error?: any;
    duration?: number;
    retryCount?: number;
  }
) {
  const { category, itemCode, url, error, duration, retryCount } = details;

  const meta = {
    module: 'cype-scraper',
    category,
    itemCode,
    url,
    duration,
    retryCount,
  };

  switch (action) {
    case 'start':
      logger.info('Scraper started', meta);
      break;
    case 'success':
      logger.info('Scraper completed successfully', meta);
      break;
    case 'error':
      logger.error('Scraper error', { ...meta, error: error?.message || String(error) });
      break;
    case 'retry':
      logger.warn('Scraper retry', meta);
      break;
    case 'cache_hit':
      logger.debug('Cache hit', meta);
      break;
  }
}
