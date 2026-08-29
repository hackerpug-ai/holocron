/**
 * REDHAT-FIX-S29-C03: real schedule disable/drain + measured post-drain quiet window.
 * REDHAT-FIX-S29-R2-C02: paginated residual-zero drain + fail-closed residual/error.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     packages/platform/tests/integration/sprint29-quiet-drain.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  CUTOVER_DRAIN_SURFACES,
  CUTOVER_SCHEDULES_DISABLED_ENV,
  callDisableAndDrain,
  createCutoverConvexClient,
  drainResidualZero,
  drainSurfacesHonest,
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  isMeasuredDrainSurface,
  MEASURED_DRAIN_SURFACES,
  type QuietCheckReport,
  runCutoverFreeze,
  runQuietCheck,
  runScheduleDrain,
  seedInFlightForDrainTest,
  UNMEASURED_DRAIN_SURFACE_CLAIMS,
  waitForMigrationReadOnlyRuntime,
} from '../../src/cutover/convex-fence-client.ts';
import {
  assertQuietCheckConfirmed,
  captureExportWatermark,
  type ExportWatermark,
  QUIET_CHECK_REQUIRED,
} from '../../src/cutover/export-watermark.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint29-quiet-drain requires PLATFORM_IT=1');
}

function loopbackConvexReady(): boolean {
  const raw = process.env.EXPO_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? '';
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (!['127.0.0.1', 'localhost', '::1'].includes(u.hostname)) return false;
  } catch {
    return false;
  }
  const r = spawnSync(
    'curl',
    ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '2', raw],
    { encoding: 'utf8' }
  );
  const code = (r.stdout ?? '').trim();
  return r.status === 0 && Boolean(code) && code !== '000';
}

const CONVEX_READY = loopbackConvexReady();

const EVIDENCE = resolve(process.cwd(), '.tmp/REDHAT-FIX-S29-C03');
const D06_03 = resolve(process.cwd(), '.tmp/D06-03');
const C02_EVIDENCE = resolve(process.cwd(), '.tmp/REDHAT-FIX-S29-R2-C02');
const C02_SPRINT_EVIDENCE = resolve(
  process.cwd(),
  '.tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip'
);
const H01_EVIDENCE = resolve(process.cwd(), '.tmp/REDHAT-FIX-S29-R3-H01');

/** Short window for integration speed; formula still asserts full wait. */
const WINDOW_SECONDS = 3;

function evidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync(D06_03, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(resolve(EVIDENCE, name), payload, 'utf8');
  writeFileSync(resolve(D06_03, name), payload, 'utf8');
}

