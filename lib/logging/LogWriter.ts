import * as FileSystem from 'expo-file-system/legacy';
import type { LogEntry, LoggerConfig } from './types';
import { performLogRotation } from './LogRotation';

/**
 * Get document directory safely
 * expo-file-system types may not include documentDirectory
 */
function getDocumentDirectory(): string {
  return (FileSystem as any).documentDirectory || '.';
}

/**
 * Async write queue for log entries
 */
interface WriteQueue {
  entries: string[];
  flushing: boolean;
}

/**
 * File writer for log entries using expo-file-system
 */
export class LogWriter {
  private readonly config: LoggerConfig;
  private readonly queue: WriteQueue = { entries: [], flushing: false };
  private currentFilePath: string;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 1000; // Flush every 1 second

  constructor(config: LoggerConfig) {
    this.config = config;
    this.currentFilePath = this.getLogFilePathForDate(new Date());
  }

  /**
   * Get the log file path for a specific date
   */
  private getLogFilePathForDate(date: Date): string {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return `${getDocumentDirectory()}${this.config.logDirectory}/client-${dateStr}.jsonl`;
  }

  /**
   * Ensure log directory exists
   */
  private async ensureLogDirectory(): Promise<void> {
    const dirPath = `${getDocumentDirectory()}${this.config.logDirectory}`;

    try {
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create log directory:', error);
    }
  }

  /**
   * Update current file path if day has changed
   */
  private updateFilePathIfNeeded(): void {
    const newPath = this.getLogFilePathForDate(new Date());
    if (newPath !== this.currentFilePath) {
      this.currentFilePath = newPath;
    }
  }

  /**
   * Check if current log file needs rotation
   */
  private async checkRotationNeeded(): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(this.currentFilePath);
      if (fileInfo.exists && 'size' in fileInfo && fileInfo.size) {
        if (fileInfo.size > this.config.maxFileSize) {
          await performLogRotation(this.currentFilePath, this.config);
        }
      }
    } catch (error) {
      // Ignore rotation errors
    }
  }

  /**
   * Write a single line to the log file
   */
  private async writeLine(line: string): Promise<void> {
    await this.ensureLogDirectory();
    this.updateFilePathIfNeeded();

    // Append to file
    await FileSystem.writeAsStringAsync(this.currentFilePath, line + '\n', {
      append: true,
    });

    // Check if rotation is needed
    await this.checkRotationNeeded();
  }

  /**
   * Flush the write queue
   */
  private async flushQueue(): Promise<void> {
    if (this.queue.flushing || this.queue.entries.length === 0) {
      return;
    }

    this.queue.flushing = true;

    try {
      // Get all entries to flush
      const entriesToFlush = [...this.queue.entries];
      this.queue.entries = [];

      // Write all entries as a batch
      await this.ensureLogDirectory();
      this.updateFilePathIfNeeded();

      const batchContent = entriesToFlush.join('\n') + '\n';
      await FileSystem.writeAsStringAsync(this.currentFilePath, batchContent, {
        append: true,
      });

      // Check rotation after batch write
      await this.checkRotationNeeded();
    } catch (error) {
      // Silently fail to avoid infinite error loops
    } finally {
      this.queue.flushing = false;
    }
  }

  /**
   * Schedule a flush
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushQueue().finally(() => {
        this.flushTimer = null;
      });
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Queue a log entry for writing
   */
  async write(entry: LogEntry): Promise<void> {
    const jsonLine = JSON.stringify(entry);
    this.queue.entries.push(jsonLine);

    // Schedule flush if not already scheduled
    this.scheduleFlush();

    // Also sync-write for important errors
    if (entry.level === 'error') {
      await this.flushQueue();
    }
  }

  /**
   * Force flush all pending writes
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushQueue();
  }

  /**
   * Get the current log file path
   */
  getCurrentFilePath(): string {
    return this.currentFilePath;
  }
}
