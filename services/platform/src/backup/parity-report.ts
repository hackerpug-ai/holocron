/**
 * Unified fire-drill parity report (D05-04 / CAP-BAK-01).
 *
 * Concrete counts + digests only — never emits pass without measured values.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ParityCompareResult } from './parity-check.ts';

export type FireDrillParityReport = {
  /** Schema version for consumers. */
  schema: 'holo.fire-drill.parity-report.v1';
  capturedAt: string;
  targetTimestamp: string;
  actualStopTimestamp: string | null;
  scratchPgdata: string;
  blobDir: string;
  sourceDatabase: { host: string; port: number; database: string };

  /** AC-1: exact per-table COUNT(*) match. */
  POSTGRES_PARITY_PASS: boolean;
  /** Pre-failure snapshot counts (captured BEFORE restore). */
  pre_failure_row_counts: Record<string, number>;
  /** Restored cluster counts. */
  restored_row_counts: Record<string, number>;
  row_counts: Record<string, number>;
  row_count_mismatches: Array<{
    table: string;
    expected: number | null;
    actual: number | null;
  }>;

  /** AC-2: evidence-ledger deterministic checksum match. */
  LEDGER_CHECKSUM_MATCH: boolean;
  ledger_checksum: string;
  pre_failure_ledger_checksum: string;
  ledger_per_table: Record<string, string>;
  sample_tx_windows: Array<{
    table: string;
    id: string;
    tx_from: string | null;
    tx_to: string | null;
  }>;

  /** AC-3: restic blob SHA-256 set parity. */
  BLOB_PARITY_PASS: boolean;
  matched_objects: number;
  pre_failure_blob_objects: number;
  restored_blob_objects: number;
  blob_parity: ParityCompareResult | null;
  restic_snapshot_id: string | null;
  restic_repository: string | null;

  /** Overall: all three must be true for exit 0. */
  ok: boolean;
  exitCode: number;
  errors: string[];
  durationMs: number;
};

export function buildParityReport(
  partial: Omit<FireDrillParityReport, 'schema' | 'ok' | 'exitCode'> & {
    ok?: boolean;
    exitCode?: number;
  }
): FireDrillParityReport {
  const allPass =
    partial.POSTGRES_PARITY_PASS === true &&
    partial.LEDGER_CHECKSUM_MATCH === true &&
    partial.BLOB_PARITY_PASS === true &&
    (partial.errors?.length ?? 0) === 0 &&
    // Fail-closed: never pass with zero observed domain/blob state.
    Object.keys(partial.row_counts ?? {}).length > 0 &&
    (partial.matched_objects ?? 0) > 0 &&
    typeof partial.ledger_checksum === 'string' &&
    partial.ledger_checksum.length === 32;

  const ok = partial.ok ?? allPass;
  return {
    schema: 'holo.fire-drill.parity-report.v1',
    ...partial,
    ok,
    exitCode: partial.exitCode ?? (ok ? 0 : 1),
  };
}

export function writeParityReport(path: string, report: FireDrillParityReport): { path: string } {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return { path: abs };
}

export function formatParityReportText(report: FireDrillParityReport): string {
  const lines = [
    'holo restore:fire-drill — CAP-BAK-01 parity report',
    `  ok:                         ${report.ok}`,
    `  POSTGRES_PARITY_PASS:       ${report.POSTGRES_PARITY_PASS}`,
    `  LEDGER_CHECKSUM_MATCH:      ${report.LEDGER_CHECKSUM_MATCH}`,
    `  BLOB_PARITY_PASS:           ${report.BLOB_PARITY_PASS}`,
    `  target_timestamp:           ${report.targetTimestamp}`,
    `  actual_stop_timestamp:      ${report.actualStopTimestamp ?? '(none)'}`,
    `  scratch:                    ${report.scratchPgdata}`,
    `  blob_dir:                   ${report.blobDir}`,
    `  ledger_checksum:            ${report.ledger_checksum || '(empty)'}`,
    `  pre_failure_ledger:         ${report.pre_failure_ledger_checksum || '(empty)'}`,
    `  matched_objects:            ${report.matched_objects}`,
    `  pre_failure_blob_objects:   ${report.pre_failure_blob_objects}`,
    `  restored_blob_objects:      ${report.restored_blob_objects}`,
    `  restic_snapshot_id:         ${report.restic_snapshot_id ?? '(none)'}`,
    `  duration_ms:                ${report.durationMs}`,
    '  row_counts (restored / baseline):',
  ];
  const tables = new Set([
    ...Object.keys(report.pre_failure_row_counts),
    ...Object.keys(report.restored_row_counts),
  ]);
  for (const t of [...tables].sort()) {
    lines.push(
      `    ${t}: ${report.restored_row_counts[t] ?? '∅'} / ${report.pre_failure_row_counts[t] ?? '∅'}`
    );
  }
  if (report.row_count_mismatches.length > 0) {
    lines.push('  row_count_mismatches:');
    for (const m of report.row_count_mismatches) {
      lines.push(`    - ${m.table}: expected=${m.expected} actual=${m.actual}`);
    }
  }
  if (report.errors.length > 0) {
    lines.push('  errors:');
    for (const e of report.errors) lines.push(`    - ${e}`);
  }
  return lines.join('\n');
}

export function defaultParityReportPath(cwd = process.cwd()): string {
  return resolve(
    process.env.HOLO_FIRE_DRILL_REPORT?.trim() || resolve(cwd, '.tmp/D05-04/parity-report.json')
  );
}
