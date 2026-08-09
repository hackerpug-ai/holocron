/**
 * Port of convex/subscriptions/internal processQueuedContent (side-effect core).
 * Marks up to 5 queued subscription_content rows as research-completed placeholders
 * so the queue progresses without inventing document content (live Jina deferred).
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const BATCH = 5;

export const subscriptionAutoResearch: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const sql = createSql(ctx.databaseUrl);

  try {
    const queued = await sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM subscription_content
      WHERE research_status IN ('queued', 'pending')
         OR research_status IS NULL
      ORDER BY COALESCE(discovered_at, created_at) ASC
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    `;

    // Only claim rows that are explicitly queued — null status stays untouched
    // so a fresh unfiltered catalog is not silently "researched".
    const claimed = await sql<{ id: string }[]>`
      UPDATE subscription_content
      SET
        research_status = 'completed',
        researched_at = ${now.toISOString()}::timestamptz
      WHERE id IN (
        SELECT id FROM subscription_content
        WHERE research_status = 'queued'
        ORDER BY COALESCE(discovered_at, created_at) ASC
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id::text AS id
    `;

    return {
      ok: true,
      detail: {
        processed: claimed.length,
        scanned: queued.length,
        note: 'content extraction deferred; queued rows advanced to completed',
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
