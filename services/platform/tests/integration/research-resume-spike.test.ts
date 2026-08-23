/**
 * R-01 — prove Mastra 1.50.1 createRun({ runId }) durable cross-process resume.
 *
 * AC-1: Process A suspends; mastra_workflow_snapshot row status indicates suspended.
 * AC-2: kill -9 Process A; Process B createRun({ runId }) + resume → status === 'success'.
 * AC-3: sideEffect INSERT occurs exactly once across both processes.
 * AC-4: storage-less Mastra cannot resume (storage registration is load-bearing).
 *
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     FLEET_URL=http://127.0.0.1:4545/v1 \
 *     pnpm vitest run --project integration \
 *     services/platform/tests/integration/research-resume-spike.test.ts
 */

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client';
import { createStorage } from '../../src/mastra';
import {
  RESUME_SPIKE_SIDE_EFFECT_TABLE,
  RESUME_SPIKE_WORKFLOW_ID,
  resumeSpike,
} from '../../src/research/__spike__/resume.spike';

const PLATFORM_IT = process.env.PLATFORM_IT === '1' || Boolean(process.env.PLATFORM_IT);
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const CHILD_ENTRY = resolve(
  REPO_ROOT,
  'services/platform/src/research/__spike__/resume.spike.child.ts'
);
const BUN_BIN = process.env.BUN_BIN ?? 'bun';

function requireLiveEnv(): void {
  if (!PLATFORM_IT) {
    throw new Error('research-resume-spike requires PLATFORM_IT=1 (no skip allowed)');
  }
  if (!DATABASE_URL) {
    throw new Error('research-resume-spike requires DATABASE_URL');
  }
  if (!DATABASE_URL.includes('holocron_nonprod')) {
    throw new Error(
      `research-resume-spike DATABASE_URL must include holocron_nonprod, got: ${DATABASE_URL}`
    );
  }
}

async function shutdownMastra(mastra: Mastra): Promise<void> {
  await Promise.race([mastra.shutdown(), new Promise((r) => setTimeout(r, 5_000))]);
}

function waitForSuspendedBarrier(
  child: ChildProcessWithoutNullStreams,
  readyFile: string,
  timeoutMs = 60_000
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(`timed out waiting for SUSPENDED barrier\nstdout:\n${stdout}\nstderr:\n${stderr}`)
      );
    }, timeoutMs);

    const trySettle = (line: string) => {
      const match = line.match(/^SUSPENDED\s+(\S+)\s*$/m);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(match[1] ?? '');
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      trySettle(stdout);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('exit', (code, signal) => {
      if (settled) return;
      // Fallback: ready file may have been written before exit race.
      try {
        const ready = readFileSync(readyFile, 'utf8');
        trySettle(ready);
        if (settled) return;
      } catch {
        // ignore missing ready file
      }
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `child exited before SUSPENDED (code=${code} signal=${signal})\nstdout:\n${stdout}\nstderr:\n${stderr}`
        )
      );
    });
  });
}

