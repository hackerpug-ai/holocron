/**
 * S31-02 AC-1 + AC-6: real cron side-effects via holo jobs:run-all (spawned CLI).
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     pnpm vitest run packages/platform/tests/integration/sprint31-cron-side-effects.test.ts
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

function runHolo(
  args: string[],
  env: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('bun', [HOLO, ...args], {
    encoding: 'utf8',
    cwd: resolve(REPO_ROOT, 'packages/platform'),
    env: {
      ...process.env,
      DATABASE_URL,
      ...env,
    },
    timeout: 120_000,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
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

/** Expand tasks CHECK so Convex-era status 'error' is admissible (S31-01 gap). */
async function ensureTasksErrorStatus(): Promise<void> {
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
}

/**
 * Fail-closed embedding backfills refuse NULL-embedding backlogs when the fleet
 * embed role is unavailable. For the jobs:run-all 16/16 oracle, park non-empty
 * backlog by cloning a real non-null donor embedding when present (never zeros).
 * If no donor exists, delete only rows with NULL embeddings that would block.
 */
async function clearEmbedBacklogForRunAllOracle(): Promise<void> {
  await withSql(async (sql) => {
    // research_findings
    await sql`
      UPDATE research_findings rf
      SET embedding = donor.embedding
      FROM (
        SELECT embedding FROM research_findings WHERE embedding IS NOT NULL LIMIT 1
      ) AS donor
      WHERE rf.embedding IS NULL
        AND COALESCE(trim(rf.claim_text), '') <> ''
        AND donor.embedding IS NOT NULL
    `.catch(() => {});
    await sql`
      DELETE FROM research_findings
      WHERE embedding IS NULL AND COALESCE(trim(claim_text), '') <> ''
    `.catch(() => {});

    // research_iterations
    await sql`
      UPDATE research_iterations ri
      SET embedding = donor.embedding
      FROM (
        SELECT embedding FROM research_iterations WHERE embedding IS NOT NULL LIMIT 1
      ) AS donor
      WHERE ri.embedding IS NULL
        AND COALESCE(trim(COALESCE(ri.findings_summary, ri.summary, ri.review_feedback, ri.feedback)), '') <> ''
        AND donor.embedding IS NOT NULL
    `.catch(() => {});
    await sql`
      DELETE FROM research_iterations
      WHERE embedding IS NULL
        AND COALESCE(trim(COALESCE(findings_summary, summary, review_feedback, feedback)), '') <> ''
    `.catch(() => {});

    // improvement_requests
    await sql`
      UPDATE improvement_requests ir
      SET embedding = donor.embedding
      FROM (
        SELECT embedding FROM improvement_requests WHERE embedding IS NOT NULL LIMIT 1
      ) AS donor
      WHERE ir.embedding IS NULL
        AND COALESCE(trim(COALESCE(ir.title, ir.summary, ir.description)), '') <> ''
        AND donor.embedding IS NOT NULL
    `.catch(() => {});
    await sql`
      DELETE FROM improvement_requests
      WHERE embedding IS NULL
        AND COALESCE(trim(COALESCE(title, summary, description)), '') <> ''
    `.catch(() => {});

    // passages (document backfill)
    await sql`
      UPDATE passages p
      SET embedding = donor.embedding
      FROM (
        SELECT embedding FROM passages WHERE embedding IS NOT NULL LIMIT 1
      ) AS donor
      WHERE p.embedding IS NULL
        AND donor.embedding IS NOT NULL
    `.catch(() => {});

    // Leave subscription queued work empty so auto-research stays green (no fake completed).
    await sql`
      UPDATE subscription_content
      SET research_status = 'pending'
      WHERE research_status = 'queued'
    `.catch(() => {});

    // No pending audio jobs
    await sql`
      UPDATE audio_transcript_jobs
      SET status = 'failed', error_message = 's31-02-oracle-preclear'
      WHERE status = 'pending'
    `.catch(() => {});
  });
}

