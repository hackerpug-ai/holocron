/**
 * REDHAT-FIX-RH-S30-01..05 integration coverage (production-bound remediations).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recoverEnableWritesCrashWindow, runEnableWrites } from '../../src/cutover/ponr.ts';
import {
  clearPostExportWriteAuditLedger,
  countAcceptedPostExportWrites,
  loadPostExportWriteAudit,
  loadPostExportWriteAuditAsync,
  recordPostExportAcceptedWrite,
} from '../../src/cutover/post-export-write-audit.ts';
import {
  POST_EXPORT_WRITE_ACCEPTED,
  POST_PONR_INELIGIBLE,
  runRollbackRepoint,
} from '../../src/cutover/rollback-repoint.ts';
import {
  readDurableMigrationReadOnly,
  writeDurableMigrationReadOnly,
} from '../../src/cutover/soak-fence.ts';
import {
  DEFAULT_KEYS,
  DISPOSABLE_SECRETS,
  PLATFORM_IT,
  type PreexistingServing,
  REPO_ROOT,
  resolveTestDatabaseUrl,
  seedDisposableSecrets,
  seedEmptyPostExportAuditAsync,
  seedExportWatermark,
  startPreexistingServing,
  truncateDataPlanePonr,
  waitHealth,
  withCutoverSharedLock,
} from './sprint30-cutover-harness.ts';

if (!PLATFORM_IT) {
  throw new Error('sprint30-redhat-rh-s30 requires PLATFORM_IT=1');
}

const EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-RH-S30-03');
const EVIDENCE_05 = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-RH-S30-05');
/** POST /api/documents refuses production-like holocron; pin nonprod for IT. */
const NONPROD_URL = 'postgres://127.0.0.1:5432/holocron_nonprod';

