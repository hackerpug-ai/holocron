import * as FileSystem from 'expo-file-system';
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
    await FileSystem.readAsStringAsync(currentFilePath);

    // Move current file to rotated version
    const timestamp = Date.now();
    const rotatedPath = currentFilePath.replace('.jsonl', `-${timestamp}.jsonl`);
    await FileSystem.moveAsync({ from: currentFilePath, to: rotatedPath });

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
    const files = await FileSystem.readDirectoryAsync(directory);

    // Filter log files matching the pattern
    const logFiles = files
      .filter(f => f.startsWith(filePrefix) && f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: `${directory}/${f}`,
        // Extract timestamp from filename (format: client-YYYY-MM-DD-timestamp.jsonl)
        timestamp: extractTimestampFromFilename(f),
      }))
      .sort((a, b) => a.timestamp - b.timestamp); // Sort by oldest first

    // Delete oldest files if we exceed maxFiles
    const filesToDelete = logFiles.slice(0, Math.max(0, logFiles.length - config.maxFiles));
    for (const file of filesToDelete) {
      try {
        await FileSystem.deleteAsync(file.path, { idempotent: true });
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
  // Pattern: client-YYYY-MM-DD-timestamp.jsonl or client-YYYY-MM-DD.jsonl
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
  Array<{ name: string; path: string; size: number | undefined }>
> {
  try {
    const files = await FileSystem.readDirectoryAsync(directory);
    const logFiles: Array<{ name: string; path: string; size: number | undefined }> = [];

    for (const file of files) {
      if (file.endsWith('.jsonl')) {
        const path = `${directory}/${file}`;
        const info = await FileSystem.getInfoAsync(path);
        logFiles.push({
          name: file,
          path,
          size: info.exists && 'size' in info ? info.size : undefined,
        });
      }
    }

    return logFiles.sort((a, b) => {
      // Sort by name (which includes date/timestamp)
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}
