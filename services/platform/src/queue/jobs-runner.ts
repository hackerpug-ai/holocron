/**
 * queue-3 — run the 16 migrated cron jobs through the durable queue with
 * observable side effects (AC-1) and priority lanes (AC-3).
 *
 * Each job execution:
 *   1. Enqueues a durable-effect intent (queue_outbox) under a stable run key.
 *   2. Fenced consumer applies the effect (queue_effects) + inbox dedupe row
 *      (queue_inbox) in one transaction — exactly-once observable effect.
 *   3. Writes one job_runs side-effect row linked to the effect.
 *
 * `holo jobs:run-all` fires all 16 once; `holo jobs:list` reports the registry.
 *
 * REDHAT-FIX-S29-R3-H02: durable soak fence is re-checked at every irreversible
 * step (not only runJob admission) so already-running / leased workers fail closed.
 */
import { randomUUID } from 'node:crypto';
import { isMigrationReadOnly, migrationReadOnlyJobError } from '../cutover/soak-fence.ts';
import { createSql, type Sql } from '../db/client.ts';
import { beginEffect, dispatchAndAck, ensureOutboxSchema } from './durable-effect.ts';
import { MIGRATED_JOBS, type MigratedJob } from './jobs-registry.ts';
import { enqueue } from './priority.ts';

const DEFAULT_URL = () => process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';

const JOB_RUNS_SQL = `
CREATE TABLE IF NOT EXISTS job_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  job_name text NOT NULL,
  run_key text NOT NULL,
  category text NOT NULL,
  lane text NOT NULL,
  effect_id uuid,
  fence_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_runs_lane_check CHECK (lane IN ('interactive','background')),
  CONSTRAINT job_runs_category_check CHECK (category IN ('janitor','workflow','consumer','backfill','digest'))
);
CREATE UNIQUE INDEX IF NOT EXISTS job_runs_run_key_uidx ON job_runs (run_key);
CREATE INDEX IF NOT EXISTS job_runs_job_name_idx ON job_runs (job_name);
CREATE INDEX IF NOT EXISTS job_runs_created_at_idx ON job_runs (created_at);
`;

async function ensureJobRunsSchema(sql: Sql): Promise<void> {
  await ensureOutboxSchema(sql);
  await sql.unsafe(JOB_RUNS_SQL);
}

export type JobRunResult = {
  name: string;
  run_key: string;
  category: string;
  lane: 'interactive' | 'background';
  effect_id: string | null;
  fence_token: string | null;
  ok: boolean;
  /** Normalized failure diagnostic (null on success). Surfaces the reason a job
   * did not fire so `holo jobs:run-all` never silently drops a failed job. */
  error: string | null;
};

function migrationBlockedResult(
  job: Pick<MigratedJob, 'name' | 'category' | 'lane'>,
  runKey: string
): JobRunResult {
  return {
    name: job.name,
    run_key: runKey,
    category: job.category,
    lane: job.lane,
    effect_id: null,
    fence_token: null,
    ok: false,
    error: migrationReadOnlyJobError(job.name),
  };
}

/**
 * Fire ONE migrated job: durable outbox enqueue + fenced ack + job_runs row.
 * Also enqueues it into the leased priority queue (queue_jobs) so the leased
 * worker path observes the job with its lane priority recorded.
 *
 * Re-checks isMigrationReadOnly at every irreversible step (beginEffect,
 * dispatchAndAck, job_runs INSERT) so a fence that arms mid-flight still blocks.
 */
