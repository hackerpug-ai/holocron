/**
 * REDHAT-FIX-S29-R3-H02 — fence mission admission/publish and already-running
 * worker irreversible effects.
 *
 * Done when:
 *   - Mission write/publish returns migration_read_only when fenced
 *   - Already-running or leased job path fails closed under fence
 *   - PLATFORM_IT negatives green
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-r3-h02-mission-worker-fence.test.ts
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  PLATFORM_IT,
  REPO_ROOT,
} from '../../../../tests/integration/service/harness';
import {
  isMigrationReadOnly,
  migrationReadOnlyJobError,
  setMigrationReadOnlyEnv,
} from '../../src/cutover/soak-fence.ts';
import { createSql, type Sql } from '../../src/db/client.ts';
import { publishDocumentForRun } from '../../src/mission/document-publish.ts';
import { MissionRuntimeError, runMissionTemplate } from '../../src/mission/runtime.ts';
import { beginEffect, dispatchAndAck } from '../../src/queue/durable-effect.ts';
import { MIGRATED_JOBS } from '../../src/queue/jobs-registry.ts';
import {
  applyIrreversibleJobEffect,
  processLeasedJob,
  runJob,
} from '../../src/queue/jobs-runner.ts';
import { dequeue, enqueue } from '../../src/queue/priority.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint29-r3-h02-mission-worker-fence requires PLATFORM_IT=1 (real Postgres)');
}

const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R3-H02');
const DATABASE_URL = DEFAULT_DATABASE_URL;
const RUN = randomUUID().slice(0, 8);

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function armFence(): void {
  setMigrationReadOnlyEnv('1');
  expect(isMigrationReadOnly()).toBe(true);
}

function disarmFence(): void {
  setMigrationReadOnlyEnv('0');
  // Durable control-plane may still arm; for these tests we force process env '0'
  // and rely on env-only engagement when secrets lack HOLO_MIGRATION_READ_ONLY.
  // When durable is '1', isMigrationReadOnly stays true — unset to empty.
  setMigrationReadOnlyEnv('');
  delete process.env.HOLO_MIGRATION_READ_ONLY;
}

describe('REDHAT-FIX-S29-R3-H02 mission + already-running worker fence', () => {
  let sql: Sql;

  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    sql = createSql(DATABASE_URL);
    // Ensure job_runs / outbox schemas exist via a no-op unfenced schema touch.
    disarmFence();
  });

  afterAll(async () => {
    disarmFence();
    await sql.end({ timeout: 5 });
  });

  beforeEach(() => {
    disarmFence();
  });

  it('mission create/admission rejects with migration_read_only when fenced', async () => {
    armFence();
    let rejected = false;
    let message = '';
    let code = '';
    try {
      await runMissionTemplate(
        {
          templateKey: 'whatsnew',
          goal: `r3-h02-mission-create-${RUN}`,
          idempotencyKey: `r3-h02-create-${RUN}`,
          date: '2026-08-01',
        },
        { databaseUrl: DATABASE_URL }
      );
    } catch (err) {
      rejected = true;
      message = err instanceof Error ? err.message : String(err);
      code = err instanceof MissionRuntimeError ? err.code : '';
    }
    const evidence = {
      rejected,
      message,
      code,
      expectedPrefix: 'migration_read_only:',
      surface: 'mission create/admission',
    };
    writeEvidence('mission-create-fenced.json', evidence);
    expect(rejected, 'mission create must reject under fence').toBe(true);
    expect(message.startsWith('migration_read_only:'), `message=${message}`).toBe(true);
    expect(code).toBe('MIGRATION_READ_ONLY');
    expect(message).toContain('mission admission');
  }, 120_000);

  it('publishDocumentForRun rejects with migration_read_only and inserts no document', async () => {
    const sourceRunId = randomUUID();
    const beforeRows = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM documents WHERE source_run_id = ${sourceRunId}::uuid
    `;
    const before = Number(beforeRows[0]?.c ?? 0);

    armFence();
    let rejected = false;
    let message = '';
    try {
      await publishDocumentForRun(sql, {
        sourceRunId,
        title: `r3-h02-publish-${RUN}`,
        content: 'blocked under soak fence',
        category: 'subscriptions',
        idempotencyKey: `r3-h02-pub-${RUN}`,
      });
    } catch (err) {
      rejected = true;
      message = err instanceof Error ? err.message : String(err);
    }

    const afterRows = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM documents WHERE source_run_id = ${sourceRunId}::uuid
    `;
    const after = Number(afterRows[0]?.c ?? 0);

    const evidence = {
      rejected,
      message,
      before,
      after,
      sourceRunId,
    };
    writeEvidence('mission-publish-fenced.json', evidence);
    expect(rejected).toBe(true);
    expect(message.startsWith('migration_read_only:')).toBe(true);
    expect(after, 'fenced publish must not insert documents').toBe(before);
  }, 60_000);

  it('mid-flight irreversible effect (outbox already committed) fails closed under fence', async () => {
    // Simulate already-running worker: commit outbox intent while unfenced,
    // arm fence, then re-check at dispatchAndAck / applyIrreversibleJobEffect.
    disarmFence();
    const job = MIGRATED_JOBS.find((j) => j.name === 'task-timeout-worker') ?? MIGRATED_JOBS[0]!;
    const key = `r3-h02-midflight:${RUN}:${randomUUID()}`;

    const begun = await beginEffect({
      key,
      name: job.name,
      payload: { phase: 'pre-fence', run: RUN },
      databaseUrl: DATABASE_URL,
    });
    expect(begun.committed).toBe(true);

    const effectsBefore = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM queue_effects WHERE key = ${key}
    `;
    const beforeEffects = Number(effectsBefore[0]?.c ?? 0);

    armFence();

    // Direct irreversible boundary
    let dispatchMsg = '';
    let dispatchRejected = false;
    try {
      await dispatchAndAck({ key, name: job.name, databaseUrl: DATABASE_URL });
    } catch (err) {
      dispatchRejected = true;
      dispatchMsg = err instanceof Error ? err.message : String(err);
    }

    // Public already-running worker API
    const applied = await applyIrreversibleJobEffect({
      key,
      jobName: job.name,
      category: job.category,
      lane: job.lane,
      databaseUrl: DATABASE_URL,
    });

    const effectsAfter = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM queue_effects WHERE key = ${key}
    `;
    const afterEffects = Number(effectsAfter[0]?.c ?? 0);

    const evidence = {
      key,
      begun,
      dispatchRejected,
      dispatchMsg,
      applyOk: applied.ok,
      applyError: applied.error,
      beforeEffects,
      afterEffects,
      expectedJobErrorPrefix: migrationReadOnlyJobError(job.name).slice(0, 20),
    };
    writeEvidence('midflight-irreversible-effect-fenced.json', evidence);

    expect(dispatchRejected, 'dispatchAndAck must throw under fence').toBe(true);
    expect(dispatchMsg.startsWith('migration_read_only:')).toBe(true);
    expect(applied.ok, 'applyIrreversibleJobEffect must fail closed').toBe(false);
    expect(String(applied.error).startsWith('migration_read_only:')).toBe(true);
    expect(afterEffects, 'no queue_effects row under fence').toBe(beforeEffects);
  }, 60_000);

  it('already-leased priority job fails closed under fence via processLeasedJob', async () => {
    disarmFence();
    const jobName = `r3-h02-leased-${RUN}`;
    // interactive lane (priority 100) so our job dequeues ahead of residual background work
    const enqueued = await enqueue({
      name: jobName,
      lane: 'interactive',
      payload: { run: RUN },
      databaseUrl: DATABASE_URL,
      key: `r3-h02-lease-key-${RUN}`,
    });

    let leased: Awaited<ReturnType<typeof dequeue>> = null;
    for (let i = 0; i < 32; i++) {
      const candidate = await dequeue(DATABASE_URL);
      if (!candidate) break;
      if (candidate.name === jobName || candidate.id === enqueued.id) {
        leased = candidate;
        break;
      }
    }
    expect(leased, 'must lease the enqueued interactive job').not.toBeNull();
    expect(leased!.id).toBe(enqueued.id);
    expect(leased!.status).toBe('leased');
    expect(leased!.fence_token).toBeTruthy();

    // Fence engages after lease acquisition (already-running worker).
    armFence();

    const result = await processLeasedJob(
      {
        id: leased!.id,
        name: leased!.name,
        lane: leased!.lane,
        fence_token: leased!.fence_token,
      },
      { databaseUrl: DATABASE_URL, category: 'janitor', runId: randomUUID() }
    );

    const effects = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM queue_effects WHERE key LIKE ${`leased-job:${jobName}:%`}
    `;

    const evidence = {
      enqueuedId: enqueued.id,
      leased,
      processOk: result.ok,
      processError: result.error,
      effectRows: Number(effects[0]?.c ?? 0),
    };
    writeEvidence('already-leased-job-fenced.json', evidence);

    expect(result.ok).toBe(false);
    expect(String(result.error).startsWith('migration_read_only:')).toBe(true);
    expect(Number(effects[0]?.c ?? 0), 'leased path must not apply effects').toBe(0);
  }, 60_000);

  it('runJob admission still blocks under fence (regression)', async () => {
    armFence();
    const job = MIGRATED_JOBS.find((j) => j.name === 'task-timeout-worker') ?? MIGRATED_JOBS[0]!;
    const beforeRows = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM job_runs WHERE job_name = ${job.name}
    `;
    const before = Number(beforeRows[0]?.c ?? 0);
    const result = await runJob(job, { databaseUrl: DATABASE_URL, runId: randomUUID() });
    const afterRows = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM job_runs WHERE job_name = ${job.name}
    `;
    const after = Number(afterRows[0]?.c ?? 0);
    writeEvidence('runjob-admission-fenced.json', { result, before, after });
    expect(result.ok).toBe(false);
    expect(String(result.error).startsWith('migration_read_only:')).toBe(true);
    expect(after).toBe(before);
  }, 60_000);

  it('child-process already-running worker blocks at irreversible effect under fence', () => {
    // Separate process: proves not only in-process runJob entry is fenced.
    // Child commits outbox unfenced, parent arms fence via env in child second phase.
    const childScript = resolve(
      REPO_ROOT,
      'services/platform/tests/integration/sprint29-r3-h02-worker-child.ts'
    );
    const key = `r3-h02-child:${RUN}:${randomUUID()}`;
    const job = MIGRATED_JOBS.find((j) => j.name === 'task-timeout-worker') ?? MIGRATED_JOBS[0]!;

    // Phase 1: child begins effect with fence OFF
    const phase1 = spawnSync(
      process.execPath.includes('bun') ? process.execPath : 'bun',
      [childScript, 'begin', key, job.name, DATABASE_URL],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, HOLO_MIGRATION_READ_ONLY: '0', DATABASE_URL },
        encoding: 'utf8',
        timeout: 60_000,
      }
    );
    writeEvidence('child-phase1-begin.json', {
      status: phase1.status,
      stdout: phase1.stdout,
      stderr: phase1.stderr,
    });
    expect(phase1.status, `phase1 failed: ${phase1.stderr}`).toBe(0);
    const begun = JSON.parse(phase1.stdout.trim()) as { committed: boolean };
    expect(begun.committed).toBe(true);

    // Phase 2: child attempts irreversible effect with fence ON (already-running path)
    const phase2 = spawnSync(
      process.execPath.includes('bun') ? process.execPath : 'bun',
      [childScript, 'dispatch', key, job.name, DATABASE_URL],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, HOLO_MIGRATION_READ_ONLY: '1', DATABASE_URL },
        encoding: 'utf8',
        timeout: 60_000,
      }
    );
    writeEvidence('child-phase2-dispatch.json', {
      status: phase2.status,
      stdout: phase2.stdout,
      stderr: phase2.stderr,
    });
    expect(phase2.status, `phase2 should exit 0 with blocked JSON: ${phase2.stderr}`).toBe(0);
    const dispatched = JSON.parse(phase2.stdout.trim()) as {
      ok: boolean;
      error: string | null;
      blocked: boolean;
    };
    expect(dispatched.blocked).toBe(true);
    expect(dispatched.ok).toBe(false);
    expect(String(dispatched.error).startsWith('migration_read_only:')).toBe(true);

    writeEvidence('child-already-running-worker-proof.json', {
      key,
      phase1: begun,
      phase2: dispatched,
      note: 'Separate process re-checked durable fence at irreversible effect; not only in-process runJob admission',
    });
  }, 120_000);
});