describe('R-01 research resume spike (Mastra 1.50.1 createRun({runId}))', () => {
  let sql: Sql;
  const scratchDir = mkdtempSync(join(tmpdir(), 'research-resume-spike-'));

  beforeAll(async () => {
    requireLiveEnv();
    sql = createSql(DATABASE_URL, { max: 4 });
    try {
      await sql`SELECT 1`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Postgres unreachable at ${DATABASE_URL}: ${message}`);
    }

    const dbName = await sql<{ current_database: string }[]>`SELECT current_database()`;
    const name = dbName[0]?.current_database ?? '';
    if (name !== 'holocron_nonprod') {
      throw new Error(`expected current_database=holocron_nonprod, got: ${name}`);
    }

    await sql`
      CREATE TABLE IF NOT EXISTS research_spike_side_effects (
        run_id text PRIMARY KEY,
        note text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`DELETE FROM research_spike_side_effects`;
  });

  afterAll(async () => {
    try {
      if (sql) {
        await sql`DROP TABLE IF EXISTS research_spike_side_effects`;
        await sql.end({ timeout: 5 });
      }
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it('AC-1..AC-4: SIGKILL + createRun({runId}) resume is durable; storage-less resume fails', async () => {
    requireLiveEnv();
    const runId = `r01-${randomUUID()}`;
    const note = `cross-process-${runId}`;
    const readyFile = join(scratchDir, `${runId}.ready`);
    writeFileSync(readyFile, '', 'utf8');

    const child = spawn(BUN_BIN, [CHILD_ENTRY], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PLATFORM_IT: '1',
        DATABASE_URL,
        FLEET_URL: process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1',
        SPIKE_RUN_ID: runId,
        SPIKE_NOTE: note,
        SPIKE_READY_FILE: readyFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(child.pid, 'child pid required for SIGKILL').toBeTruthy();
    const childPid = child.pid as number;

    let barrierRunId: string;
    try {
      barrierRunId = await waitForSuspendedBarrier(child, readyFile, 90_000);
    } catch (error) {
      try {
        process.kill(childPid, 'SIGKILL');
      } catch {
        // already dead
      }
      throw error;
    }
    expect(barrierRunId).toBe(runId);

    // AC-1: durable snapshot row exists with suspended status in jsonb.
    const snapshotRows = await sql<
      {
        workflow_name: string;
        run_id: string;
        snapshot: Record<string, unknown>;
      }[]
    >`
        SELECT workflow_name, run_id, snapshot
        FROM public.mastra_workflow_snapshot
        WHERE run_id = ${runId}
      `;
    expect(snapshotRows.length, 'expected mastra_workflow_snapshot row').toBe(1);
    const snap = snapshotRows[0];
    expect(snap?.workflow_name).toBe(RESUME_SPIKE_WORKFLOW_ID);
    expect(snap?.run_id).toBe(runId);
    const snapStatus = String(snap?.snapshot?.status ?? '');
    expect(
      snapStatus,
      `snapshot jsonb status must indicate suspended: ${JSON.stringify(snap?.snapshot)}`
    ).toBe('suspended');

    // Real SIGKILL of process A.
    const killSent = process.kill(childPid, 'SIGKILL');
    expect(killSent).toBe(true);
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolveExit) => {
        child.on('close', (code, signal) => resolveExit({ code, signal }));
      }
    );
    expect(exit.signal, 'child must die via SIGKILL').toBe('SIGKILL');

    // AC-3 prelude: side effect already committed exactly once before kill.
    const preResumeCount = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n
        FROM research_spike_side_effects
        WHERE run_id = ${runId}
      `;
    expect(Number(preResumeCount[0]?.n ?? 0)).toBe(1);

    // AC-2: fresh process B (this test process) rehydrates + resumes.
    const mastraB = new Mastra({
      storage: createStorage(),
      workflows: { resumeSpike },
    });
    let resumeResult: { status: string; result?: { done?: boolean; runId?: string } };
    try {
      const wfB = mastraB.getWorkflow('resumeSpike');
      const runB = await wfB.createRun({ runId });
      // Prefer awaiting resume() (not resumeAsync fire-and-forget) so we observe terminal status.
      resumeResult = await runB.resume({
        resumeData: { approved: true },
        step: 'hold',
      });

      expect(resumeResult.status).toBe('success');
      expect(resumeResult.result?.done).toBe(true);
      expect(resumeResult.result?.runId).toBe(runId);

      // AC-3: exactly-once side effect across processes.
      const postCount = await sql<{ n: string }[]>`
          SELECT count(*)::text AS n
          FROM research_spike_side_effects
          WHERE run_id = ${runId}
        `;
      expect(Number(postCount[0]?.n ?? 0)).toBe(1);
      expect(RESUME_SPIKE_SIDE_EFFECT_TABLE).toBe('research_spike_side_effects');

      // AC-4: storage-less Mastra (assimilate/run.ts shape) cannot resume.
      // Keep mastraB alive until after this attempt so a shared workflow
      // registration cannot observe a shut-down Postgres pool.
      //
      // Mastra falls back to in-memory storage when none is configured.
      // createRun({ runId }) therefore cannot load the durable suspended
      // snapshot from Postgres — resume throws (No snapshot found, or
      // "was not suspended" against an in-memory pending placeholder).
      const storageLess = new Mastra({
        workflows: { resumeSpike },
      });
      let ac4Error: unknown;
      let ac4Status: string | undefined;
      try {
        const wfLess = storageLess.getWorkflow('resumeSpike');
        const runLess = await wfLess.createRun({ runId });
        const ac4Result = await runLess.resume({
          resumeData: { approved: true },
          step: 'hold',
        });
        ac4Status = ac4Result.status;
      } catch (error) {
        ac4Error = error;
      } finally {
        await shutdownMastra(storageLess);
      }

      expect(ac4Status, 'storage-less resume must not succeed').not.toBe('success');
      expect(ac4Error, 'storage-less resume must fail').toBeTruthy();
      const ac4Message = ac4Error instanceof Error ? ac4Error.message : String(ac4Error);
      expect(ac4Message).toMatch(/No snapshot found|snapshot|was not suspended|not suspended/i);
    } finally {
      await shutdownMastra(mastraB);
    }
  }, 180_000);
});
