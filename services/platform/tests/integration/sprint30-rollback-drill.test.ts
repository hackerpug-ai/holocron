/**
 * D07-03 — rollback drill: Sev-1 trigger, five write surfaces, real
 * cutover:rollback-repoint CLI, independent zero-loss recompute (UC-SYNC-04).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint30-rollback-drill.test.ts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DRILL_FENCE_NOT_ARMED,
  type DrillReport,
  POST_EXPORT_WRITE_ACCEPTED,
  probeFiveWriteSurfaces,
  recomputeAcceptedPostExportWritesFromRawFile,
  runRollbackDrill,
} from '../../src/cutover/rollback-drill.ts';
import {
  TARGET_CONVEX_FROZEN,
  writePostExportWriteAudit,
} from '../../src/cutover/rollback-repoint.ts';
import {
  isMigrationReadOnly,
  writeDurableMigrationReadOnly,
} from '../../src/cutover/soak-fence.ts';
import {
  AUDIT_PATH,
  cleanupDefaultCutoverArtifacts,
  DEFAULT_KEYS,
  DISPOSABLE_SECRETS,
  holo,
  holoEnv,
  PLATFORM_IT,
  type PreexistingServing,
  REPO_ROOT,
  seedDisposableSecrets,
  seedEmptyPostExportAudit,
  seedExportWatermark,
  startPreexistingServing,
  WATERMARK_PATH,
  waitHealth,
  withCutoverSharedLock,
} from './sprint30-cutover-harness.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint30-rollback-drill requires PLATFORM_IT=1');
}

const D07_03 = resolve(REPO_ROOT, '.tmp/D07-03');
const EVIDENCE = resolve(D07_03, 'evidence');

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(resolve(EVIDENCE, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Fixture post_export_writes_n3 via file mirror + Postgres ledger (RH-S30-03). */
async function seedPostExportWritesN3(exportMs: number): Promise<void> {
  const writes = [
    {
      committed_at_ms: exportMs + 5_000,
      surface: 'hono.POST /api/documents',
      id: 'n3-doc-1',
    },
    {
      committed_at_ms: exportMs + 10_000,
      surface: 'mcp.store_document',
      id: 'n3-mcp-2',
    },
    {
      committed_at_ms: exportMs + 15_000,
      surface: 'mission.publish',
      id: 'n3-mission-3',
    },
  ];
  writePostExportWriteAudit(
    {
      export_watermark_ms: exportMs,
      accepted_writes: writes,
    },
    AUDIT_PATH
  );
  const { recordPostExportAcceptedWrite, clearPostExportWriteAuditLedger } = await import(
    '../../src/cutover/post-export-write-audit.ts'
  );
  const { resolveTestDatabaseUrl } = await import('./sprint30-cutover-harness.ts');
  try {
    await clearPostExportWriteAuditLedger({ databaseUrl: resolveTestDatabaseUrl() });
  } catch {
    /* table may be fresh */
  }
  for (const w of writes) {
    await recordPostExportAcceptedWrite({
      surface: w.surface,
      writeRowId: w.id,
      committedAtMs: w.committed_at_ms,
      exportWatermarkMs: exportMs,
      databaseUrl: resolveTestDatabaseUrl(),
      mirrorToFile: false,
    });
  }
}

function parseDrill(stdout: string): DrillReport {
  return JSON.parse(stdout) as DrillReport;
}

