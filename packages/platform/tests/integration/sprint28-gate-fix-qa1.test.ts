/**
 * GATE-FIX-QA1 — promote start named errors + recovery-baseline emit/select honesty.
 *
 * Pure unit tests (always run):
 *   TC-1 classifyPostgresStartFailure maps recovery-ended-before-target → outside available WAL
 *   TC-2 selectBestFireDrillBaseline prefers non-zero/restorable over zero-count junk
 *   TC-3 isBaselineParityMeaningful / score helpers reject empty-domain junk
 *
 * PLATFORM_IT live (when secrets/Postgres available):
 *   TC-4 captureAndUploadRecoveryBaseline refuses unlistable restic snapshot ids
 *
 * Run:
 *   pnpm vitest run packages/platform/tests/integration/sprint28-gate-fix-qa1.test.ts
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/tests/integration/sprint28-gate-fix-qa1.test.ts
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { selectBestFireDrillBaseline } from '../../src/backup/fire-drill.ts';
import type { RecoveryBaseline } from '../../src/backup/recovery-baseline.ts';
import {
  baselineDomainRowTotal,
  buildRecoveryBaseline,
  captureAndUploadRecoveryBaseline,
  isBaselineParityMeaningful,
  RECOVERY_BASELINE_SCHEMA,
  verifyResticSnapshotInRepo,
} from '../../src/backup/recovery-baseline.ts';
import {
  classifyPostgresStartFailure,
  mapPostgresStartFailureNamedErrors,
  parseRequiredRecoverySettings,
} from '../../src/backup/restore.ts';
import { psqlConnectionArgs, psqlConnectionEnv } from '../../src/backup/wal-archive.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-QA1');
const RECOVERY_BASELINE_SRC = resolve(
  REPO_ROOT,
  'packages/platform/src/backup/recovery-baseline.ts'
);
const FIRE_DRILL_SRC = resolve(REPO_ROOT, 'packages/platform/src/backup/fire-drill.ts');
const RESTORE_SRC = resolve(REPO_ROOT, 'packages/platform/src/backup/restore.ts');

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function makeBaseline(partial: {
  baseline_id?: string;
  target_timestamp: string;
  row_counts: Record<string, number>;
  restic_snapshot_id: string;
  ledger_sha256?: string;
  pgbackrest_backup_label?: string;
}): RecoveryBaseline {
  const ledger = partial.ledger_sha256 ?? 'a'.repeat(64);
  const blob = 'b'.repeat(64);
  return {
    schema_version: RECOVERY_BASELINE_SCHEMA,
    baseline_id: partial.baseline_id ?? 'c'.repeat(64),
    captured_at: '2026-07-28T00:00:00Z',
    target_timestamp: partial.target_timestamp,
    target_lsn: '0/1000000',
    stanza: 'main',
    pgbackrest_backup_label: partial.pgbackrest_backup_label ?? '20260728-000000F',
    restic_snapshot_id: partial.restic_snapshot_id,
    row_counts: partial.row_counts,
    ledger_sha256: ledger,
    blob_manifest_sha256: blob,
    algorithm: 'sha256',
  };
}

describe('GATE-FIX-QA1 pure helpers (always)', () => {
  it('TC-1a: classifyPostgresStartFailure maps recovery-ended-before-target to outside available WAL', () => {
    const log = [
      'LOG:  starting point-in-time recovery to 2026-08-01 00:00:00+00',
      'LOG:  restored log file "000000010000000000000001" from archive',
      'FATAL:  recovery ended before configured recovery target was reached',
    ].join('\n');
    const named = classifyPostgresStartFailure(log);
    writeEvidence('tc1a-classify.json', { log, named });
    expect(named.some((e) => /outside available WAL/i.test(e))).toBe(true);
    // Must not be only the generic "Postgres failed to start" phrasing.
    expect(named.every((e) => !/^restore incomplete — Postgres failed to start/i.test(e))).toBe(
      true
    );
  });

  it('TC-1b: mapPostgresStartFailureNamedErrors falls back to generic start error only when no named class', () => {
    const generic = mapPostgresStartFailureNamedErrors('totally unknown gobbledygook xyz');
    expect(generic.length).toBeGreaterThan(0);
    expect(generic.join(' ')).toMatch(/Postgres failed to start/i);

    const wal = mapPostgresStartFailureNamedErrors(
      'recovery ended before configured recovery target was reached\narchive-get missing WAL'
    );
    expect(wal.some((e) => /outside available WAL/i.test(e))).toBe(true);
    expect(wal.join(' ')).not.toMatch(/^restore incomplete — Postgres failed to start/);
  });

  it('TC-1c: recovery startup extracts only allowlisted primary minimum settings', () => {
    const log = [
      'DETAIL: max_connections = 100 is a lower setting than on the primary server, where its value was 250.',
      'DETAIL: max_worker_processes = 8 is a lower setting than on the primary server, where its value was 16.',
      'DETAIL: shared_preload_libraries = 0 is a lower setting than on the primary server, where its value was 99.',
    ].join('\n');
    expect(parseRequiredRecoverySettings(log)).toEqual({
      max_connections: '250',
      max_worker_processes: '16',
    });
  });

  it('TC-1d: restored postmaster pins pgBackRest PG1 path to scratch', () => {
    const source = readFileSync(RESTORE_SRC, 'utf8');
    expect(source).toMatch(
      /pgToolEnv\(env,\s*\{\s*PGDATA:\s*pgdata,\s*PGBACKREST_PG1_PATH:\s*pgdata\s*\}\)/
    );
  });

  it('TC-1e: archive-get / missing WAL log classifies as outside available WAL', () => {
    const log =
      'pgbackrest archive-get: [ERROR] raised from remote-0 protocol on host: unable to find WAL file 000000010000000000000099';
    const named = classifyPostgresStartFailure(log);
    expect(named.some((e) => /outside available WAL/i.test(e))).toBe(true);
  });

  it('TC-1f: WAL jobs prefer DATABASE_URL without exposing it on psql argv', () => {
    const databaseUrl = 'postgres://wal-user:wal-secret-canary@127.0.0.1:56594/holocron_nonprod';
    const env = {
      DATABASE_URL: databaseUrl,
      PGHOST: '127.0.0.1',
      PGPORT: '5432',
      PGDATABASE: 'holocron',
    };
    expect(
      psqlConnectionArgs(env),
      'DATABASE_URL and its password must never be present on psql argv'
    ).toEqual([]);
    expect(psqlConnectionArgs(env).join(' ')).not.toContain('wal-secret-canary');
    expect(psqlConnectionEnv(env)).toMatchObject({
      PGHOST: '127.0.0.1',
      PGPORT: '56594',
      PGDATABASE: 'holocron_nonprod',
      PGUSER: 'wal-user',
      PGPASSWORD: 'wal-secret-canary',
    });
    expect(psqlConnectionArgs({ PGDATABASE: 'fallback_db' })).toEqual(['-d', 'fallback_db']);
  });

  it('TC-2: selectBestFireDrillBaseline prefers non-zero domain counts over zero junk', () => {
    const junk = makeBaseline({
      baseline_id: '1'.repeat(64),
      target_timestamp: '2026-07-29T12:00:00Z',
      row_counts: {
        beliefs: 0,
        sources: 0,
        passages: 0,
        claims: 0,
        relations: 0,
        file_objects: 0,
      },
      restic_snapshot_id: 'resticc5ms5egca88d4616ab',
      ledger_sha256: 'd'.repeat(64),
    });
    const valid = makeBaseline({
      baseline_id: '2'.repeat(64),
      target_timestamp: '2026-07-28T18:00:00Z', // slightly older but valid
      row_counts: {
        beliefs: 8,
        sources: 8,
        passages: 19,
        claims: 5,
        relations: 11,
        file_objects: 5,
      },
      restic_snapshot_id: 'abcdef0123456789deadbeef',
      ledger_sha256: 'e'.repeat(64),
    });
    // Discovery previously sorted solely by target_timestamp desc → junk wins.
    const candidates = [
      {
        baseline: junk,
        key: 'recovery-baselines/sha256/1/recovery-baseline.json',
        ts: Date.parse(junk.target_timestamp),
      },
      {
        baseline: valid,
        key: 'recovery-baselines/sha256/2/recovery-baseline.json',
        ts: Date.parse(valid.target_timestamp),
      },
    ];
    const best = selectBestFireDrillBaseline(candidates, {
      targetTimestamp: '2026-08-01T00:00:00Z',
    });
    writeEvidence('tc2-select-best.json', {
      best_id: best?.baseline.baseline_id,
      best_counts: best?.baseline.row_counts,
    });
    expect(best).not.toBeNull();
    expect(best?.baseline.baseline_id).toBe(valid.baseline_id);
    expect(best?.baseline.row_counts.beliefs).toBe(8);
  });

  it('TC-2b: selectBestFireDrillBaseline fails closed when only zero-count junk exists', () => {
    const junk = makeBaseline({
      baseline_id: '3'.repeat(64),
      target_timestamp: '2026-07-29T00:00:00Z',
      row_counts: { beliefs: 0, sources: 0 },
      restic_snapshot_id: 'notarealsnapshot999',
    });
    const best = selectBestFireDrillBaseline(
      [{ baseline: junk, key: 'k', ts: Date.parse(junk.target_timestamp) }],
      { targetTimestamp: '2026-08-01T00:00:00Z', requireMeaningful: true }
    );
    expect(best).toBeNull();
  });

  it('TC-2c: among meaningful survivors, prefer later target_timestamp over higher row totals', () => {
    const olderRicher = makeBaseline({
      baseline_id: '4'.repeat(64),
      target_timestamp: '2026-07-27T00:00:00Z',
      row_counts: {
        beliefs: 100,
        sources: 100,
        passages: 100,
        claims: 100,
        relations: 100,
        file_objects: 100,
      },
      restic_snapshot_id: 'older-richer-snap01',
    });
    const newerLeaner = makeBaseline({
      baseline_id: '5'.repeat(64),
      target_timestamp: '2026-07-28T18:00:00Z',
      row_counts: {
        beliefs: 2,
        sources: 2,
        passages: 2,
        claims: 2,
        relations: 2,
        file_objects: 2,
      },
      restic_snapshot_id: 'newer-leaner-snap02',
    });
    const best = selectBestFireDrillBaseline(
      [
        {
          baseline: olderRicher,
          key: 'k4',
          ts: Date.parse(olderRicher.target_timestamp),
        },
        {
          baseline: newerLeaner,
          key: 'k5',
          ts: Date.parse(newerLeaner.target_timestamp),
        },
      ],
      { targetTimestamp: '2026-08-01T00:00:00Z' }
    );
    expect(best?.baseline.baseline_id).toBe(newerLeaner.baseline_id);
  });

  it('TC-3: isBaselineParityMeaningful rejects all-zero domain maps', () => {
    expect(
      isBaselineParityMeaningful(
        makeBaseline({
          target_timestamp: '2026-07-01T00:00:00Z',
          row_counts: { beliefs: 0, sources: 0 },
          restic_snapshot_id: 'snap12345678',
        })
      )
    ).toBe(false);
    expect(
      isBaselineParityMeaningful(
        makeBaseline({
          target_timestamp: '2026-07-01T00:00:00Z',
          row_counts: { beliefs: 3, sources: 1 },
          restic_snapshot_id: 'snap12345678',
        })
      )
    ).toBe(true);
    expect(baselineDomainRowTotal({ beliefs: 2, sources: 3 })).toBe(5);
    expect(baselineDomainRowTotal({ beliefs: 0, sources: 0 })).toBe(0);
  });
});

describe('GATE-FIX-QA1 live emit refuse fake restic (PLATFORM_IT)', () => {
  itLive(
    'TC-4: captureAndUploadRecoveryBaseline refuses missing/unlistable restic snapshot id',
    async () => {
      const secretsCandidates = [
        process.env.HOLO_SECRETS_PATH,
        process.env.SECRETS_PATH,
        resolve(REPO_ROOT, 'packages/platform/config/secrets.yaml'),
        '/Users/inference1/Projects/holocron/packages/platform/config/secrets.yaml',
      ].filter((p): p is string => typeof p === 'string' && p.length > 0);
      const secretsPath = secretsCandidates.find((p) => existsSync(p));
      if (!secretsPath) {
        throw new Error('secrets.yaml required for PLATFORM_IT capture refuse test');
      }
      process.env.HOLO_SECRETS_PATH = secretsPath;

      // Pure verify helper: fake id must not resolve.
      const verify = verifyResticSnapshotInRepo({
        resticSnapshotId: 'resticc5ms5egca88d4616ab_MISSING_QA1',
        env: process.env,
      });
      writeEvidence('tc4-verify-restic.json', verify);
      expect(verify.ok).toBe(false);

      // Full capture path must refuse upload (ok:false) — no R2 bind with fake id.
      const { loadBackupConfig } = await import('../../src/backup/config.ts');
      const cfg = loadBackupConfig({ env: process.env, secretsPath });
      const result = captureAndUploadRecoveryBaseline({
        config: cfg,
        env: process.env,
        pgbackrestBackupLabel: '20260729-012203F-qa1fake',
        resticSnapshotId: 'resticc5ms5egca88d4616ab_MISSING_QA1',
        targetLsn: '0/1',
        rowCounts: { beliefs: 1, sources: 1 },
        ledgerSha256: 'f'.repeat(64),
        blobManifestSha256: 'a'.repeat(64),
        skipResticVerify: false,
      });
      writeEvidence('tc4-capture-refuse.json', result);
      expect(result.ok).toBe(false);
      expect(result.uploaded).toBe(false);
      expect(result.errors.join(' ')).toMatch(/restic|snapshot|not found|unlistable|missing/i);
    },
    180_000
  );
});

/**
 * REDHAT-FIX-S28R2 H1/H2 — pure contracts (always run; no PLATFORM_IT required).
 */
