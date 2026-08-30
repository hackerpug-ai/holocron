/**
 * Goal mtfxh0ho-aveqis step 6 — subscription document loop (code half).
 *
 * Reconciles the research_status literal mismatch (the fetch path inserts
 * 'pending'; the old auto-research handler selected 'queued', a literal
 * nothing writes) and replaces the RESEARCH_DEFERRED_NO_DOCUMENT hard-fail
 * with admission of the standing `subscriptions` mission — mirroring the
 * whats-new-daily admission pattern (dedupe on active run, honest failure).
 *
 * Runs against REAL Postgres (holocron_nonprod): rows are namespaced and
 * deleted per-test/in afterAll. Set DATABASE_URL to run; skips otherwise.
 * Test order matters: the literal test runs before any pending rows are
 * created by the other tests.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client';
import { subscriptionAutoResearch } from '../../src/queue/jobs-handlers/subscription-auto-research';

const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';
const NS = `step6-${randomUUID().slice(0, 8)}`;

const itDb = (name: string, fn: (sql: Sql) => Promise<void>, timeout = 30_000): void => {
  const run = DATABASE_URL ? it : it.skip;
  run(
    name,
    async () => {
      const sql = createSql(DATABASE_URL);
      try {
        await fn(sql);
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    timeout
  );
};

let sharedSql: Sql | null = null;

afterAll(async () => {
  if (!DATABASE_URL) return;
  const sql = sharedSql ?? createSql(DATABASE_URL);
  try {
    // run keys are `subscriptions-auto:<row-uuid>` — no NS; clean by shape
    await sql`DELETE FROM queue_jobs WHERE name = 'mission:execute' AND payload->>'runId' IN (SELECT id::text FROM mission_runs WHERE template_key = 'subscriptions' AND idempotency_key LIKE ${'subscriptions-auto:%'})`;
    await sql`DELETE FROM mission_runs WHERE template_key = 'subscriptions' AND idempotency_key LIKE ${'subscriptions-auto:%'}`;
    await sql`DELETE FROM subscription_content WHERE source_id IN (SELECT id FROM subscription_sources WHERE identifier LIKE ${NS + '%'})`;
    await sql`DELETE FROM subscription_sources WHERE identifier LIKE ${NS + '%'}`;
  } catch {
    // best-effort cleanup
  } finally {
    await sql.end({ timeout: 5 });
  }
});

async function insertSource(sql: Sql, marker: string): Promise<string> {
  const source = await sql<{ id: string }[]>`
    INSERT INTO subscription_sources (identifier, source_type, name)
    VALUES (${marker}, 'github', ${'step6 probe source'})
    RETURNING id::text AS id
  `;
  return source[0]!.id;
}

async function insertContent(
  sql: Sql,
  sourceId: string,
  contentId: string,
  status: string
): Promise<void> {
  await sql`
    INSERT INTO subscription_content (source_id, content_id, title, research_status, discovered_at)
    VALUES (${sourceId}::uuid, ${contentId}, ${'step6 item'}, ${status}, now())
  `;
}

describe('subscription-auto-research admits the standing subscriptions mission', () => {
  itDb('treats the orphan QUEUED literal as invisible to the pipeline', async (sql) => {
    sharedSql = sql;
    // safety: clear leftover namespaced pending rows from earlier runs
    await sql`DELETE FROM subscription_content WHERE research_status = 'pending' AND content_id LIKE ${'step6%'}`;
    const sourceId = await insertSource(sql, `${NS + '-src-literal'}`);
    await insertContent(sql, sourceId, `${NS + 'c3'}`, 'queued');

    const result = await subscriptionAutoResearch({ databaseUrl: DATABASE_URL });
    const detail = result.detail as { pending?: number; enqueued?: boolean };
    expect(detail.pending ?? 0).toBe(0);
    expect(detail.enqueued).toBeUndefined();

    await sql`DELETE FROM subscription_content WHERE source_id = ${sourceId}::uuid`;
    await sql`DELETE FROM subscription_sources WHERE id = ${sourceId}::uuid`;
  });

  itDb(
    'selects PENDING rows (reconciled literal) and admits a mission run with a runId',
    async (sql) => {
      sharedSql = sql;
      // hermetic: clear stale active runs from earlier attempts
      await sql`DELETE FROM queue_jobs WHERE name = 'mission:execute' AND payload->>'runId' IN (SELECT id::text FROM mission_runs WHERE template_key = 'subscriptions' AND idempotency_key LIKE ${'subscriptions-auto:%'})`;
      await sql`DELETE FROM mission_runs WHERE template_key = 'subscriptions' AND idempotency_key LIKE ${'subscriptions-auto:%'}`;
      const sourceId = await insertSource(sql, `${NS + '-src'}`);
      await insertContent(sql, sourceId, `${NS + 'c1'}`, 'pending');

      const result = await subscriptionAutoResearch({ databaseUrl: DATABASE_URL });

      expect(result.ok).toBe(true);
      const detail = result.detail as { enqueued?: boolean; run_id?: string; pending?: number };
      expect(detail.enqueued).toBe(true);
      expect(detail.pending).toBeGreaterThanOrEqual(1);
      expect(detail.run_id).toBeTruthy();

      const run = await sql<{ template_key: string; status: string }[]>`
        SELECT template_key, status FROM mission_runs WHERE id::text = ${detail.run_id!}
      `;
      expect(run[0]?.template_key).toBe('subscriptions');
      expect(['pending', 'running']).toContain(run[0]?.status);

      // mission:execute must be enqueued WITH a runId (the WN-1 bug class)
      const job = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM queue_jobs
        WHERE name = 'mission:execute' AND payload->>'runId' = ${detail.run_id!}
      `;
      expect(job[0]?.count).toBeGreaterThanOrEqual(1);

      await sql`DELETE FROM subscription_content WHERE source_id = ${sourceId}::uuid`;
      await sql`DELETE FROM subscription_sources WHERE id = ${sourceId}::uuid`;
    }
  );

  itDb('dedupes while an active run for the same backlog exists', async (sql) => {
    sharedSql = sql;
    const sourceId = await insertSource(sql, `${NS + '-src-dedupe'}`);
    await insertContent(sql, sourceId, `${NS + 'c2'}`, 'pending');

    const first = await subscriptionAutoResearch({ databaseUrl: DATABASE_URL });
    expect(first.ok).toBe(true);
    const second = await subscriptionAutoResearch({ databaseUrl: DATABASE_URL });
    expect(second.ok).toBe(true);
    const detail = second.detail as { enqueued?: boolean; deduped?: boolean; run_id?: string };
    expect(detail.enqueued).toBe(false);
    expect(detail.deduped).toBe(true);
    expect(detail.run_id).toBe((first.detail as { run_id?: string }).run_id);

    await sql`DELETE FROM subscription_content WHERE source_id = ${sourceId}::uuid`;
    await sql`DELETE FROM subscription_sources WHERE id = ${sourceId}::uuid`;
  });
});
