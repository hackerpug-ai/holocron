/**
 * Port of document embedding backfill cron.
 * Documents store vectors on `passages` (chunk-backed). Delegates to embedRun()
 * which calls real fleet embed() per NULL passage — never ok:true with backlog.
 */
import { createSql, withDbRetry } from '../../db/client.ts';
import { embedRun } from '../../inference/embed-run.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const rundocumentEmbeddingBackfill: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const sql = createSql(ctx.databaseUrl);

  try {
    // Prefer passages (canonical document embedding surface).
    const passagesExist = await sql<{ exists: boolean }[]>`
      SELECT to_regclass('public.passages') IS NOT NULL AS exists
    `;

    if (passagesExist[0]?.exists) {
      const before = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM passages WHERE embedding IS NULL
      `;
      const missingBefore = Number(before[0]?.count ?? 0);
      if (missingBefore === 0) {
        return {
          ok: true,
          detail: { mode: 'passages', missing_count: 0, embedded: 0 },
        };
      }

      try {
        const result = await embedRun({ databaseUrl: ctx.databaseUrl, sql });
        const embedded = result.processed;
        const remaining = result.remainingNull;
        // NEVER ok:true with embedded:0 while backlog remains.
        if (remaining > 0 && embedded === 0) {
          return {
            ok: false,
            detail: {
              mode: 'passages',
              missing_count: remaining,
              embedded: 0,
            },
            error: 'EMBED_BACKFILL_NO_PROGRESS',
          };
        }
        return {
          ok: true,
          detail: {
            mode: 'passages',
            missing_count: remaining,
            embedded,
            missing_before: missingBefore,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          detail: { mode: 'passages', missing_count: missingBefore, embedded: 0 },
          error: `EMBED_FLEET_FAILED: ${message}`,
        };
      }
    }

    // Legacy column-backed documents.embedding (if present).
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'documents'
        AND column_name = 'embedding'
    `;
    if (cols.length === 0) {
      // No passages table and no documents.embedding — nothing to backfill.
      return { ok: true, detail: { mode: 'none', missing_count: 0, embedded: 0 } };
    }

    const missing = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM documents
      WHERE embedding IS NULL
        AND COALESCE(trim(content), '') <> ''
    `;
    const missingCount = Number(missing[0]?.count ?? 0);
    if (missingCount === 0) {
      return { ok: true, detail: { mode: 'column-backed', missing_count: 0, embedded: 0 } };
    }
    return {
      ok: false,
      detail: { mode: 'column-backed', missing_count: missingCount, embedded: 0 },
      error: 'EMBED_BACKFILL_NO_PROGRESS',
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};

/** Pool-exhaustion retry wrapper — goal step 5: bursts must not fail on 53300. */
export const documentEmbeddingBackfill: JobHandler = (ctx) =>
  withDbRetry(() => rundocumentEmbeddingBackfill(ctx));
