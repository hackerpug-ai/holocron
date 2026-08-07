/**
 * D07-01 RED — zero-loss rollback drill + N>0 post-export refusal anchor (UC-SYNC-04).
 *
 * AC-1: cutover:rollback-drill --json zero-loss oracle (FAILS at planning SHA: unknown verb).
 * AC-2: three real accepted post-export writes → cutover:rollback-repoint refuses with
 *       POST_EXPORT_WRITE_ACCEPTED acceptedCount 3 (PASSES at planning SHA — harness anchor).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSecretsFile } from '../../src/config/secrets.ts';
import {
  countAcceptedPostExportWrites,
  loadPostExportWriteAudit,
  POST_EXPORT_WRITE_ACCEPTED,
  type RollbackRepointReport,
  TARGET_CONVEX_FROZEN,
} from '../../src/cutover/rollback-repoint.ts';
import {
  AUDIT_PATH,
  cleanupDefaultCutoverArtifacts,
  countDataPlanePonr,
  countDocumentsByIds,
  DISPOSABLE_SECRETS,
  holo,
  holoEnv,
  PLATFORM_IT,
  type PreexistingServing,
  REPO_ROOT,
  readRawAcceptedCount,
  secretsHasConvexPlane,
  seedDisposableSecrets,
  seedEmptyPostExportAudit,
  seedExportWatermark,
  seedThreeRealPostExportWrites,
  startPreexistingServing,
  truncateDataPlanePonr,
  WATERMARK_PATH,
  waitHealth,
  withCutoverSharedLock,
  writeEvidence,
} from './sprint30-cutover-harness.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint30-rollback-zero-loss requires PLATFORM_IT=1');
}

describe('D07-01 RED: rollback zero-loss + post-export anchor (UC-SYNC-04)', () => {
  const priorSecrets = process.env.HOLO_SECRETS_PATH;
  const priorVerify = process.env.HOLO_VERIFY_BASE_URL;
  const priorSoak = process.env.HOLO_SOAK_BASE_URL;
  const priorPlatform = process.env.PLATFORM_URL;
  const priorVerifyPid = process.env.HOLO_VERIFY_PID;
  let liveServing: PreexistingServing | undefined;
  let exportMs = 0;

  beforeEach(() => {
    seedDisposableSecrets({ readOnly: '1' });
    const wm = seedExportWatermark();
    exportMs = wm.exportMs;
    seedEmptyPostExportAudit(exportMs);
    cleanupDefaultCutoverArtifacts();
    seedEmptyPostExportAudit(exportMs);

    process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
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
  });

  it('AC-1: cutover:rollback-drill --json reports zero-loss re-point with live acks', async () => {
    await withCutoverSharedLock(async () => {
      // soaked_stack_live: pre-existing serving process answering GET /health BEFORE drill
      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

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
          `${REPO_ROOT}/.tmp/D07-01/red/ac1-drill-report.json`,
        ],
        env
      );

      writeEvidence('ac1-drill.json', {
        status: cli.status,
        stdout: cli.stdout,
        stderr: cli.stderr,
        baseUrl: liveServing.baseUrl,
        pid: liveServing.pid,
        healthBefore,
      });

      // GREEN contract (RED at planning SHA: unknown cutover:rollback-drill verb → exit 2)
      expect(cli.status, `drill exit: stdout=${cli.stdout}\nstderr=${cli.stderr}`).toBe(0);

      const report = JSON.parse(cli.stdout) as {
        ok?: boolean;
        repointed?: boolean;
        target?: string;
        lost_accepted_writes?: number;
        accepted_post_export_writes_recomputed?: number;
        acknowledgements?: Array<{ preexisting?: boolean; unit?: string }>;
        precondition?: { accepted_post_export_writes?: number };
      };

      expect(report.repointed).toBe(true);
      expect(report.target).toBe(TARGET_CONVEX_FROZEN);

      // Independently recompute lost_accepted_writes from raw audit evidence (never copy)
      const rawAccepted = readRawAcceptedCount(AUDIT_PATH);
      const loaded = loadPostExportWriteAudit({
        cwd: REPO_ROOT,
        auditPath: AUDIT_PATH,
        watermarkPath: WATERMARK_PATH,
      });
      const recomputed =
        loaded.audit != null ? countAcceptedPostExportWrites(loaded.audit) : rawAccepted;
      expect(recomputed).toBe(0);
      expect(rawAccepted).toBe(0);
      expect(report.lost_accepted_writes).toBe(0);
      expect(report.accepted_post_export_writes_recomputed ?? recomputed).toBe(0);
      expect(report.lost_accepted_writes).toBe(recomputed);

      const acks = report.acknowledgements ?? [];
      expect(acks.length).toBeGreaterThanOrEqual(1);
      expect(acks.every((a) => a.preexisting === true)).toBe(true);
      // cutover-cli / non-preexisting units must not authorize
      expect(acks.some((a) => a.preexisting === false || a.unit === 'cutover-cli')).toBe(false);

      const secrets = loadSecretsFile(DISPOSABLE_SECRETS);
      expect(secrets.HOLO_DATA_PLANE).toBe('convex');

      // Same pre-existing pid must observe convex via /health
      const healthAfter = await waitHealth(liveServing.baseUrl);
      expect(healthAfter.status).toBe(200);
      expect(healthAfter.body.data_plane).toBe('convex');
      expect(liveServing.pid).toBeTypeOf('number');
    });
  }, 180_000);

  it('AC-2: three accepted post-export writes refuse cutover:rollback-repoint', async () => {
    await withCutoverSharedLock(async () => {
      // TC-11 / AC-3 Case 1 isolation: empty PONR so POST_EXPORT_WRITE_ACCEPTED
      // is the active latch (not the stronger POST_PONR_INELIGIBLE).
      await truncateDataPlanePonr();
      expect(await countDataPlanePonr()).toBe(0);

      seedDisposableSecrets({ readOnly: '1' });
      // Past watermark so seeded document commit timestamps are strictly after T_export.
      const wm = seedExportWatermark(Date.now() - 60_000);
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      const healthBefore = await waitHealth(liveServing.baseUrl);
      expect(healthBefore.status).toBe(200);

      const seeded = await seedThreeRealPostExportWrites({
        baseUrl: liveServing.baseUrl,
        exportMs,
        count: 3,
      });
      expect(seeded).toHaveLength(3);

      const liveCount = await countDocumentsByIds(seeded.map((s) => s.id));
      expect(liveCount).toBe(3);
      for (const s of seeded) {
        expect(s.committed_at_ms).toBeGreaterThan(exportMs);
      }

      // Prove live serving still up before refusal (oracle must not greenwash dead server)
      const healthMid = await waitHealth(liveServing.baseUrl);
      expect(healthMid.status).toBe(200);

      const priorSecretsBody = readFileSync(DISPOSABLE_SECRETS, 'utf8');
      const env = holoEnv(liveServing.baseUrl, liveServing.pid);
      const cli = holo(
        [
          'cutover:rollback-repoint',
          '--json',
          '--etl-report',
          WATERMARK_PATH,
          '--output',
          `${REPO_ROOT}/.tmp/D07-01/red/ac2-rollback-repoint.json`,
        ],
        env
      );

      writeEvidence('ac2-three-accepted-writes.json', {
        status: cli.status,
        stdout: cli.stdout,
        stderr: cli.stderr,
        seeded,
        liveCount,
        secretsAfter: readFileSync(DISPOSABLE_SECRETS, 'utf8'),
        healthMid,
      });

      expect(cli.status).toBe(2);
      const report = JSON.parse(cli.stdout) as RollbackRepointReport;
      expect(report.ok).toBe(false);
      expect(report.repointed).toBe(false);
      expect(report.error?.code).toBe(POST_EXPORT_WRITE_ACCEPTED);
      expect(report.error?.code).not.toBe('POST_PONR_INELIGIBLE');
      expect(report.precondition.accepted_post_export_writes).toBe(3);
      expect(report.error?.code).not.toBe('EXPORT_WATERMARK_MISSING');
      expect(await countDataPlanePonr()).toBe(0);

      // Disposable durable secrets must NOT contain HOLO_DATA_PLANE: convex
      expect(secretsHasConvexPlane(DISPOSABLE_SECRETS)).toBe(false);
      expect(readFileSync(DISPOSABLE_SECRETS, 'utf8')).toBe(priorSecretsBody);

      const still = await countDocumentsByIds(seeded.map((s) => s.id));
      expect(still).toBe(3);

      // Serving process still alive
      const healthAfter = await waitHealth(liveServing.baseUrl);
      expect(healthAfter.status).toBe(200);
      expect(existsSync(AUDIT_PATH)).toBe(true);
    });
  }, 180_000);
});
