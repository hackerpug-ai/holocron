/**
 * Port of convex/feeds/internal.ts createMorningDigest (+ notification side-effect).
 * Summarizes last-24h feed items and inserts a digest notification row.
 * Idempotent under same-day replay: one digest per UTC calendar day (reference_id).
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

export const morningDigest: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const referenceId = `morning-digest:${dayKey}`;
  const sql = createSql(ctx.databaseUrl);

  try {
    // Idempotency: skip if today's digest already exists.
    const existing = await sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM notifications
      WHERE type = 'morning_digest'
        AND reference_id = ${referenceId}
      LIMIT 1
    `;
    if (existing.length > 0) {
      return {
        ok: true,
        detail: { created: false, deduped: true, notification_id: existing[0]?.id },
      };
    }

    const items = await sql<{ id: string; viewed: boolean | null; content_type: string | null }[]>`
      SELECT id::text AS id, viewed, content_type
      FROM feed_items
      WHERE COALESCE(discovered_at, created_at) >= ${since.toISOString()}::timestamptz
      ORDER BY COALESCE(discovered_at, created_at) DESC
      LIMIT 100
    `;

    const stats = {
      total: items.length,
      unviewed: items.filter((i) => !i.viewed).length,
      video: items.filter((i) => i.content_type === 'video').length,
      blog: items.filter((i) => i.content_type === 'blog').length,
      social: items.filter((i) => i.content_type === 'social').length,
    };

    const summary = `Morning digest: ${stats.unviewed} unviewed items of ${stats.total} total (${stats.video} videos, ${stats.blog} blogs, ${stats.social} social)`;
    const feedItemIds = items.map((i) => i.id);

    const inserted = await sql<{ id: string }[]>`
      INSERT INTO notifications (
        type,
        title,
        body,
        route,
        reference_id,
        read,
        importance,
        feed_item_ids,
        digest_count,
        digest_summary,
        created_at
      )
      VALUES (
        'morning_digest',
        'Morning Digest',
        ${summary},
        '/feed',
        ${referenceId},
        false,
        'normal',
        ${sql.json(feedItemIds as never)},
        ${stats.unviewed},
        ${summary},
        ${now.toISOString()}::timestamptz
      )
      RETURNING id::text AS id
    `;

    return {
      ok: true,
      detail: {
        created: true,
        notification_id: inserted[0]?.id ?? null,
        stats,
        message: summary,
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
