/**
 * Port of convex/subscriptions/internal checkAllSubscriptions (side-effect core).
 * Touches last_checked on active subscription_sources so the monitor is observable
 * even when external fetch is deferred (01-scope live market-data deferred).
 * Idempotent: re-run advances last_checked only.
 *
 * OBS-03: after a successful advance, persists a redacted heartbeat service_event
 * (type/summary carry "last_checked") through the validated public writer so the
 * monitor's activity is durable and queryable across reconnects.
 */
import { createSql } from '../../db/client.ts';
import { writeServiceEvent } from '../../observability/service-events.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

export const subscriptionMonitor: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const sql = createSql(ctx.databaseUrl);

  try {
    const updated = await sql<{ id: string }[]>`
      UPDATE subscription_sources
      SET
        last_checked = ${now.toISOString()}::timestamptz,
        updated_at = ${now.toISOString()}::timestamptz
      WHERE true
      RETURNING id::text AS id
    `;

    const heartbeat = await writeServiceEvent(
      {
        source: 'observability',
        category: 'job',
        type: 'subscription.last_checked',
        severity: 'info',
        status: 'ok',
        summary: `subscription-monitor advanced last_checked for ${updated.length} source(s)`,
        metadata: {
          job_name: 'subscription-monitor',
          sources_checked: updated.length,
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
          sources_checked: updated.length,
          heartbeat_ok: false,
          note: 'last_checked advanced but the redacted heartbeat did not persist',
        },
        error: `observability heartbeat failed: ${heartbeat.error}`,
      };
    }

    return {
      ok: true,
      detail: {
        sources_checked: updated.length,
        note: 'external content fetch deferred (scope); last_checked advanced',
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
