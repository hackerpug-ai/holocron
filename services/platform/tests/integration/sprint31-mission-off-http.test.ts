/**
 * S31-02 AC-4: POST /api/missions returns non-terminal; background queue drives run.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run services/platform/tests/integration/sprint31-mission-off-http.test.ts
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const WORKER = resolve(REPO_ROOT, 'services/platform/src/queue/scheduler-worker.ts');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/S31-02');
const itLive = PLATFORM_IT ? it : it.skip;

const RN = process.env.HOLO_KEY_RN ?? 'rn-test';

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

describe('S31-02 AC-4: missionExecutionLeavesTheRequestThread', () => {
  let worker: ReturnType<typeof spawn> | null = null;

  beforeAll(() => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE, { recursive: true });
    process.env.HOLO_KEY_RN = RN;
    process.env.HOLO_KEY_MCP = process.env.HOLO_KEY_MCP ?? 'mcp-test';
    process.env.HOLO_KEY_CONTROL = process.env.HOLO_KEY_CONTROL ?? 'ctl-test';
    process.env.DATABASE_URL = DATABASE_URL;
    delete process.env.HOLO_MISSION_INLINE;
  });

  afterAll(() => {
    if (worker && !worker.killed) worker.kill('SIGTERM');
  });

  itLive(
    'POST /api/missions enqueues background work and returns non-terminal',
    async () => {
      const goal = `S31-02 AC-4 background mission smoke ${Date.now()}`;
      await withSql(async (sql) => {
        await sql`DELETE FROM queue_jobs WHERE name = 'mission:execute'`;
        // Clear WIP-one residue so admission is not blocked by a prior active run.
        await sql`
          UPDATE mission_runs
          SET status = 'failed',
              error_code = 'S31_02_TEST_CLEAR',
              completed_at = now(),
              updated_at = now()
          WHERE template_key = 'whatsnew'
            AND status IN ('pending', 'running', 'suspended')
        `;
      });

      const bgBefore = await withSql(async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM queue_jobs WHERE lane = 'background'
        `;
        return Number(rows[0]?.count ?? 0);
      });

      // Start consumer so the mission can reach terminal after admit.
      worker = spawn('bun', [WORKER], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          DATABASE_URL,
          HOLO_SCHEDULER_POLL_MS: '200',
          HOLO_SCHEDULER_CADENCE_MS: '120_000',
        },
        stdio: 'ignore',
      });

      const { createHonoApp } = await import('../../src/http/hono-app.ts');
      const app = createHonoApp();

      // Health via app.request
      const health = await app.request('http://127.0.0.1/health');
      expect(health.status).toBe(200);

      const idempotencyKey = `s31-02-mission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const t0 = Date.now();
      const res = await app.request('http://127.0.0.1/api/missions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${RN}`,
        },
        body: JSON.stringify({
          templateKey: 'whatsnew',
          goal,
          idempotencyKey,
        }),
      });
      const requestMs = Date.now() - t0;
      const body = (await res.json()) as {
        runId?: string;
        status?: string;
        ok?: boolean;
        code?: string;
        error?: string;
      };

      writeFileSync(
        resolve(EVIDENCE, 'ac4-mission-post.json'),
        JSON.stringify({ status: res.status, body, requestMs }, null, 2)
      );

      expect([200, 202]).toContain(res.status);
      expect(body.runId).toBeTruthy();
      const terminal = new Set(['completed', 'failed', 'blocked', 'cancelled', 'canceled']);
      expect(terminal.has(body.status ?? '')).toBe(false);
      expect(['pending', 'running', 'suspended', 'leased'].includes(body.status ?? 'pending')).toBe(
        true
      );

      const runId = body.runId!;
      const queueRow = await withSql(async (sql) => {
        return sql<
          {
            id: string;
            lane: string;
            status: string;
            lease_owner: string | null;
            payload: { runId?: string };
          }[]
        >`
          SELECT id::text AS id, lane, status, lease_owner, payload
          FROM queue_jobs
          WHERE lane = 'background'
            AND (
              payload->>'runId' = ${runId}
              OR key = ${`mission-exec:${runId}`}
            )
          ORDER BY created_at DESC
          LIMIT 1
        `;
      });
      expect(queueRow.length).toBe(1);
      expect(queueRow[0]?.lane).toBe('background');

      // Poll mission_runs until terminal or deadline.
      const missionStart = Date.now();
      let missionStatus = body.status ?? 'pending';
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const rows = await withSql(async (sql) => {
          return sql<{ status: string }[]>`
            SELECT status FROM mission_runs WHERE id = ${runId}::uuid LIMIT 1
          `;
        });
        missionStatus = rows[0]?.status ?? missionStatus;
        if (terminal.has(missionStatus)) break;
        // Also drive one consume tick in-process if worker is slow.
        await new Promise((r) => setTimeout(r, 500));
      }
      const missionMs = Date.now() - missionStart;

      // Re-read driving job for lease_owner after consume.
      const driving = await withSql(async (sql) => {
        return sql<{ status: string; lease_owner: string | null; completed_at: Date | null }[]>`
          SELECT status, lease_owner, completed_at
          FROM queue_jobs
          WHERE key = ${`mission-exec:${runId}`}
          LIMIT 1
        `;
      });

      writeFileSync(
        resolve(EVIDENCE, 'ac4-mission-terminal.json'),
        JSON.stringify(
          {
            runId,
            missionStatus,
            requestMs,
            missionMs,
            driving,
            bgBefore,
          },
          null,
          2
        )
      );

      // request must be faster than full mission wall time when mission does real work;
      // at minimum requestMs < missionMs once we waited for terminal (or elapsed poll).
      expect(requestMs).toBeLessThan(missionMs + 1);
      expect(requestMs).toBeLessThan(5_000);

      // Mission row exists.
      const missionRows = await withSql(async (sql) => {
        return sql<{ id: string; status: string }[]>`
          SELECT id::text AS id, status FROM mission_runs WHERE id = ${runId}::uuid
        `;
      });
      expect(missionRows).toHaveLength(1);

      if (worker && !worker.killed) {
        worker.kill('SIGTERM');
        worker = null;
      }
    },
    120_000
  );
});
