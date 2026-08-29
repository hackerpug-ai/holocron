/**
 * Structured logging system for React Native
 *
 * @example
 * ```ts
 * import { log } from '@/lib/logger-client'
 *
 * const logger = log('MyComponent')
 * logger.info('Component mounted', { props })
 * ```
 */

// Configuration
export { defaultConfig, getPlatformString, isValidLogLevel, parseLogLevel } from './config';

// Core logger class
export { Logger } from './Logger';
// Log rotation
export { cleanupOldLogs, getLogFiles, performLogRotation } from './LogRotation';
// File writer
export { LogWriter } from './LogWriter';
// Sanitization
export { getSanitizationPatterns, sanitize, sanitizeError, sanitizeObject } from './sanitizers';
// Type definitions
export type { LogEntry, LoggerConfig, LogLevel, SanitizationPattern } from './types';
