import type { LogEntry, LoggerConfig } from './types';
import { performLogRotation } from './LogRotation.ts';

/**
 * Async write queue for log entries
 */
interface WriteQueue {
  entries: string[];
  flushing: boolean;
}

/**
 * File writer for log entries using Deno filesystem APIs
 */
export class LogWriter {
  private readonly config: LoggerConfig;
  private readonly queue: WriteQueue = { entries: [], flushing: false };
  private currentFilePath: string;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.currentFilePath = this.getLogFilePathForDate(new Date());
  }

  /**
   * Get the log file path for a specific date
   */
  private getLogFilePathForDate(date: Date): string {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return `${this.config.logDirectory}/server-${dateStr}.jsonl`;
  }

  /**
   * Ensure log directory exists
   */
  private async ensureLogDirectory(): Promise<void> {
    try {
      await Deno.mkdir(this.config.logDirectory, { recursive: true });
    } catch (error) {
      // Directory might already exist or other error
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        console.error('Failed to create log directory:', error);
      }
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
      const stat = await Deno.stat(this.currentFilePath);
      if (stat.size > this.config.maxFileSize) {
        await performLogRotation(this.currentFilePath, this.config);
      }
    } catch {
      // File might not exist yet
    }
  }

  /**
   * Write a single line to the log file
   */
  private async writeLine(line: string): Promise<void> {
    await this.ensureLogDirectory();
    this.updateFilePathIfNeeded();

    // Append to file
    using file = await Deno.open(this.currentFilePath, {
      write: true,
      append: true,
      create: true,
    });

    const encoder = new TextEncoder();
    await file.write(encoder.encode(line + '\n'));
    file.close();

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

      using file = await Deno.open(this.currentFilePath, {
        write: true,
        append: true,
        create: true,
      });

      const encoder = new TextEncoder();
      const batchContent = entriesToFlush.join('\n') + '\n';
      await file.write(encoder.encode(batchContent));
      file.close();

      // Check rotation after batch write
      await this.checkRotationNeeded();
    } catch (error) {
      // Silently fail to avoid infinite error loops
    } finally {
      this.queue.flushing = false;
    }
  }

  /**
   * Queue a log entry for writing
   */
  async write(entry: LogEntry): Promise<void> {
    const jsonLine = JSON.stringify(entry);
    this.queue.entries.push(jsonLine);

    // Sync-write for important errors
    if (entry.level === 'error') {
      await this.flushQueue();
    }
  }

  /**
   * Force flush all pending writes
   */
  async flush(): Promise<void> {
    await this.flushQueue();
  }

  /**
   * Get the current log file path
   */
  getCurrentFilePath(): string {
    return this.currentFilePath;
  }
}

// Declare using for Deno resources (TypeScript 5.2+)
declare using {
  // This is for Deno's resource management
  var file: Deno.FsFile;
}
