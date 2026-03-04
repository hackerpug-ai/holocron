import * as FileSystem from 'expo-file-system';
import type { LogEntry, LogLevel, LoggerConfig } from './types';
import { LOG_LEVEL_VALUES } from './types';
import { sanitizeObject, sanitizeError } from './sanitizers';
import { LogWriter } from './LogWriter';
import { getPlatformString } from './config';

/**
 * Category-specific Logger instance
 */
export class Logger {
  private readonly category: string;
  private readonly config: LoggerConfig;
  private readonly sessionId: string;
  private readonly platform: string;
  private readonly writer: LogWriter;

  constructor(
    category: string,
    config: LoggerConfig,
    sessionId: string,
    writer: LogWriter,
  ) {
    this.category = category;
    this.config = config;
    this.sessionId = sessionId;
    this.platform = getPlatformString();
    this.writer = writer;
  }

  /**
   * Check if a log level should be recorded based on minLevel config
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) {
      return false;
    }
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.minLevel];
  }

  /**
   * Create a log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    duration?: number,
    error?: Error,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: this.category,
      message,
      platform: this.platform,
      sessionId: this.sessionId,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = this.config.sanitize ? sanitizeObject(context) : context;
    }

    if (duration !== undefined) {
      entry.duration = duration;
    }

    if (error) {
      const sanitizedError = sanitizeError(error);
      entry.error = {
        name: sanitizedError.name as string || 'Error',
        message: sanitizedError.message as string,
        stack: sanitizedError.stack as string | undefined,
      };
    }

    return entry;
  }

  /**
   * Write log entry and optionally output to console
   */
  private async write(entry: LogEntry): Promise<void> {
    // Output to console in development
    if (__DEV__) {
      const consoleMethod = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'log';
      const emoji = {
        debug: '🐛',
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
      }[entry.level];

      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      const durationStr = entry.duration ? ` (${entry.duration}ms)` : '';
      // eslint-disable-next-line no-console
      console[consoleMethod](`[${emoji} ${entry.category}]${entry.message}${durationStr}${contextStr}`);
    }

    // Write to file
    await this.writer.write(entry);
  }

  /**
   * Log a debug message
   */
  async debug(message: string, context?: Record<string, unknown>): Promise<void> {
    if (!this.shouldLog('debug')) return;

    const entry = this.createEntry('debug', message, context);
    await this.write(entry);
  }

  /**
   * Log an info message
   */
  async info(message: string, context?: Record<string, unknown>): Promise<void> {
    if (!this.shouldLog('info')) return;

    const entry = this.createEntry('info', message, context);
    await this.write(entry);
  }

  /**
   * Log a warning message
   */
  async warn(message: string, context?: Record<string, unknown>): Promise<void> {
    if (!this.shouldLog('warn')) return;

    const entry = this.createEntry('warn', message, context);
    await this.write(entry);
  }

  /**
   * Log an error message
   */
  async error(
    message: string,
    error?: Error | unknown,
    context?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.shouldLog('error')) return;

    const errorObj = error instanceof Error ? error : error ? new Error(String(error)) : undefined;
    const entry = this.createEntry('error', message, context, undefined, errorObj);
    await this.write(entry);
  }

  /**
   * Log an operation with automatic timing
   */
  async logOperation<T>(
    operationName: string,
    fn: () => Promise<T> | T,
    context?: Record<string, unknown>,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      await this.info(`Operation completed: ${operationName}`, {
        ...context,
        operation: operationName,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.error(`Operation failed: ${operationName}`, error, {
        ...context,
        operation: operationName,
        duration,
      });

      throw error;
    }
  }

  /**
   * Flush any pending log writes
   */
  async flush(): Promise<void> {
    await this.writer.flush();
  }
}
