import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('REDHAT-FIX-C5-consume fire-drill baseline wiring', () => {
  it('fire-drill imports recovery-baseline helpers', async () => {
    const mod = await import('../../src/backup/fire-drill.ts');
    expect(typeof mod.runFireDrill).toBe('function');
    const src = readFileSync(
      resolve(import.meta.dirname, '../../src/backup/fire-drill.ts'),
      'utf8'
    );
    expect(src).toMatch(/loadRecoveryBaselineFromR2/);
    expect(src).toMatch(/compareRestoredToBaseline/);
    expect(src).toMatch(/computeLedgerSha256/);
    expect(src).toMatch(/baseline_id/);
  });

  it('parity-report v2 rejects MD5-only sole oracle', async () => {
    const { buildParityReport, isCollisionResistantDigest } = await import(
      '../../src/backup/parity-report.ts'
    );
    expect(isCollisionResistantDigest('a'.repeat(32))).toBe(false);
    expect(isCollisionResistantDigest('a'.repeat(64))).toBe(true);
    const base = {
      capturedAt: new Date().toISOString(),
      targetTimestamp: '2024-01-01T00:00:00Z',
      actualStopTimestamp: null,
      scratchPgdata: '/tmp/x',
      blobDir: '/tmp/b',
      sourceDatabase: { host: 'h', port: 1, database: 'd' },
      POSTGRES_PARITY_PASS: true,
      pre_failure_row_counts: { beliefs: 1 },
      restored_row_counts: { beliefs: 1 },
      row_counts: { beliefs: 1 },
      row_count_mismatches: [] as Array<{
        table: string;
        expected: number | null;
        actual: number | null;
      }>,
      LEDGER_CHECKSUM_MATCH: true,
      ledger_checksum: 'a'.repeat(32),
      pre_failure_ledger_checksum: 'a'.repeat(32),
      ledger_per_table: {},
      sample_tx_windows: [] as Array<{
        table: string;
        id: string;
        tx_from: string | null;
        tx_to: string | null;
      }>,
      BLOB_PARITY_PASS: true,
      matched_objects: 1,
      pre_failure_blob_objects: 1,
      restored_blob_objects: 1,
      blob_parity: null,
      restic_snapshot_id: null,
      restic_repository: null,
      baseline_loaded: false,
      baseline_id: null as string | null,
      baseline_sha256: null as string | null,
      baseline_key: null as string | null,
      pgbackrest_backup_label: null as string | null,
      ledger_sha256: null as string | null,
      pre_failure_ledger_sha256: null as string | null,
      blob_manifest_sha256: null as string | null,
      baseline_blob_manifest_sha256: null as string | null,
      errors: [] as string[],
      durationMs: 1,
    };
    expect(buildParityReport(base).ok).toBe(false);
    expect(buildParityReport(base).schema).toBe('holo.fire-drill.parity-report.v2');
    expect(
      buildParityReport({
        ...base,
        ledger_sha256: 'b'.repeat(64),
        ledger_checksum: 'b'.repeat(64),
      }).ok
    ).toBe(true);
  });

  it('runFireDrill fails closed without R2 baseline', async () => {
    const { runFireDrill } = await import('../../src/backup/fire-drill.ts');
    const root = resolve(import.meta.dirname, '../../../../.tmp/REDHAT-FIX-C5-consume');
    const scratch = resolve(root, 'scratch-empty');
    const blob = resolve(root, 'blob-empty');
    mkdirSync(scratch, { recursive: true });
    mkdirSync(blob, { recursive: true });
    // GATE-FIX-S28R3-QA19: isolate from ambient R2/secrets so discovery cannot load a real baseline.
    // Do not pass through process.env credential keys (values never logged here).
    const isolated: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      LANG: process.env.LANG ?? 'C.UTF-8',
      HOLO_RECOVERY_BASELINE_ID: '0'.repeat(64),
      HOLOCRON_SECRETS_PATH: '/nonexistent-c5-consume-no-secrets',
      HOLO_SECRETS_PATH: '/nonexistent-c5-consume-no-secrets',
      // Explicit empty credential slots — refuse ambient R2 discovery.
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      R2_SESSION_TOKEN: '',
      R2_RESTORE_ACCESS_KEY_ID: '',
      R2_RESTORE_SECRET_ACCESS_KEY: '',
      R2_RESTORE_SESSION_TOKEN: '',
      R2_ENDPOINT: '',
      AWS_ACCESS_KEY_ID: '',
      AWS_SECRET_ACCESS_KEY: '',
      AWS_SESSION_TOKEN: '',
    };
    const r = await runFireDrill({
      targetTimestamp: '2099-01-01T00:00:00Z',
      scratch,
      blobDir: blob,
      reportPath: resolve(root, 'parity-report-failclosed.json'),
      requireRecoveryBaseline: true,
      env: isolated,
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).not.toBe(0);
    expect(r.report.schema).toBe('holo.fire-drill.parity-report.v2');
    expect(r.report.baseline_loaded).toBe(false);
    expect(r.errors.join(' ')).toMatch(/baseline|R2|recovery/i);
    expect(existsSync(resolve(root, 'parity-report-failclosed.json'))).toBe(true);
  }, 120_000);
});