describe('D07-03 rollback drill (UC-SYNC-04 / T-SYNC-013)', () => {
  const priorSecrets = process.env.HOLO_SECRETS_PATH;
  const priorVerify = process.env.HOLO_VERIFY_BASE_URL;
  const priorSoak = process.env.HOLO_SOAK_BASE_URL;
  const priorPlatform = process.env.PLATFORM_URL;
  const priorVerifyPid = process.env.HOLO_VERIFY_PID;
  let liveServing: PreexistingServing | undefined;
  let exportMs = 0;

  beforeEach(() => {
    mkdirSync(D07_03, { recursive: true });
    mkdirSync(EVIDENCE, { recursive: true });
    seedDisposableSecrets({ readOnly: '1' });
    const wm = seedExportWatermark();
    exportMs = wm.exportMs;
    seedEmptyPostExportAudit(exportMs);
    cleanupDefaultCutoverArtifacts();
    seedEmptyPostExportAudit(exportMs);

    process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
    process.env.HOLOCRON_SECRETS_PATH = DISPOSABLE_SECRETS;
    delete process.env.HOLO_VERIFY_BASE_URL;
    delete process.env.HOLO_SOAK_BASE_URL;
    delete process.env.PLATFORM_URL;
    delete process.env.HOLO_VERIFY_PID;
    liveServing = undefined;
  });

  afterEach(async () => {
    if (liveServing) {
      await liveServing.stop();
      liveServing = undefined;
    }
    if (priorSecrets !== undefined) process.env.HOLO_SECRETS_PATH = priorSecrets;
    else delete process.env.HOLO_SECRETS_PATH;
    if (priorVerify !== undefined) process.env.HOLO_VERIFY_BASE_URL = priorVerify;
    else delete process.env.HOLO_VERIFY_BASE_URL;
    if (priorSoak !== undefined) process.env.HOLO_SOAK_BASE_URL = priorSoak;
    else delete process.env.HOLO_SOAK_BASE_URL;
    if (priorPlatform !== undefined) process.env.PLATFORM_URL = priorPlatform;
    else delete process.env.PLATFORM_URL;
    if (priorVerifyPid !== undefined) process.env.HOLO_VERIFY_PID = priorVerifyPid;
    else delete process.env.HOLO_VERIFY_PID;
    // AC-2-negative sets process fence env; never leak into later cases.
    delete process.env.HOLO_MIGRATION_READ_ONLY;
  });

  it('AC-1: Sev-1 trigger from real failing verify-tools against unreachable base URL', async () => {
    await withCutoverSharedLock(async () => {
      // Sev-1 is always derived from a real bind-then-close port inside the drill
      // (never a hand-set sevOne flag). Do NOT pass the dead URL as --base-url —
      // that flag is the live serving plane for probes/repoint.
      const env = holoEnv();
      // Clear any inherited live URLs so this case only proves the trigger phase.
      delete env.HOLO_VERIFY_BASE_URL;
      delete env.HOLO_SOAK_BASE_URL;
      delete env.PLATFORM_URL;
      delete env.HOLO_VERIFY_PID;

      const cli = holo(
        [
          'cutover:rollback-drill',
          '--json',
          '--etl-report',
          WATERMARK_PATH,
          '--output',
          resolve(D07_03, 'ac1-drill-report.json'),
        ],
        env
      );

      writeEvidence('ac1-sev1-trigger.json', {
        status: cli.status,
        stdout: cli.stdout,
        stderr: cli.stderr,
        triggerBaseUrl: (() => {
          try {
            return (JSON.parse(cli.stdout) as DrillReport).sevOneTrigger?.triggerBaseUrl;
          } catch {
            return null;
          }
        })(),
      });

      // May fail overall (no live serving) but MUST carry real sevOneTrigger
      expect(cli.stdout.length, `empty stdout: ${cli.stderr}`).toBeGreaterThan(10);
      const report = parseDrill(cli.stdout);

      expect(report.sevOneTrigger.gate).toBe('verify-tools');
      expect(report.sevOneTrigger.report.ok).toBe(false);
      expect(report.sevOneTrigger.report.toolsPassed).toBe(0);
      expect(report.sevOneTrigger.report.toolsTotal).toBeGreaterThan(0);
      expect(report.sevOneTrigger.declared).toBe(true);
      expect(report.sevOneTrigger.report.ok).not.toBe(true);
      expect(report.sevOneTrigger.report.toolsTotal).not.toBe(0);
      // Trigger URL must be a real allocated dead target (connection-refused class)
      expect(report.sevOneTrigger.triggerBaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    });
  }, 180_000);

  it('AC-2: five write surfaces blocked with migration_read_only while fenced', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      const health = await waitHealth(liveServing.baseUrl);
      expect(health.status).toBe(200);

      // Arm durable fence (server re-reads secrets; job/mission in-process use HOLO_SECRETS_PATH)
      writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });
      process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;

      const probes = await probeFiveWriteSurfaces({
        baseUrl: liveServing.baseUrl,
        rnKey: DEFAULT_KEYS.rn,
        mcpKey: DEFAULT_KEYS.mcp,
      });

      writeEvidence('ac2-five-surfaces-fenced.json', { probes, baseUrl: liveServing.baseUrl });

      expect(probes.app.status, `app body=${JSON.stringify(probes.app.body)}`).toBe(423);
      expect(probes.app.body.code).toBe('migration_read_only');
      expect(probes.mcp.rejected).toBe(true);
      expect(probes.upload.status).toBe(423);
      expect(probes.job.ok).toBe(false);
      expect(probes.job.error?.startsWith('migration_read_only:')).toBe(true);
      expect(probes.mission.rejected).toBe(true);
      expect(probes.app.status).not.toBe(200);
      expect(probes.job.ok).not.toBe(true);
      expect(probes.app.status).not.toBe(0);
      expect(probes.mcp.executed).toBe(true);
      expect(probes.upload.executed).toBe(true);
      expect(probes.job.executed).toBe(true);
      expect(probes.mission.executed).toBe(true);
    });
  }, 180_000);

  it('AC-2-negative: same five write probes succeed when fence is disarmed', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '0' });
      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);

      writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });
      process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
      process.env.HOLO_MIGRATION_READ_ONLY = '0';

      const probes = await probeFiveWriteSurfaces({
        baseUrl: liveServing.baseUrl,
        rnKey: DEFAULT_KEYS.rn,
        mcpKey: DEFAULT_KEYS.mcp,
      });

      writeEvidence('ac2-negative-disarmed.json', { probes, baseUrl: liveServing.baseUrl });

      expect(probes.app.status, `app body=${JSON.stringify(probes.app.body)}`).toBe(201);
      expect(probes.job.ok).toBe(true);
      expect(probes.mcp.rejected).toBe(false);
      expect(probes.app.status).not.toBe(423);
      expect(probes.app.status).not.toBe(0);
    });
  }, 180_000);

  it('AC-3: real rollback-repoint CLI exit 0 + independent recompute matches zero', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      const healthBefore = await waitHealth(liveServing.baseUrl);
      expect(healthBefore.status).toBe(200);

      const env = holoEnv(liveServing.baseUrl, liveServing.pid);
      const outPath = resolve(D07_03, 'ac3-drill-report.json');
      const cli = holo(
        ['cutover:rollback-drill', '--json', '--etl-report', WATERMARK_PATH, '--output', outPath],
        env
      );

      writeEvidence('ac3-zero-loss.json', {
        status: cli.status,
        stdout: cli.stdout,
        stderr: cli.stderr,
        baseUrl: liveServing.baseUrl,
        pid: liveServing.pid,
      });

      expect(cli.status, `exit: stdout=${cli.stdout}\nstderr=${cli.stderr}`).toBe(0);
      const report = parseDrill(cli.stdout);

      expect(report.repoint.exitCode).toBe(0);
      expect(report.repoint.parsed?.repointed).toBe(true);
      expect(report.independentRecompute.acceptedCount).toBe(0);
      expect(report.independentRecompute.matchesReport).toBe(true);
      expect(report.independentRecompute.rawFileByteCount).toBeGreaterThan(0);
      expect(report.liveAcks.authorizingCount).toBeGreaterThanOrEqual(1);
      expect(report.liveAcks.allPreexisting).toBe(true);
      expect(report.independentRecompute.acceptedCount).toBe(
        report.repoint.parsed?.precondition.accepted_post_export_writes
      );
      expect(report.liveAcks.authorizingCount).not.toBe(0);

      // D07-01 top-level oracle fields
      expect(report.ok).toBe(true);
      expect(report.repointed).toBe(true);
      expect(report.target).toBe(TARGET_CONVEX_FROZEN);
      expect(report.lost_accepted_writes).toBe(0);
      expect(report.accepted_post_export_writes_recomputed).toBe(0);
    });
  }, 180_000);

  it('AC-4: N=3 accepted writes refuse rollback; recompute === 3; secrets unchanged', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      await seedPostExportWritesN3(exportMs);

      const secretsBefore = sha256File(DISPOSABLE_SECRETS);
      const rawBefore = recomputeAcceptedPostExportWritesFromRawFile(AUDIT_PATH);
      expect(rawBefore.acceptedCount).toBe(3);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);

      const env = holoEnv(liveServing.baseUrl, liveServing.pid);
      const cli = holo(
        [
          'cutover:rollback-drill',
          '--json',
          '--etl-report',
          WATERMARK_PATH,
          '--output',
          resolve(D07_03, 'ac4-n3-drill-report.json'),
        ],
        env
      );

      writeEvidence('ac4-n3-refusal.json', {
        status: cli.status,
        stdout: cli.stdout,
        stderr: cli.stderr,
        secretsBefore,
        secretsAfter: sha256File(DISPOSABLE_SECRETS),
      });

      expect(cli.status).not.toBe(0);
      const report = parseDrill(cli.stdout);

      expect(report.repoint.parsed?.ok).toBe(false);
      expect(report.repoint.parsed?.repointed).toBe(false);
      expect(report.repoint.parsed?.error?.code).toBe(POST_EXPORT_WRITE_ACCEPTED);
      expect(report.independentRecompute.acceptedCount).toBe(3);
      expect(report.independentRecompute.matchesReport).toBe(true);
      expect(sha256File(DISPOSABLE_SECRETS)).toBe(secretsBefore);
      expect(report.repoint.parsed?.repointed).not.toBe(true);
      expect(report.independentRecompute.acceptedCount).not.toBe(0);
      expect(report.error?.code).toBe(POST_EXPORT_WRITE_ACCEPTED);
    });
  }, 180_000);

  it('AC-5: pre-existing serving ack + post-repoint /health data_plane=convex', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      // Start pre-existing server BEFORE drill control-plane write
      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      const healthBefore = await waitHealth(liveServing.baseUrl);
      expect(healthBefore.status).toBe(200);
      expect(liveServing.pid).toBeTypeOf('number');

      const env = holoEnv(liveServing.baseUrl, liveServing.pid);
      const cli = holo(
        [
          'cutover:rollback-drill',
          '--json',
          '--etl-report',
          WATERMARK_PATH,
          '--output',
          resolve(D07_03, 'ac5-drill-report.json'),
        ],
        env
      );

      writeEvidence('ac5-preexisting-acks.json', {
        status: cli.status,
        stdout: cli.stdout,
        stderr: cli.stderr,
        preexistingPid: liveServing.pid,
      });

      expect(cli.status, `exit: stdout=${cli.stdout}\nstderr=${cli.stderr}`).toBe(0);
      const report = parseDrill(cli.stdout);

      expect(
        report.liveAcks.acks.some((a) => a.kind === 'network_health' && a.preexisting === true)
      ).toBe(true);
      expect(report.liveAcks.acks.every((a) => a.pid !== report.drillProcessPid)).toBe(true);
      expect(report.liveAcks.acks.length).not.toBe(0);

      // Fresh post-repoint /health against the same pre-existing server
      const postRepointHealthProbe = await waitHealth(liveServing.baseUrl);
      expect(postRepointHealthProbe.body.data_plane).toBe('convex');

      // Drill also captures this when repointed
      if (report.postRepointHealthProbe) {
        expect(report.postRepointHealthProbe.body.data_plane).toBe('convex');
      }
    });
  }, 180_000);

  it('GATE-FIX-drill-fence-precondition AC-1: disarmed fence → DRILL_FENCE_NOT_ARMED before probes; no mint', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '0' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });
      process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
      process.env.HOLO_MIGRATION_READ_ONLY = '0';
      expect(isMigrationReadOnly()).toBe(false);

      // Live server under disarmed fence — must NOT be probed by runRollbackDrill
      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);
      process.env.HOLO_VERIFY_BASE_URL = liveServing.baseUrl;

      const { resolveTestDatabaseUrl } = await import('./sprint30-cutover-harness.ts');
      const { clearPostExportWriteAuditLedger, loadPostExportWriteAuditAsync } = await import(
        '../../src/cutover/post-export-write-audit.ts'
      );
      const dbUrl = resolveTestDatabaseUrl();
      try {
        await clearPostExportWriteAuditLedger({ databaseUrl: dbUrl });
      } catch {
        /* fresh */
      }

      const beforeLedger = await loadPostExportWriteAuditAsync({
        allowFileFallback: false,
        databaseUrl: dbUrl,
      });
      const beforeCount = (beforeLedger.audit?.accepted_writes ?? []).length;

      const reportPath = resolve(D07_03, 'gate-fix-disarmed-precondition-report.json');
      const report = await runRollbackDrill({
        cwd: REPO_ROOT,
        baseUrl: liveServing.baseUrl,
        reportPath,
        watermarkPath: WATERMARK_PATH,
        auditPath: AUDIT_PATH,
        skipRepoint: true, // isolate probe precondition (repoint is sibling residual)
        databaseUrl: dbUrl,
      });

      writeEvidence('ac1-disarmed-precondition-fail.json', report);

      expect(report.ok).toBe(false);
      expect(report.error?.code).toBe(DRILL_FENCE_NOT_ARMED);
      expect(report.fence_armed).toBe(false);
      expect(report.probes.app.executed).toBe(false);
      expect(report.probes.mcp.executed).toBe(false);
      expect(report.probes.upload.executed).toBe(false);
      expect(report.probes.job.executed).toBe(false);
      expect(report.probes.mission.executed).toBe(false);
      expect(report.accepted_write_identities).toEqual([]);
      // Must NOT be the post-mint residual class from 20260808T011038Z
      expect(report.error?.code).not.toBe('DRILL_WRITE_SURFACES_NOT_BLOCKED');
      expect(report.probes.app.status).not.toBe(201);

      const afterLedger = await loadPostExportWriteAuditAsync({
        allowFileFallback: false,
        databaseUrl: dbUrl,
      });
      const afterCount = (afterLedger.audit?.accepted_writes ?? []).length;
      expect(afterCount).toBe(beforeCount);

      writeEvidence('ac1-no-minted-writes.json', {
        beforeCount,
        afterCount,
        fence_armed: report.fence_armed,
        error: report.error,
        probes_executed: {
          app: report.probes.app.executed,
          mcp: report.probes.mcp.executed,
          upload: report.probes.upload.executed,
          job: report.probes.job.executed,
          mission: report.probes.mission.executed,
        },
      });
    });
  }, 180_000);

  it('GATE-FIX-drill-fence-precondition AC-2: after durable re-arm, live POST /api/documents returns 423+code', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '0' });
      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);

      // Durable re-arm (no regex rewrite) — serving process re-reads per request
      writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });
      process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
      expect(isMigrationReadOnly()).toBe(true);

      const res = await fetch(`${liveServing.baseUrl}/api/documents`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${DEFAULT_KEYS.rn}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'gate-fix-live-423-proof',
          content: 'must be blocked',
          category: 'general',
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      writeEvidence('ac2-live-serving-423.json', {
        status: res.status,
        body,
        baseUrl: liveServing.baseUrl,
      });
      expect(res.status).toBe(423);
      expect(body.code).toBe('migration_read_only');
    });
  }, 180_000);
});
