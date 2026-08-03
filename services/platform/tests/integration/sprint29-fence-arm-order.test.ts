/**
 * REDHAT-FIX-S29-H05 — fence arm-after-confirm ordering + cross-process probe.
 * REDHAT-FIX-S29-R2-H04 — fail-closed cross-process probe (no in-process arm fallback).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-fence-arm-order.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { anyApi } from 'convex/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../../../convex/_generated/api';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { captureArticleBaseline } from '../../src/cutover/article-baseline.ts';
import {
  createCutoverConvexClient,
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  runCrossProcessBlockedWriteProbe,
  runCutoverFreeze,
  waitForMigrationReadOnlyRuntime,
} from '../../src/cutover/convex-fence-client.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint29-fence-arm-order requires PLATFORM_IT=1');
}

const EVIDENCE = resolve(process.cwd(), '.tmp/REDHAT-FIX-S29-H05');
const EVIDENCE_R2_H04 = resolve(process.cwd(), '.tmp/REDHAT-FIX-S29-R2-H04');
const EVIDENCE_SPRINT = resolve(
  process.cwd(),
  '.tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip'
);
const D0603 = resolve(process.cwd(), '.tmp/D06-03');

function evidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync(D0603, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(resolve(EVIDENCE, name), payload, 'utf8');
  // Mirror freeze-report into D06-03 for TC jq paths
  if (name === 'freeze-report.json') {
    writeFileSync(resolve(D0603, name), payload, 'utf8');
  }
}

function evidenceR2H04(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_R2_H04, { recursive: true });
  mkdirSync(EVIDENCE_SPRINT, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(resolve(EVIDENCE_R2_H04, name), payload, 'utf8');
  writeFileSync(resolve(EVIDENCE_SPRINT, name), payload, 'utf8');
}

function holo(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync('bun', ['services/platform/src/cli/holo.ts', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 180_000,
    env: process.env,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * Static RED control: pre-fix ordering at convex-fence-client.ts:199 stamped
 * fence_armed_at = Date.now() BEFORE env set. Post-fix source must not reintroduce
 * that pattern inside runCutoverFreeze.
 */
