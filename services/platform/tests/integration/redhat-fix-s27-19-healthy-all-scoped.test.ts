/**
 * REDHAT-FIX-S27-19 / R-5 — backup:healthy --all must not unscoped-silence all jobs
 * without break-glass env.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HEALTHY_ALL_BREAK_GLASS_ENV, runHealthyBackupJob } from '../../src/backup/alerting';
import {
  ensureBackupHeartbeatTable,
  getBackupHeartbeat,
  upsertBackupHeartbeat,
} from '../../src/backup/heartbeat';
import { createSql } from '../../src/db/client';

const live = process.env.PLATFORM_IT === '1';
const d = live ? describe : describe.skip;

async function seedFailed(jobName: string) {
  await upsertBackupHeartbeat({
    jobName,
    status: 'failed',
    lastSuccessAt: new Date(Date.now() - 60 * 60_000),
    objectCount: 0,
    traceId: `s27-19-seed-${jobName}`,
  });
}

d('REDHAT-FIX-S27-19 healthy --all scoped', () => {
  beforeAll(async () => {
    await ensureBackupHeartbeatTable();
  });

  afterAll(async () => {
    // best-effort cleanup of canary rows
    const sql = createSql();
    try {
      await sql`DELETE FROM backup_heartbeat WHERE job_name LIKE ${'s27-19-%'} OR job_name = ${'prod-canary-overdue'}`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('AC-1: default --all does not reset non-allowlist failed job', async () => {
    await seedFailed('wal_archive');
    await seedFailed('prod-canary-overdue');
    delete process.env[HEALTHY_ALL_BREAK_GLASS_ENV];
    await runHealthyBackupJob('all', { env: { ...process.env } });
    const wal = await getBackupHeartbeat('wal_archive');
    const canary = await getBackupHeartbeat('prod-canary-overdue');
    expect(wal?.status).toBe('success');
    expect(canary?.status).toBe('failed');
  });

  it('AC-2: allowlist + test-prefix still reset', async () => {
    await seedFailed('base_backup');
    await seedFailed('s27-19-harness-job');
    delete process.env[HEALTHY_ALL_BREAK_GLASS_ENV];
    await runHealthyBackupJob('all', { env: { ...process.env } });
    expect((await getBackupHeartbeat('base_backup'))?.status).toBe('success');
    expect((await getBackupHeartbeat('s27-19-harness-job'))?.status).toBe('success');
  });

  it('AC-3: break-glass enables unscoped full-table success', async () => {
    await seedFailed('prod-canary-overdue');
    await runHealthyBackupJob('all', {
      env: { ...process.env, [HEALTHY_ALL_BREAK_GLASS_ENV]: '1' },
    });
    expect((await getBackupHeartbeat('prod-canary-overdue'))?.status).toBe('success');
  });

  it('AC-4: negative control — unscoped path only with break-glass', async () => {
    // Source contract: without break-glass, WHERE clause must exist (no bare UPDATE).
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../src/backup/alerting.ts', import.meta.url), 'utf8')
    );
    expect(src).toContain(HEALTHY_ALL_BREAK_GLASS_ENV);
    expect(src).toMatch(/job_name = ANY/);
    // Behavior: canary survives without glass (already proven AC-1); re-assert.
    await seedFailed('prod-canary-overdue');
    await runHealthyBackupJob('all', { env: { ...process.env } });
    expect((await getBackupHeartbeat('prod-canary-overdue'))?.status).toBe('failed');
  });

  it('AC-5: single-job path only touches that job', async () => {
    await seedFailed('s27-19-job-a');
    await seedFailed('s27-19-job-b');
    await runHealthyBackupJob('s27-19-job-a');
    expect((await getBackupHeartbeat('s27-19-job-a'))?.status).toBe('success');
    expect((await getBackupHeartbeat('s27-19-job-b'))?.status).toBe('failed');
  });
});
