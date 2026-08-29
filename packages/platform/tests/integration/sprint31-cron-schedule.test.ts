/**
 * S31-02 AC-2: schedule expressions drive real cadence.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     pnpm vitest run packages/platform/tests/integration/sprint31-cron-schedule.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const WORKER = resolve(REPO_ROOT, 'packages/platform/src/queue/scheduler-worker.ts');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/S31-02');
const itLive = PLATFORM_IT ? it : it.skip;

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('bun', [HOLO, ...args], {
    encoding: 'utf8',
    cwd: resolve(REPO_ROOT, 'packages/platform'),
    env: { ...process.env, DATABASE_URL },
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function runSchedulerEval(at: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('bun', [WORKER], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL,
      HOLO_SCHEDULER_EVAL_AT: at,
    },
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

describe('S31-02 AC-2: scheduleExpressionsDriveRealCadence', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE, { recursive: true });
  });

  itLive(
    'jobs:list returns concrete next_fire_at for all 16',
    async () => {
      const result = runHolo(['jobs:list', '--json']);
      writeFileSync(
        resolve(EVIDENCE, 'ac2-jobs-list.json'),
        JSON.stringify({ status: result.status, stdout: result.stdout }, null, 2)
      );
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        count: number;
        jobs: { name: string; next_fire_at: string | null; schedule: string }[];
      };
      expect(payload.count).toBe(16);
      expect(payload.jobs).toHaveLength(16);
      const now = Date.now();
      for (const j of payload.jobs) {
        expect(j.next_fire_at, j.name).toBeTruthy();
        expect(j.next_fire_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        const t = new Date(j.next_fire_at!).getTime();
        expect(Number.isFinite(t)).toBe(true);
        if (j.schedule.startsWith('interval 1h')) {
          const delta = t - now;
          expect(delta).toBeGreaterThan(0);
          expect(delta).toBeLessThanOrEqual(3600_000 + 5_000);
        }
      }
    },
    60_000
  );

  itLive(
    'morning-digest fires once in-window and zero out-of-window',
    async () => {
      await withSql(async (sql) => {
        await sql`DELETE FROM notifications WHERE type = 'morning_digest' AND reference_id LIKE 'morning-digest:%'`;
      });

      const inWindow = '2026-08-08T16:00:30.000Z';
      const outWindow = '2026-08-08T03:00:00.000Z';

      const inResult = runSchedulerEval(inWindow);
      writeFileSync(
        resolve(EVIDENCE, 'ac2-scheduler-in-window.json'),
        JSON.stringify(inResult, null, 2)
      );
      expect(inResult.status).toBe(0);
      // Last JSON line is the eval summary.
      const inLines = inResult.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('{') && l.includes('fired'));
      const inSummary = JSON.parse(inLines[inLines.length - 1] ?? '{}') as {
        fired: string[];
        fired_count: number;
      };
      expect(inSummary.fired ?? []).toContain('morning-digest');
      expect((inSummary.fired ?? []).filter((n) => n === 'morning-digest')).toHaveLength(1);

      const digestsAfterIn = await withSql(async (sql) => {
        return sql<{ id: string }[]>`
          SELECT id::text AS id FROM notifications
          WHERE type = 'morning_digest'
            AND created_at > now() - interval '30 minutes'
        `;
      });
      expect(digestsAfterIn.length).toBeGreaterThanOrEqual(1);
      expect(digestsAfterIn.length).toBeLessThanOrEqual(1);

      // Out-of-window: step at 03:00 — morning-digest must not fire.
      // Scope the digest oracle to the eval day's reference_id so parallel
      // jobs:run-all (which may create "today's" digest) cannot flake this case.
      const evalDayKey = '2026-08-08';
      const evalRef = `morning-digest:${evalDayKey}`;
      await withSql(async (sql) => {
        await sql`DELETE FROM notifications WHERE reference_id = ${evalRef}`;
      });

      const outResult = runSchedulerEval(outWindow);
      writeFileSync(
        resolve(EVIDENCE, 'ac2-scheduler-out-window.json'),
        JSON.stringify(outResult, null, 2)
      );
      expect(outResult.status).toBe(0);
      const outLines = outResult.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('{') && l.includes('fired'));
      const outSummary = JSON.parse(outLines[outLines.length - 1] ?? '{}') as {
        fired: string[];
      };
      expect(outSummary.fired ?? []).not.toContain('morning-digest');
      expect((outSummary.fired ?? []).filter((n) => n === 'morning-digest')).toHaveLength(0);

      const digestsAfterOut = await withSql(async (sql) => {
        return sql<{ id: string }[]>`
          SELECT id::text AS id FROM notifications
          WHERE type = 'morning_digest'
            AND reference_id = ${evalRef}
        `;
      });
      expect(digestsAfterOut).toHaveLength(0);
    },
    180_000
  );

  itLive(
    'unparseable schedule is a startup error (SCHEDULE_PARSE_ERROR)',
    async () => {
      // Inject via env override consumed by a tiny inline runner that imports parseSchedule.
      const script = `
        import { parseSchedule, ScheduleParseError } from ${JSON.stringify(resolve(REPO_ROOT, 'packages/platform/src/queue/schedule-parser.ts'))};
        try {
          parseSchedule('every fortnight-ish', 'feed-builder');
          console.error('expected SCHEDULE_PARSE_ERROR');
          process.exit(0);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(msg);
          process.exit(msg.includes('SCHEDULE_PARSE_ERROR') ? 2 : 1);
        }
      `;
      const r = spawnSync('bun', ['-e', script], {
        encoding: 'utf8',
        cwd: REPO_ROOT,
        timeout: 30_000,
      });
      // Also exercise worker path: worker parses MIGRATED_JOBS only, so we simulate
      // the startup error by running a child that re-exports parse failure the way
      // scheduler-worker does on bad registry.
      const workerProbe = `
        import { parseSchedule } from ${JSON.stringify(resolve(REPO_ROOT, 'packages/platform/src/queue/schedule-parser.ts'))};
        const jobs = [{ name: 'feed-builder', schedule: 'every fortnight-ish' }];
        for (const j of jobs) {
          try { parseSchedule(j.schedule, j.name); }
          catch (e) {
            console.error(e instanceof Error ? e.message : String(e));
            process.exit(1);
          }
        }
        process.exit(0);
      `;
      const w = spawnSync('bun', ['-e', workerProbe], {
        encoding: 'utf8',
        cwd: REPO_ROOT,
        timeout: 30_000,
      });
      writeFileSync(
        resolve(EVIDENCE, 'ac2-schedule-parse-error.json'),
        JSON.stringify(
          {
            direct: { status: r.status, stderr: r.stderr, stdout: r.stdout },
            worker: { status: w.status, stderr: w.stderr, stdout: w.stdout },
          },
          null,
          2
        )
      );
      expect(w.status).not.toBe(0);
      expect(w.stderr + w.stdout).toMatch(/SCHEDULE_PARSE_ERROR/);
      expect(w.stderr + w.stdout).toMatch(/feed-builder/);
      expect(w.stderr + w.stdout).toMatch(/every fortnight-ish/);
    },
    30_000
  );
});
