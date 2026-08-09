/**
 * Shared types for migrated cron job handlers.
 *
 * Each handler is a pure-ish async function over real Postgres (via databaseUrl).
 * Handlers MUST be idempotent under replay: re-running against already-swept
 * rows changes 0 rows.
 */
export type JobHandlerResult = {
  ok: boolean;
  /** Domain-side summary (counts, ids). Never a fabricated success. */
  detail: Record<string, unknown>;
  /** Named failure code/message when ok=false. */
  error?: string;
};

export type JobHandlerContext = {
  databaseUrl: string;
  /** Optional evaluation instant (scheduler step / tests). Defaults to now. */
  now?: Date;
  /** Optional job-specific args (timeout minutes, etc.). */
  args?: Record<string, unknown>;
};

export type JobHandler = (ctx: JobHandlerContext) => Promise<JobHandlerResult>;
