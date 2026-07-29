/**
 * REDHAT-FIX-C5 / CAP-BAK-01 — immutable collision-resistant recovery baseline.
 *
 * Proves:
 *   AC-1 capture|emit — baseline uploaded to R2 with SHA-256 bindings
 *   AC-2 parity|compare — load from R2 alone and match restored digests/counts
 *   AC-3 tamper|mismatch|fail — fail-closed on ledger mismatch
 *   AC-4 contract — D05-04 + module export surface
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { type BackupConfig, loadBackupConfig } from '../../src/backup/config.ts';
import {
  captureRowCounts,
  connectionFromDatabaseUrl,
  defaultSourceConnection,
} from '../../src/backup/evidence-ledger-verify.ts';
import * as backupIndex from '../../src/backup/index.ts';
import {
  buildRecoveryBaseline,
  captureAndUploadRecoveryBaseline,
  compareRestoredToBaseline,
  computeBlobManifestSha256,
  computeLedgerSha256,
  contentAddressedBaselineKey,
  isMd5OnlyDigest,
  loadBaselineAndCompare,
  loadRecoveryBaselineFromR2,
  lookupBaselineKey,
  normalizeSha256Digest,
  queryTargetLsn,
  RECOVERY_BASELINE_SCHEMA,
  type RecoveryBaseline,
  validateRecoveryBaseline,
} from '../../src/backup/recovery-baseline.ts';
import { defaultBlobRoot } from '../../src/blob/store.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-C5');
const MODULE_PATH = resolve(REPO_ROOT, 'services/platform/src/backup/recovery-baseline.ts');
const D05_04 = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-04-run-the-full-fire-drill-restore-postgres-blob-end-to-end.md'
);

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron_nonprod';

const RUN_ID = `c5-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function resolveSecretsPath(): string {
  const candidates = [
    process.env.HOLO_SECRETS_PATH,
    process.env.SECRETS_PATH,
    resolve(REPO_ROOT, 'services/platform/config/secrets.yaml'),
    '/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`no secrets.yaml found (checked ${candidates.join(', ')})`);
}

function sha256Utf8(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Synthetic but length-valid bindings when a full backup cycle is not run in-suite. */
function syntheticBindings() {
  // pgBackRest-style label + restic-like short id (both >= 8)
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  return {
    pgbackrestBackupLabel: `${stamp.slice(0, 8)}-${stamp.slice(8)}F-c5${RUN_ID.slice(-4)}`,
    resticSnapshotId: `restic${RUN_ID.replace(/[^a-z0-9]/gi, '').slice(0, 16)}ab`,
  };
}