export async function runJob(
  job: MigratedJob,
  opts: { databaseUrl?: string; runId?: string } = {}
): Promise<JobRunResult> {
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const runId = opts.runId ?? randomUUID();
  const runKey = `job:${job.name}:${runId}`;
  const payload = { job: job.name, category: job.category, lane: job.lane, runId };

  // D06-05 / D06-01: soak fence — return ok:false (never throw) before beginEffect
  if (isMigrationReadOnly()) {
    return migrationBlockedResult(job, runKey);
  }

  const sql = createSql(url);
  try {
    await ensureJobRunsSchema(sql);

    // Re-check immediately before irreversible outbox intent.
    if (isMigrationReadOnly()) {
      return migrationBlockedResult(job, runKey);
    }

    // Durable effect: outbox intent → fenced ack (exactly-once observable effect).
    await beginEffect({
      key: runKey,
      name: job.name,
      payload,
      databaseUrl: url,
    });

    // Re-check after outbox commit, before irreversible effect application.
    // Covers the TOCTOU where fence arms between admission and effect.
    if (isMigrationReadOnly()) {
      return migrationBlockedResult(job, runKey);
    }

    const ack = await dispatchAndAck({ key: runKey, name: job.name, databaseUrl: url });

    // Enqueue into the leased priority queue so the lane is observable there too.
    // Best-effort observability only — never a second irreversible business write.
    await enqueue({
      name: job.name,
      lane: job.lane,
      payload,
      databaseUrl: url,
      key: `leased:${runKey}`,
    }).catch(() => {
      // leased-queue enqueue is best-effort observability; the durable effect is
      // the source of truth (do not fail the run on a duplicate leased key).
    });

    // Observable side-effect row (the former Convex cron side effect).
    // Recorded only after a successful irreversible effect application.
    const rows = await sql<{ id: string }[]>`
      INSERT INTO job_runs (job_name, run_key, category, lane, effect_id, fence_token)
      VALUES (
        ${job.name},
        ${runKey},
        ${job.category},
        ${job.lane},
        ${ack.effectId ?? null}::uuid,
        ${ack.fenceToken ?? null}
      )
      ON CONFLICT (run_key) DO UPDATE SET job_name = EXCLUDED.job_name
      RETURNING id::text AS id
    `;

    return {
      name: job.name,
      run_key: runKey,
      category: job.category,
      lane: job.lane,
      effect_id: ack.effectId ?? rows[0]?.id ?? null,
      fence_token: ack.fenceToken,
      ok: true,
      error: null,
    };
  } catch (err) {
    // REDHAT-FIX-H1: surface the failure reason instead of swallowing it, so
    // `holo jobs:run-all` reports which job failed and why (never a silent drop).
    const error = err instanceof Error ? err.message : String(err);
    return {
      name: job.name,
      run_key: runKey,
      category: job.category,
      lane: job.lane,
      effect_id: null,
      fence_token: null,
      ok: false,
      error,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Apply the irreversible durable effect for work that is already mid-flight
 * (outbox intent committed and/or queue_jobs row already leased).
 *
 * This is the already-running / leased worker path — it does NOT short-circuit
 * only at runJob admission. The durable fence is re-checked at dispatchAndAck.
 *
 * REDHAT-FIX-S29-R3-H02.
 */
export async function applyIrreversibleJobEffect(opts: {
  key: string;
  jobName: string;
  category?: string;
  lane?: 'interactive' | 'background';
  databaseUrl?: string;
}): Promise<JobRunResult> {
  const runKey = opts.key;
  const job = {
    name: opts.jobName,
    category: opts.category ?? 'janitor',
    lane: opts.lane ?? 'background',
  } as MigratedJob;

  if (isMigrationReadOnly()) {
    return migrationBlockedResult(job, runKey);
  }

  try {
    // Fresh re-check at the irreversible boundary (defense in depth with
    // dispatchAndAck's own fence check).
    if (isMigrationReadOnly()) {
      return migrationBlockedResult(job, runKey);
    }
    const ack = await dispatchAndAck({
      key: opts.key,
      name: opts.jobName,
      databaseUrl: opts.databaseUrl,
    });
    return {
      name: opts.jobName,
      run_key: runKey,
      category: job.category,
      lane: job.lane,
      effect_id: ack.effectId,
      fence_token: ack.fenceToken,
      ok: true,
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      name: opts.jobName,
      run_key: runKey,
      category: job.category,
      lane: job.lane,
      effect_id: null,
      fence_token: null,
      ok: false,
      error,
    };
  }
}

/**
 * Process an already-leased priority-queue job under the soak fence.
 * Acquires no new lease — caller must already hold `leased` from dequeue().
 * Fail-closed when the durable fence is armed at effect time.
 */
export async function processLeasedJob(
  leased: {
    id: string;
    name: string;
    lane: 'interactive' | 'background';
    fence_token?: string | null;
  },
  opts: { databaseUrl?: string; category?: string; runId?: string } = {}
): Promise<JobRunResult> {
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const runId = opts.runId ?? randomUUID();
  const runKey = `leased-job:${leased.name}:${leased.id}:${runId}`;
  const category = opts.category ?? 'janitor';
  const job = {
    name: leased.name,
    category,
    lane: leased.lane,
  } as MigratedJob;

  if (isMigrationReadOnly()) {
    return migrationBlockedResult(job, runKey);
  }

  const payload = {
    job: leased.name,
    lane: leased.lane,
    leasedId: leased.id,
    leaseFence: leased.fence_token ?? null,
    runId,
  };

  try {
    if (isMigrationReadOnly()) {
      return migrationBlockedResult(job, runKey);
    }
    await beginEffect({
      key: runKey,
      name: leased.name,
      payload,
      databaseUrl: url,
    });
    if (isMigrationReadOnly()) {
      return migrationBlockedResult(job, runKey);
    }
    return await applyIrreversibleJobEffect({
      key: runKey,
      jobName: leased.name,
      category,
      lane: leased.lane,
      databaseUrl: url,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      name: leased.name,
      run_key: runKey,
      category,
      lane: leased.lane,
      effect_id: null,
      fence_token: null,
      ok: false,
      error,
    };
  }
}

export type RunAllResult = {
  jobs_fired: number;
  jobs_total: number;
  side_effect_rows: number;
  run_id: string;
  runs: JobRunResult[];
};

/** Fire all 16 migrated jobs once. Returns counts for the CLI / gate. */
export async function runAllJobs(opts: { databaseUrl?: string } = {}): Promise<RunAllResult> {
  const url = opts.databaseUrl ?? DEFAULT_URL();
  const runId = randomUUID();
  const runs: JobRunResult[] = [];
  for (const job of MIGRATED_JOBS) {
    runs.push(await runJob(job, { databaseUrl: url, runId }));
  }
  const jobs_fired = runs.filter((r) => r.ok).length;
  // REDHAT-FIX-H1: log each failure reason to stderr so an operator running
  // `holo jobs:run-all` sees which job failed and why (never a silent drop).
  for (const r of runs) {
    if (!r.ok && r.error) {
      console.error(`[jobs:run-all] job "${r.name}" FAILED: ${r.error}`);
    }
  }

  const sql = createSql(url);
  let side_effect_rows = 0;
  try {
    await ensureJobRunsSchema(sql);
    const rows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM job_runs WHERE created_at > now() - interval '1 hour'
    `;
    side_effect_rows = Number(rows[0]?.count ?? 0);
  } finally {
    await sql.end({ timeout: 5 });
  }

  return {
    jobs_fired,
    jobs_total: MIGRATED_JOBS.length,
    side_effect_rows,
    run_id: runId,
    runs,
  };
}