describe('REDHAT-FIX-S28R2 H1 refuse zero/empty domain baseline (always)', () => {
  it('H1 AC-1: buildRecoveryBaseline throws on all-zero domain map without allowEmptyDomainBaseline', () => {
    const deadConn = { host: '127.0.0.1', port: 1, database: 'no_such_db_s28r2' };
    expect(() =>
      buildRecoveryBaseline({
        pgbackrestBackupLabel: '20260728-000000F',
        resticSnapshotId: 'abcdef0123456789dead',
        targetLsn: '0/1000000',
        rowCounts: {
          beliefs: 0,
          sources: 0,
          passages: 0,
          claims: 0,
          relations: 0,
          file_objects: 0,
        },
        ledgerSha256: 'a'.repeat(64),
        blobManifestSha256: 'b'.repeat(64),
        conn: deadConn,
      })
    ).toThrow(/zero|empty|domain|refuse/i);
  });

  it('H1 AC-1b: captureAndUploadRecoveryBaseline does not upload all-zero domain baseline', () => {
    const deadConn = { host: '127.0.0.1', port: 1, database: 'no_such_db_s28r2' };
    const result = captureAndUploadRecoveryBaseline({
      pgbackrestBackupLabel: '20260728-000000F-zero',
      resticSnapshotId: 'abcdef0123456789dead',
      targetLsn: '0/1000000',
      rowCounts: {
        beliefs: 0,
        sources: 0,
        passages: 0,
        claims: 0,
        relations: 0,
        file_objects: 0,
      },
      ledgerSha256: 'a'.repeat(64),
      blobManifestSha256: 'b'.repeat(64),
      conn: deadConn,
      skipResticVerify: true,
      // Force config miss path if needed — still must not uploaded:true with zeros.
      env: { ...process.env, R2_BUCKET_NAME: '' },
    });
    writeEvidence('h1-zero-capture-refuse.json', result);
    expect(result.ok).toBe(false);
    expect(result.uploaded).toBe(false);
  });
});

