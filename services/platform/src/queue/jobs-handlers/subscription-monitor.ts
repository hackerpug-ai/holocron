/**
 * Port of convex/subscriptions/internal checkAllSubscriptions (side-effect core).
 * Touches last_checked on active subscription_sources so the monitor is observable
 * even when external fetch is deferred (01-scope live market-data deferred).
 * Idempotent: re-run advances last_checked only.
 */
import { createSql } from '../../db/client.ts';
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

    return {
      ok: true,
      detail: {
        sources_checked: updated.length,
        note: 'external content fetch deferred (scope); last_checked advanced',
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
