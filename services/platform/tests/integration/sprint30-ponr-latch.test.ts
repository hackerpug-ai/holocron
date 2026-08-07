/**
 * D07-01 RED — data-plane PONR latch closes the rollback path (UC-SYNC-04 / T-SYNC-014).
 *
 * AC-3: recorded PONR → cutover:rollback-repoint exits 2 with POST_PONR_INELIGIBLE
 * AC-5: cutover:enable-writes re-run is idempotent (same ponr_id, no second write)
 * AC-6: PONR latch survives deletion of all .tmp cutover artifacts (stronger than fail-open audit)
 *
 * All cases FAIL at the planning SHA (unknown cutover:enable-writes / missing latch).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint30-ponr-latch.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSecretsFile } from '../../src/config/secrets.ts';
import {
  POST_EXPORT_WRITE_ACCEPTED,
  type RollbackRepointReport,
  writePostExportWriteAudit,
} from '../../src/cutover/rollback-repoint.ts';
import {
  AUDIT_PATH,
  cleanupDefaultCutoverArtifacts,
  countDataPlanePonr,
  countDocuments,
  DISPOSABLE_SECRETS,
  deleteTmpCutoverArtifacts,
  ENABLE_WRITES_REPORT_PATH,
  holo,
  holoEnv,
  PLATFORM_IT,
  type PreexistingServing,
  REPO_ROOT,
  secretsHasConvexPlane,
  seedDisposableSecrets,
  seedEmptyPostExportAudit,
  seedExportWatermark,
  selectPonrRow,
  startPreexistingServing,
  WATERMARK_PATH,
  waitHealth,
  withCutoverSharedLock,
  writeEvidence,
} from './sprint30-cutover-harness.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint30-ponr-latch requires PLATFORM_IT=1');
}

/** Literal until D07-04 exports the constant. */
const POST_PONR_INELIGIBLE = 'POST_PONR_INELIGIBLE';

type EnableWritesReport = {
  ok?: boolean;
  already_recorded?: boolean;
  ponr_id?: string;
  error?: { code?: string };
};