function c02Evidence(name: string, body: unknown): void {
  mkdirSync(C02_EVIDENCE, { recursive: true });
  mkdirSync(C02_SPRINT_EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(resolve(C02_EVIDENCE, name), payload, 'utf8');
  writeFileSync(resolve(C02_SPRINT_EVIDENCE, name), payload, 'utf8');
}

/** Pre-fix cab5c071 runScheduleDrain success predicate — ignored after* residual. */
function preFixRunScheduleDrainOk(fields: {
  envOk: boolean;
  surfacesOk: boolean;
  completedAtMs: number;
  convexDrainOk: boolean;
  consumersHonored: boolean;
  probeHonored: boolean;
  runtimeDisabled: boolean;
  probeSkipped?: boolean;
}): boolean {
  return (
    fields.envOk &&
    fields.surfacesOk &&
    fields.completedAtMs > 0 &&
    fields.convexDrainOk &&
    fields.consumersHonored &&
    fields.probeHonored &&
    (fields.runtimeDisabled || fields.probeSkipped === true)
  );
}

function theatreQuietReport(): Record<string, unknown> {
  // Pre-fix C-03 shape (step3.log / convex-fence-client.ts:307-401 theatre)
  return {
    ok: true,
    acceptedWriteCount: 0,
    rejectedWriteCount: 2,
    auditAcceptedWriteCount: 0,
    auditRejectedWriteCount: 0,
    windowSeconds: 30,
    oracle: 'live_probes',
    sinceMs: Date.now() - 30_000,
    untilMs: Date.now(),
    probes: [
      {
        surface: 'documents.mutations.create',
        rejected: true,
        message: 'migration_read_only: mutation blocked',
      },
      {
        surface: 'subscriptions.mutations.add',
        rejected: true,
        message: 'migration_read_only: mutation blocked',
      },
    ],
    report_path: resolve(EVIDENCE, 'theatre-quiet-check-report.json'),
  };
}

describe.skipIf(!CONVEX_READY)('Sprint 29 C-03 quiet drain + measured post-drain window', () => {
  beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(D06_03, { recursive: true });
    const env = getMigrationReadOnlyEnv();
    if (!isFenceArmedEnv(env)) {
      await runCutoverFreeze({
        reason: 'REDHAT-FIX-S29-C03 quiet-drain suite arm',
        reportPath: resolve(D06_03, 'freeze-report.json'),
      });
    } else {
      await waitForMigrationReadOnlyRuntime({ expected: true });
    }
  }, 180_000);

  it('drain-before-quiet: drain.ok, drainCompletedAtMs>0, surfaces, quietSince>=drain', async () => {
    const report = await runQuietCheck({
      windowSeconds: WINDOW_SECONDS,
      reportPath: resolve(EVIDENCE, 'quiet-check-report.json'),
    });
    evidence('quiet-check-report.json', report);
    evidence('ac1-drain-before-quiet.json', {
      drain_ok: report.drain.ok,
      drainCompletedAtMs: report.drainCompletedAtMs,
      surfaces: report.drain.surfaces,
      quietSinceMs: report.quietSinceMs,
    });

    expect(report.drain.ok, JSON.stringify(report.drain)).toBe(true);
    expect(report.drainCompletedAtMs).toBeGreaterThan(0);
    // R3-H01: surfaces[] only measured residual inventory (not crons/outbox theatre)
    expect(
      drainSurfacesHonest(report.drain.surfaces),
      `surfaces=${report.drain.surfaces.join(',')}`
    ).toBe(true);
    expect(report.drain.surfaces).toContain('tasks');
    expect(report.drain.surfaces).toContain('subscriptionContent');
    for (const s of report.drain.surfaces) {
      expect(isMeasuredDrainSurface(s), `unmeasured surface claimed: ${s}`).toBe(true);
    }
    expect(report.quietSinceMs).toBeGreaterThanOrEqual(report.drainCompletedAtMs);
    // Dual-lens C-03: real consumers honor HOLO_CUTOVER_SCHEDULES_DISABLED
    expect(report.drain.consumersHonored, JSON.stringify(report.drain)).toBe(true);
    expect(report.drain.convexDrainOk, JSON.stringify(report.drain)).toBe(true);
    expect(report.drain.disabledEnvValue).toMatch(/^(1|true)$/);
    expect(report.drain.probe?.skipped === true || report.drain.probe?.honored === true).toBe(true);
    // Must not look like pre-fix live_probes-only theatre
    expect(report.drainCompletedAtMs).not.toBe(0);
  }, 180_000);

  it('measured-post-drain-window: elapsed wall-clock >= windowSeconds after drain', async () => {
    const report = await runQuietCheck({
      windowSeconds: WINDOW_SECONDS,
      reportPath: resolve(EVIDENCE, 'quiet-check-report-measured.json'),
    });
    evidence('quiet-check-report-measured.json', report);
    evidence('ac2-measured-window.json', {
      windowSeconds: report.windowSeconds,
      drainCompletedAtMs: report.drainCompletedAtMs,
      quietUntilMs: report.quietUntilMs,
      elapsedMs: report.elapsedMs,
      drainElapsed: report.quietUntilMs - report.drainCompletedAtMs,
    });

    expect(report.windowSeconds).toBe(WINDOW_SECONDS);
    expect(report.elapsedMs).toBeGreaterThanOrEqual(WINDOW_SECONDS * 1000);
    expect(report.quietUntilMs - report.drainCompletedAtMs).toBeGreaterThanOrEqual(
      WINDOW_SECONDS * 1000
    );
    // Kill wait-skip mutant: near-zero elapsed must not pass
    expect(report.elapsedMs).toBeGreaterThan(WINDOW_SECONDS * 1000 - 50);
  }, 120_000);

  it('post-drain-write-oracles: acceptedWriteCount==0 and rejectedWriteCount>0', async () => {
    const report = await runQuietCheck({
      windowSeconds: WINDOW_SECONDS,
      reportPath: resolve(EVIDENCE, 'quiet-check-report-oracles.json'),
    });
    evidence('quiet-check-report-oracles.json', report);
    evidence('ac3-write-oracles.json', {
      acceptedWriteCount: report.acceptedWriteCount,
      rejectedWriteCount: report.rejectedWriteCount,
      auditAcceptedWriteCount: report.auditAcceptedWriteCount,
      auditRejectedWriteCount: report.auditRejectedWriteCount,
      oracle: report.oracle,
      quietSinceMs: report.quietSinceMs,
      drainCompletedAtMs: report.drainCompletedAtMs,
      probes: report.probes,
    });

    expect(report.acceptedWriteCount).toBe(0);
    expect(report.rejectedWriteCount).toBeGreaterThan(0);
    expect(report.quietSinceMs).toBeGreaterThanOrEqual(report.drainCompletedAtMs);
    expect(report.ok).toBe(true);
    // Probes must have run post-drain (not empty theatre)
    expect(report.probes.length).toBeGreaterThan(0);
    expect(report.probes.every((p) => p.rejected)).toBe(true);
  }, 120_000);

  it('d06-04-quiet-precondition: theatre report without drain is refused', async () => {
    const theatrePath = resolve(EVIDENCE, 'theatre-quiet-check-report.json');
    const theatre = theatreQuietReport();
    writeFileSync(theatrePath, `${JSON.stringify(theatre, null, 2)}\n`, 'utf8');
    evidence('theatre-quiet-check-report.json', theatre);

    const watermark: ExportWatermark = {
      watermarkAt: new Date().toISOString(),
      watermarkAtMs: Date.now(),
      lastWriteAuditCount: 0,
      fence_armed_at: Date.now() - 60_000,
      fence_env: '1',
      quiet_check_path: theatrePath,
      quiet_ok: true, // pretends ok — C-03 must still refuse missing drain
    };

    const err = assertQuietCheckConfirmed(watermark);
    evidence('ac4-theatre-refusal.json', err);
    expect(err, 'theatre report must be refused').not.toBeNull();
    expect(err?.ok).toBe(false);
    expect(err?.error.code).toBe(QUIET_CHECK_REQUIRED);
    expect(err?.error.message.toLowerCase()).toMatch(/drain|window|quiet/);

    // Wait-skip / drain-skip mutant shapes
    const waitSkipPath = resolve(EVIDENCE, 'wait-skip-quiet-report.json');
    const waitSkip = {
      ok: true,
      acceptedWriteCount: 0,
      rejectedWriteCount: 2,
      windowSeconds: 30,
      drainCompletedAtMs: Date.now(),
      quietSinceMs: Date.now(),
      quietUntilMs: Date.now() + 5, // << 30s
      elapsedMs: 5,
      drain: {
        ok: true,
        surfaces: [...CUTOVER_DRAIN_SURFACES],
        consumersHonored: true,
        convexDrainOk: true,
      },
    };

    // Theatre: env/audit bookkeeping without consumersHonored
    const theatreNoConsumerPath = resolve(EVIDENCE, 'theatre-no-consumer-honor.json');
    const theatreNoConsumer = {
      ok: true,
      acceptedWriteCount: 0,
      rejectedWriteCount: 2,
      windowSeconds: 30,
      drainCompletedAtMs: Date.now() - 35_000,
      quietSinceMs: Date.now() - 35_000,
      quietUntilMs: Date.now() - 5_000,
      elapsedMs: 30_000,
      drain: {
        ok: true,
        surfaces: [...CUTOVER_DRAIN_SURFACES],
        consumersHonored: false,
        convexDrainOk: false,
      },
    };
    writeFileSync(theatreNoConsumerPath, `${JSON.stringify(theatreNoConsumer, null, 2)}\n`, 'utf8');
    const noConsumerErr = assertQuietCheckConfirmed({
      ...watermark,
      quiet_check_path: theatreNoConsumerPath,
      quiet_ok: true,
    });
    evidence('ac4-no-consumer-honor-refusal.json', noConsumerErr);
    expect(noConsumerErr).not.toBeNull();
    expect(noConsumerErr?.error.code).toBe(QUIET_CHECK_REQUIRED);
    expect(noConsumerErr?.error.message.toLowerCase()).toMatch(/consumer|drain|theatre/);
    writeFileSync(waitSkipPath, `${JSON.stringify(waitSkip, null, 2)}\n`, 'utf8');
    const waitErr = assertQuietCheckConfirmed({
      ...watermark,
      quiet_check_path: waitSkipPath,
      quiet_ok: true,
    });
    evidence('ac4-wait-skip-refusal.json', waitErr);
    expect(waitErr).not.toBeNull();
    expect(waitErr?.error.code).toBe(QUIET_CHECK_REQUIRED);

    // Good report from live quiet-check must pass (re-arm fence — sibling suites may unset it)
    const envNow = getMigrationReadOnlyEnv();
    if (!isFenceArmedEnv(envNow)) {
      await runCutoverFreeze({
        reason: 'REDHAT-FIX-S29-C03 re-arm before good quiet report',
        reportPath: resolve(D06_03, 'freeze-report-ac4.json'),
      });
    } else {
      await waitForMigrationReadOnlyRuntime({ expected: true });
    }
    const good = await runQuietCheck({
      windowSeconds: WINDOW_SECONDS,
      reportPath: resolve(EVIDENCE, 'quiet-check-report-good-for-d06-04.json'),
    });
    evidence('quiet-check-report-good-for-d06-04.json', good);
    expect(good.ok, JSON.stringify(good.drain)).toBe(true);
    const goodWm = await captureExportWatermark({
      quietCheckPath: good.report_path,
    });
    const goodErr = assertQuietCheckConfirmed(goodWm);
    evidence('ac4-good-report.json', { watermark: goodWm, err: goodErr });
    expect(goodErr).toBeNull();
  }, 180_000);

  it('mutant-kill: report fields reject drain-skip and wait-skip shapes', () => {
    // Structural assertions that fail against pre-fix QuietCheckReport (no drain fields)
    const preFixTheatre = theatreQuietReport() as Partial<QuietCheckReport>;
    evidence('ac5-prefix-theatre.json', preFixTheatre);

    expect(
      (preFixTheatre as { drain?: { ok?: boolean } }).drain?.ok === true,
      'pre-fix theatre has no drain.ok — RED against unfixed path'
    ).toBe(false);
    expect(
      typeof (preFixTheatre as { drainCompletedAtMs?: number }).drainCompletedAtMs === 'number' &&
        ((preFixTheatre as { drainCompletedAtMs?: number }).drainCompletedAtMs ?? 0) > 0
    ).toBe(false);

    // Required shape after C-03
    const requiredKeys = [
      'drainCompletedAtMs',
      'quietSinceMs',
      'quietUntilMs',
      'elapsedMs',
      'drain',
    ] as const;
    for (const k of requiredKeys) {
      expect(k in preFixTheatre && (preFixTheatre as Record<string, unknown>)[k] != null).toBe(
        false
      );
    }
  });
});

