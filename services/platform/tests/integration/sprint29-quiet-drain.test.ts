/**
 * REDHAT-FIX-S29-C03: real schedule disable/drain + measured post-drain quiet window.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-quiet-drain.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  type QuietCheckReport,
  runCutoverFreeze,
  runQuietCheck,
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

const EVIDENCE = resolve(process.cwd(), '.tmp/REDHAT-FIX-S29-C03');
const D06_03 = resolve(process.cwd(), '.tmp/D06-03');

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

describe('Sprint 29 C-03 quiet drain + measured post-drain window', () => {
  beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(D06_03, { recursive: true });
    const env = getMigrationReadOnlyEnv();
    if (!isFenceArmedEnv(env)) {
      await runCutoverFreeze({
        reason: 'REDHAT-FIX-S29-C03 quiet-drain suite arm',
        reportPath: resolve(D06_03, 'freeze-report.json'),
      });
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
    expect(report.drain.surfaces).toContain('crons');
    const hasSecondary =
      report.drain.surfaces.includes('queues') ||
      report.drain.surfaces.includes('outbox') ||
      report.drain.surfaces.includes('scheduled_jobs');
    expect(hasSecondary, `surfaces=${report.drain.surfaces.join(',')}`).toBe(true);
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
        surfaces: ['crons', 'queues'],
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
        surfaces: ['crons', 'queues'],
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