function sourceHasPreFixArmBeforeSetOrdering(): boolean {
  const src = readFileSync(
    resolve(process.cwd(), 'services/platform/src/cutover/convex-fence-client.ts'),
    'utf8'
  );
  // Extract runCutoverFreeze body roughly
  const start = src.indexOf('export async function runCutoverFreeze');
  if (start < 0) return true; // missing = fail closed as pre-fix-like
  const next = src.indexOf('export async function', start + 10);
  const body = src.slice(start, next > 0 ? next : undefined);
  // Pre-fix pattern: fence_armed_at = Date.now() appears before convexEnv('set'...
  const armIdx = body.search(/fence_armed_at\s*=\s*Date\.now\s*\(/);
  const setIdx = body.search(/convexEnv\s*\(\s*['"]set['"]/);
  if (armIdx < 0 || setIdx < 0) {
    // Missing arm stamp after set is also wrong for green; treat as pre-fix only if arm precedes set
    return armIdx >= 0 && (setIdx < 0 || armIdx < setIdx);
  }
  return armIdx < setIdx;
}

/**
 * H-04 RED control: pre-fix :341-382 fell back to in-process mutation with
 * child_pid:null and still returned rejected:true on fence rejection.
 */
function sourceHasInProcessProbeFallbackSuccessPath(): boolean {
  const src = readFileSync(
    resolve(process.cwd(), 'services/platform/src/cutover/convex-fence-client.ts'),
    'utf8'
  );
  const start = src.indexOf('export async function runCrossProcessBlockedWriteProbe');
  if (start < 0) return true;
  const next = src.indexOf('export async function', start + 10);
  const body = src.slice(start, next > 0 ? next : undefined);
  // Forbidden success-path markers from reviewed SHA cab5c071
  return (
    body.includes('s29-h05-xproc-fallback-') ||
    /Fallback:\s*in-process real mutation/.test(body) ||
    (/child_pid:\s*null/.test(body) && /client\.mutation\s*\(\s*docsCreate/.test(body))
  );
}

/**
 * H-04 RED control: pre-fix :442-465 armed after rejected only — no child_pid gate.
 */
function sourceRequiresChildPidBeforeArm(): boolean {
  const src = readFileSync(
    resolve(process.cwd(), 'services/platform/src/cutover/convex-fence-client.ts'),
    'utf8'
  );
  const start = src.indexOf('export async function runCutoverFreeze');
  if (start < 0) return false;
  const next = src.indexOf('export async function', start + 10);
  const body = src.slice(start, next > 0 ? next : undefined);
  const armIdx = body.search(/fence_armed_at\s*=\s*Date\.now\s*\(/);
  if (armIdx < 0) return false;
  const beforeArm = body.slice(0, armIdx);
  return (
    /child_pid/.test(beforeArm) &&
    /typeof\s+cross_process_probe\.child_pid\s*(?:===|!==)\s*['"]number['"]/.test(beforeArm)
  );
}

describe('REDHAT-FIX-S29-H05 fence arm-after-confirm ordering', () => {
  beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(D0603, { recursive: true });
    // Start unfenced so freeze must do real set+confirm
    const prior = getMigrationReadOnlyEnv();
    if (isFenceArmedEnv(prior)) {
      spawnSync('npx', ['convex', 'env', 'unset', 'HOLO_MIGRATION_READ_ONLY'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 90_000,
      });
    }
    await waitForMigrationReadOnlyRuntime({ expected: false });
  }, 120_000);

  it('TC-7 RED: source must not reintroduce pre-fix arm-before-set ordering at :199-237', () => {
    const preFix = sourceHasPreFixArmBeforeSetOrdering();
    evidence('tc7-source-arm-order.json', {
      pre_fix_arm_before_set: preFix,
      note: 'GREEN requires pre_fix_arm_before_set === false',
    });
    // RED against unfixed SHA would have preFix===true and this expect fails
    expect(preFix, 'pre-fix arm-before-set ordering still present in runCutoverFreeze').toBe(false);
  });

  it("AC-1 arm-after-confirm: fence_armed_at only after confirmed env=='1'", async () => {
    const freezeReport = await runCutoverFreeze({
      reason: 's29-h05 arm-after-confirm',
      reportPath: resolve(D0603, 'freeze-report.json'),
    });
    evidence('freeze-report.json', freezeReport);
    evidence('ac-1-arm-after-confirm.json', freezeReport);

    expect(freezeReport.ok).toBe(true);
    expect(freezeReport.confirmed_at_ms).toBeGreaterThan(0);
    expect(freezeReport.fence_armed_at).toBeGreaterThanOrEqual(freezeReport.confirmed_at_ms);

    const env = getMigrationReadOnlyEnv();
    evidence('ac-1-env.json', { env });
    expect(isFenceArmedEnv(env) || freezeReport.env_value === '1').toBe(true);

    // CLI JSON path
    const cli = holo([
      'cutover:freeze',
      '--reason',
      's29-h05',
      '--json',
      '--output',
      resolve(EVIDENCE, 'freeze-report-cli.json'),
    ]);
    evidence('ac-1-cli-freeze.json', cli);
    expect(cli.status).toBe(0);
    const parsed = JSON.parse(cli.stdout) as {
      ok: boolean;
      confirmed_at_ms: number;
      fence_armed_at: number;
      cross_process_probe: { rejected: boolean };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.confirmed_at_ms).toBeGreaterThan(0);
    expect(parsed.fence_armed_at).toBeGreaterThanOrEqual(parsed.confirmed_at_ms);
  }, 300_000);

  it('AC-2 cross-process-blocked-write: probe rejects with migration_read_only: before arm', async () => {
    // Freeze (idempotent re-arm) must include cross_process_probe
    const freezeReport = await runCutoverFreeze({
      reason: 's29-h05 cross-process-blocked-write',
      reportPath: resolve(D0603, 'freeze-report.json'),
    });
    evidence('freeze-report.json', freezeReport);
    evidence('ac-2-cross-process-probe.json', freezeReport.cross_process_probe);

    expect(freezeReport.cross_process_probe).toBeTruthy();
    expect(freezeReport.cross_process_probe.rejected).toBe(true);
    expect(freezeReport.cross_process_probe.message.startsWith('migration_read_only:')).toBe(true);
    // H-04 / AC-3: successful arm requires real OS child identity (not in-process fallback)
    expect(typeof freezeReport.cross_process_probe.child_pid).toBe('number');
    expect(freezeReport.cross_process_probe.child_pid).toBeGreaterThan(0);
    if (
      freezeReport.cross_process_probe.documentsBefore >= 0 &&
      freezeReport.cross_process_probe.documentsAfter >= 0
    ) {
      expect(freezeReport.cross_process_probe.documentsAfter).toBe(
        freezeReport.cross_process_probe.documentsBefore
      );
    }
    // Arm after probe: fence_armed_at >= confirmed_at_ms (probe sits between)
    expect(freezeReport.fence_armed_at).toBeGreaterThanOrEqual(freezeReport.confirmed_at_ms);
  }, 300_000);

  it('AC-5 baseline-after-confirmed-arm: capturedAtMs > fence_armed_at >= confirmed_at_ms', async () => {
    // Ensure fence armed with post-confirmation timestamps
    const freezeReport = await runCutoverFreeze({
      reason: 's29-h05 baseline-after-confirmed-arm',
      reportPath: resolve(D0603, 'freeze-report.json'),
    });
    evidence('freeze-report.json', freezeReport);

    expect(freezeReport.fence_armed_at).toBeGreaterThanOrEqual(freezeReport.confirmed_at_ms);

    // Seed public article: temporarily unset, publish, re-arm with confirmed order
    const client = createCutoverConvexClient();
    spawnSync('npx', ['convex', 'env', 'unset', 'HOLO_MIGRATION_READ_ONLY'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 90_000,
    });
    await waitForMigrationReadOnlyRuntime({ expected: false, client });

    let shareToken: string | null = null;
    try {
      const id = await client.mutation(api.documents.mutations.create, {
        title: `s29-h05-baseline-${Date.now()}`,
        content: '# H-05 baseline\n\nPost-confirmation arm ordering proof.',
        category: 'general',
        embedding: [0, 0, 0],
      });
      const pub = await client.mutation(api.documents.mutations.publishDocument, { id });
      shareToken =
        pub && typeof pub === 'object' && 'shareToken' in pub
          ? String((pub as { shareToken: string }).shareToken)
          : null;
    } catch (err) {
      evidence('ac-5-seed-error.json', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const rearm = await runCutoverFreeze({
      reason: 's29-h05 re-arm after baseline seed',
      reportPath: resolve(D0603, 'freeze-report.json'),
    });
    evidence('freeze-report.json', rearm);
    await new Promise((r) => setTimeout(r, 50));

    expect(shareToken).toBeTruthy();
    const baseline = await captureArticleBaseline({
      token: shareToken!,
      outputPath: resolve(EVIDENCE, 'article-baseline.json'),
      freezeReportPath: resolve(D0603, 'freeze-report.json'),
    });
    evidence('article-baseline.json', baseline);
    evidence('ac-5-baseline-ordering.json', {
      baseline,
      fence_armed_at: rearm.fence_armed_at,
      confirmed_at_ms: rearm.confirmed_at_ms,
    });

    expect(baseline.ok, JSON.stringify(baseline)).toBe(true);
    if (baseline.ok) {
      expect(rearm.fence_armed_at).toBeGreaterThanOrEqual(rearm.confirmed_at_ms);
      expect(baseline.capturedAtMs).toBeGreaterThan(rearm.fence_armed_at);
      expect(baseline.capturedAtMs).toBeGreaterThan(baseline.fence_armed_at);
    }

    // Audit latest should match post-confirmation arm when present
    try {
      const latestFenceArmed = anyApi.migrationFence?.audit?.latestFenceArmed;
      if (latestFenceArmed) {
        const latest = (await client.query(latestFenceArmed, {})) as {
          fenceArmedAtMs?: number;
        } | null;
        evidence('ac-5-audit-latest.json', latest);
        if (latest && typeof latest.fenceArmedAtMs === 'number') {
          expect(latest.fenceArmedAtMs).toBe(rearm.fence_armed_at);
        }
      }
    } catch {
      // audit module optional
    }
  }, 360_000);
});

describe('REDHAT-FIX-S29-R2-H04 cross-process probe fail-closed (no in-process arm fallback)', () => {
  beforeAll(() => {
    mkdirSync(EVIDENCE_R2_H04, { recursive: true });
    mkdirSync(EVIDENCE_SPRINT, { recursive: true });
  });

  it('r2-h04 RED static: source must not reintroduce in-process probe success fallback', () => {
    const hasFallback = sourceHasInProcessProbeFallbackSuccessPath();
    const requiresChildPid = sourceRequiresChildPidBeforeArm();
    evidenceR2H04('r2-h04-source-gate.json', {
      has_inprocess_probe_fallback_success_path: hasFallback,
      requires_child_pid_before_arm: requiresChildPid,
      note: 'GREEN requires has_fallback===false && requires_child_pid===true',
    });
    expect(hasFallback, 'pre-fix in-process probe fallback still present (:341-382)').toBe(false);
    expect(requiresChildPid, 'runCutoverFreeze must gate arm on child_pid number').toBe(true);
  });

  it('cross-process-probe-fail-closed-no-inprocess-fallback: unparseable child fails closed', async () => {
    // Real OS spawn; mutant eval emits non-JSON so parse cannot yield rejected boolean.
    // Pre-fix fell back to in-process mutation (child_pid:null) and could return rejected:true.
    const probe = await runCrossProcessBlockedWriteProbe({
      childEvalScript: 'console.log("r2-h04-unparseable-not-json");',
    });
    evidenceR2H04('r2-h04-ac1-unparseable-probe.json', probe);

    expect(probe.rejected, 'unparseable child must fail closed (rejected===false)').toBe(false);
    expect(
      /cross_process_probe_fail_closed|unparseable|spawn/i.test(probe.message),
      `expected fail-closed diagnostic, got ${probe.message}`
    ).toBe(true);
    // child_pid may be null or a spawn pid, but rejected must never green via in-process
    expect(probe.message).not.toMatch(/^migration_read_only:/);
  }, 120_000);

  it('freeze-refuses-arm-when-cross-process-probe-fails: no fence_armed_at on unparseable child', async () => {
    // Ensure env can confirm, then force probe parse failure so arm must refuse.
    const prior = getMigrationReadOnlyEnv();
    if (isFenceArmedEnv(prior)) {
      spawnSync('npx', ['convex', 'env', 'unset', 'HOLO_MIGRATION_READ_ONLY'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 90_000,
      });
    }
    await waitForMigrationReadOnlyRuntime({ expected: false });

    const refusePath = resolve(EVIDENCE_R2_H04, 'freeze-report-must-not-arm.json');
    if (existsSync(refusePath)) {
      unlinkSync(refusePath);
    }

    let threw = false;
    let errMsg = '';
    try {
      await runCutoverFreeze({
        reason: 's29-r2-h04-probe-fail',
        reportPath: refusePath,
        probe: {
          childEvalScript: 'console.log("r2-h04-force-unparseable");',
        },
      });
    } catch (err) {
      threw = true;
      errMsg = err instanceof Error ? err.message : String(err);
    }
    evidenceR2H04('r2-h04-ac2-freeze-refuse.json', {
      threw,
      errMsg,
      ok: false,
      report_exists_after: existsSync(refusePath),
    });

    expect(threw, 'freeze must throw FAIL CLOSED when probe fails').toBe(true);
    expect(errMsg).toMatch(/FAIL CLOSED|cross-process probe/i);
    // Must not persist success freeze-report with authoritative arm
    if (existsSync(refusePath)) {
      const raw = readFileSync(refusePath, 'utf8');
      const parsed = JSON.parse(raw) as { ok?: boolean; fence_armed_at?: number };
      expect(parsed.ok, 'refuse path must not be ok:true after probe fail').not.toBe(true);
    }
  }, 300_000);

  it('r2-h04 child_pid: successful arm requires non-null child_pid number', async () => {
    const freezeReport = await runCutoverFreeze({
      reason: 's29-r2-h04',
      reportPath: resolve(EVIDENCE_R2_H04, 'freeze-report.json'),
    });
    evidenceR2H04('freeze-report.json', freezeReport);
    evidenceR2H04('r2-h04-ac3-child-pid.json', freezeReport.cross_process_probe);

    expect(freezeReport.ok).toBe(true);
    expect(freezeReport.cross_process_probe.rejected).toBe(true);
    expect(freezeReport.cross_process_probe.message.startsWith('migration_read_only:')).toBe(true);
    expect(typeof freezeReport.cross_process_probe.child_pid).toBe('number');
    expect(freezeReport.cross_process_probe.child_pid).toBeGreaterThan(0);
    expect(freezeReport.fence_armed_at).toBeGreaterThanOrEqual(freezeReport.confirmed_at_ms);
  }, 300_000);
});
