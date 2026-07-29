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
 *   pnpm vitest run services/platform/tests/integration/sprint28-gate-fix-qa1.test.ts
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-gate-fix-qa1.test.ts
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { selectBestFireDrillBaseline } from '../../src/backup/fire-drill.ts';
import type { RecoveryBaseline } from '../../src/backup/recovery-baseline.ts';
import {
  baselineDomainRowTotal,
  captureAndUploadRecoveryBaseline,
  isBaselineParityMeaningful,
  RECOVERY_BASELINE_SCHEMA,
  verifyResticSnapshotInRepo,
} from '../../src/backup/recovery-baseline.ts';
import {
  classifyPostgresStartFailure,
  mapPostgresStartFailureNamedErrors,
} from '../../src/backup/restore.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-QA1');

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

  it('TC-1c: archive-get / missing WAL log classifies as outside available WAL', () => {
    const log =
      'pgbackrest archive-get: [ERROR] raised from remote-0 protocol on host: unable to find WAL file 000000010000000000000099';
    const named = classifyPostgresStartFailure(log);
    expect(named.some((e) => /outside available WAL/i.test(e))).toBe(true);
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
        resolve(REPO_ROOT, 'services/platform/config/secrets.yaml'),
        '/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml',
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
