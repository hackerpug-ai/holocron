/**
 * GATE-FIX-QA2 — in-window PITR metadata + listable restic-bound baseline emit.
 *
 * Pure:
 *   - extractBackupTimeWindow / recommended_pitr derivation
 *   - matchResticSnapshotId still exact (ghost fail-closed)
 *   - CLI surfaces restore:window + backup:emit-recovery-baseline
 *
 * PLATFORM_IT:
 *   - queryPitrWindow against real pgBackRest when secrets available
 *   - emitLiveRecoveryBaseline refuses ghost restic ids
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  emitLiveRecoveryBaseline,
  matchResticSnapshotId,
  verifyResticSnapshotInRepo,
} from '../../src/backup/recovery-baseline.ts';
import {
  extractBackupTimeWindow,
  formatPitrWindowText,
  PITR_WINDOW_WAL_SLACK_MS,
  queryPitrWindow,
} from '../../src/backup/restore.ts';

const itLive = PLATFORM_IT ? it : it.skip;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

describe('GATE-FIX-QA2 pure helpers', () => {
  it('AC-1: extractBackupTimeWindow + format exposes recommended_pitr from real labels', () => {
    const stop = Math.floor(Date.parse('2026-07-29T04:00:00Z') / 1000);
    const start = stop - 3600;
    const info = JSON.stringify([
      {
        name: 'main',
        backup: [
          {
            label: '20260729-030000F',
            timestamp: { start, stop },
          },
        ],
      },
    ]);
    const w = extractBackupTimeWindow(info);
    expect(w.labels).toContain('20260729-030000F');
    expect(w.latest).not.toBeNull();
    expect(w.latest!.toISOString().startsWith('2026-07-29')).toBe(true);
    // recommended_pitr must be latest, not a stale future (e.g. 2026-08-01).
    const recommended = w.latest!.toISOString().replace(/\.\d{3}Z$/, 'Z');
    expect(recommended).not.toMatch(/^2026-08-01/);
    expect(PITR_WINDOW_WAL_SLACK_MS).toBeGreaterThan(0);

    const report = {
      ok: true as const,
      earliest: w.earliest!.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      latest: recommended,
      recommended_pitr: recommended,
      window_max: new Date(w.latest!.getTime() + PITR_WINDOW_WAL_SLACK_MS)
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z'),
      labels: w.labels,
      stanza: 'main',
      repoPrefix: '/pgbackrest',
      errors: [] as string[],
    };
    const text = formatPitrWindowText(report);
    expect(text).toMatch(/recommended_pitr/);
    expect(text).toMatch(/export PITR_TIMESTAMP=/);
    expect(text).toContain(recommended);
  });

  it('AC-3: matchResticSnapshotId still refuses ghost resticc5ms5egca88d4616ab style ids', () => {
    const real = [{ id: 'abcdef0123456789abcdef0123456789abcdef01', short_id: 'abcdef01' }];
    const ghost = matchResticSnapshotId('resticc5ms5egca88d4616ab', real);
    expect(ghost.ok).toBe(false);
    const exact = matchResticSnapshotId('abcdef0123456789abcdef0123456789abcdef01', real);
    expect(exact.ok).toBe(true);
  });

  it('AC-1/AC-2 CLI surfaces exist in holo help', () => {
    const holo = readFileSync(resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts'), 'utf8');
    expect(holo).toMatch(/restore:window/);
    expect(holo).toMatch(/backup:emit-recovery-baseline/);
    expect(holo).toMatch(/queryPitrWindow|emitLiveRecoveryBaseline/);
  });
});

describe('GATE-FIX-QA2 live (PLATFORM_IT)', () => {
  itLive('AC-1: queryPitrWindow returns live labels + recommended_pitr', () => {
    const report = queryPitrWindow({});
    // When secrets/repo available, ok with non-empty labels; otherwise fail-closed errors.
    if (report.ok) {
      expect(report.labels.length).toBeGreaterThan(0);
      expect(report.recommended_pitr).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.recommended_pitr).not.toBe('2026-08-01T00:00:00Z');
      expect(report.latest).toBeTruthy();
    } else {
      expect(report.errors.length).toBeGreaterThan(0);
    }
  });

  itLive('AC-2: emitLiveRecoveryBaseline refuses ghost restic id without upload', () => {
    const result = emitLiveRecoveryBaseline({
      resticSnapshotId: 'resticc5ms5egca88d4616ab',
      blobRoot: existsSync(resolve(REPO_ROOT, 'data/blobs'))
        ? resolve(REPO_ROOT, 'data/blobs')
        : resolve(REPO_ROOT, '.tmp'),
    });
    expect(result.ok).toBe(false);
    expect(result.uploaded).toBe(false);
    // Ghost restic, missing secrets, or missing blob root all refuse upload.
    const err = result.errors.join(' ').toLowerCase();
    expect(err.length).toBeGreaterThan(0);
    expect(result.uploaded).toBe(false);
    expect(err).toMatch(
      /restic|unlistable|not found|refuse|blobroot|blob root|backup config missing|secrets/
    );
  });

  itLive('AC-3: verifyResticSnapshotInRepo still fails closed for ghost id', () => {
    const v = verifyResticSnapshotInRepo({
      resticSnapshotId: 'resticc5ms5egca88d4616ab',
    });
    expect(v.ok).toBe(false);
  });
});
