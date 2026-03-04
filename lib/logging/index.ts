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

// Type definitions
export type { LogLevel, LogEntry, LoggerConfig, SanitizationPattern } from './types';

// Core logger class
export { Logger } from './Logger';

// Configuration
export { defaultConfig, getPlatformString, isValidLogLevel, parseLogLevel } from './config';

// Sanitization
export { sanitize, sanitizeObject, sanitizeError, getSanitizationPatterns } from './sanitizers';

// File writer
export { LogWriter } from './LogWriter';

// Log rotation
export { performLogRotation, cleanupOldLogs, getLogFiles } from './LogRotation';
