/**
 * Port of convex/subscriptions/internal processQueuedContent.
 *
 * Does NOT mark research_status=completed without producing a document.
 * When queued work exists but content extraction is unavailable, leaves rows
 * queued and fails closed with RESEARCH_DEFERRED_NO_DOCUMENT.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const BATCH = 5;

export const subscriptionAutoResearch: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const sql = createSql(ctx.databaseUrl);

  try {
    const queued = await sql<{ id: string; url: string | null; title: string | null }[]>`
      SELECT id::text AS id, url, title
      FROM subscription_content
      WHERE research_status = 'queued'
      ORDER BY COALESCE(discovered_at, created_at) ASC
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    `;

    if (queued.length === 0) {
      return {
        ok: true,
        detail: { processed: 0, documents_created: 0, deferred: 0, queued: 0 },
      };
    }

    // Live Jina/content extraction is deferred in scope — do not invent documents
    // and do not advance research_status to completed. Leave queued for a real
    // extraction worker; surface a named non-success so jobs:run-all cannot greenwash.
    return {
      ok: false,
      detail: {
        processed: 0,
        documents_created: 0,
        deferred: queued.length,
        queued: queued.length,
        sample_ids: queued.map((r) => r.id).slice(0, 5),
      },
      error: 'RESEARCH_DEFERRED_NO_DOCUMENT',
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
