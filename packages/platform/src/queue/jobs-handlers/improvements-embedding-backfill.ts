/**
 * Port of improvements embedding backfill cron.
 * Embeds improvement_requests with NULL embeddings via real fleet embed().
 * NEVER returns ok:true with embedded:0 while a non-empty backlog remains.
 */
import { createSql, withDbRetry } from '../../db/client.ts';
import {
  BACKFILL_BATCH,
  embedDocumentText,
  isEmbeddableText,
  toVectorLiteral,
} from './embed-util.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const runimprovementsEmbeddingBackfill: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const sql = createSql(ctx.databaseUrl);

  try {
    let embedded = 0;
    let lastError: string | null = null;

    const rows = await sql<{ id: string; text: string | null }[]>`
      SELECT id::text AS id,
             COALESCE(title, summary, description) AS text
      FROM improvement_requests
      WHERE embedding IS NULL
        AND COALESCE(trim(COALESCE(title, summary, description)), '') <> ''
      ORDER BY created_at ASC
      LIMIT ${BACKFILL_BATCH}
      FOR UPDATE SKIP LOCKED
    `.catch(() => [] as { id: string; text: string | null }[]);

    for (const row of rows) {
      if (!isEmbeddableText(row.text)) continue;
      try {
        const vector = await embedDocumentText(row.text!);
        const lit = toVectorLiteral(vector);
        const updated = await sql<{ id: string }[]>`
          UPDATE improvement_requests
          SET embedding = ${lit}::vector
          WHERE id = ${row.id}::uuid
            AND embedding IS NULL
          RETURNING id::text AS id
        `;
        if (updated.length > 0) embedded++;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        break;
      }
    }

    const left = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM improvement_requests
      WHERE embedding IS NULL
        AND COALESCE(trim(COALESCE(title, summary, description)), '') <> ''
    `.catch(() => [{ count: '0' }]);
    const missingCount = Number(left[0]?.count ?? 0);

    if (missingCount > 0 && embedded === 0) {
      return {
        ok: false,
        detail: { missing_count: missingCount, embedded: 0 },
        error: lastError ? `EMBED_FLEET_FAILED: ${lastError}` : 'EMBED_BACKFILL_NO_PROGRESS',
      };
    }

    return {
      ok: true,
      detail: { missing_count: missingCount, embedded },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};

/** Pool-exhaustion retry wrapper — goal step 5: bursts must not fail on 53300. */
export const improvementsEmbeddingBackfill: JobHandler = (ctx) =>
  withDbRetry(() => runimprovementsEmbeddingBackfill(ctx));
