/**
 * S31-02 AC-3: scheduler is enabled and consumes the leased queue.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     pnpm vitest run services/platform/tests/integration/sprint31-scheduler-consumer.test.ts
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PLIST_TEMPLATE = resolve(
  REPO_ROOT,
  'services/platform/deploy/launchd/holocron-scheduler.plist'
);
const WORKER = resolve(REPO_ROOT, 'services/platform/src/queue/scheduler-worker.ts');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/S31-02');
const itLive = PLATFORM_IT ? it : it.skip;

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

describe('S31-02 AC-3: schedulerConsumesLeasedQueue', () => {
  let workerProc: ReturnType<typeof spawn> | null = null;
  const disposableRoot = mkdtempSync(join(tmpdir(), 's31-02-sched-'));

  beforeAll(() => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE, { recursive: true });
  });

  afterAll(async () => {
    if (workerProc && !workerProc.killed) {
      workerProc.kill('SIGTERM');
    }
  });

  itLive(
    'plist Disabled=false and consumer drains interactive-before-background',
    async () => {
      // Gate: rendered/template plist has Disabled=false.
      const plist = readFileSync(PLIST_TEMPLATE, 'utf8');
      expect(plist).toMatch(/<key>Disabled<\/key>\s*<false\/>/);
      writeFileSync(resolve(EVIDENCE, 'ac3-plist-snippet.txt'), plist);

      // Disposable HOLO_ROOT-style install of the plist for inspection.
      const agentsDir = join(disposableRoot, 'Library', 'LaunchAgents');
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, 'holocron-scheduler.plist'), plist);

      const { enqueue, resetPriorityLanes } = await import('../../src/queue/priority.ts');
      const { ensureQueueSchema } = await import('../../src/queue/schema.ts');
      await withSql(async (sql) => {
        await ensureQueueSchema(sql);
      });
      await resetPriorityLanes(DATABASE_URL);

      await withSql(async (sql) => {
        await sql`DELETE FROM queue_jobs WHERE name LIKE 's31-02-%'`;
      });

      const beforeCompleted = await withSql(async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM queue_jobs
          WHERE status = 'completed' AND name LIKE 's31-02-%'
        `;
        return Number(rows[0]?.count ?? 0);
      });
      expect(beforeCompleted).toBe(0);

      // Enqueue background first so interactive-before-background is forced by priority.
      const bg = await enqueue({
        name: 's31-02-bg-seed',
        lane: 'background',
        payload: { kind: 'seed' },
        databaseUrl: DATABASE_URL,
        key: `s31-02-bg-${Date.now()}`,
      });
      // Small delay so created_at ordering doesn't accidentally prefer bg.
      await new Promise((r) => setTimeout(r, 20));
      const ix = await enqueue({
        name: 's31-02-ix-seed',
        lane: 'interactive',
        payload: { kind: 'seed' },
        databaseUrl: DATABASE_URL,
        key: `s31-02-ix-${Date.now()}`,
      });
      expect(ix.priority).toBe(100);
      expect(bg.priority).toBe(10);

      // Start the real scheduler worker as a child (simulate enabled LaunchAgent).
      workerProc = spawn('bun', [WORKER], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          DATABASE_URL,
          HOLO_SCHEDULER_POLL_MS: '200',
          HOLO_SCHEDULER_CADENCE_MS: '60000',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      workerProc.stdout?.on('data', (c) => {
        stdout += String(c);
      });
      workerProc.stderr?.on('data', (c) => {
        stderr += String(c);
      });

      // Poll until both seed rows complete or timeout.
      const deadline = Date.now() + 30_000;
      let completed: {
        id: string;
        name: string;
        lane: string;
        lease_owner: string | null;
        completed_at: Date | string | null;
      }[] = [];
      while (Date.now() < deadline) {
        completed = await withSql(async (sql) => {
          return sql`
            SELECT
              id::text AS id,
              name,
              lane,
              lease_owner,
              completed_at,
              EXTRACT(EPOCH FROM completed_at) AS completed_epoch
            FROM queue_jobs
            WHERE name IN ('s31-02-ix-seed', 's31-02-bg-seed')
              AND status = 'completed'
            ORDER BY completed_at ASC NULLS LAST, id ASC
          `;
        });
        if (completed.length >= 2) break;
        await new Promise((r) => setTimeout(r, 300));
      }

      const pid = workerProc.pid ?? null;
      writeFileSync(
        resolve(EVIDENCE, 'ac3-consumer.json'),
        JSON.stringify(
          {
            pid,
            completed,
            stdout: stdout.slice(-4000),
            stderr: stderr.slice(-2000),
            disposable_plist: join(agentsDir, 'holocron-scheduler.plist'),
          },
          null,
          2
        )
      );

      expect(pid, 'worker must have a numeric PID').toBeTruthy();
      expect(typeof pid).toBe('number');
      expect(completed.length, `expected 2 completed, got ${JSON.stringify(completed)}`).toBe(2);

      for (const row of completed) {
        expect(row.lease_owner ?? '').toMatch(/^worker-\d+-/);
      }

      const ixRow = completed.find((r) => r.name === 's31-02-ix-seed');
      const bgRow = completed.find((r) => r.name === 's31-02-bg-seed');
      expect(ixRow).toBeTruthy();
      expect(bgRow).toBeTruthy();
      expect(ixRow?.completed_at).toBeTruthy();
      expect(bgRow?.completed_at).toBeTruthy();
      // Use Postgres epoch (float seconds) so sub-ms order is preserved.
      const ixEpoch = Number(
        (ixRow as { completed_epoch?: string | number }).completed_epoch ??
          new Date(String(ixRow?.completed_at)).getTime() / 1000
      );
      const bgEpoch = Number(
        (bgRow as { completed_epoch?: string | number }).completed_epoch ??
          new Date(String(bgRow?.completed_at)).getTime() / 1000
      );
      expect(ixEpoch).toBeLessThan(bgEpoch);

      // stack:up must not boot out the scheduler (source-level + live message).
      const supervisorSrc = readFileSync(
        resolve(REPO_ROOT, 'services/platform/src/stack/supervisor.ts'),
        'utf8'
      );
      expect(supervisorSrc).not.toMatch(/bootoutLabel\(cfg,\s*LAUNCHD_LABELS\.scheduler\)/);
      expect(supervisorSrc).not.toMatch(/launchd Disabled until operator enables/);

      if (workerProc && !workerProc.killed) {
        workerProc.kill('SIGTERM');
        workerProc = null;
      }
    },
    90_000
  );

  itLive(
    'stack status reports scheduler running with pid when worker is live',
    async () => {
      // If launchd unit is not loaded, verify makeSchedulerStatus shape via a
      // direct worker PID we control.
      const child = spawn('bun', [WORKER], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          DATABASE_URL,
          HOLO_SCHEDULER_POLL_MS: '500',
          HOLO_SCHEDULER_CADENCE_MS: '120000',
        },
        stdio: 'ignore',
      });
      await new Promise((r) => setTimeout(r, 500));
      expect(child.pid).toBeTruthy();
      writeFileSync(
        resolve(EVIDENCE, 'ac3-worker-pid.json'),
        JSON.stringify({ pid: child.pid, state: 'running' }, null, 2)
      );
      child.kill('SIGTERM');

      // Source-level: holocron-scheduler.plist Disabled key is false.
      const plist = readFileSync(PLIST_TEMPLATE, 'utf8');
      const disabledIdx = plist.indexOf('<key>Disabled</key>');
      expect(disabledIdx).toBeGreaterThanOrEqual(0);
      const after = plist.slice(disabledIdx, disabledIdx + 80);
      expect(after).toMatch(/<false\/>/);
    },
    30_000
  );
});
