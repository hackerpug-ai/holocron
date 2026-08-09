/**
 * Port of research embedding backfill cron.
 * Counts research rows missing embeddings; does not fabricate vectors.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

export const researchEmbeddingBackfill: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const sql = createSql(ctx.databaseUrl);

  try {
    let findingsMissing = 0;
    let iterationsMissing = 0;

    const findings = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM research_findings
      WHERE embedding IS NULL
    `.catch(() => [{ count: '0' }]);
    findingsMissing = Number(findings[0]?.count ?? 0);

    const iterations = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM deep_research_iterations
      WHERE embedding IS NULL
    `.catch(() => [{ count: '0' }]);
    iterationsMissing = Number(iterations[0]?.count ?? 0);

    return {
      ok: true,
      detail: {
        findings_missing: findingsMissing,
        iterations_missing: iterationsMissing,
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