describe('REDHAT-FIX-C5 recovery baseline (PLATFORM_IT)', () => {
  let cfg: BackupConfig;
  let blobRoot: string;
  let tempBlobRoot: string | null = null;
  let uploaded: {
    baseline: RecoveryBaseline;
    contentKey: string;
    lookupKey: string;
  } | null = null;

  let secretsPath = '';

  beforeAll(() => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    if (!PLATFORM_IT) return;
    secretsPath = resolveSecretsPath();
    process.env.HOLO_SECRETS_PATH = secretsPath;
    cfg = loadBackupConfig({ env: process.env, secretsPath });
    // Prefer a temp blob tree with at least one object so manifest is non-trivial.
    tempBlobRoot = mkdtempSync(join(tmpdir(), 'holo-c5-blob-'));
    const digest = sha256Utf8(`c5-seed-${RUN_ID}`);
    const objDir = join(tempBlobRoot, digest.slice(0, 2));
    mkdirSync(objDir, { recursive: true });
    writeFileSync(join(objDir, digest), `payload-${RUN_ID}\n`, 'utf8');
    blobRoot = tempBlobRoot;
    writeEvidence('setup.json', {
      run_id: RUN_ID,
      bucket: cfg.bucketName,
      endpoint: cfg.endpoint,
      blobRoot,
      secrets: secretsPath,
    });
  });

  afterAll(() => {
    if (tempBlobRoot && existsSync(tempBlobRoot)) {
      rmSync(tempBlobRoot, { recursive: true, force: true });
    }
  });

  it('module recovery-baseline.ts exists (TC-1)', () => {
    expect(existsSync(MODULE_PATH), `missing ${MODULE_PATH}`).toBe(true);
  });

  it('backup package exports recovery baseline helpers (AC-4)', () => {
    expect(typeof backupIndex.captureAndUploadRecoveryBaseline).toBe('function');
    expect(typeof backupIndex.loadRecoveryBaselineFromR2).toBe('function');
    expect(typeof backupIndex.compareRestoredToBaseline).toBe('function');
    expect(typeof backupIndex.computeLedgerSha256).toBe('function');
    expect(backupIndex.RECOVERY_BASELINE_SCHEMA).toBe(RECOVERY_BASELINE_SCHEMA);
  });

  it('D05-04 references recovery baseline / ledger_sha256 / SHA-256 and forbids MD5-only sole oracle (AC-4)', () => {
    expect(existsSync(D05_04)).toBe(true);
    const text = readFileSync(D05_04, 'utf8');
    expect(text).toMatch(/recovery baseline|recovery-baseline|ledger_sha256/i);
    expect(text).toMatch(/SHA-256|sha256/i);
    expect(text).toMatch(
      /never MD5-only|NEVER use MD5 as the only|not MD5-only|MD5-only is never/i
    );
    // Must not leave MD5 as the only integrity mechanism language without SHA-256 baseline.
    expect(text).toMatch(/SHA-256 or stronger|collision-resistant|ledger_sha256/);
    writeEvidence('d05-04-contract-snippet.txt', text.slice(0, 2500));
  });

  itLive(
    'capture|emit: writes immutable recovery-baseline to R2 with SHA-256 bindings (AC-1)',
    () => {
      const conn = connectionFromDatabaseUrl(DATABASE_URL, process.env);
      const bindings = syntheticBindings();
      const lsn = queryTargetLsn(conn);
      expect(lsn, 'target_lsn from live Postgres').toBeTruthy();
      if (!lsn) throw new Error('target_lsn missing');
      expect(lsn.length).toBeGreaterThan(0);

      const counts = captureRowCounts(conn);
      const ledger = computeLedgerSha256(conn);
      expect(normalizeSha256Digest(ledger.ledger_sha256)).toMatch(/^[0-9a-f]{64}$/);
      expect(isMd5OnlyDigest(ledger.ledger_sha256)).toBe(false);

      const blobManifest = computeBlobManifestSha256(blobRoot);
      expect(normalizeSha256Digest(blobManifest)).toMatch(/^[0-9a-f]{64}$/);

      const result = captureAndUploadRecoveryBaseline({
        config: cfg,
        env: process.env,
        databaseUrl: DATABASE_URL,
        blobRoot,
        pgbackrestBackupLabel: bindings.pgbackrestBackupLabel,
        resticSnapshotId: bindings.resticSnapshotId,
        stanza: cfg.stanza,
        targetLsn: lsn,
        rowCounts: counts.row_counts,
        ledgerSha256: ledger.ledger_sha256,
        ledgerPerTableSha256: ledger.per_table,
        blobManifestSha256: blobManifest,
      });

      writeEvidence('capture-emit-result.json', result);
      expect(result.ok, result.errors.join('; ')).toBe(true);
      expect(result.uploaded).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.baseline).toBeTruthy();
      if (!result.baseline || !result.contentKey || !result.lookupKey) {
        throw new Error('baseline upload incomplete');
      }
      const b = result.baseline;
      expect(b.pgbackrest_backup_label.length).toBeGreaterThanOrEqual(8);
      expect(b.restic_snapshot_id.length).toBeGreaterThanOrEqual(8);
      expect(b.target_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(b.target_lsn.length).toBeGreaterThan(0);
      expect(typeof b.row_counts.beliefs === 'number' || b.row_counts.beliefs === undefined).toBe(
        true
      );
      // beliefs key preferred; if table missing, other counts still integer map
      for (const v of Object.values(b.row_counts)) {
        expect(Number.isInteger(v) && v >= 0).toBe(true);
      }
      expect(normalizeSha256Digest(b.ledger_sha256)).toMatch(/^[0-9a-f]{64}$/);
      expect(normalizeSha256Digest(b.blob_manifest_sha256)).toMatch(/^[0-9a-f]{64}$/);
      expect(isMd5OnlyDigest(b.ledger_sha256)).toBe(false);
      expect(b.algorithm).toBe('sha256');
      expect(result.contentKey).toBe(contentAddressedBaselineKey(b.baseline_id));
      expect(result.lookupKey).toBe(
        lookupBaselineKey(b.pgbackrest_backup_label, b.restic_snapshot_id)
      );

      // Round-trip get from R2 (no mini)
      const loaded = loadRecoveryBaselineFromR2({
        config: cfg,
        env: process.env,
        baselineId: b.baseline_id,
      });
      writeEvidence('capture-emit-loaded.json', loaded);
      expect(loaded.ok, loaded.errors.join('; ')).toBe(true);
      expect(loaded.baseline?.baseline_id).toBe(b.baseline_id);
      expect(loaded.baseline?.ledger_sha256).toBe(b.ledger_sha256);

      uploaded = {
        baseline: b,
        contentKey: result.contentKey,
        lookupKey: result.lookupKey,
      };
    }
  );

  itLive(
    'parity|compare: loads baseline from R2 alone and reports POSTGRES_PARITY_PASS + LEDGER_CHECKSUM_MATCH (AC-2)',
    () => {
      expect(uploaded, 'prior capture|emit must populate uploaded baseline').toBeTruthy();
      if (!uploaded) throw new Error('uploaded baseline missing');
      const b = uploaded.baseline;

      // Recompute actuals from same source (simulates restored state matching baseline).
      // Expected side comes ONLY from R2 — no mini required for expected values.
      const conn = connectionFromDatabaseUrl(DATABASE_URL, process.env);
      const actualCounts = captureRowCounts(conn).row_counts;
      const actualLedger = computeLedgerSha256(conn).ledger_sha256;
      const actualBlob = computeBlobManifestSha256(blobRoot);

      const cmp = loadBaselineAndCompare({
        load: {
          config: cfg,
          env: process.env,
          pgbackrestBackupLabel: b.pgbackrest_backup_label,
          resticSnapshotId: b.restic_snapshot_id,
        },
        actualRowCounts: actualCounts,
        actualLedgerSha256: actualLedger,
        actualBlobManifestSha256: actualBlob,
      });

      writeEvidence('parity-compare-result.json', cmp);
      expect(cmp.loadErrors).toEqual([]);
      expect(cmp.ok, cmp.errors.join('; ')).toBe(true);
      expect(cmp.POSTGRES_PARITY_PASS).toBe(true);
      expect(cmp.LEDGER_CHECKSUM_MATCH).toBe(true);
      expect(cmp.expected_ledger_sha256).toBe(normalizeSha256Digest(b.ledger_sha256));
      expect(cmp.actual_ledger_sha256).toBe(normalizeSha256Digest(actualLedger));
      expect(cmp.baseline_id).toBe(b.baseline_id);
      expect(cmp.pgbackrest_backup_label).toBe(b.pgbackrest_backup_label);
      expect(cmp.exitCode).toBe(0);

      // Lookup by content-address alone (still no mini for expected)
      const byId = loadRecoveryBaselineFromR2({
        config: cfg,
        env: process.env,
        baselineId: b.baseline_id,
      });
      expect(byId.ok).toBe(true);
      expect(byId.baseline?.pgbackrest_backup_label).toBe(b.pgbackrest_backup_label);
    }
  );

  itLive('tamper|mismatch|fail: ledger_sha256 mismatch fails closed (AC-3)', () => {
    expect(uploaded).toBeTruthy();
    if (!uploaded) throw new Error('uploaded baseline missing');
    const b = uploaded.baseline;
    const tamperedLedger = sha256Utf8(`tampered-ledger-${RUN_ID}`);
    expect(tamperedLedger).not.toBe(normalizeSha256Digest(b.ledger_sha256));

    const cmp = compareRestoredToBaseline({
      baseline: b,
      actualRowCounts: b.row_counts,
      actualLedgerSha256: tamperedLedger,
      actualBlobManifestSha256: b.blob_manifest_sha256,
    });

    writeEvidence('tamper-mismatch-result.json', cmp);
    expect(cmp.ok).toBe(false);
    expect(cmp.exitCode).not.toBe(0);
    expect(cmp.LEDGER_CHECKSUM_MATCH).toBe(false);
    expect(cmp.expected_ledger_sha256).toBe(normalizeSha256Digest(b.ledger_sha256));
    expect(cmp.actual_ledger_sha256).toBe(tamperedLedger);
    expect(cmp.errors.some((e) => /LEDGER_CHECKSUM_MATCH=false|mismatch/i.test(e))).toBe(true);

    // Row-count mismatch also fails closed
    const badCounts = { ...b.row_counts, beliefs: (b.row_counts.beliefs ?? 0) + 999_001 };
    const cmpCounts = compareRestoredToBaseline({
      baseline: b,
      actualRowCounts: badCounts,
      actualLedgerSha256: b.ledger_sha256,
    });
    writeEvidence('tamper-rowcount-result.json', cmpCounts);
    expect(cmpCounts.ok).toBe(false);
    expect(cmpCounts.POSTGRES_PARITY_PASS).toBe(false);
    expect(cmpCounts.exitCode).not.toBe(0);

    // Missing baseline key fails closed
    const missing = loadBaselineAndCompare({
      load: {
        config: cfg,
        env: process.env,
        baselineId: '0'.repeat(64),
      },
      actualRowCounts: b.row_counts,
      actualLedgerSha256: b.ledger_sha256,
    });
    writeEvidence('missing-baseline-result.json', missing);
    expect(missing.ok).toBe(false);
    expect(missing.exitCode).not.toBe(0);
    expect(missing.POSTGRES_PARITY_PASS).toBe(false);
    expect(missing.LEDGER_CHECKSUM_MATCH).toBe(false);
  });

  itLive('validate rejects MD5-only ledger as sole digest (AC-1 negative)', () => {
    const conn = defaultSourceConnection(process.env);
    const bindings = syntheticBindings();
    const lsn = queryTargetLsn(conn) ?? '0/0';
    const md5Only = createHash('md5').update('not-allowed', 'utf8').digest('hex');
    expect(isMd5OnlyDigest(md5Only)).toBe(true);

    expect(() =>
      buildRecoveryBaseline({
        pgbackrestBackupLabel: bindings.pgbackrestBackupLabel,
        resticSnapshotId: bindings.resticSnapshotId,
        targetLsn: lsn,
        rowCounts: { beliefs: 0, sources: 0, passages: 0, claims: 0 },
        ledgerSha256: md5Only,
        blobManifestSha256: sha256Utf8('blob'),
        conn,
      })
    ).toThrow(/SHA-256|MD5/i);

    const badDoc = {
      schema_version: RECOVERY_BASELINE_SCHEMA,
      baseline_id: 'a'.repeat(64),
      captured_at: new Date().toISOString(),
      target_timestamp: new Date().toISOString(),
      target_lsn: lsn,
      stanza: 'main',
      pgbackrest_backup_label: bindings.pgbackrestBackupLabel,
      restic_snapshot_id: bindings.resticSnapshotId,
      row_counts: { beliefs: 1 },
      ledger_sha256: md5Only,
      blob_manifest_sha256: sha256Utf8('x'),
      algorithm: 'sha256',
    };
    const v = validateRecoveryBaseline(badDoc);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /MD5|SHA-256|ledger_sha256/i.test(e))).toBe(true);
    writeEvidence('md5-only-reject.json', v);
  });

  itLive('defaultBlobRoot path is available for production mirror hook', () => {
    const root = defaultBlobRoot(REPO_ROOT);
    expect(typeof root).toBe('string');
    writeEvidence('default-blob-root.txt', root);
  });
});
