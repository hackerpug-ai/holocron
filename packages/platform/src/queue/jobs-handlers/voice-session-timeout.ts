/**
 * Port of convex/voice/scheduled.ts (timeoutOrphanedSessions).
 * Sessions older than 2m with no completed_at → completed with timeout error.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const SESSION_TIMEOUT_MS = 2 * 60 * 1000;

export const voiceSessionTimeout: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const cutoff = new Date(now.getTime() - SESSION_TIMEOUT_MS);
  const sql = createSql(ctx.databaseUrl);

  try {
    const updated = await sql<{ id: string }[]>`
      UPDATE voice_sessions
      SET
        completed_at = ${now.toISOString()}::timestamptz,
        error_message = 'Session timed out',
        updated_at = ${now.toISOString()}::timestamptz
      WHERE completed_at IS NULL
        AND created_at < ${cutoff.toISOString()}::timestamptz
      RETURNING id::text AS id
    `;

    return { ok: true, detail: { timed_out_count: updated.length } };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