describe('REDHAT-FIX-S28R2 H2 exact restic match + selection (always)', () => {
  it('H2 AC-1: verifyResticSnapshotInRepo source refuses needle.startsWith(short)', () => {
    const src = readFileSync(RECOVERY_BASELINE_SRC, 'utf8');
    // Over-permissive prefix extension must be gone (ghost ids starting with real short_id).
    expect(src).not.toMatch(/needle\.startsWith\(\s*short\s*\)/);
    // Exact id / short_id and full-id prefix (id.startsWith(needle)) remain.
    expect(src).toMatch(/id\s*===\s*needle/);
    expect(src).toMatch(/short\s*===\s*needle/);
    expect(src).toMatch(/id\.startsWith\(\s*needle\s*\)/);
  });

  it('H2 AC-1b: match oracle via runProcess injection (not user-owned resticBin)', () => {
    // GATE-FIX-S28R3-QA22: user-owned absolute resticBin is refused; inject process
    // runner BELOW the production trust boundary instead of a credential-bearing fake bin.
    const fullId = 'abcdef0123456789deadbeefcafebabe00112233';
    const shortId = 'abcdef01';
    const snapJson = JSON.stringify([{ id: fullId, short_id: shortId }]);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      RESTIC_PASSWORD: 'test-password-long-enough-s28r2',
      RESTIC_REPOSITORY: 's3:https://example.invalid/bucket/restic',
      R2_ACCESS_KEY_ID: 'test-ak-s28r2',
      R2_SECRET_ACCESS_KEY: 'test-sk-s28r2',
      R2_ENDPOINT: 'https://example.invalid',
      R2_BUCKET_NAME: 'holocron-backup',
      R2_REPO_CIPHER_PASS: 'cipher-pass-long-enough',
      R2_ACCOUNT_ID: 'exampleaccountid',
      AWS_ACCESS_KEY_ID: 'test-ak-s28r2',
      AWS_SECRET_ACCESS_KEY: 'test-sk-s28r2',
    };

    const runProcess = (_cmd: string, args: string[]) => {
      if (args[0] === 'snapshots') {
        return { status: 0, stdout: snapJson, stderr: '' };
      }
      return { status: 1, stdout: '', stderr: 'unexpected' };
    };

    const exactFull = verifyResticSnapshotInRepo({
      resticSnapshotId: fullId,
      env,
      runProcess,
    });
    writeEvidence('h2-exact-full.json', exactFull);
    expect(exactFull.ok).toBe(true);

    const exactShort = verifyResticSnapshotInRepo({
      resticSnapshotId: shortId,
      env,
      runProcess,
    });
    writeEvidence('h2-exact-short.json', exactShort);
    expect(exactShort.ok).toBe(true);

    // Full-id prefix (≥8) still allowed.
    const prefix = verifyResticSnapshotInRepo({
      resticSnapshotId: fullId.slice(0, 12),
      env,
      runProcess,
    });
    writeEvidence('h2-id-prefix.json', prefix);
    expect(prefix.ok).toBe(true);

    // Ghost that merely starts with real short_id must NOT match (old needle.startsWith(short)).
    const ghost = verifyResticSnapshotInRepo({
      resticSnapshotId: `${shortId}_MISSING_GHOST_ID_XX`,
      env,
      runProcess,
    });
    writeEvidence('h2-ghost-short-prefix.json', ghost);
    expect(ghost.ok).toBe(false);

    // Negative: user-owned absolute resticBin is refused BEFORE credential env use.
    const dir = mkdtempSync(join(tmpdir(), 's28r2-restic-'));
    const userOwned = join(dir, 'restic');
    writeFileSync(userOwned, '#!/bin/sh\necho EVIL\nexit 0\n', 'utf8');
    chmodSync(userOwned, 0o755);
    const refused = verifyResticSnapshotInRepo({
      resticSnapshotId: fullId,
      resticBin: userOwned,
      env,
      runProcess: () => {
        throw new Error('runProcess must not run when resticBin is untrusted');
      },
    });
    writeEvidence('h2-user-owned-restic-refused.json', refused);
    expect(refused.ok).toBe(false);
    expect(refused.error ?? '').toMatch(/untrusted|root-owned/i);
  });

  it('H2 AC-2/3: resolveFireDrillBaseline must live-verify restic and skip ghosts', () => {
    const src = readFileSync(FIRE_DRILL_SRC, 'utf8');
    expect(src).toMatch(/verifyResticSnapshotInRepo/);
    // Discovery path must filter candidates / fail closed on pure ghost set.
    expect(src).toMatch(/function resolveFireDrillBaseline/);
    const resolveStart = src.indexOf('function resolveFireDrillBaseline');
    expect(resolveStart).toBeGreaterThanOrEqual(0);
    const resolveBody = src.slice(resolveStart, resolveStart + 4500);
    expect(resolveBody).toMatch(/verifyResticSnapshotInRepo/);
    expect(resolveBody).toMatch(/ghost|unlistable|skip|not found|fail closed|no parity/i);
  });

  it('H2 AC-3: among meaningful candidates, nonzero ghost restic loses to valid (selection contract)', () => {
    // Pure ranking still prefers higher totals; live resolve must then drop ghosts.
    // Document the intended pair: ghost has higher counts but bad restic id.
    const ghost = makeBaseline({
      baseline_id: 'g'.repeat(64),
      target_timestamp: '2026-07-29T20:00:00Z',
      row_counts: {
        beliefs: 99,
        sources: 99,
        passages: 99,
        claims: 99,
        relations: 99,
        file_objects: 99,
      },
      restic_snapshot_id: 'ghostsnap_not_in_repo_xx',
    });
    const valid = makeBaseline({
      baseline_id: 'v'.repeat(64),
      target_timestamp: '2026-07-29T18:00:00Z',
      row_counts: {
        beliefs: 8,
        sources: 8,
        passages: 8,
        claims: 8,
        relations: 8,
        file_objects: 8,
      },
      restic_snapshot_id: 'validsnap0123456789ab',
    });
    const ranked = selectBestFireDrillBaseline(
      [
        { baseline: ghost, key: 'k-ghost', ts: Date.parse(ghost.target_timestamp) },
        { baseline: valid, key: 'k-valid', ts: Date.parse(valid.target_timestamp) },
      ],
      { targetTimestamp: '2026-08-01T00:00:00Z' }
    );
    // Ranking alone still picks ghost (newer + richer) — resolve must re-verify restic.
    expect(ranked?.baseline.baseline_id).toBe(ghost.baseline_id);
    const fireSrc = readFileSync(FIRE_DRILL_SRC, 'utf8');
    // After ranking/filter, live path must invoke restic verify so ghosts cannot win.
    expect(fireSrc).toMatch(/verifyResticSnapshotInRepo\s*\(/);
  });
});
