/**
 * Port of improvements embedding backfill cron.
 * Counts improvement_requests missing embeddings; does not fabricate vectors.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

export const improvementsEmbeddingBackfill: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const sql = createSql(ctx.databaseUrl);

  try {
    const missing = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM improvement_requests
      WHERE embedding IS NULL
    `.catch(() => [{ count: '0' }]);

    return {
      ok: true,
      detail: {
        missing_count: Number(missing[0]?.count ?? 0),
        embedded: 0,
        note: 'use holo embed:run for real vectors; no fabricated embeddings',
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