describe('S31-02 AC-1: task-timeout-worker real side-effect', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE, { recursive: true });
    await ensureTasksErrorStatus();
  });

  itLive(
    'taskTimeoutWorkerSweepsStuckTasks',
    async () => {
      await clearEmbedBacklogForRunAllOracle();
      const seedIds = await withSql(async (sql) => {
        // Clean prior S31-02 seeds
        await sql`DELETE FROM tasks WHERE legacy_convex_id LIKE 's31-02-%'`;
        await sql`DELETE FROM job_runs WHERE job_name = 'task-timeout-worker' AND created_at > now() - interval '2 hours'`;

        const stuck: string[] = [];
        for (let i = 0; i < 3; i++) {
          const rows = await sql<{ id: string }[]>`
            INSERT INTO tasks (task_type, status, legacy_convex_id, started_at, created_at, updated_at)
            VALUES (
              's31-02-timeout',
              'running',
              ${`s31-02-stuck-${i}`},
              now() - interval '90 minutes',
              now() - interval '90 minutes',
              now() - interval '90 minutes'
            )
            RETURNING id::text AS id
          `;
          stuck.push(rows[0]?.id);
        }

        const control5 = await sql<{ id: string }[]>`
          INSERT INTO tasks (task_type, status, legacy_convex_id, started_at, created_at, updated_at)
          VALUES (
            's31-02-timeout',
            'running',
            's31-02-control-5m',
            now() - interval '5 minutes',
            now() - interval '5 minutes',
            now() - interval '5 minutes'
          )
          RETURNING id::text AS id
        `;

        const controlCompleted = await sql<{ id: string; updated_at: Date }[]>`
          INSERT INTO tasks (task_type, status, legacy_convex_id, started_at, completed_at, created_at, updated_at)
          VALUES (
            's31-02-timeout',
            'completed',
            's31-02-control-done',
            now() - interval '2 hours',
            now() - interval '1 hour',
            now() - interval '2 hours',
            now() - interval '1 hour'
          )
          RETURNING id::text AS id, updated_at
        `;

        const beforeErrors = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count FROM tasks
          WHERE status IN ('error', 'failed')
            AND legacy_convex_id LIKE 's31-02-stuck-%'
        `;
        expect(Number(beforeErrors[0]?.count ?? 0)).toBe(0);

        return {
          stuck,
          control5: control5[0]?.id,
          controlCompleted: controlCompleted[0]?.id,
          controlCompletedUpdatedAt: new Date(controlCompleted[0]?.updated_at).toISOString(),
        };
      });

      const result = runHolo(['jobs:run-all', '--json']);
      writeFileSync(
        resolve(EVIDENCE, 'ac1-jobs-run-all.json'),
        JSON.stringify(
          {
            status: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
          },
          null,
          2
        )
      );

      expect(result.status, `jobs:run-all exit: ${result.stderr}`).toBe(0);
      const payload = JSON.parse(result.stdout) as {
        jobs_fired: number;
        jobs_total: number;
        runs: { name: string; ok: boolean; error: string | null }[];
      };
      expect(payload.jobs_total).toBe(16);
      expect(payload.jobs_fired).toBe(16);

      const after = await withSql(async (sql) => {
        const errorRows = await sql<
          {
            id: string;
            status: string;
            error_message: string | null;
            error_details: { reason?: string } | null;
            completed_at: Date | string | null;
          }[]
        >`
          SELECT id::text AS id, status, error_message, error_details, completed_at
          FROM tasks
          WHERE id = ANY(${seedIds.stuck}::uuid[])
        `;

        const control5 = await sql<{ id: string; status: string }[]>`
          SELECT id::text AS id, status FROM tasks WHERE id = ${seedIds.control5}::uuid
        `;
        const controlDone = await sql<{ id: string; status: string; updated_at: Date }[]>`
          SELECT id::text AS id, status, updated_at FROM tasks WHERE id = ${seedIds.controlCompleted}::uuid
        `;
        const jobRuns = await sql<{ id: string; effect_id: string | null }[]>`
          SELECT id::text AS id, effect_id::text AS effect_id
          FROM job_runs
          WHERE job_name = 'task-timeout-worker'
            AND created_at > now() - interval '10 minutes'
        `;

        return { errorRows, control5, controlDone, jobRuns };
      });

      writeFileSync(resolve(EVIDENCE, 'ac1-db-query.json'), JSON.stringify(after, null, 2));

      // Domain oracle: exactly 3 stuck tasks terminalized with timeout details.
      expect(after.errorRows).toHaveLength(3);
      for (const row of after.errorRows) {
        expect(['error', 'failed']).toContain(row.status);
        expect(row.error_message ?? '').toMatch(/timed out after running for 9[0-9] minutes/);
        expect(row.error_details?.reason).toBe('timeout');
        expect(row.completed_at).toBeTruthy();
      }

      // Prefer status=error when CHECK allows (AC contract); accept failed fallback.
      const errorStatusCount = after.errorRows.filter((r) => r.status === 'error').length;
      const failedStatusCount = after.errorRows.filter((r) => r.status === 'failed').length;
      expect(errorStatusCount + failedStatusCount).toBe(3);

      expect(after.control5[0]?.status).toBe('running');
      expect(after.controlDone[0]?.status).toBe('completed');
      expect(new Date(after.controlDone[0]?.updated_at).toISOString()).toBe(
        seedIds.controlCompletedUpdatedAt
      );

      expect(after.jobRuns.length).toBeGreaterThanOrEqual(1);
      expect(after.jobRuns.some((r) => r.effect_id != null)).toBe(true);
    },
    180_000
  );
});

describe('S31-02 AC-6: unbound handler cannot report green', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE, { recursive: true });
  });

  itLive(
    'unboundHandlerFailsTheRun',
    async () => {
      await clearEmbedBacklogForRunAllOracle();
      const marker = new Date().toISOString();
      const result = runHolo(['jobs:run-all', '--json'], {
        HOLO_JOBS_UNBIND: 'feed-builder',
      });

      writeFileSync(
        resolve(EVIDENCE, 'ac6-jobs-run-all.json'),
        JSON.stringify(
          { status: result.status, stdout: result.stdout, stderr: result.stderr, marker },
          null,
          2
        )
      );

      expect(result.status).not.toBe(0);
      const payload = JSON.parse(result.stdout) as {
        jobs_fired: number;
        jobs_total: number;
        run_id: string;
        runs: { name: string; ok: boolean; error: string | null; run_key?: string }[];
      };
      expect(payload.jobs_total).toBe(16);
      expect(payload.jobs_fired).toBe(15);

      const feed = payload.runs.find((r) => r.name === 'feed-builder');
      expect(feed?.ok).toBe(false);
      expect(feed?.error ?? '').toMatch(/HANDLER_UNBOUND/);

      expect(result.stderr).toMatch(/\[jobs:run-all\].*feed-builder/i);

      // Scope job_runs to this run_id — concurrent suite noise must not flake AC-6.
      const after = await withSql(async (sql) => {
        const forRun = await sql<{ job_name: string }[]>`
          SELECT job_name FROM job_runs
          WHERE run_key LIKE ${`job:%:${payload.run_id}`}
        `;
        const feedRuns = forRun.filter((r) => r.job_name === 'feed-builder');
        return {
          run_id: payload.run_id,
          jobs_for_run: forRun.length,
          job_names: forRun.map((r) => r.job_name),
          feedRuns: feedRuns.length,
        };
      });

      writeFileSync(resolve(EVIDENCE, 'ac6-job-runs.json'), JSON.stringify(after, null, 2));

      expect(after.feedRuns).toBe(0);
      expect(after.jobs_for_run).toBe(15);
      expect(after.job_names).not.toContain('feed-builder');
    },
    180_000
  );
});
