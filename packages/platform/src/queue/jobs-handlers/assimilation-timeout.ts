/**
 * Port of convex/assimilate/scheduled.ts timeoutStuckSessions.
 * Convex residual is MIGRATED_TO_MISSION_ENGINE (no-op soak). We still perform
 * a real idempotent sweep against assimilation_sessions so domain state cannot
 * strand forever after Sprint 32 deletes convex/.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

/** Sessions stuck in-progress longer than this are failed. */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export const assimilationTimeout: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const cutoff = new Date(now.getTime() - SESSION_TIMEOUT_MS);
  const sql = createSql(ctx.databaseUrl);

  try {
    // Discover in-progress status values that exist in the live table.
    const updated = await sql<{ id: string }[]>`
      UPDATE assimilation_sessions
      SET
        status = 'failed',
        error_reason = COALESCE(error_reason, 'Assimilation session timed out'),
        updated_at = ${now.toISOString()}::timestamptz,
        completed_at = COALESCE(completed_at, ${now.toISOString()}::timestamptz)
      WHERE status IN ('in_progress', 'running', 'pending', 'active')
        AND COALESCE(updated_at, created_at) < ${cutoff.toISOString()}::timestamptz
      RETURNING id::text AS id
    `;

    return {
      ok: true,
      detail: {
        timed_out_count: updated.length,
        migrated: true,
        marker: 'MIGRATED_TO_MISSION_ENGINE',
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
