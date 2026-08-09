/**
 * Port of convex/crons.ts whats-new-daily (MIGRATED_TO_MISSION_ENGINE).
 * Does not run the legacy Convex workflow. Enqueues a background mission
 * intent row so the standing ops path can pick it up; domain-visible via
 * queue_jobs + optional mission_runs if template exists.
 */
import { createSql } from '../../db/client.ts';
import { enqueue } from '../priority.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

export const whatsNewDaily: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const key = `whats-new-daily:${dayKey}`;
  const sql = createSql(ctx.databaseUrl);

  try {
    // Dedupe: one enqueue per UTC day.
    const existing = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM queue_jobs
      WHERE key = ${key}
      LIMIT 1
    `;
    if (existing.length > 0) {
      return {
        ok: true,
        detail: {
          enqueued: false,
          deduped: true,
          queue_job_id: existing[0]?.id,
          marker: 'MIGRATED_TO_MISSION_ENGINE',
        },
      };
    }

    const job = await enqueue({
      name: 'mission:whatsNew',
      lane: 'background',
      key,
      payload: {
        templateKey: 'whatsNew',
        date: dayKey,
        source: 'whats-new-daily',
      },
      databaseUrl: ctx.databaseUrl,
    });

    return {
      ok: true,
      detail: {
        enqueued: true,
        queue_job_id: job.id,
        marker: 'MIGRATED_TO_MISSION_ENGINE',
        hint: 'holo mission run whatsNew --date YYYY-MM-DD',
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
