/**
 * queue-4 / AC-1 PRIMARY + AC-2 / TC-1 + TC-2 (T-PLAT-009, T-PLAT-010):
 *
 * Kill-9 at commit / after-commit-before-enqueue / after-dispatch-before-ack
 * → exactly one observable side effect + one auditable outbox/inbox dedupe + fencing.
 *
 * All 16 migrated jobs fire via jobs:run-all with side effects in Postgres.
 *
 * RED against current mainline:
 * - durable outbox/inbox modules missing (services/platform/src/queue/*)
 * - holo jobs:run-all / jobs:list / queue:audit unknown commands
 * - no durable effect tables → effect_count/outbox_count/inbox_dedupe_count stay 0
 *
 * NEGATIVE CONTROL (would fail if GREEN claimed without):
 * - stub/mock Postgres or in-memory queue
 * - empty suite (0 tests collected)
 * - tests pass without durable module
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/RED/queue-durable.RED.test.ts
 */
import { beforeAll, describe, expect, vi } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  EXPECTED_JOB_COUNT,
  EXPECTED_JOB_NAMES,
  ensureMigrated,
  itLive,
  type KillBoundary,
  loadDurableEffectApi,
  parseJsonObject,
  readDurableAudit,
  runHolo,
  withQueueLock,
  writeQueueRedArtifact,
} from './queue-red-harness';

vi.setConfig({ testTimeout: 120_000 });

const EFFECT_KEY = 'red-kill9-1';