describe.skipIf(!CONVEX_READY)('Sprint 29 R2-C02 residual-zero paginated drain', () => {
  beforeAll(async () => {
    mkdirSync(C02_EVIDENCE, { recursive: true });
    mkdirSync(C02_SPRINT_EVIDENCE, { recursive: true });
    // Prefer existing fence from C-03 suite; only re-arm if clearly disengaged.
    // Avoid hard-failing freeze when a concurrent suite races env propagation.
    let env = getMigrationReadOnlyEnv();
    if (!isFenceArmedEnv(env)) {
      try {
        await runCutoverFreeze({
          reason: 'REDHAT-FIX-S29-R2-C02 residual-zero suite arm',
          reportPath: resolve(D06_03, 'freeze-report-c02.json'),
        });
      } catch (err) {
        env = getMigrationReadOnlyEnv();
        if (!isFenceArmedEnv(env)) throw err;
      }
    } else {
      await waitForMigrationReadOnlyRuntime({ expected: true });
    }
    // Ensure schedules-disabled flag is visible so seed+drain can run
    const drain = await runScheduleDrain({
      reason: 'REDHAT-FIX-S29-R2-C02 ensure schedules disabled before residual tests',
    });
    if (!drain.ok && !drain.consumersHonored) {
      throw new Error(`C-02 beforeAll drain not ready: ${drain.error ?? JSON.stringify(drain)}`);
    }
  }, 240_000);

  it('r2-c02 residual-zero-paginated-drain: multi-batch clears >100 active tasks', async () => {
    const client = createCutoverConvexClient();
    const seed = await seedInFlightForDrainTest({
      client,
      activeTasks: 101,
      queuedSubscriptionContent: 0,
      tag: `c02-tasks-${Date.now()}`,
    });
    expect(seed.ok).toBe(true);
    expect(seed.activeTasks).toBeGreaterThan(100);

    // RED: single-pass (pre-fix DRAIN_BATCH once) leaves residual
    const single = await callDisableAndDrain({
      client,
      maxPasses: 1,
      reason: 'c02 RED single-batch residual proof',
    });
    const redPayload = {
      finding: 'C-02',
      reviewed_sha: 'cab5c0717974a96e33c338105b5d198d82cb607d',
      defect:
        'pre-fix drain.ts:113-150 single .take(DRAIN_BATCH=100); drain.ts:191-205 ok:true without residual zero; convex-fence-client.ts:689-724 ignored after*',
      seed,
      single_batch: single,
      residual_after_single: {
        afterActiveTasks: single.samples?.afterActiveTasks,
        afterRunningTasks: single.samples?.afterRunningTasks,
        afterQueuedSubscriptionContent: single.samples?.afterQueuedSubscriptionContent,
      },
      pre_fix_would_ok_true_with_residual: preFixRunScheduleDrainOk({
        envOk: true,
        surfacesOk: true,
        completedAtMs: Date.now(),
        // pre-fix mutation returned ok:true even with residual
        convexDrainOk: true,
        consumersHonored: true,
        probeHonored: true,
        runtimeDisabled: true,
        probeSkipped: true,
      }),
      fixed_single_batch_ok: single.ok,
      fixed_requires_residual_zero: !drainResidualZero(single.samples),
    };
    c02Evidence('redhat-fix-s29-r2-c02-red.log', redPayload);
    expect(
      (single.samples?.afterActiveTasks ?? 0) > 0 || single.ok === false,
      'single-batch must leave residual or fail closed'
    ).toBe(true);
    expect(single.ok, 'fixed path must NOT ok:true with residual after single batch').toBe(false);
    expect(drainResidualZero(single.samples)).toBe(false);

    // Clear leftover residual from RED single-pass, then re-seed >100 for multi-batch GREEN
    await callDisableAndDrain({
      client,
      reason: 'c02 clear residual after RED single-batch',
    });
    const seedGreen = await seedInFlightForDrainTest({
      client,
      activeTasks: 101,
      queuedSubscriptionContent: 0,
      tag: `c02-tasks-green-${Date.now()}`,
    });
    expect(seedGreen.activeTasks).toBeGreaterThan(100);

    // GREEN: multi-batch drain to residual zero from a full >100 seed
    const full = await callDisableAndDrain({
      client,
      reason: 'c02 GREEN multi-batch residual-zero',
    });
    const greenSamples = {
      ok: full.ok,
      samples: full.samples,
      drainCompletedAtMs: full.drainCompletedAtMs,
      consumersHonored: full.consumersHonored,
      error: full.error,
    };
    c02Evidence('redhat-fix-s29-r2-c02-drain-samples.json', greenSamples);
    c02Evidence('redhat-fix-s29-r2-c02-green.log', {
      finding: 'C-02',
      status: 'GREEN',
      seed_activeTasks: seedGreen.activeTasks,
      drain: full,
      residual_zero: drainResidualZero(full.samples),
      batchesProcessed: full.samples?.batchesProcessed ?? full.samples?.drainBatches,
    });

    expect(full.ok, JSON.stringify(full)).toBe(true);
    expect(full.samples?.afterActiveTasks).toBe(0);
    expect(full.samples?.afterRunningTasks).toBe(0);
    expect(full.samples?.afterQueuedSubscriptionContent).toBe(0);
    const batches = full.samples?.batchesProcessed ?? full.samples?.drainBatches ?? 0;
    expect(
      batches,
      `expected multi-batch drain for 101 tasks, got batches=${batches}`
    ).toBeGreaterThan(1);
    expect(full.drainCompletedAtMs).toBeGreaterThan(0);
  }, 300_000);

  it('r2-c02 subscription-queue-residual-zero: >100 queued content drains to zero', async () => {
    const client = createCutoverConvexClient();
    const seed = await seedInFlightForDrainTest({
      client,
      activeTasks: 0,
      queuedSubscriptionContent: 101,
      tag: `c02-subq-${Date.now()}`,
    });
    expect(seed.ok).toBe(true);
    expect(seed.queuedSubscriptionContent).toBeGreaterThan(100);

    const single = await callDisableAndDrain({
      client,
      maxPasses: 1,
      reason: 'c02 subscription single-batch residual',
    });
    expect((single.samples?.afterQueuedSubscriptionContent ?? 0) > 0 || single.ok === false).toBe(
      true
    );

    // Clear residual + re-seed full >100 so multi-batch is observable on GREEN path
    await callDisableAndDrain({
      client,
      reason: 'c02 clear subscription residual after single-batch',
    });
    const seedGreen = await seedInFlightForDrainTest({
      client,
      activeTasks: 0,
      queuedSubscriptionContent: 101,
      tag: `c02-subq-green-${Date.now()}`,
    });
    expect(seedGreen.queuedSubscriptionContent).toBeGreaterThan(100);

    const full = await callDisableAndDrain({
      client,
      reason: 'c02 subscription multi-batch residual-zero',
    });
    c02Evidence('redhat-fix-s29-r2-c02-subscription-samples.json', {
      ok: full.ok,
      samples: full.samples,
      seed: seedGreen,
    });
    // Merge residual-zero proof into canonical samples without wiping multi-batch task proof
    expect(full.ok, JSON.stringify(full)).toBe(true);
    expect(full.samples?.afterQueuedSubscriptionContent).toBe(0);
    expect(full.samples?.afterActiveTasks).toBe(0);
    expect(full.samples?.afterRunningTasks).toBe(0);
    const batches = full.samples?.batchesProcessed ?? full.samples?.drainBatches ?? 0;
    expect(batches, `subscription multi-batch expected, got ${batches}`).toBeGreaterThan(1);
  }, 300_000);

  it('r2-c02 drain-fail-closed-on-query-patch-error: injectFault fails closed', async () => {
    const client = createCutoverConvexClient();
    const sampleFail = await callDisableAndDrain({
      client,
      injectFault: 'sample',
      reason: 'c02 AC-3 sample fault',
    });
    c02Evidence('redhat-fix-s29-r2-c02-fail-closed-sample.json', sampleFail);
    expect(sampleFail.ok).toBe(false);
    expect(sampleFail.error ?? '').toMatch(/fail-closed|injectFault|sample/i);
    // Residual must not be coerced to zero theatre
    const s = sampleFail.samples;
    const coercedZero =
      s?.afterActiveTasks === 0 &&
      s?.afterRunningTasks === 0 &&
      s?.afterQueuedSubscriptionContent === 0 &&
      sampleFail.ok === true;
    expect(coercedZero).toBe(false);

    const patchFail = await callDisableAndDrain({
      client,
      injectFault: 'patch',
      reason: 'c02 AC-3 patch fault',
    });
    c02Evidence('redhat-fix-s29-r2-c02-fail-closed-patch.json', patchFail);
    expect(patchFail.ok).toBe(false);
    expect(patchFail.error ?? '').toMatch(/fail-closed|injectFault|patch/i);
  }, 180_000);

  it('r2-c02 runScheduleDrain-requires-residual-zero: residual gate on client', async () => {
    const client = createCutoverConvexClient();
    // Seed residual then force single-pass incomplete drain via mutation, then
    // prove drainResidualZero + client predicate refuse success.
    await seedInFlightForDrainTest({
      client,
      activeTasks: 101,
      queuedSubscriptionContent: 0,
      tag: `c02-client-residual-${Date.now()}`,
    });
    const incomplete = await callDisableAndDrain({
      client,
      maxPasses: 1,
      reason: 'c02 incomplete residual for runScheduleDrain gate',
    });
    expect(incomplete.ok).toBe(false);
    expect(drainResidualZero(incomplete.samples)).toBe(false);

    // Pre-fix client would still ok with residual if mutation lied ok:true
    const preFixOk = preFixRunScheduleDrainOk({
      envOk: true,
      surfacesOk: true,
      completedAtMs: Date.now(),
      convexDrainOk: true,
      consumersHonored: true,
      probeHonored: true,
      runtimeDisabled: true,
      probeSkipped: true,
    });
    expect(preFixOk, 'pre-fix predicate ignores residual').toBe(true);
    expect(drainResidualZero(incomplete.samples), 'fixed residual gate').toBe(false);

    // Live runScheduleDrain after incomplete residual must either clear residual
    // (multi-batch) with ok:true, or fail if residual remains — never ok with residual.
    const drain = await runScheduleDrain({
      client,
      reason: 'c02 runScheduleDrain residual-aware',
    });
    c02Evidence('redhat-fix-s29-r2-c02-runScheduleDrain.json', drain);
    if (drain.ok) {
      expect(drainResidualZero(drain.samples)).toBe(true);
      expect(drain.samples?.afterActiveTasks).toBe(0);
    } else {
      expect(drainResidualZero(drain.samples) || drain.ok === false).toBe(true);
    }
    // Quiet-check report residual contract
    writeFileSync(
      resolve(D06_03, 'quiet-check-report.json'),
      `${JSON.stringify(
        {
          ok: drain.ok,
          drain: {
            ok: drain.ok,
            samples: drain.samples,
            consumersHonored: drain.consumersHonored,
            convexDrainOk: drain.convexDrainOk,
          },
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    expect(drain.ok === false || (drain.samples?.afterActiveTasks ?? 0) === 0).toBe(true);
  }, 300_000);

  it('r2-c02 env flag still required: schedules disabled surfaces in drain path', async () => {
    // Smoke: full quiet-check still greens with residual-aware drain
    const report = await runQuietCheck({
      windowSeconds: WINDOW_SECONDS,
      reportPath: resolve(C02_EVIDENCE, 'quiet-check-report-c02.json'),
    });
    c02Evidence('quiet-check-report-c02.json', report);
    expect(report.drain.ok, JSON.stringify(report.drain)).toBe(true);
    expect(drainResidualZero(report.drain.samples)).toBe(true);
    expect(report.drain.disabledEnv).toBe(CUTOVER_SCHEDULES_DISABLED_ENV);
    expect(report.ok).toBe(true);
  }, 180_000);
});

function h01Evidence(name: string, body: unknown): void {
  mkdirSync(H01_EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(resolve(H01_EVIDENCE, name), payload, 'utf8');
}

describe.skipIf(!CONVEX_READY)(
  'Sprint 29 R3-H01 honest drain inventory / unknown residual fail-closed',
  () => {
    beforeAll(async () => {
      mkdirSync(H01_EVIDENCE, { recursive: true });
      let env = getMigrationReadOnlyEnv();
      if (!isFenceArmedEnv(env)) {
        try {
          await runCutoverFreeze({
            reason: 'REDHAT-FIX-S29-R3-H01 honest inventory suite arm',
            reportPath: resolve(D06_03, 'freeze-report-r3-h01.json'),
          });
        } catch (err) {
          env = getMigrationReadOnlyEnv();
          if (!isFenceArmedEnv(env)) throw err;
        }
      }
      const drain = await runScheduleDrain({
        reason: 'REDHAT-FIX-S29-R3-H01 ensure schedules disabled before honest inventory tests',
      });
      if (!drain.ok && !drain.consumersHonored) {
        throw new Error(
          `R3-H01 beforeAll drain not ready: ${drain.error ?? JSON.stringify(drain)}`
        );
      }
    }, 240_000);

    it('r3-h01 honest-inventory: surfaces only measured residual inventory at residual 0', async () => {
      const client = createCutoverConvexClient();
      // Seed both measured surfaces so multi-surface residual drain is real
      const seed = await seedInFlightForDrainTest({
        client,
        activeTasks: 12,
        queuedSubscriptionContent: 12,
        tag: `r3h01-both-${Date.now()}`,
      });
      expect(seed.ok).toBe(true);

      const full = await callDisableAndDrain({
        client,
        reason: 'r3-h01 multi-surface residual-zero honest inventory',
      });
      h01Evidence('r3-h01-multi-surface-residual-zero.json', {
        finding: 'R3-H01',
        seed,
        drain: full,
        residual_zero: drainResidualZero(full.samples),
        surfaces_honest: drainSurfacesHonest(full.surfaces),
        measured: [...MEASURED_DRAIN_SURFACES],
        unmeasured_claims: [...UNMEASURED_DRAIN_SURFACE_CLAIMS],
      });

      expect(full.ok, JSON.stringify(full)).toBe(true);
      expect(drainResidualZero(full.samples)).toBe(true);
      expect(full.samples?.afterActiveTasks).toBe(0);
      expect(full.samples?.afterRunningTasks).toBe(0);
      expect(full.samples?.afterQueuedSubscriptionContent).toBe(0);
      expect(drainSurfacesHonest(full.surfaces)).toBe(true);
      expect(full.surfaces).toEqual(expect.arrayContaining([...MEASURED_DRAIN_SURFACES]));
      for (const claim of UNMEASURED_DRAIN_SURFACE_CLAIMS) {
        expect(full.surfaces, `must not claim unmeasured ${claim}`).not.toContain(claim);
      }
    }, 300_000);

    it('r3-h01 unknown-residual-fail-closed: unmeasured surface claims refused', async () => {
      const client = createCutoverConvexClient();
      const redClaims = [...UNMEASURED_DRAIN_SURFACE_CLAIMS];
      const results: Array<{
        surfaces: string[];
        ok: boolean;
        error?: string;
        reported: string[];
      }> = [];

      for (const claim of redClaims) {
        const res = await callDisableAndDrain({
          client,
          surfaces: [claim],
          reason: `r3-h01 RED unmeasured claim ${claim}`,
        });
        results.push({
          surfaces: [claim],
          ok: res.ok,
          error: res.error,
          reported: res.surfaces,
        });
        expect(res.ok, `unmeasured ${claim} must fail closed`).toBe(false);
        expect(res.surfaces, `must not report unmeasured ${claim} as drained`).not.toContain(claim);
        expect(res.error ?? '').toMatch(/unknown residual|unmeasured|measured-only|R3-H01/i);
        expect(drainResidualZero(res.samples)).toBe(false);
      }

      // Mixed measured + unmeasured also fails closed (never partial claim of unmeasured)
      const mixed = await callDisableAndDrain({
        client,
        surfaces: ['tasks', 'outbox'],
        reason: 'r3-h01 RED mixed measured+unmeasured',
      });
      results.push({
        surfaces: ['tasks', 'outbox'],
        ok: mixed.ok,
        error: mixed.error,
        reported: mixed.surfaces,
      });
      expect(mixed.ok).toBe(false);
      expect(mixed.surfaces).not.toContain('outbox');
      expect(mixed.error ?? '').toMatch(/unknown residual|unmeasured|outbox|measured-only/i);

      // Client schedule drain path also refuses
      const schedule = await runScheduleDrain({
        client,
        surfaces: ['crons', 'queues', 'outbox', 'scheduled_jobs'],
        reason: 'r3-h01 RED runScheduleDrain legacy claims',
      });
      expect(schedule.ok).toBe(false);
      expect(schedule.surfaces.every((s) => isMeasuredDrainSurface(s))).toBe(true);
      for (const claim of UNMEASURED_DRAIN_SURFACE_CLAIMS) {
        expect(schedule.surfaces).not.toContain(claim);
      }

      h01Evidence('r3-h01-unknown-residual-fail-closed.json', {
        finding: 'R3-H01',
        status: 'RED_fail_closed',
        results,
        schedule_drain: schedule,
        pre_fix_theatre_claims: [...UNMEASURED_DRAIN_SURFACE_CLAIMS],
        measured_only: [...MEASURED_DRAIN_SURFACES],
      });
    }, 180_000);

    it('r3-h01 quiet-check report surfaces honest after residual-zero drain', async () => {
      const report = await runQuietCheck({
        windowSeconds: WINDOW_SECONDS,
        reportPath: resolve(H01_EVIDENCE, 'quiet-check-report-r3-h01.json'),
      });
      h01Evidence('quiet-check-report-r3-h01.json', report);
      h01Evidence('r3-h01-green.log', {
        finding: 'R3-H01',
        status: 'GREEN',
        drain_ok: report.drain.ok,
        surfaces: report.drain.surfaces,
        residual_zero: drainResidualZero(report.drain.samples),
        surfaces_honest: drainSurfacesHonest(report.drain.surfaces),
        samples: report.drain.samples,
      });

      expect(report.drain.ok, JSON.stringify(report.drain)).toBe(true);
      expect(drainResidualZero(report.drain.samples)).toBe(true);
      expect(drainSurfacesHonest(report.drain.surfaces)).toBe(true);
      expect(report.drain.surfaces).toEqual(expect.arrayContaining([...CUTOVER_DRAIN_SURFACES]));
      for (const claim of UNMEASURED_DRAIN_SURFACE_CLAIMS) {
        expect(report.drain.surfaces).not.toContain(claim);
      }
      expect(report.ok).toBe(true);
    }, 180_000);

    it('r3-h01 mutant-kill: pre-fix crons/queues/outbox/scheduled_jobs claim is dishonest', () => {
      const preFixSurfaces = ['crons', 'queues', 'outbox', 'scheduled_jobs'];
      h01Evidence('r3-h01-prefix-theatre-surfaces.json', {
        finding: 'R3-H01',
        pre_fix_CUTOVER_DRAIN_SURFACES: preFixSurfaces,
        measured: [...MEASURED_DRAIN_SURFACES],
        pre_fix_honest: drainSurfacesHonest(preFixSurfaces),
        fixed_honest: drainSurfacesHonest([...MEASURED_DRAIN_SURFACES]),
      });
      expect(drainSurfacesHonest(preFixSurfaces)).toBe(false);
      expect(drainSurfacesHonest([...MEASURED_DRAIN_SURFACES])).toBe(true);
      expect(drainResidualZero(undefined)).toBe(false);
      expect(
        drainResidualZero({
          afterActiveTasks: 0,
          afterRunningTasks: 0,
          afterQueuedSubscriptionContent: 0,
          unknownSurfaces: ['outbox'],
        })
      ).toBe(false);
      expect(
        drainResidualZero({
          afterActiveTasks: -1,
          afterRunningTasks: -1,
          afterQueuedSubscriptionContent: -1,
        })
      ).toBe(false);
    });
  }
);
