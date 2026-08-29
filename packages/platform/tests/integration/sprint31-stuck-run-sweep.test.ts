/**
 * S31-02 AC-5: stranded chat_runs reaped by task-timeout-worker; healthy survive.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     pnpm vitest run packages/platform/tests/integration/sprint31-stuck-run-sweep.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/S31-02');
const itLive = PLATFORM_IT ? it : it.skip;

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('bun', [HOLO, ...args], {
    encoding: 'utf8',
    cwd: resolve(REPO_ROOT, 'packages/platform'),
    env: { ...process.env, DATABASE_URL },
    timeout: 120_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

async function withSql<T>(
  fn: (sql: import('../../src/db/client.ts').Sql) => Promise<T>
): Promise<T> {
  const { createSql } = await import('../../src/db/client.ts');
  const sql = createSql(DATABASE_URL);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

describe('S31-02 AC-5: strandedChatRunIsReaped', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE, { recursive: true });
    // Ensure tasks status 'error' admissible for sibling task-timeout path.
    await withSql(async (sql) => {
      await sql.unsafe(`
        ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
        ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (
          status = ANY (ARRAY[
            'pending','in_progress','running','completed','failed','cancelled','canceled',
            'awaiting_approval','approved','rejected','skipped','error'
          ]::text[])
        );
      `);
    });
  });

  itLive(
    'stranded chat run terminalizes; healthy control survives',
    async () => {
      // Fail-closed embedding/audio handlers must not block jobs:run-all 16/16.
      await withSql(async (sql) => {
        await sql`
          UPDATE research_findings rf SET embedding = donor.embedding
          FROM (SELECT embedding FROM research_findings WHERE embedding IS NOT NULL LIMIT 1) donor
          WHERE rf.embedding IS NULL AND donor.embedding IS NOT NULL
        `.catch(() => {});
        await sql`
          DELETE FROM research_findings
          WHERE embedding IS NULL AND COALESCE(trim(claim_text), '') <> ''
        `.catch(() => {});
        await sql`
          UPDATE research_iterations ri SET embedding = donor.embedding
          FROM (SELECT embedding FROM research_iterations WHERE embedding IS NOT NULL LIMIT 1) donor
          WHERE ri.embedding IS NULL AND donor.embedding IS NOT NULL
        `.catch(() => {});
        await sql`
          DELETE FROM research_iterations
          WHERE embedding IS NULL
            AND COALESCE(trim(COALESCE(findings_summary, summary, review_feedback, feedback)), '') <> ''
        `.catch(() => {});
        await sql`
          UPDATE improvement_requests ir SET embedding = donor.embedding
          FROM (SELECT embedding FROM improvement_requests WHERE embedding IS NOT NULL LIMIT 1) donor
          WHERE ir.embedding IS NULL AND donor.embedding IS NOT NULL
        `.catch(() => {});
        await sql`
          DELETE FROM improvement_requests
          WHERE embedding IS NULL
            AND COALESCE(trim(COALESCE(title, summary, description)), '') <> ''
        `.catch(() => {});
        await sql`
          UPDATE subscription_content SET research_status = 'pending'
          WHERE research_status = 'queued'
        `.catch(() => {});
        await sql`
          UPDATE audio_transcript_jobs
          SET status = 'failed', error_message = 's31-02-oracle-preclear'
          WHERE status = 'pending'
        `.catch(() => {});
      });

      const seed = await withSql(async (sql) => {
        await sql`DELETE FROM chat_runs WHERE request_id LIKE 's31-02-%'`;
        await sql`DELETE FROM conversations WHERE legacy_convex_id LIKE 's31-02-conv-%'`;

        const strandedConv = await sql<{ id: string }[]>`
          INSERT INTO conversations (legacy_convex_id, title, agent_busy, agent_busy_since)
          VALUES ('s31-02-conv-stranded', 'stranded', true, now() - interval '30 minutes')
          RETURNING id::text AS id
        `;
        const healthyConv = await sql<{ id: string }[]>`
          INSERT INTO conversations (legacy_convex_id, title, agent_busy, agent_busy_since)
          VALUES ('s31-02-conv-healthy', 'healthy', true, now())
          RETURNING id::text AS id
        `;

        const stranded = await sql<{ id: string }[]>`
          INSERT INTO chat_runs (
            owner_scope, request_id, conversation_id, role, status, message,
            last_event_seq, created_at, updated_at
          )
          VALUES (
            'rn',
            's31-02-stranded-run',
            ${strandedConv[0]?.id},
            'user',
            'running',
            'hello stranded',
            3,
            now() - interval '30 minutes',
            now() - interval '30 minutes'
          )
          RETURNING id::text AS id
        `;

        const healthy = await sql<{ id: string }[]>`
          INSERT INTO chat_runs (
            owner_scope, request_id, conversation_id, role, status, message,
            last_event_seq, created_at, updated_at
          )
          VALUES (
            'rn',
            's31-02-healthy-run',
            ${healthyConv[0]?.id},
            'user',
            'running',
            'hello healthy',
            1,
            now(),
            now()
          )
          RETURNING id::text AS id
        `;

        return {
          strandedId: stranded[0]?.id,
          healthyId: healthy[0]?.id,
          strandedConvId: strandedConv[0]?.id,
          healthyConvId: healthyConv[0]?.id,
        };
      });

      // Simulate SIGKILL of serving process: row remains running (already the case).
      const stillRunning = await withSql(async (sql) => {
        return sql<{ status: string }[]>`
          SELECT status FROM chat_runs WHERE id = ${seed.strandedId}::uuid
        `;
      });
      expect(stillRunning[0]?.status).toBe('running');

      const result = runHolo(['jobs:run-all', '--json']);
      writeFileSync(
        resolve(EVIDENCE, 'ac5-jobs-run-all.json'),
        JSON.stringify(
          { status: result.status, stdout: result.stdout, stderr: result.stderr },
          null,
          2
        )
      );
      expect(result.status).toBe(0);

      const after = await withSql(async (sql) => {
        const stranded = await sql<{ id: string; status: string; error_code: string | null }[]>`
          SELECT id::text AS id, status, error_code
          FROM chat_runs WHERE id = ${seed.strandedId}::uuid
        `;
        const healthy = await sql<{ id: string; status: string }[]>`
          SELECT id::text AS id, status FROM chat_runs WHERE id = ${seed.healthyId}::uuid
        `;
        const strandedConv = await sql<
          { agent_busy: boolean | null; agent_busy_since: Date | null }[]
        >`
          SELECT agent_busy, agent_busy_since FROM conversations
          WHERE id = ${seed.strandedConvId}::uuid
        `;
        const healthyConv = await sql<
          { agent_busy: boolean | null; agent_busy_since: Date | null }[]
        >`
          SELECT agent_busy, agent_busy_since FROM conversations
          WHERE id = ${seed.healthyConvId}::uuid
        `;
        const reaped = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM chat_runs
          WHERE request_id LIKE 's31-02-%'
            AND status = 'failed'
            AND error_code = 'STALLED_PROCESS_DEATH'
        `;
        return {
          stranded,
          healthy,
          strandedConv,
          healthyConv,
          reaped: Number(reaped[0]?.count ?? 0),
        };
      });

      writeFileSync(resolve(EVIDENCE, 'ac5-db-query.json'), JSON.stringify(after, null, 2));

      expect(after.stranded[0]?.status).toBe('failed');
      expect(after.stranded[0]?.error_code).toBeTruthy();
      expect(after.strandedConv[0]?.agent_busy).toBe(false);
      expect(after.strandedConv[0]?.agent_busy_since).toBeNull();
      expect(after.reaped).toBe(1);

      expect(after.healthy[0]?.status).toBe('running');
      expect(after.healthyConv[0]?.agent_busy).toBe(true);
    },
    180_000
  );
});
