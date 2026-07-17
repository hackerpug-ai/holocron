/**
 * REDHAT-FIX-H1 — jobs-runner must surface the failure reason (never silently
 * drop a failed job). Verifies `runJob` returns a non-empty `error` string on
 * failure and `error: null` on success; `holo jobs:run-all` carries `error`.
 *
 * Failure path (bad DATABASE_URL → connection refused) runs unconditionally;
 * success path runs under PLATFORM_IT against real Postgres.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const itLive = PLATFORM_IT ? it : it.skip;

type RunnerModule = {
  runJob: (job: {
    name: string;
    category: string;
    lane: 'interactive' | 'background';
    schedule: string;
    description: string;
  }, opts?: { databaseUrl?: string; runId?: string }) => Promise<{
    ok: boolean;
    error: string | null;
    name: string;
  }>;
};

async function loadRunner(): Promise<RunnerModule> {
  const abs = resolve(
    process.env.HOLO_ROOT ?? process.cwd(),
    'services/platform/src/queue/jobs-runner.ts'
  );
  return (await import(pathToFileURL(abs).href)) as RunnerModule;
}

const SAMPLE_JOB = {
  name: 'redhat-fix-h1-probe',
  category: 'janitor' as const,
  lane: 'background' as const,
  schedule: 'interval 1h',
  description: 'REDHAT-FIX-H1 probe job.',
};

describe('REDHAT-FIX-H1: jobs-runner surfaces failure reason', () => {
  it('runJob returns a non-empty error string when the DB is unreachable', async () => {
    const { runJob } = await loadRunner();
    // Unreachable DB → connection refused → caught + normalized into `error`.
    const result = await runJob(SAMPLE_JOB, {
      databaseUrl: 'postgres://127.0.0.1:1/invalid',
    });
    expect(result.ok, 'failed job is ok:false').toBe(false);
    expect(result.error, 'error is a non-empty diagnostic string').toBeTruthy();
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });

  itLive(
    'runJob returns error:null on success (real Postgres)',
    async () => {
      const { runJob } = await loadRunner();
      const result = await runJob(SAMPLE_JOB, { databaseUrl: DATABASE_URL });
      expect(result.ok, 'job fired').toBe(true);
      expect(result.error, 'no error on success').toBeNull();
    },
    30_000
  );
});
