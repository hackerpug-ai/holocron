/**
 * Port of convex/feeds/internal.ts buildFeed (core side-effect).
 * Groups recent subscription_content not yet in_feed into feed_items and
 * marks content as in_feed. Idempotent: already-in-feed rows are skipped.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const MAX_ITEMS = 50;

export const feedBuilder: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const sql = createSql(ctx.databaseUrl);

  try {
    const pending = await sql<
      {
        id: string;
        source_id: string | null;
        title: string | null;
        author_handle: string | null;
        content_category: string | null;
        thumbnail_url: string | null;
        discovered_at: Date | string | null;
      }[]
    >`
      SELECT
        id::text AS id,
        source_id,
        title,
        author_handle,
        content_category,
        thumbnail_url,
        discovered_at
      FROM subscription_content
      WHERE COALESCE(in_feed, false) = false
        AND COALESCE(passed_filter, true) = true
      ORDER BY COALESCE(discovered_at, created_at) DESC
      LIMIT ${MAX_ITEMS}
    `;

    // Group by author_handle / source_id.
    const groups = new Map<string, typeof pending>();
    for (const row of pending) {
      const key = row.author_handle ?? row.source_id ?? 'unknown';
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    let feedItemsCreated = 0;
    for (const [groupKey, rows] of groups) {
      const ids = rows.map((r) => r.id);
      const title =
        rows.length === 1
          ? (rows[0]?.title ?? `Update from ${groupKey}`)
          : `${rows.length} updates from ${groupKey}`;
      const contentType = rows[0]?.content_category ?? 'blog';

      const inserted = await sql<{ id: string }[]>`
        INSERT INTO feed_items (
          group_key,
          title,
          summary,
          content_type,
          item_count,
          item_ids,
          author_handle,
          creator_name,
          viewed,
          discovered_at,
          created_at
        )
        VALUES (
          ${groupKey},
          ${title},
          ${title},
          ${contentType},
          ${rows.length},
          ${sql.json(ids as never)},
          ${rows[0]?.author_handle ?? null},
          ${groupKey},
          false,
          ${now.toISOString()}::timestamptz,
          ${now.toISOString()}::timestamptz
        )
        RETURNING id::text AS id
      `;
      const feedItemId = inserted[0]?.id;
      if (!feedItemId) continue;
      feedItemsCreated++;

      await sql`
        UPDATE subscription_content
        SET
          in_feed = true,
          feed_item_id = ${feedItemId}
        WHERE id = ANY(${ids}::uuid[])
      `;
    }

    return {
      ok: true,
      detail: {
        feed_items_created: feedItemsCreated,
        content_marked: pending.length,
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
