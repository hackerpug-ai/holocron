/**
 * Structured Logging Utility
 *
 * Provides consistent, structured logging throughout the Convex backend.
 * Logs are emitted as JSON for easier parsing and filtering.
 *
 * Usage:
 * ```typescript
 * import { logEvent, logError } from "../lib/logger";
 *
 * logEvent("function_name", { status: "started", id: "123" });
 * logError("function_name", { error: "Something failed", code: 500 });
 * ```
 */

type LogLevel = "info" | "warn" | "error" | "debug";

type LogContext = Record<string, unknown>;

/**
 * Log an event with structured context
 *
 * @param event - Event name/function identifier
 * @param context - Additional context data
 * @param level - Log level (default: "info")
 */
export function logEvent(
  event: string,
  context: LogContext = {},
  level: LogLevel = "info"
): void {
  const logEntry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const output = JSON.stringify(logEntry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "debug":
      // Only log debug in non-production
      if (process.env.NODE_ENV !== "production") {
        console.debug(output);
      }
      break;
    default:
      console.log(output);
  }
}

/**
 * Log an error with structured context
 *
 * @param event - Event name/function identifier
 * @param context - Additional context data (should include error details)
 */
export function logError(event: string, context: LogContext = {}): void {
  logEvent(event, context, "error");
}

/**
 * Log a warning with structured context
 *
 * @param event - Event name/function identifier
 * @param context - Additional context data
 */
export function logWarning(event: string, context: LogContext = {}): void {
  logEvent(event, context, "warn");
}

/**
 * Log debug information (only in non-production)
 *
 * @param event - Event name/function identifier
 * @param context - Additional context data
 */
export function logDebug(event: string, context: LogContext = {}): void {
  logEvent(event, context, "debug");
}
