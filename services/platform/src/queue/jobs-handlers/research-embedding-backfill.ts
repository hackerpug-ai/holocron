/**
 * Port of research embedding backfill cron.
 * Embeds research_findings / research_iterations with NULL embeddings via real fleet embed().
 * NEVER returns ok:true with embedded:0 while a non-empty backlog remains.
 */
import { createSql } from '../../db/client.ts';
import {
  BACKFILL_BATCH,
  embedDocumentText,
  isEmbeddableText,
  toVectorLiteral,
} from './embed-util.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

export const researchEmbeddingBackfill: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const sql = createSql(ctx.databaseUrl);

  try {
    let embedded = 0;
    let findingsMissing = 0;
    let iterationsMissing = 0;
    let lastError: string | null = null;

    const findings = await sql<{ id: string; claim_text: string | null }[]>`
      SELECT id::text AS id, claim_text
      FROM research_findings
      WHERE embedding IS NULL
        AND COALESCE(trim(claim_text), '') <> ''
      ORDER BY created_at ASC
      LIMIT ${BACKFILL_BATCH}
      FOR UPDATE SKIP LOCKED
    `.catch(() => [] as { id: string; claim_text: string | null }[]);

    for (const row of findings) {
      if (!isEmbeddableText(row.claim_text)) continue;
      try {
        const vector = await embedDocumentText(row.claim_text!);
        const lit = toVectorLiteral(vector);
        const updated = await sql<{ id: string }[]>`
          UPDATE research_findings
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

    const iterations = await sql<{ id: string; text: string | null }[]>`
      SELECT id::text AS id,
             COALESCE(findings_summary, summary, review_feedback, feedback) AS text
      FROM research_iterations
      WHERE embedding IS NULL
        AND COALESCE(trim(COALESCE(findings_summary, summary, review_feedback, feedback)), '') <> ''
      ORDER BY created_at ASC
      LIMIT ${BACKFILL_BATCH}
      FOR UPDATE SKIP LOCKED
    `.catch(() => [] as { id: string; text: string | null }[]);

    for (const row of iterations) {
      if (!isEmbeddableText(row.text)) continue;
      try {
        const vector = await embedDocumentText(row.text!);
        const lit = toVectorLiteral(vector);
        const updated = await sql<{ id: string }[]>`
          UPDATE research_iterations
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

    const findingsLeft = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM research_findings
      WHERE embedding IS NULL AND COALESCE(trim(claim_text), '') <> ''
    `.catch(() => [{ count: '0' }]);
    findingsMissing = Number(findingsLeft[0]?.count ?? 0);

    const iterationsLeft = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM research_iterations
      WHERE embedding IS NULL
        AND COALESCE(trim(COALESCE(findings_summary, summary, review_feedback, feedback)), '') <> ''
    `.catch(() => [{ count: '0' }]);
    iterationsMissing = Number(iterationsLeft[0]?.count ?? 0);

    const backlog = findingsMissing + iterationsMissing;
    if (backlog > 0 && embedded === 0) {
      return {
        ok: false,
        detail: {
          findings_missing: findingsMissing,
          iterations_missing: iterationsMissing,
          embedded: 0,
        },
        error: lastError ? `EMBED_FLEET_FAILED: ${lastError}` : 'EMBED_BACKFILL_NO_PROGRESS',
      };
    }

    return {
      ok: true,
      detail: {
        findings_missing: findingsMissing,
        iterations_missing: iterationsMissing,
        embedded,
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
