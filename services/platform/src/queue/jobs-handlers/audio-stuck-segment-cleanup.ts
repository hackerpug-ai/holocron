/**
 * Port of convex/audio/scheduled.ts (timeoutStuckSegments).
 * Segments stuck generating > 3m and jobs stuck running/pending > 10m → failed.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const SEGMENT_TIMEOUT_MS = 180_000;
const JOB_TIMEOUT_MS = 600_000;

export const audioStuckSegmentCleanup: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const segmentCutoff = new Date(now.getTime() - SEGMENT_TIMEOUT_MS);
  const jobCutoff = new Date(now.getTime() - JOB_TIMEOUT_MS);
  const sql = createSql(ctx.databaseUrl);

  try {
    // Convex "generating" maps to Postgres running/in_progress (workStatusValues).
    const segs = await sql<{ id: string }[]>`
      UPDATE audio_segments
      SET
        status = 'failed',
        error_message = 'Generation timed out',
        updated_at = ${now.toISOString()}::timestamptz
      WHERE status IN ('running', 'in_progress')
        AND updated_at < ${segmentCutoff.toISOString()}::timestamptz
      RETURNING id::text AS id
    `;

    const jobs = await sql<{ id: string }[]>`
      UPDATE audio_jobs
      SET
        status = 'failed',
        error_message = CASE
          WHEN status = 'pending' THEN 'Job timed out (never started)'
          ELSE 'Job timed out'
        END,
        updated_at = ${now.toISOString()}::timestamptz
      WHERE status IN ('running', 'pending')
        AND updated_at < ${jobCutoff.toISOString()}::timestamptz
      RETURNING id::text AS id
    `;

    return {
      ok: true,
      detail: {
        segments_failed: segs.length,
        jobs_failed: jobs.length,
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
