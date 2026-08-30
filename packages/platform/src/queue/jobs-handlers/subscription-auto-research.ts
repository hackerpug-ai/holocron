/**
 * Goal mtfxh0ho-aveqis step 6 — subscription document loop (code half).
 *
 * Reconciles the research_status literal mismatch: the fetch path (mcp
 * executor + subscription-monitor) inserts 'pending'; the previous version of
 * this handler selected the orphan 'queued' literal — a value nothing in the
 * pipeline writes — so the backlog was permanently invisible and the handler
 * hard-failed RESEARCH_DEFERRED_NO_DOCUMENT.
 *
 * Now: selects PENDING rows and admits the standing `subscriptions` mission
 * (template_key 'subscriptions') via createMissionRunFromHttp, mirroring the
 * whats-new-daily admission pattern — dedupe on the active run, honest
 * failure when admission fails. The mission template owns the
 * pending → researched transition and document creation.
 */
import { createSql } from '../../db/client.ts';
import type { JobHandler, JobHandlerResult } from './types.ts';

const BATCH = 5;
const TEMPLATE_KEY = 'subscriptions';

export const subscriptionAutoResearch: JobHandler = async (ctx): Promise<JobHandlerResult> => {
  const sql = createSql(ctx.databaseUrl);

  try {
    const pending = await sql<{ id: string; url: string | null; title: string | null }[]>`
      SELECT id::text AS id, url, title
      FROM subscription_content
      WHERE research_status = 'pending'
      ORDER BY COALESCE(discovered_at, created_at) ASC
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    `;

    if (pending.length === 0) {
      return { ok: true, detail: { processed: 0, documents_created: 0, pending: 0 } };
    }

    // Dedupe: never stack runs while one is already active for this backlog.
    const active = await sql<{ id: string; status: string }[]>`
      SELECT id::text AS id, status
      FROM mission_runs
      WHERE template_key = ${TEMPLATE_KEY}
        AND status IN ('pending', 'running')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (active[0]) {
      return {
        ok: true,
        detail: {
          enqueued: false,
          deduped: true,
          run_id: active[0].id,
          run_status: active[0].status,
          pending: pending.length,
        },
      };
    }

    // Admit the real mission run (pending) + enqueue mission:execute {runId}.
    // Dynamic import mirrors scheduler-worker: a static import would cycle
    // (missions → soak-fence → jobs-registry → jobs-handlers index → here).
    const { createMissionRunFromHttp } = await import('../../http/missions.ts');
    const key = `subscriptions-auto:${pending[0]!.id}`;
    const admitted = await createMissionRunFromHttp(
      {
        templateKey: TEMPLATE_KEY,
        goal: `research ${pending.length} pending subscription content item(s)`,
        idempotencyKey: key,
      },
      { databaseUrl: ctx.databaseUrl }
    );
    if (!admitted.ok || !admitted.runId) {
      // Honest failure: rows stay pending, the queue retries — never greenwash.
      return {
        ok: false,
        detail: {
          admitted,
          pending: pending.length,
          sample_ids: pending.map((r) => r.id).slice(0, 5),
        },
        error: `subscriptions mission admission failed (${key}): ${admitted.error ?? 'no runId returned'}`,
      };
    }

    return {
      ok: true,
      detail: {
        enqueued: true,
        run_id: admitted.runId,
        pending: pending.length,
        idempotency_key: key,
        sample_ids: pending.map((r) => r.id).slice(0, 5),
      },
    };
  } catch (err) {
    return { ok: false, detail: {}, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 5 });
  }
};
