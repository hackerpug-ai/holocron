/**
 * Port of convex/crons.ts whats-new-daily (MIGRATED_TO_MISSION_ENGINE).
 *
 * imp-prod-tool-audit-remediation AC-2: instead of enqueueing a bare
 * `mission:whatsNew` intent (no runId — the scheduler-worker's mission branch
 * reads payload.runId and silently skips), this handler admits a REAL mission
 * run through the exported HTTP admission path (createMissionRunFromHttp →
 * admitMissionRunPending). Admission creates a pending mission_runs row and
 * enqueues `mission:execute` with payload.runId, so the standing scheduler
 * actually executes the whatsNew template and the daily briefing regenerates.
 *
 * Dedupe-once-per-day: mission admission is idempotent on
 * (template_key, idempotency_key) with key `whats-new-daily:<day>`; the handler
 * short-circuits on an existing run for the same UTC day.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

export const WHATS_NEW_TEMPLATE_KEY = 'whatsnew';

export const whatsNewDaily: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const now = ctx.now ?? new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const key = `whats-new-daily:${dayKey}`;
  const sql = createSql(ctx.databaseUrl);

  try {
    // Dedupe: one mission run admission per UTC day.
    const existing = await sql<{ id: string; status: string }[]>`
      SELECT id::text AS id, status
      FROM mission_runs
      WHERE template_key = ${WHATS_NEW_TEMPLATE_KEY}
        AND idempotency_key = ${key}
      LIMIT 1
    `;
    if (existing[0]) {
      return {
        ok: true,
        detail: {
          enqueued: false,
          deduped: true,
          run_id: existing[0].id,
          run_status: existing[0].status,
          marker: 'MIGRATED_TO_MISSION_ENGINE',
        },
      };
    }

    // Admit the real mission run (pending) + enqueue mission:execute {runId}.
    // Dynamic import mirrors scheduler-worker: a static import would cycle
    // (missions → soak-fence → jobs-registry → jobs-handlers index → here).
    const { createMissionRunFromHttp } = await import('../../http/missions.ts');
    const admitted = await createMissionRunFromHttp(
      {
        templateKey: WHATS_NEW_TEMPLATE_KEY,
        goal: `daily briefing for ${dayKey}`,
        idempotencyKey: key,
      },
      { databaseUrl: ctx.databaseUrl }
    );
    if (!admitted.ok || !admitted.runId) {
      return {
        ok: false,
        detail: {
          admitted,
          marker: 'MIGRATED_TO_MISSION_ENGINE',
        },
        error: `mission admission failed for ${key}: ${admitted.error ?? 'no runId returned'}`,
      };
    }

    return {
      ok: true,
      detail: {
        enqueued: true,
        run_id: admitted.runId,
        run_status: admitted.status ?? 'pending',
        replay: admitted.replay === true,
        marker: 'MIGRATED_TO_MISSION_ENGINE',
        hint: 'scheduler-worker executes mission:execute with payload.runId',
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