describe('D07-01 RED: PONR latch closes rollback path (T-SYNC-014)', () => {
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

  async function recordPonr(env: NodeJS.ProcessEnv): Promise<{
    enable: ReturnType<typeof holo>;
    report: EnableWritesReport;
  }> {
    const enable = holo(
      ['cutover:enable-writes', '--json', '--output', ENABLE_WRITES_REPORT_PATH],
      env
    );
    let report: EnableWritesReport = {};
    try {
      report = JSON.parse(enable.stdout || '{}') as EnableWritesReport;
    } catch {
      report = {};
    }
    return { enable, report };
  }

  it('AC-3: recorded PONR refuses rollback-repoint with POST_PONR_INELIGIBLE', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      const health = await waitHealth(liveServing.baseUrl);
      expect(health.status).toBe(200);

      const env = holoEnv(liveServing.baseUrl, liveServing.pid);

      // ponr_recorded fixture via cutover:enable-writes (D07-04 surface — RED unknown verb)
      const { enable, report: enableReport } = await recordPonr(env);
      writeEvidence('ac3-enable-writes.json', {
        status: enable.status,
        stdout: enable.stdout,
        stderr: enable.stderr,
        enableReport,
      });
      expect(enable.status, `enable-writes must succeed for PONR fixture`).toBe(0);

      const ponrCount = await countDataPlanePonr();
      expect(ponrCount).toBe(1);
      const ponr = await selectPonrRow();
      expect(ponr).not.toBeNull();
      expect((ponr?.convex_fence_audit_id ?? '').length).toBeGreaterThan(0);

      const rollback = holo(
        [
          'cutover:rollback-repoint',
          '--json',
          '--etl-report',
          WATERMARK_PATH,
          '--output',
          `${REPO_ROOT}/.tmp/D07-01/red/ac3-rollback-repoint.json`,
        ],
        env
      );

      writeEvidence('ac3-latch.json', {
        status: rollback.status,
        stdout: rollback.stdout,
        stderr: rollback.stderr,
        ponrCountBefore: ponrCount,
        secrets: loadSecretsFile(DISPOSABLE_SECRETS),
      });

      expect(rollback.status).toBe(2);
      const refuse = JSON.parse(rollback.stdout) as RollbackRepointReport;
      expect(refuse.ok).toBe(false);
      expect(refuse.repointed).toBe(false);
      expect(refuse.error?.code).toBe(POST_PONR_INELIGIBLE);
      expect(refuse.error?.code).not.toBe(POST_EXPORT_WRITE_ACCEPTED);
      expect(refuse.precondition.accepted_post_export_writes).toBe(0);
      expect(secretsHasConvexPlane(DISPOSABLE_SECRETS)).toBe(false);

      const ponrCountAfter = await countDataPlanePonr();
      expect(ponrCountAfter).toBe(1);
    });
  }, 180_000);

  it('AC-5: cutover:enable-writes is idempotent (same ponr_id, documents unchanged)', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);
      const env = holoEnv(liveServing.baseUrl, liveServing.pid);

      const first = await recordPonr(env);
      writeEvidence('ac5-enable-writes-run1.json', first);
      expect(first.enable.status).toBe(0);
      const ponrId1 = first.report.ponr_id;
      expect(typeof ponrId1).toBe('string');
      expect((ponrId1 ?? '').length).toBeGreaterThan(0);

      const docsBaseline = await countDocuments();
      const ponrBaseline = await countDataPlanePonr();
      expect(ponrBaseline).toBe(1);

      const second = await recordPonr(env);
      writeEvidence('ac5-enable-writes-run2.json', second);
      expect(second.enable.status).toBe(0);
      expect(second.report.already_recorded).toBe(true);
      expect(second.report.ponr_id).toBe(ponrId1);

      expect(await countDataPlanePonr()).toBe(1);
      expect(await countDocuments()).toBe(docsBaseline);
    });
  }, 180_000);

  it('AC-6: PONR latch survives tmp deletion of post-export audit artifacts', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);
      const env = holoEnv(liveServing.baseUrl, liveServing.pid);

      const { enable } = await recordPonr(env);
      writeEvidence('ac6-enable-writes.json', {
        status: enable.status,
        stdout: enable.stdout,
        stderr: enable.stderr,
      });
      expect(enable.status).toBe(0);
      expect(await countDataPlanePonr()).toBe(1);

      const deleted = deleteTmpCutoverArtifacts();
      writeEvidence('ac6-deleted-artifacts.json', { deleted });
      expect(existsSync(AUDIT_PATH)).toBe(false);

      const rollback1 = holo(
        [
          'cutover:rollback-repoint',
          '--json',
          '--etl-report',
          WATERMARK_PATH,
          '--output',
          `${REPO_ROOT}/.tmp/D07-01/red/ac6-rollback-after-delete.json`,
        ],
        env
      );

      // Rewrite audit with accepted_writes: [] and refuse again
      writePostExportWriteAudit({ export_watermark_ms: exportMs, accepted_writes: [] }, AUDIT_PATH);
      const rollback2 = holo(
        [
          'cutover:rollback-repoint',
          '--json',
          '--etl-report',
          WATERMARK_PATH,
          '--output',
          `${REPO_ROOT}/.tmp/D07-01/red/ac6-rollback-empty-audit.json`,
        ],
        env
      );

      writeEvidence('ac6-tmp-deleted.json', {
        rollback1: {
          status: rollback1.status,
          stdout: rollback1.stdout,
          stderr: rollback1.stderr,
        },
        rollback2: {
          status: rollback2.status,
          stdout: rollback2.stdout,
          stderr: rollback2.stderr,
        },
        ponrCount: await countDataPlanePonr(),
      });

      expect(rollback1.status).toBe(2);
      const r1 = JSON.parse(rollback1.stdout) as RollbackRepointReport;
      expect(r1.error?.code).toBe(POST_PONR_INELIGIBLE);
      expect(r1.repointed).toBe(false);

      expect(rollback2.status).toBe(2);
      const r2 = JSON.parse(rollback2.stdout) as RollbackRepointReport;
      expect(r2.error?.code).toBe(POST_PONR_INELIGIBLE);

      expect(await countDataPlanePonr()).toBe(1);
      expect(secretsHasConvexPlane(DISPOSABLE_SECRETS)).toBe(false);

      const contrastBody = readFileSync(DISPOSABLE_SECRETS, 'utf8');
      writeEvidence('ac6-contrast-note.json', {
        note: 'with data_plane_ponr count==0 and audit deleted, refusal must not be POST_EXPORT_WRITE_ACCEPTED',
        post_export_write_accepted: POST_EXPORT_WRITE_ACCEPTED,
        secrets_snapshot_len: contrastBody.length,
      });
    });
  }, 180_000);
});