describe('REDHAT-FIX-RH-S30 remediations 03 + 05', () => {
  const priorSecrets = process.env.HOLO_SECRETS_PATH;
  const priorDb = process.env.DATABASE_URL;
  let liveServing: PreexistingServing | undefined;

  beforeEach(() => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(EVIDENCE_05, { recursive: true });
    process.env.DATABASE_URL = NONPROD_URL;
    seedDisposableSecrets({ readOnly: '1' });
    process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
    liveServing = undefined;
  });

  afterEach(async () => {
    if (liveServing) {
      await liveServing.stop();
      liveServing = undefined;
    }
    if (priorSecrets !== undefined) process.env.HOLO_SECRETS_PATH = priorSecrets;
    else delete process.env.HOLO_SECRETS_PATH;
    if (priorDb !== undefined) process.env.DATABASE_URL = priorDb;
    else delete process.env.DATABASE_URL;
  });

  it('RH-S30-03 AC-1: real POST /api/documents after watermark increments Postgres ledger', async () => {
    await withCutoverSharedLock(async () => {
      const { exportMs } = seedExportWatermark(Date.now() - 60_000);
      await seedEmptyPostExportAuditAsync(exportMs);
      await clearPostExportWriteAuditLedger({ databaseUrl: resolveTestDatabaseUrl() });

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);

      // Lift fence so POST is accepted
      const { writeDurableMigrationReadOnly } = await import('../../src/cutover/soak-fence.ts');
      writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });

      const res = await fetch(`${liveServing.baseUrl}/api/documents`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${DEFAULT_KEYS.rn}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: `rh-s30-03-${Date.now()}`,
          content: 'production-bound write audit proof',
          category: 'general',
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { document?: { id?: string } };
      mkdirSync(EVIDENCE, { recursive: true });
      writeFileSync(
        resolve(EVIDENCE, 'post-documents.json'),
        JSON.stringify({ status: res.status, body }, null, 2) + '\n'
      );

      expect(res.status).toBe(201);
      expect(body.document?.id).toBeTruthy();

      const ledger = await loadPostExportWriteAuditAsync({
        cwd: REPO_ROOT,
        databaseUrl: resolveTestDatabaseUrl(),
      });
      writeFileSync(
        resolve(EVIDENCE, 'ledger-after-post.json'),
        JSON.stringify(ledger, null, 2) + '\n'
      );
      expect(ledger.source).toBe('postgres');
      expect(ledger.audit).not.toBeNull();
      expect(countAcceptedPostExportWrites(ledger.audit!)).toBeGreaterThanOrEqual(1);
    });
  }, 180_000);

  it('RH-S30-03 AC-2/3: absent/missing file does not zero oracle; ledger fail-closed', async () => {
    await withCutoverSharedLock(async () => {
      const { exportMs } = seedExportWatermark(Date.now() - 60_000);
      await seedEmptyPostExportAuditAsync(exportMs);

      // Seed one accepted write into Postgres ledger
      const rec = await recordPostExportAcceptedWrite({
        surface: 'test.seed',
        writeRowId: '00000000-0000-4000-8000-000000000001',
        committedAtMs: Date.now(),
        exportWatermarkMs: exportMs,
        databaseUrl: resolveTestDatabaseUrl(),
        cwd: REPO_ROOT,
        mirrorToFile: false,
      });
      expect(rec.ok).toBe(true);

      // Delete file mirror — oracle must still see the write from Postgres
      const auditPath = resolve(REPO_ROOT, '.tmp/D06-05/post-export-write-audit.json');
      if (existsSync(auditPath)) rmSync(auditPath);

      const loaded = await loadPostExportWriteAuditAsync({
        cwd: REPO_ROOT,
        databaseUrl: resolveTestDatabaseUrl(),
        allowFileFallback: false,
      });
      writeFileSync(
        resolve(EVIDENCE, 'ledger-after-file-delete.json'),
        JSON.stringify(loaded, null, 2) + '\n'
      );
      expect(loaded.source).toBe('postgres');
      expect(countAcceptedPostExportWrites(loaded.audit!)).toBeGreaterThanOrEqual(1);

      // Sync fail-closed: missing file does not synthesize empty
      const syncMissing = loadPostExportWriteAudit({
        cwd: REPO_ROOT,
        auditPath: resolve(REPO_ROOT, '.tmp/D06-05/does-not-exist-audit.json'),
        failClosed: true,
      });
      expect(syncMissing.audit).toBeNull();
    });
  }, 120_000);

  it('RH-S30-05: crash-window recovery re-arms fence + production audit refuses rollback', async () => {
    await withCutoverSharedLock(async () => {
      await truncateDataPlanePonr();
      const { exportMs } = seedExportWatermark(Date.now() - 60_000);
      await seedEmptyPostExportAuditAsync(exportMs);
      await clearPostExportWriteAuditLedger({ databaseUrl: resolveTestDatabaseUrl() });

      // Start with fence lifted (half-open window simulation after accepted write)
      writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });
      process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;

      const writeRowId = '00000000-0000-4000-8000-aaaaaaaaaaaa';
      const recovery = await recoverEnableWritesCrashWindow({
        secretsPath: DISPOSABLE_SECRETS,
        writeRowId,
        writeCommittedAtMs: Date.now(),
        exportWatermarkMs: exportMs,
        databaseUrl: resolveTestDatabaseUrl(),
        cwd: REPO_ROOT,
      });

      writeFileSync(
        resolve(EVIDENCE_05, 'crash-window-recovery.json'),
        JSON.stringify(recovery, null, 2) + '\n'
      );
      expect(recovery.rearmOk).toBe(true);
      expect(recovery.auditOk).toBe(true);

      const fence = readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS);
      expect(fence === '1' || fence === 'true').toBe(true);

      const ledger = await loadPostExportWriteAuditAsync({
        cwd: REPO_ROOT,
        databaseUrl: resolveTestDatabaseUrl(),
      });
      writeFileSync(
        resolve(EVIDENCE_05, 'ledger-after-recover.json'),
        JSON.stringify(ledger, null, 2) + '\n'
      );
      expect(countAcceptedPostExportWrites(ledger.audit!)).toBeGreaterThanOrEqual(1);

      liveServing = await startPreexistingServing(DISPOSABLE_SECRETS);
      await waitHealth(liveServing.baseUrl);

      // Full enable-writes with inject (when Convex available) — always fail-closed
      const report = await runEnableWrites({
        cwd: REPO_ROOT,
        reportPath: resolve(EVIDENCE_05, 'enable-writes-inject-fail.json'),
        baseUrl: liveServing.baseUrl,
        secretsPath: DISPOSABLE_SECRETS,
        databaseUrl: resolveTestDatabaseUrl(),
        injectPonrInsertFailure: true,
      });
      writeFileSync(
        resolve(EVIDENCE_05, 'enable-writes-result.json'),
        JSON.stringify(report, null, 2) + '\n'
      );
      expect(report.ok).toBe(false);

      const refuse = await runRollbackRepoint({
        cwd: REPO_ROOT,
        baseUrl: liveServing.baseUrl,
        secretsPath: DISPOSABLE_SECRETS,
      });
      writeFileSync(
        resolve(EVIDENCE_05, 'rollback-refuse.json'),
        JSON.stringify(refuse, null, 2) + '\n'
      );
      expect(refuse.repointed).toBe(false);
      expect(
        refuse.error?.code === POST_EXPORT_WRITE_ACCEPTED ||
          refuse.error?.code === POST_PONR_INELIGIBLE
      ).toBe(true);
    });
  }, 240_000);
});