async function exerciseBoundary(boundary: KillBoundary): Promise<{
  loadError: string | null;
  apiResult: {
    effect_count: number;
    outbox_count: number;
    inbox_dedupe_count: number;
    fencing_token: string | null;
  } | null;
  audit: Awaited<ReturnType<typeof readDurableAudit>>;
  cliAudit: { status: number | null; stdout: string; stderr: string };
}> {
  let loadError: string | null = null;
  let apiResult: {
    effect_count: number;
    outbox_count: number;
    inbox_dedupe_count: number;
    fencing_token: string | null;
  } | null = null;

  try {
    const api = await loadDurableEffectApi();
    // First pass: kill at the named boundary (simulates SIGKILL mid-pipeline).
    await api.runDurableEffectBoundary({
      key: EFFECT_KEY,
      payload: { n: 1 },
      boundary,
      databaseUrl: DEFAULT_DATABASE_URL,
    });
    // Recovery pass: re-run same key with no kill — must not double-apply.
    apiResult = await api.runDurableEffectBoundary({
      key: EFFECT_KEY,
      payload: { n: 1 },
      boundary: 'none',
      databaseUrl: DEFAULT_DATABASE_URL,
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const { createSql } = await import('../../../../services/platform/src/db/client');
  const sql = createSql(DEFAULT_DATABASE_URL);
  let audit: Awaited<ReturnType<typeof readDurableAudit>>;
  try {
    audit = await readDurableAudit(sql, EFFECT_KEY);
  } finally {
    await sql.end({ timeout: 5 });
  }

  // Prefer API result when present; otherwise DB audit (zeros on mainline).
  const effect_count = apiResult?.effect_count ?? audit.effect_count;
  const outbox_count = apiResult?.outbox_count ?? audit.outbox_count;
  const inbox_dedupe_count = apiResult?.inbox_dedupe_count ?? audit.inbox_dedupe_count;
  const fencing_token = apiResult?.fencing_token ?? audit.fencing_token;

  const cliAudit = runHolo(['queue:audit', EFFECT_KEY, '--json']);

  return {
    loadError,
    apiResult: {
      effect_count,
      outbox_count,
      inbox_dedupe_count,
      fencing_token,
    },
    audit,
    cliAudit,
  };
}

function assertExactlyOnce(
  label: string,
  result: Awaited<ReturnType<typeof exerciseBoundary>>
): void {
  const effect_count = result.apiResult?.effect_count ?? 0;
  const outbox_count = result.apiResult?.outbox_count ?? 0;
  const inbox_dedupe_count = result.apiResult?.inbox_dedupe_count ?? 0;
  const fencing_token = result.apiResult?.fencing_token ?? null;

  writeQueueRedArtifact(`AC-1-${label}.json`, {
    ac: 'AC-1',
    tc: 'TC-1',
    boundary: label,
    key: EFFECT_KEY,
    loadError: result.loadError,
    effect_count,
    outbox_count,
    inbox_dedupe_count,
    fencing_token,
    audit: result.audit,
    cliAudit: {
      status: result.cliAudit.status,
      stdout: result.cliAudit.stdout.slice(0, 2000),
      stderr: result.cliAudit.stderr.slice(0, 2000),
    },
    must_observe: {
      'effect_count === 1': effect_count === 1,
      'outbox_count === 1': outbox_count === 1,
      'inbox_dedupe_count === 1': inbox_dedupe_count === 1,
      'fencing_token present': Boolean(fencing_token),
    },
    must_not_observe: {
      'effect_count === 0': effect_count === 0,
      'effect_count >= 2': effect_count >= 2,
      'outbox_count === 0': outbox_count === 0,
      'duplicate inbox': inbox_dedupe_count >= 2,
    },
  });

  // Contract assertions — RED fails here on mainline (missing durable queue).
  // Count asserts first so failure output always carries effect_count/outbox/inbox lines.
  expect(effect_count, `${label}: effect_count === 1 (loadError=${result.loadError})`).toBe(1);
  expect(outbox_count, `${label}: outbox_count === 1`).toBe(1);
  expect(inbox_dedupe_count, `${label}: inbox_dedupe_count === 1`).toBe(1);
  expect(fencing_token, `${label}: fencing_token must be recorded`).toBeTruthy();
  expect(result.loadError, `${label}: durable-effect API must load (queue-2)`).toBeNull();
  expect(effect_count, `${label}: never zero effects`).toBeGreaterThan(0);
  expect(effect_count, `${label}: never two effects`).toBeLessThan(2);
}

describe('AC-1 / TC-1: kill-9 boundaries exactly-once + outbox/inbox dedupe', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive(
    'kill-9 before commit: effect_count === 1, outbox_count === 1, inbox_dedupe_count === 1',
    async () => {
      await withQueueLock(async () => {
        const result = await exerciseBoundary('before-commit');
        assertExactlyOnce('before-commit', result);
      });
    }
  );

  itLive(
    'kill-9 after commit before enqueue: effect_count === 1, outbox_count === 1, inbox_dedupe_count === 1',
    async () => {
      await withQueueLock(async () => {
        const result = await exerciseBoundary('after-commit-before-enqueue');
        assertExactlyOnce('after-commit-before-enqueue', result);
      });
    }
  );

  itLive(
    'kill-9 after dispatch before ack: effect_count === 1, outbox_count === 1, inbox_dedupe_count === 1',
    async () => {
      await withQueueLock(async () => {
        const result = await exerciseBoundary('after-dispatch-before-ack');
        assertExactlyOnce('after-dispatch-before-ack', result);
      });
    }
  );

  itLive('queue:audit <key> exposes outbox, inbox dedupe, and fencing token', async () => {
    await withQueueLock(async () => {
      const cli = runHolo(['queue:audit', EFFECT_KEY, '--json']);
      const out = `${cli.stdout}\n${cli.stderr}`;

      let payload: Record<string, unknown> | null = null;
      let parseError: string | null = null;
      try {
        payload = parseJsonObject(cli.stdout);
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }

      const effect_count = Number(payload?.effect_count ?? payload?.effects ?? 0);
      const outbox_count = Number(payload?.outbox_count ?? payload?.outbox ?? 0);
      const inbox_dedupe_count = Number(
        payload?.inbox_dedupe_count ?? payload?.inbox_count ?? payload?.inbox ?? 0
      );
      const fencing_token =
        (payload?.fencing_token as string | undefined) ??
        (payload?.fencing as string | undefined) ??
        null;

      writeQueueRedArtifact('AC-1-queue-audit.json', {
        ac: 'AC-1',
        status: cli.status,
        parseError,
        payload,
        stdout: cli.stdout.slice(0, 2000),
        stderr: cli.stderr.slice(0, 2000),
        must_observe: {
          'CLI exit 0': cli.status === 0,
          'effect_count === 1': effect_count === 1,
          'outbox_count === 1': outbox_count === 1,
          'inbox_dedupe_count === 1': inbox_dedupe_count === 1,
          fencing_token: Boolean(fencing_token),
        },
      });

      expect(cli.status, `queue:audit must exit 0:\n${out}`).toBe(0);
      expect(parseError, `queue:audit stdout must be JSON: ${parseError}`).toBeNull();
      expect(effect_count, 'effect_count === 1').toBe(1);
      expect(outbox_count, 'outbox_count === 1').toBe(1);
      expect(inbox_dedupe_count, 'inbox_dedupe_count === 1').toBe(1);
      expect(fencing_token, 'fencing_token recorded').toBeTruthy();
    });
  });
});

describe('AC-2 / TC-2: all-16-fire jobs:run-all inventory', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive('jobs:list reports 16 migrated jobs (7/4/1/3→1/1 split)', async () => {
    await withQueueLock(async () => {
      const list = runHolo(['jobs:list', '--json']);
      const out = `${list.stdout}\n${list.stderr}`;

      let payload: Record<string, unknown> | null = null;
      let parseError: string | null = null;
      try {
        payload = parseJsonObject(list.stdout);
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }

      const jobs =
        (payload?.jobs as unknown[] | undefined) ??
        (payload?.items as unknown[] | undefined) ??
        (Array.isArray(payload) ? (payload as unknown[]) : null);
      const jobs_listed = Array.isArray(jobs) ? jobs.length : Number(payload?.count ?? 0);

      const names = Array.isArray(jobs)
        ? jobs
            .map((j) => {
              if (typeof j === 'string') return j;
              if (j && typeof j === 'object') {
                const o = j as Record<string, unknown>;
                return String(o.name ?? o.id ?? o.job ?? '');
              }
              return '';
            })
            .filter(Boolean)
        : [];

      const missing = EXPECTED_JOB_NAMES.filter((n) => !names.includes(n));

      writeQueueRedArtifact('AC-2-jobs-list.json', {
        ac: 'AC-2',
        tc: 'TC-2',
        status: list.status,
        parseError,
        jobs_listed,
        expected: EXPECTED_JOB_COUNT,
        names,
        missing,
        stdout: list.stdout.slice(0, 2000),
        stderr: list.stderr.slice(0, 2000),
        must_observe: {
          'CLI exit 0': list.status === 0,
          'jobs_listed === 16': jobs_listed === EXPECTED_JOB_COUNT,
        },
      });

      expect(list.status, `jobs:list must exit 0:\n${out}`).toBe(0);
      expect(parseError, `jobs:list stdout must be JSON: ${parseError}`).toBeNull();
      expect(jobs_listed, 'jobs_listed === 16').toBe(EXPECTED_JOB_COUNT);
      expect(missing, `all 16 job names present; missing=${missing.join(',')}`).toEqual([]);
    });
  });

  itLive('jobs:run-all fires jobs_fired === 16 with side_effect_rows >= 16', async () => {
    await withQueueLock(async () => {
      const run = runHolo(['jobs:run-all', '--json']);
      const out = `${run.stdout}\n${run.stderr}`;

      let payload: Record<string, unknown> | null = null;
      let parseError: string | null = null;
      try {
        payload = parseJsonObject(run.stdout);
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }

      const jobs_fired = Number(
        payload?.jobs_fired ?? payload?.fired ?? payload?.count ?? payload?.ran ?? 0
      );

      const { createSql } = await import('../../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);
      let side_effect_rows = 0;
      let sideEffectError: string | null = null;
      try {
        // job_runs / scheduled_job_runs are the expected GREEN observation surface
        for (const table of ['job_runs', 'scheduled_job_runs', 'queue_job_runs', 'cron_runs']) {
          try {
            const rows = await sql.unsafe(
              `SELECT count(*)::text AS count FROM ${table} WHERE created_at > now() - interval '1 hour'`
            );
            const n = Number((rows[0] as { count?: string } | undefined)?.count ?? 0);
            if (n > side_effect_rows) side_effect_rows = n;
          } catch {
            // table missing on mainline — continue
          }
        }
      } catch (err) {
        sideEffectError = err instanceof Error ? err.message : String(err);
      } finally {
        await sql.end({ timeout: 5 });
      }

      writeQueueRedArtifact('AC-2-jobs-run-all.json', {
        ac: 'AC-2',
        tc: 'TC-2',
        status: run.status,
        parseError,
        jobs_fired,
        side_effect_rows,
        sideEffectError,
        expected: EXPECTED_JOB_COUNT,
        stdout: run.stdout.slice(0, 2000),
        stderr: run.stderr.slice(0, 2000),
        must_observe: {
          'CLI exit 0': run.status === 0,
          'jobs_fired === 16': jobs_fired === EXPECTED_JOB_COUNT,
          'side_effect_rows >= 16': side_effect_rows >= EXPECTED_JOB_COUNT,
        },
        must_not_observe: {
          'empty run': jobs_fired === 0,
          'unknown command': /unknown command/i.test(out),
        },
      });

      expect(run.status, `jobs:run-all must exit 0:\n${out}`).toBe(0);
      expect(parseError, `jobs:run-all stdout must be JSON: ${parseError}`).toBeNull();
      expect(jobs_fired, 'jobs_fired === 16').toBe(EXPECTED_JOB_COUNT);
      expect(side_effect_rows, 'side_effect_rows >= 16').toBeGreaterThanOrEqual(EXPECTED_JOB_COUNT);
    });
  });
});
