/**
 * D07-04 / D07-01 — data-plane PONR latch (UC-SYNC-04 / T-SYNC-014).
 *
 * Covers AC-1 first-write, AC-3 latch, AC-4 idempotent, AC-5 fails closed,
 * AC-6 lifts the fence, AC-7 survives tmp deletion, AC-8 convex snapshot.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint30-ponr-latch.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anyApi, type FunctionReference } from 'convex/server';
import { loadSecretsFile } from '../../src/config/secrets.ts';
import { createCutoverConvexClient } from '../../src/cutover/convex-fence-client.ts';
import {
  computeDocumentRowDigest,
  CONVEX_ESCAPE_HATCH_DIVERGED,
  PONR_LEDGER_UNREADABLE,
} from '../../src/cutover/ponr.ts';
import {
  POST_EXPORT_WRITE_ACCEPTED,
  POST_PONR_INELIGIBLE,
  type RollbackRepointReport,
  writePostExportWriteAudit,
} from '../../src/cutover/rollback-repoint.ts';
import {
  allocateClosedLocalPort,
  AUDIT_PATH,
  cleanupDefaultCutoverArtifacts,
  countDataPlanePonr,
  countDocuments,
  DEFAULT_KEYS,
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
  seedDivergedExportWatermark,
  seedEmptyPostExportAudit,
  seedExportWatermark,
  selectDocumentRow,
  selectPonrRow,
  startPreexistingServing,
  truncateDataPlanePonr,
  WATERMARK_PATH,
  waitHealth,
  withCutoverSharedLock,
  writeEvidence,
} from './sprint30-cutover-harness.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint30-ponr-latch requires PLATFORM_IT=1');
}

type EnableWritesReport = {
  ok?: boolean;
  already_recorded?: boolean;
  ponr_id?: string;
  write_row_id?: string;
  write_row_digest_sha256?: string;
  write_surface?: string;
  write_table?: string;
  fence_lifted_at?: string;
  write_committed_at?: string;
  convex_fence_audit_id?: string;
  convex_documents_total?: number;
  convex_accepted_writes_since_watermark?: number;
  error?: { code?: string; message?: string };
};

const auditApi = (anyApi as any).migrationFence.audit as {
  latestFenceArmed: FunctionReference<'query'>;
  countAttemptsInWindow: FunctionReference<'query'>;
};
const docsApi = (anyApi as any).documents.queries as {
  count: FunctionReference<'query'>;
  list: FunctionReference<'query'>;
};

async function postDocument(
  baseUrl: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/documents`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${DEFAULT_KEYS.rn}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: `s30-d07-04-fence-probe-${Date.now()}`,
      content: 'fence probe write',
      category: 'general',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

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

  it('AC-1: first-write records PONR with already_recorded:false + independent digest', async () => {
    await withCutoverSharedLock(async () => {
      await truncateDataPlanePonr();
      expect(await countDataPlanePonr()).toBe(0);

      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      const health = await waitHealth(liveServing.baseUrl);
      expect(health.status).toBe(200);

      const env = holoEnv(liveServing.baseUrl, liveServing.pid);
      const { enable, report } = await recordPonr(env);
      writeEvidence('ac1-first-write.json', {
        status: enable.status,
        stdout: enable.stdout,
        stderr: enable.stderr,
        report,
      });

      expect(enable.status).toBe(0);
      expect(report.ok).toBe(true);
      expect(report.already_recorded).toBe(false);
      expect(typeof report.ponr_id).toBe('string');
      expect((report.ponr_id ?? '').length).toBeGreaterThan(0);
      expect(typeof report.write_row_id).toBe('string');

      expect(await countDataPlanePonr()).toBe(1);
      const ponr = await selectPonrRow();
      expect(ponr).not.toBeNull();
      expect(ponr!.write_table).toBe('documents');
      expect(ponr!.write_surface).toBe('hono.POST /api/documents');
      expect(ponr!.write_row_id).toBe(report.write_row_id);
      expect(ponr!.write_row_digest_sha256).toMatch(/^[0-9a-f]{64}$/);

      const doc = await selectDocumentRow(ponr!.write_row_id!);
      expect(doc).not.toBeNull();
      const independentDigest = computeDocumentRowDigest(doc!);
      expect(independentDigest).toBe(ponr!.write_row_digest_sha256);
      expect(independentDigest).toBe(report.write_row_digest_sha256);

      const fenceMs = Date.parse(ponr!.fence_lifted_at ?? '');
      const writeMs = Date.parse(ponr!.write_committed_at ?? '');
      expect(Number.isFinite(fenceMs)).toBe(true);
      expect(Number.isFinite(writeMs)).toBe(true);
      expect(writeMs - fenceMs).toBeGreaterThanOrEqual(0);
    });
  }, 180_000);

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

      // Ensure a real PONR exists (first-write if ledger empty; idempotent otherwise)
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
      expect(refuse.error?.message ?? '').toContain(ponr!.id);
      expect(refuse.error?.message ?? '').toMatch(/restore/i);
      expect(secretsHasConvexPlane(DISPOSABLE_SECRETS)).toBe(false);

      const ponrCountAfter = await countDataPlanePonr();
      expect(ponrCountAfter).toBe(1);
    });
  }, 180_000);

  it('AC-4: cutover:enable-writes is idempotent (same ponr_id, documents unchanged)', async () => {
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
      const fenceAudit1 = first.report.convex_fence_audit_id;
      const writeRow1 = first.report.write_row_id;

      const docsBaseline = await countDocuments();
      const ponrBaseline = await countDataPlanePonr();
      expect(ponrBaseline).toBe(1);

      const second = await recordPonr(env);
      writeEvidence('ac5-enable-writes-run2.json', second);
      expect(second.enable.status).toBe(0);
      expect(second.report.already_recorded).toBe(true);
      expect(second.report.ponr_id).toBe(ponrId1);
      expect(second.report.write_row_id).toBe(writeRow1);
      expect(second.report.convex_fence_audit_id).toBe(fenceAudit1);

      expect(await countDataPlanePonr()).toBe(1);
      expect(await countDocuments()).toBe(docsBaseline);
    });
  }, 180_000);

  it('AC-5: fails closed with PONR_LEDGER_UNREADABLE on unreachable DATABASE_URL', async () => {
    await withCutoverSharedLock(async () => {
      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      const closedPort = await allocateClosedLocalPort();
      const hostPort = `127.0.0.1:${closedPort}`;
      const unreachableUrl = `postgres://holocron@${hostPort}/holocron_nonprod?connect_timeout=2`;

      const env: NodeJS.ProcessEnv = {
        ...holoEnv(),
        DATABASE_URL: unreachableUrl,
      };

      const rollback = holo(
        [
          'cutover:rollback-repoint',
          '--json',
          '--etl-report',
          WATERMARK_PATH,
          '--output',
          `${REPO_ROOT}/.tmp/D07-01/red/ac5-ledger-unreadable.json`,
        ],
        env
      );

      writeEvidence('ac5-ponr-ledger-unreadable.json', {
        status: rollback.status,
        stdout: rollback.stdout,
        stderr: rollback.stderr,
        hostPort,
        unreachableUrlHost: hostPort,
      });

      expect(rollback.status).toBe(2);
      const refuse = JSON.parse(rollback.stdout) as RollbackRepointReport;
      expect(refuse.ok).toBe(false);
      expect(refuse.repointed).toBe(false);
      expect(refuse.error?.code).toBe(PONR_LEDGER_UNREADABLE);
      expect(refuse.error?.code).not.toBe('LIVE_ACK_MISSING');
      expect(refuse.error?.message ?? '').toContain(hostPort);
      expect(secretsHasConvexPlane(DISPOSABLE_SECRETS)).toBe(false);
      expect(loadSecretsFile(DISPOSABLE_SECRETS).HOLO_ROLLBACK_TARGET).not.toBe(
        'convex-frozen'
      );
    });
  }, 120_000);

  it('AC-6: lifts the fence 423→201 on same pre-existing serving pid', async () => {
    await withCutoverSharedLock(async () => {
      await truncateDataPlanePonr();
      expect(await countDataPlanePonr()).toBe(0);

      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);
      const prePid = liveServing.pid;

      const pre = await postDocument(liveServing.baseUrl);
      writeEvidence('ac6-pre-fence-post.json', pre);
      expect(pre.status).toBe(423);
      expect(pre.body).toMatchObject({
        error: 'migration_read_only',
        code: 'migration_read_only',
      });

      const env = holoEnv(liveServing.baseUrl, liveServing.pid);
      const { enable, report } = await recordPonr(env);
      writeEvidence('ac6-enable-writes-fence-lift.json', {
        status: enable.status,
        stdout: enable.stdout,
        stderr: enable.stderr,
        report,
      });
      expect(enable.status).toBe(0);
      expect(report.already_recorded).toBe(false);

      const secrets = loadSecretsFile(DISPOSABLE_SECRETS);
      expect(secrets.HOLO_MIGRATION_READ_ONLY).toBe('0');

      const post = await postDocument(liveServing.baseUrl);
      writeEvidence('ac6-post-fence-post.json', {
        ...post,
        prePid,
        postPid: liveServing.pid,
      });
      expect(post.status).toBe(201);
      const docId = (post.body.document as { id?: string } | undefined)?.id;
      expect(typeof docId).toBe('string');
      const doc = await selectDocumentRow(docId!);
      expect(doc).not.toBeNull();
      expect(liveServing.pid).toBe(prePid);
    });
  }, 180_000);

  it('AC-7: PONR latch survives tmp deletion of post-export audit artifacts', async () => {
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

  it('AC-8: convex snapshot equality on undiverged + CONVEX_ESCAPE_HATCH_DIVERGED fail-closed', async () => {
    await withCutoverSharedLock(async () => {
      // ── Case 0: undiverged live Convex snapshot equality ─────────────────
      await truncateDataPlanePonr();
      seedDisposableSecrets({ readOnly: '1' });
      const wm = seedExportWatermark();
      exportMs = wm.exportMs;
      seedEmptyPostExportAudit(exportMs);

      const client = createCutoverConvexClient();
      const liveArmed = (await client.query(auditApi.latestFenceArmed, {})) as {
        _id?: string;
      } | null;
      const liveCount = (await client.query(docsApi.count, {})) as number;
      const liveCounts = (await client.query(auditApi.countAttemptsInWindow, {
        sinceMs: exportMs,
      })) as { acceptedWriteCount?: number; rejectedWriteCount?: number };
      const liveList = (await client.query(docsApi.list, { limit: 1 })) as {
        documents?: Array<{ _creationTime?: number }>;
      };
      const liveNewest = Math.floor(liveList?.documents?.[0]?._creationTime ?? 0);

      writeEvidence('ac8-live-convex-pre.json', {
        liveArmedId: liveArmed?._id,
        liveCount,
        liveCounts,
        liveNewest,
        exportMs,
      });

      expect(typeof liveArmed?._id).toBe('string');
      expect(liveCount).toBeGreaterThan(0);
      expect(liveCounts.acceptedWriteCount ?? -1).toBe(0);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);
      const env = holoEnv(liveServing.baseUrl, liveServing.pid);

      const undiverged = await recordPonr(env);
      writeEvidence('ac8-enable-writes-undiverged.json', undiverged);
      expect(undiverged.enable.status).toBe(0);
      expect(undiverged.report.already_recorded).toBe(false);

      const ponr = await selectPonrRow();
      expect(ponr).not.toBeNull();
      expect(ponr!.convex_fence_audit_id).toBe(liveArmed!._id);
      expect(ponr!.convex_fence_audit_id).toMatch(/^[a-z0-9]{32}$/);
      expect((ponr!.convex_fence_env_value ?? '').length).toBeGreaterThan(0);
      expect(ponr!.convex_documents_total).toBeGreaterThan(0);
      expect(ponr!.convex_documents_total).toBe(liveCount);
      expect(ponr!.convex_accepted_writes_since_watermark).toBe(0);
      expect(ponr!.convex_rejected_writes_since_watermark).toBeGreaterThanOrEqual(0);
      expect(ponr!.export_watermark_ms).toBe(exportMs);
      expect(
        (ponr!.export_watermark_ms ?? 0) - (ponr!.convex_newest_document_creation_time ?? 0)
      ).toBeGreaterThanOrEqual(0);

      // ── Case 1: diverged Convex → fail closed, no PONR, fence stays '1' ──
      await truncateDataPlanePonr();
      expect(await countDataPlanePonr()).toBe(0);
      seedDisposableSecrets({ readOnly: '1' });
      const divergedWm = seedDivergedExportWatermark();
      seedEmptyPostExportAudit(divergedWm.exportMs);

      // Confirm live deployment is past the low watermark
      const divCounts = (await client.query(auditApi.countAttemptsInWindow, {
        sinceMs: divergedWm.exportMs,
      })) as { acceptedWriteCount?: number };
      const divList = (await client.query(docsApi.list, { limit: 1 })) as {
        documents?: Array<{ _creationTime?: number }>;
      };
      const divNewest = Math.floor(divList?.documents?.[0]?._creationTime ?? 0);
      writeEvidence('ac8-diverged-pre.json', {
        divergedExportMs: divergedWm.exportMs,
        divCounts,
        divNewest,
      });
      // At least one divergence signal must be present (accepted writes or newer doc)
      const divergedByNewest = divNewest > divergedWm.exportMs;
      const divergedByAccepted = (divCounts.acceptedWriteCount ?? 0) >= 1;
      expect(divergedByNewest || divergedByAccepted).toBe(true);

      const divergedEnv = holoEnv(liveServing.baseUrl, liveServing.pid);
      const diverged = await recordPonr(divergedEnv);
      writeEvidence('ac8-enable-writes-diverged.json', diverged);

      expect(diverged.enable.status).toBe(2);
      expect(diverged.report.ok).toBe(false);
      expect(diverged.report.error?.code).toBe(CONVEX_ESCAPE_HATCH_DIVERGED);
      expect(diverged.report.error?.message ?? '').toMatch(
        /convex_accepted_writes_since_watermark|convex_newest_document_creation_time|export_watermark_ms/
      );
      expect(await countDataPlanePonr()).toBe(0);
      const secretsAfter = loadSecretsFile(DISPOSABLE_SECRETS);
      expect(secretsAfter.HOLO_MIGRATION_READ_ONLY).toBe('1');
    });
  }, 240_000);
});
