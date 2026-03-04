/**
 * Structured logging system for Supabase Edge Functions
 *
 * @example
 * ```ts
 * import { log } from '../_shared/logging'
 *
 * const logger = log('MyFunction')
 * logger.info('Processing request', { requestId })
 * ```
 */

// Type definitions
export type { LogLevel, LogEntry, LoggerConfig, SanitizationPattern } from './types.ts';

// Core logger class
export { Logger } from './Logger.ts';

// Configuration
export { defaultConfig, getPlatformString, isValidLogLevel, parseLogLevel } from './config.ts';

// Sanitization
export { sanitize, sanitizeObject, sanitizeError, getSanitizationPatterns } from './sanitizers.ts';

// File writer
export { LogWriter } from './LogWriter.ts';

// Log rotation
export { performLogRotation, cleanupOldLogs, getLogFiles } from './LogRotation.ts';

// Server singleton (main export for Edge Functions)
export { log, updateLoggerConfig, getLoggerConfig, flushAllLogs, getSessionId } from './logger-server.ts';
