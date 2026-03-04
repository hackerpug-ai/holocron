/**
 * Log severity levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Numeric values for log level comparison
 */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * A single log entry
 */
export interface LogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Log severity level */
  level: LogLevel;
  /** Log category/component */
  category: string;
  /** Human-readable message */
  message: string;
  /** Additional context data */
  context?: Record<string, unknown>;
  /** Platform: always 'edge-function' for server logs */
  platform: string;
  /** Unique session identifier */
  sessionId: string;
  /** Optional duration in milliseconds (for timed operations) */
  duration?: number;
  /** Optional error details */
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Whether logging is enabled */
  enabled: boolean;
  /** Minimum log level to record */
  minLevel: LogLevel;
  /** Whether to sanitize sensitive data */
  sanitize: boolean;
  /** Maximum file size before rotation (bytes) */
  maxFileSize: number;
  /** Maximum number of log files to keep */
  maxFiles: number;
  /** Directory path for log files */
  logDirectory: string;
}

/**
 * Sanitization patterns for sensitive data
 */
export interface SanitizationPattern {
  /** Pattern name/description */
  name: string;
  /** Regex pattern to match */
  pattern: RegExp;
  /** Replacement string */
  replacement: string;
}
