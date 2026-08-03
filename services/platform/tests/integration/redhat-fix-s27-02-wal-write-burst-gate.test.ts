/**
 * REDHAT-FIX-S27-02 — gate step 1 must run a real WAL write burst (backup:wal),
 * not a read-only backup:status grep theatre.
 *
 * Static contract: gate-plan.json step 1 action-oracle alignment.
 * Live: PLATFORM_IT=1 runs holo backup:wal --json and asserts R2 growth + continuity.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const GATE_PLAN = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json'
);
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S27-02');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';

type GateStep = {
  n: number;
  text?: string;
  literal_cmd?: string;
  assertion?: { kind?: string; expected_exit?: number; expect_log_regex?: string };
};

function loadGateStep1(): GateStep {
  const plan = JSON.parse(readFileSync(GATE_PLAN, 'utf8')) as { steps: GateStep[] };
  const step = plan.steps.find((s) => s.n === 1);
  if (!step) throw new Error('gate-plan.json missing step n=1');
  return step;
}

describe('REDHAT-FIX-S27-02 gate step 1 — real WAL write burst', () => {
  it('literal_cmd runs backup:wal with conjunctive health oracle (not status-only theatre)', () => {
    const step = loadGateStep1();
    const cmd = step.literal_cmd ?? '';

    expect(cmd).toMatch(/backup:wal/);
    expect(cmd).toMatch(/--json/);
    expect(cmd).toMatch(/writeBurstRows/);
    expect(cmd).toMatch(/r2WalObjectCountAfter/);
    expect(cmd).toMatch(/continuityOk/);
    // Must not rely on pg_stat_archiver failed=0 as pass token (F-3 adjacency)
    expect(cmd).not.toMatch(/failed=0/);
    // Must not be a pure backup:status read while claiming write burst
    const withoutWal = cmd.replace(/backup:wal/g, '');
    // primary action is backup:wal; status may be secondary post-check only
    expect(cmd.indexOf('backup:wal')).toBeLessThan(
      cmd.includes('backup:status') ? cmd.indexOf('backup:status') : Number.POSITIVE_INFINITY
    );
    void withoutWal;

    expect(step.assertion?.expected_exit).toBe(0);
    expect(step.assertion?.expect_log_regex ?? '').toMatch(/success/);
    // Weak OR-alternation on archive_mode alone is forbidden as the sole oracle
    expect(step.assertion?.expect_log_regex ?? '').not.toMatch(
      /archive_mode:\\s\+always\|pgbackrest/
    );
  });

  itLive('backup:wal --json proves write burst, R2 growth, continuity, success heartbeat', () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const outPath = resolve(EVIDENCE_DIR, 'backup-wal-live.json');
    const res = spawnSync(BUN_BIN, [HOLO_CLI, 'backup:wal', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 180_000,
      env: process.env,
    });
    writeFileSync(outPath, res.stdout ?? '', 'utf8');
    if (res.stderr) {
      writeFileSync(resolve(EVIDENCE_DIR, 'backup-wal-live.stderr'), res.stderr, 'utf8');
    }

    expect(
      res.status,
      `backup:wal exit=${res.status}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`
    ).toBe(0);

    const body = JSON.parse(res.stdout) as {
      status: string;
      ok: boolean;
      continuityOk: boolean;
      r2WalObjectCountBefore: number;
      r2WalObjectCountAfter: number;
      writeBurstRows: number;
      heartbeat: { status: string; last_success_at: string | null } | null;
    };

    expect(body.status).toBe('success');
    expect(body.ok).toBe(true);
    expect(body.continuityOk).toBe(true);
    expect(body.writeBurstRows).toBeGreaterThanOrEqual(1);
    expect(body.r2WalObjectCountAfter).toBeGreaterThan(body.r2WalObjectCountBefore);
    expect(body.heartbeat?.status).toBe('success');
    expect(body.heartbeat?.last_success_at).toBeTruthy();
    expect(existsSync(outPath)).toBe(true);
  });
});
