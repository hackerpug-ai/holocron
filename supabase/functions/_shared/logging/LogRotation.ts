import type { LoggerConfig } from './types';

/**
 * Perform log rotation when file exceeds max size
 */
export async function performLogRotation(
  currentFilePath: string,
  config: LoggerConfig,
): Promise<void> {
  try {
    // Read current file content
    const content = await Deno.readTextFile(currentFilePath);

    // Move current file to rotated version
    const timestamp = Date.now();
    const rotatedPath = currentFilePath.replace('.jsonl', `-${timestamp}.jsonl`);
    await Deno.rename(currentFilePath, rotatedPath);

    // Clean up old log files
    await cleanupOldLogs(currentFilePath, config);
  } catch {
    // Silently fail to avoid infinite error loops
  }
}

/**
 * Clean up old log files beyond maxFiles limit
 */
export async function cleanupOldLogs(
  currentFilePath: string,
  config: LoggerConfig,
): Promise<void> {
  try {
    // Extract directory and file prefix
    const lastSlashIndex = currentFilePath.lastIndexOf('/');
    const directory = currentFilePath.substring(0, lastSlashIndex);
    const filePrefix = currentFilePath.substring(lastSlashIndex + 1).replace('.jsonl', '');

    // List all files in directory
    const files = [];
    for await (const dirEntry of Deno.readDir(directory)) {
      if (dirEntry.name.startsWith(filePrefix) && dirEntry.name.endsWith('.jsonl')) {
        files.push(dirEntry.name);
      }
    }

    // Get file info and sort by timestamp
    const logFiles = [];
    for (const file of files) {
      const path = `${directory}/${file}`;
      try {
        const stat = await Deno.stat(path);
        logFiles.push({
          name: file,
          path,
          mtime: stat.mtime?.getTime() ?? 0,
          timestamp: extractTimestampFromFilename(file),
        });
      } catch {
        // Ignore stat errors
      }
    }

    // Sort by oldest first
    logFiles.sort((a, b) => a.timestamp - b.timestamp);

    // Delete oldest files if we exceed maxFiles
    const filesToDelete = logFiles.slice(0, Math.max(0, logFiles.length - config.maxFiles));
    for (const file of filesToDelete) {
      try {
        await Deno.remove(file.path);
      } catch {
        // Ignore delete errors
      }
    }
  } catch {
    // Silently fail to avoid infinite error loops
  }
}

/**
 * Extract timestamp from rotated log filename
 */
function extractTimestampFromFilename(filename: string): number {
  // Pattern: server-YYYY-MM-DD-timestamp.jsonl or server-YYYY-MM-DD.jsonl
  const matches = filename.match(/(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.jsonl$/);

  if (matches) {
    const dateStr = matches[1];
    const timestamp = matches[2];

    if (timestamp) {
      return parseInt(timestamp, 10);
    }

    // Use date as timestamp for non-rotated files
    return new Date(dateStr).getTime();
  }

  return 0;
}

/**
 * Get all log file info for debugging
 */
export async function getLogFiles(directory: string): Promise<
  Array<{ name: string; path: string; size: number }>
> {
  try {
    const logFiles: Array<{ name: string; path: string; size: number }> = [];

    for await (const dirEntry of Deno.readDir(directory)) {
      if (dirEntry.name.endsWith('.jsonl')) {
        const path = `${directory}/${dirEntry.name}`;
        const stat = await Deno.stat(path);
        logFiles.push({
          name: dirEntry.name,
          path,
          size: stat.size,
        });
      }
    }

    return logFiles.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
