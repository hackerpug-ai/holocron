/**
 * GATE-FIX-QA3 — truthful recoverable recovery baseline (no temporal relabeling).
 *
 * Pure (always):
 *   TC-1 / AC-1: coherent capture-then-cover binding (target_timestamp + payload joint)
 *   TC-2 / AC-2: refuse labeling later-captured payload with older backup stop S
 *   TC-3 / AC-3: refuse when coverage/as-of cannot be proven
 *   TC-4 / AC-4: fire-drill selection loads window-truthful baseline at recommended_pitr
 *
 * PLATFORM_IT:
 *   emit path refuses temporal relabel; coherent emit when cover is injected
 *
 * Run:
 *   pnpm vitest run packages/platform/tests/integration/sprint28-gate-fix-qa3.test.ts
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/tests/integration/sprint28-gate-fix-qa3.test.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { selectBestFireDrillBaseline } from '../../src/backup/fire-drill.ts';
import type { RecoveryBaseline } from '../../src/backup/recovery-baseline.ts';
import {
  buildRecoveryBaseline,
  emitLiveRecoveryBaseline,
  parseBackupStopForLabel,
  RECOVERY_BASELINE_SCHEMA,
  resolveRecoverableBaselineBinding,
} from '../../src/backup/recovery-baseline.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-QA3');
const RECOVERY_BASELINE_SRC = resolve(
  REPO_ROOT,
  'packages/platform/src/backup/recovery-baseline.ts'
);

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
    captured_at: '2026-07-29T00:00:00.000Z',
    target_timestamp: partial.target_timestamp,
    target_lsn: '0/1000000',
    stanza: 'main',
    pgbackrest_backup_label: partial.pgbackrest_backup_label ?? '20260729-002802F',
    restic_snapshot_id: partial.restic_snapshot_id,
    row_counts: partial.row_counts,
    ledger_sha256: ledger,
    blob_manifest_sha256: blob,
    algorithm: 'sha256',
  };
}

const STOP_S = '2026-07-29T00:28:02Z';
const CAPTURE_T = '2026-07-29T00:27:50.000Z'; // before stop — honest capture-then-cover
const LATER_T = '2026-07-29T06:17:48.998Z'; // wall clock after stop (QA fail shape)
const LABEL = '20260729-002802F';

describe('GATE-FIX-QA3 pure helpers (always)', () => {
  it('TC-1 / AC-1: capture-then-cover binds target_timestamp to capture T when stop S >= T', () => {
    const bound = resolveRecoverableBaselineBinding({
      payloadCapturedAt: CAPTURE_T,
      backupStopAt: STOP_S,
      pgbackrestBackupLabel: LABEL,
      coverageProvenThroughCapture: true,
    });
    writeEvidence('tc1-capture-then-cover.json', bound);
    expect(bound.ok).toBe(true);
    if (!bound.ok) throw new Error(bound.errors.join('; '));
    expect(bound.mode).toBe('capture_then_cover');
    expect(Date.parse(bound.target_timestamp)).toBe(Date.parse(CAPTURE_T));
    // Recoverable at recommended_pitr = stop: target <= stop
    expect(Date.parse(bound.target_timestamp)).toBeLessThanOrEqual(Date.parse(STOP_S));
    expect(bound.pgbackrest_backup_label).toBe(LABEL);
  });

  it('TC-1b / AC-1: parseBackupStopForLabel reads real pgBackRest stop metadata', () => {
    const stopSec = Math.floor(Date.parse(STOP_S) / 1000);
    const info = JSON.stringify([
      {
        name: 'main',
        backup: [
          {
            label: LABEL,
            timestamp: { start: stopSec - 120, stop: stopSec },
          },
          {
            label: '20260728-120000F',
            timestamp: { start: stopSec - 86_400, stop: stopSec - 86_000 },
          },
        ],
      },
    ]);
    const parsed = parseBackupStopForLabel(info, LABEL);
    writeEvidence('tc1b-parse-stop.json', parsed);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('expected parseBackupStopForLabel result');
    expect(parsed.label).toBe(LABEL);
    expect(Date.parse(parsed.stopAt)).toBe(stopSec * 1000);
  });

  it('TC-2 / AC-2: refuse temporal relabel — later-captured payload cannot use older stop S', () => {
    // Classic anti-pattern: digests captured at LATER_T, stamp target_timestamp=STOP_S.
    const relabel = resolveRecoverableBaselineBinding({
      payloadCapturedAt: LATER_T,
      backupStopAt: STOP_S,
      pgbackrestBackupLabel: LABEL,
      // No coverage after capture, no as-of derivation — only a request to use S.
      requestedTargetTimestamp: STOP_S,
      coverageProvenThroughCapture: false,
      asOfDerivedAtStop: false,
    });
    writeEvidence('tc2-temporal-relabel-refuse.json', relabel);
    expect(relabel.ok).toBe(false);
    if (relabel.ok) throw new Error('expected refuse');
    expect(relabel.errors.join(' ').toLowerCase()).toMatch(
      /temporal relabel|refuse|coverage|as-of|later/
    );

    // Even if someone sets coverageProvenThroughCapture while stop < capture — refuse.
    const falseCover = resolveRecoverableBaselineBinding({
      payloadCapturedAt: LATER_T,
      backupStopAt: STOP_S,
      pgbackrestBackupLabel: LABEL,
      coverageProvenThroughCapture: true, // lie: stop is before capture
      requestedTargetTimestamp: STOP_S,
    });
    expect(falseCover.ok).toBe(false);
  });

  it('TC-2b / AC-2: buildRecoveryBaseline refuses temporal relabel of later payload to older S', () => {
    const deadConn = { host: '127.0.0.1', port: 1, database: 'no_such_db_gate_fix_qa3' };
    expect(() =>
      buildRecoveryBaseline({
        pgbackrestBackupLabel: LABEL,
        resticSnapshotId: 'abcdef0123456789deadbeef',
        targetLsn: '0/1000000',
        targetTimestamp: STOP_S,
        payloadCapturedAt: LATER_T,
        backupStopAt: STOP_S,
        coverageProvenThroughCapture: false,
        asOfDerivedAtStop: false,
        rowCounts: {
          beliefs: 8,
          sources: 8,
          passages: 19,
          claims: 5,
          relations: 11,
          file_objects: 5,
        },
        ledgerSha256: 'a'.repeat(64),
        blobManifestSha256: 'b'.repeat(64),
        conn: deadConn,
      })
    ).toThrow(/temporal relabel|refuse|coverage|as-of|later/i);
  });

  it('TC-3 / AC-3: missing coverage / as-of proof → refuse (no fabricated timestamp)', () => {
    const missing = resolveRecoverableBaselineBinding({
      payloadCapturedAt: LATER_T,
      backupStopAt: STOP_S,
      pgbackrestBackupLabel: LABEL,
    });
    writeEvidence('tc3-missing-coverage.json', missing);
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error('expected refuse');
    // Fail closed: no successful target_timestamp property on refuse result.
    expect(missing).not.toHaveProperty('target_timestamp');
    expect(missing.errors.join(' ').toLowerCase()).toMatch(
      /refuse|coverage|as-of|temporal relabel/
    );
  });

  it('TC-4 / AC-4: selection at recommended_pitr loads window-truthful baseline', () => {
    const recommended = STOP_S;
    const wallClockLater = makeBaseline({
      baseline_id: '1'.repeat(64),
      target_timestamp: LATER_T, // after recommended — correctly filtered out
      row_counts: {
        beliefs: 8,
        sources: 8,
        passages: 19,
        claims: 5,
        relations: 11,
        file_objects: 5,
      },
      restic_snapshot_id: 'laterresticsnap01',
    });
    const windowTruthful = makeBaseline({
      baseline_id: '2'.repeat(64),
      target_timestamp: CAPTURE_T, // <= recommended, coherent with stop
      row_counts: {
        beliefs: 8,
        sources: 8,
        passages: 19,
        claims: 5,
        relations: 11,
        file_objects: 5,
      },
      restic_snapshot_id: 'windowresticsnap1',
    });
    const candidates = [
      {
        baseline: wallClockLater,
        key: 'recovery-baselines/sha256/1/recovery-baseline.json',
        ts: Date.parse(wallClockLater.target_timestamp),
      },
      {
        baseline: windowTruthful,
        key: 'recovery-baselines/sha256/2/recovery-baseline.json',
        ts: Date.parse(windowTruthful.target_timestamp),
      },
    ].filter((c) => c.ts <= Date.parse(recommended));

    const best = selectBestFireDrillBaseline(candidates, {
      targetTimestamp: recommended,
      requireMeaningful: true,
    });
    writeEvidence('tc4-select-at-recommended.json', {
      recommended,
      filtered: candidates.map((c) => c.baseline.baseline_id),
      best_id: best?.baseline.baseline_id ?? null,
    });
    expect(best).not.toBeNull();
    if (!best) throw new Error('expected selectBestFireDrillBaseline result');
    expect(best.baseline.baseline_id).toBe(windowTruthful.baseline_id);
    expect(Date.parse(best.baseline.target_timestamp)).toBeLessThanOrEqual(Date.parse(recommended));
  });

  it('TC-anti-pattern: source must not only stamp recommended_pitr onto live payload', () => {
    const src = readFileSync(RECOVERY_BASELINE_SRC, 'utf8');
    // Must have explicit joint-truth binding helper (not wall-clock-only emit).
    expect(src).toMatch(/resolveRecoverableBaselineBinding/);
    expect(src).toMatch(/coverageProvenThroughCapture|capture_then_cover|temporal relabel/i);
    // Forbidden shortcut: assign recommended_pitr as target without binding proof.
    expect(src).not.toMatch(
      /targetTimestamp\s*=\s*window\.recommended_pitr|target_timestamp:\s*recommended_pitr/
    );
  });
});

describe('GATE-FIX-QA3 emit path (PLATFORM_IT or pure inject)', () => {
  it('AC-2 inject: emitLiveRecoveryBaseline refuses later payload labeled as older stop', () => {
    const result = emitLiveRecoveryBaseline({
      resticSnapshotId: 'resticc5ms5egca88d4616ab',
      blobRoot: existsSync(resolve(REPO_ROOT, 'data/blobs'))
        ? resolve(REPO_ROOT, 'data/blobs')
        : resolve(REPO_ROOT, '.tmp'),
      // Simulate the anti-pattern path via injectable coverage/query seams.
      payloadCapturedAt: LATER_T,
      backupStopAt: STOP_S,
      pgbackrestBackupLabel: LABEL,
      requestedTargetTimestamp: STOP_S,
      coverageProvenThroughCapture: false,
      asOfDerivedAtStop: false,
      // Skip live restic/pgbackrest so pure refuse path is exercised.
      skipLiveResolve: true,
    });
    writeEvidence('ac2-emit-refuse.json', result);
    expect(result.ok).toBe(false);
    expect(result.uploaded).toBe(false);
    // Must refuse on binding honesty (not merely ghost restic after a false green stamp).
    expect(result.errors.join(' ').toLowerCase()).toMatch(
      /temporal relabel|unproven coverage|later-captured|as-of/
    );
  });

  it('AC-1 inject: coherent emit when cover proves stop >= capture (no upload without restic)', () => {
    // With skipLiveResolve + coverage proof, binding succeeds; upload may still
    // refuse on ghost restic — but must not fail solely on timestamp fabrication.
    const result = emitLiveRecoveryBaseline({
      resticSnapshotId: 'resticc5ms5egca88d4616ab',
      blobRoot: resolve(REPO_ROOT, '.tmp'),
      payloadCapturedAt: CAPTURE_T,
      backupStopAt: STOP_S,
      pgbackrestBackupLabel: LABEL,
      coverageProvenThroughCapture: true,
      skipLiveResolve: true,
    });
    writeEvidence('ac1-emit-coherent-binding.json', result);
    // Ghost restic still refuse upload — ok may be false — but errors must not
    // claim temporal relabel when coverage is proven.
    const err = result.errors.join(' ').toLowerCase();
    if (!result.ok) {
      expect(err).not.toMatch(/temporal relabel/);
      expect(err).toMatch(/restic|unlistable|blob|secrets|config|domain|zero|snapshot|refuse/);
    } else if (result.baseline) {
      expect(Date.parse(result.baseline.target_timestamp)).toBeLessThanOrEqual(Date.parse(STOP_S));
    }
  });

  itLive('AC-3 live: emit without coverage proof after last stop fails closed', () => {
    // Force capture epoch after a synthetic old stop with no cover callback success.
    const result = emitLiveRecoveryBaseline({
      blobRoot: existsSync(resolve(REPO_ROOT, 'data/blobs'))
        ? resolve(REPO_ROOT, 'data/blobs')
        : resolve(REPO_ROOT, '.tmp'),
      payloadCapturedAt: new Date().toISOString(),
      backupStopAt: '2020-01-01T00:00:00Z',
      pgbackrestBackupLabel: '20200101-000000F',
      coverageProvenThroughCapture: false,
      asOfDerivedAtStop: false,
      // Do not run real base backup in this negative test.
      ensureCoverageThrough: () => ({
        ok: false,
        errors: ['simulated: no real backup/WAL coverage for capture point'],
      }),
      skipLiveResolve: true,
      resticSnapshotId: 'abcdef0123456789deadbeef',
    });
    writeEvidence('ac3-live-no-coverage.json', result);
    expect(result.ok).toBe(false);
    expect(result.uploaded).toBe(false);
  });
});
