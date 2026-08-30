/**
 * imp-prod-tool-audit-remediation AC-1: subscription-monitor performs a real
 * RSS/Atom fetch per feed-bearing source via the SSRF-hardened shared helper
 * (`fetchFeedEntries` in mcp/executor.ts — same path as the MCP
 * `check_subscriptions` tool, no duplicated fetch logic).
 *
 * Per-source semantics:
 *   - feed_url set   → fetch + parse, insert new entries into
 *                      subscription_content (content_id dedupe), then advance
 *                      last_checked for that source only on success.
 *   - feed_url unset → nothing to fetch; last_checked still advances so the
 *                      monitor stays observable for feed-less sources.
 *   - fetch failure  → error recorded in detail; that source's last_checked is
 *                      NOT advanced (staleness stays visible).
 *
 * Idempotent: re-run dedupes on (source_id, content_id) and re-advances
 * last_checked only.
 *
 * OBS-03: after the sweep, persists a redacted heartbeat service_event
 * (type/summary carry "last_checked") through the validated public writer.
 * Fail closed: a heartbeat that does not persist fails the job so the queue
 * retries instead of reporting green without its durable observability signal.
 */

import { randomUUID } from 'node:crypto';
import { createSql } from '../../db/client.ts';
import { feedAllowlistFromEnv, fetchFeedEntries } from '../../mcp/executor.ts';
import { writeServiceEvent } from '../../observability/service-events.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

export const subscriptionMonitor: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const nowIso = now.toISOString();
  const sql = createSql(ctx.databaseUrl);

  try {
    const sources = await sql<{ id: string; identifier: string; feedUrl: string | null }[]>`
      SELECT id::text AS id, identifier, feed_url AS "feedUrl"
      FROM subscription_sources
      ORDER BY created_at ASC
    `;

    const errors: string[] = [];
    let sourcesFetched = 0;
    let entriesFetched = 0;
    let entriesQueued = 0;

    for (const source of sources) {
      try {
        const feedUrl = source.feedUrl?.trim() ?? '';
        if (feedUrl.length > 0) {
          const entries = await fetchFeedEntries(feedUrl, {
            allowedHosts: feedAllowlistFromEnv(),
          });
          sourcesFetched++;
          entriesFetched += entries.length;
          for (const entry of entries) {
            const inserted = await sql`
              INSERT INTO subscription_content (
                id, source_id, content_id, title, url, metadata_json,
                passed_filter, research_status, discovered_at
              )
              SELECT ${randomUUID()}::uuid, ${source.id}::uuid, ${entry.contentId},
                     ${entry.title}, ${entry.url},
                     ${sql.json({
                       feedUrl,
                       publishedAt: entry.publishedAt,
                       summary: entry.summary,
                     } satisfies Record<string, unknown>)},
                     true, 'pending', COALESCE(${entry.publishedAt}::timestamptz, now())
              WHERE NOT EXISTS (
                SELECT 1 FROM subscription_content
                WHERE source_id = ${source.id}::uuid AND content_id = ${entry.contentId}
              )
              RETURNING id::text AS id
            `;
            entriesQueued += inserted.length;
          }
        }
        await sql`
          UPDATE subscription_sources
          SET last_checked = ${nowIso}::timestamptz, updated_at = ${nowIso}::timestamptz
          WHERE id = ${source.id}::uuid
        `;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        let hostLabel = 'unknown-feed-host';
        try {
          hostLabel = new URL(source.feedUrl ?? '').host;
        } catch {
          // keep fallback label — never let labeling mask the original error
        }
        errors.push(`${source.identifier} (feed ${hostLabel}): ${message}`);
      }
    }

    const advanced = sources.length - errors.length;
    const heartbeat = await writeServiceEvent(
      {
        source: 'observability',
        category: 'job',
        type: 'subscription.last_checked',
        severity: errors.length > 0 ? 'warning' : 'info',
        status: 'ok',
        summary: `subscription-monitor advanced last_checked for ${advanced} source(s); fetched ${entriesFetched} entr(ies) from ${sourcesFetched} feed(s)`,
        metadata: {
          job_name: 'subscription-monitor',
          sources_checked: sources.length,
          rows_affected: entriesQueued,
        },
        redacted: true,
      },
      { databaseUrl: ctx.databaseUrl }
    );

    // Fail closed: AC-1 makes the durable redacted heartbeat a hard contract, not a
    // best-effort nicety. A monitor that advances last_checked but reports ok without
    // a persisted service_event silently drops the only durable observability signal,
    // so surface the heartbeat failure and let the queue retry instead of lying green.
    if (!heartbeat.ok) {
      return {
        ok: false,
        detail: {
          sources_checked: sources.length,
          sources_fetched: sourcesFetched,
          entries_queued: entriesQueued,
          errors: errors.join('; '),
          heartbeat_ok: false,
          note: 'last_checked advanced but the redacted heartbeat did not persist',
        },
        error: `observability heartbeat failed: ${heartbeat.error}`,
      };
    }

    return {
      ok: true,
      detail: {
        sources_checked: sources.length,
        sources_fetched: sourcesFetched,
        entries_fetched: entriesFetched,
        entries_queued: entriesQueued,
        errors: errors.join('; '),
        note: 'per-source fetch+insert via shared SSRF-hardened helper; last_checked advances only on successful check',
        heartbeat_event_id: heartbeat.eventId,
        heartbeat_ok: true,
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
