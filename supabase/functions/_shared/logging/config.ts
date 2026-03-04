import type { LoggerConfig, LogLevel } from './types.ts';

/**
 * Default logger configuration for server-side
 */
export const defaultConfig: LoggerConfig = {
  enabled: Deno.env.get('LOGGING_ENABLED') !== 'false',
  minLevel: (Deno.env.get('LOG_LEVEL') as LogLevel) ?? 'info',
  sanitize: true,
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 7,
  logDirectory: '/tmp/logs',
};

/**
 * Get platform string for logging
 */
export function getPlatformString(): string {
  return 'edge-function';
}

/**
 * Validate log level
 */
export function isValidLogLevel(level: string): level is LogLevel {
  return ['debug', 'info', 'warn', 'error'].includes(level);
}

/**
 * Parse log level from environment variable
 */
export function parseLogLevel(envValue: string | undefined): LogLevel {
  if (envValue && isValidLogLevel(envValue)) {
    return envValue;
  }
  return 'info';
}
