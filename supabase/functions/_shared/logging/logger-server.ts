import { defaultConfig } from './config.ts';
import { Logger } from './Logger.ts';
import { LogWriter } from './LogWriter.ts';
import type { LogLevel, LoggerConfig } from './types.ts';

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `${Date.now()}-${crypto.randomUUID().split('-')[0]}`;
}

/**
 * Session ID shared across all loggers
 */
const SESSION_ID = generateSessionId();

/**
 * Singleton logger manager
 */
class LoggerManager {
  private config: LoggerConfig;
  private writer: LogWriter | null = null;
  private loggers: Map<string, Logger> = new Map();

  constructor() {
    this.config = { ...defaultConfig };
  }

  /**
   * Initialize the log writer
   */
  private ensureWriter(): void {
    if (!this.writer) {
      this.writer = new LogWriter(this.config);
    }
  }

  /**
   * Get or create a category-specific logger
   */
  getLogger(category: string): Logger {
    if (!this.loggers.has(category)) {
      this.ensureWriter();
      const logger = new Logger(category, this.config, SESSION_ID, this.writer!);
      this.loggers.set(category, logger);
    }
    return this.loggers.get(category)!;
  }

  /**
   * Update logger configuration
   */
  updateConfig(partialConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...partialConfig };
    // Reset writer and loggers with new config
    this.writer = null;
    this.loggers.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Flush all pending log writes
   */
  async flushAll(): Promise<void> {
    const flushPromises = Array.from(this.loggers.values()).map(logger => logger.flush());
    await Promise.all(flushPromises);
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return SESSION_ID;
  }
}

/**
 * Global logger manager instance
 */
const manager = new LoggerManager();

/**
 * Get a category-specific logger
 *
 * @example
 * ```ts
 * import { log } from '../_shared/logging/logger-server.ts'
 *
 * const logger = log('MyFunction')
 * logger.info('Function called')
 * ```
 */
export function log(category: string): Logger {
  return manager.getLogger(category);
}

/**
 * Update global logger configuration
 */
export function updateLoggerConfig(partialConfig: Partial<LoggerConfig>): void {
  manager.updateConfig(partialConfig);
}

/**
 * Get current logger configuration
 */
export function getLoggerConfig(): LoggerConfig {
  return manager.getConfig();
}

/**
 * Flush all pending log writes
 */
export async function flushAllLogs(): Promise<void> {
  await manager.flushAll();
}

/**
 * Get the current session ID
 */
export function getSessionId(): string {
  return manager.getSessionId();
}
