/**
 * Unified fire-drill parity report (D05-04 / CAP-BAK-01).
 *
 * Concrete counts + digests only — never emits pass without measured values.
 * REDHAT-FIX-C5: baseline_id / ledger_sha256 (collision-resistant) are first-class;
 * MD5-only ledger_checksum is diagnostic secondary, never the sole ok oracle.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ParityCompareResult } from './parity-check.ts';

/** True for 64-hex SHA-256 (optional sha256: prefix). Rejects MD5-only 32-hex. */
export function isCollisionResistantDigest(value: string | null | undefined): boolean {
  if (!value) return false;
  const raw = value.trim().toLowerCase();
  const hex = raw.startsWith('sha256:') ? raw.slice('sha256:'.length) : raw;
  return /^[0-9a-f]{64}$/.test(hex);
}

export type FireDrillParityReport = {
  /** Schema version for consumers (v2 adds recovery-baseline fields). */
  schema: 'holo.fire-drill.parity-report.v2';
  capturedAt: string;
  targetTimestamp: string;
  actualStopTimestamp: string | null;
  scratchPgdata: string;
  blobDir: string;
  sourceDatabase: { host: string; port: number; database: string };

  /** AC-1: exact per-table COUNT(*) match. */
  POSTGRES_PARITY_PASS: boolean;
  /** Pre-failure / baseline expected counts (R2 baseline preferred). */
  pre_failure_row_counts: Record<string, number>;
  /** Restored cluster counts. */
  restored_row_counts: Record<string, number>;
  row_counts: Record<string, number>;
  row_count_mismatches: Array<{
    table: string;
    expected: number | null;
    actual: number | null;
  }>;

  /**
   * AC-2: evidence-ledger integrity match.
   * Prefer collision-resistant SHA-256 vs recovery baseline; MD5 is secondary only.
   */
  LEDGER_CHECKSUM_MATCH: boolean;
  /**
   * Primary ledger digest after restore. Prefer 64-hex SHA-256.
   * May still hold MD5 for legacy diagnostics when SHA-256 is also present.
   */
  ledger_checksum: string;
  /** Expected ledger digest (baseline.ledger_sha256 or pre-failure SHA-256/MD5). */
  pre_failure_ledger_checksum: string;
  /** Restored collision-resistant ledger digest (SHA-256). */
  ledger_sha256: string | null;
  /** Expected collision-resistant ledger digest (from R2 baseline or pre-failure SHA-256). */
  pre_failure_ledger_sha256: string | null;
  ledger_per_table: Record<string, string>;
  sample_tx_windows: Array<{
    table: string;
    id: string;
    tx_from: string | null;
    tx_to: string | null;
  }>;

  /** AC-3: restic blob SHA-256 set parity / baseline blob_manifest_sha256. */
  BLOB_PARITY_PASS: boolean;
  matched_objects: number;
  pre_failure_blob_objects: number;
  restored_blob_objects: number;
  blob_parity: ParityCompareResult | null;
  restic_snapshot_id: string | null;
  restic_repository: string | null;
  /** Restored blob manifest binding (SHA-256 of sorted content digests). */
  blob_manifest_sha256: string | null;
  /** Expected blob manifest from R2 baseline (when loaded). */
  baseline_blob_manifest_sha256: string | null;

  /**
   * R2 recovery baseline binding (REDHAT-FIX-C5).
   * When loaded, baseline is the sole integrity oracle for row counts + ledger SHA-256.
   */
  baseline_loaded: boolean;
  baseline_id: string | null;
  /** Content-address / declared baseline identity (same as baseline_id when verified). */
  baseline_sha256: string | null;
  baseline_key: string | null;
  pgbackrest_backup_label: string | null;

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
  const ledgerSha =
    partial.ledger_sha256 ??
    (isCollisionResistantDigest(partial.ledger_checksum) ? partial.ledger_checksum : null);
  const baselineBound =
    Boolean(partial.baseline_id) &&
    isCollisionResistantDigest(partial.baseline_sha256 ?? partial.baseline_id);
  // Fail-closed: never pass on MD5-only sole oracle. Require SHA-256 ledger or
  // a verified baseline-bound LEDGER_CHECKSUM_MATCH with 64-hex baseline_sha256.
  const collisionResistantLedger =
    isCollisionResistantDigest(ledgerSha) ||
    (partial.LEDGER_CHECKSUM_MATCH === true &&
      baselineBound &&
      isCollisionResistantDigest(
        partial.pre_failure_ledger_sha256 ?? partial.baseline_sha256 ?? partial.baseline_id
      ));

  const allPass =
    partial.POSTGRES_PARITY_PASS === true &&
    partial.LEDGER_CHECKSUM_MATCH === true &&
    partial.BLOB_PARITY_PASS === true &&
    (partial.errors?.length ?? 0) === 0 &&
    // Fail-closed: never pass with zero observed domain/blob state.
    Object.keys(partial.row_counts ?? {}).length > 0 &&
    (partial.matched_objects ?? 0) > 0 &&
    collisionResistantLedger;

  const ok = partial.ok ?? allPass;
  return {
    schema: 'holo.fire-drill.parity-report.v2',
    ...partial,
    baseline_loaded: partial.baseline_loaded ?? false,
    baseline_id: partial.baseline_id ?? null,
    baseline_sha256: partial.baseline_sha256 ?? partial.baseline_id ?? null,
    baseline_key: partial.baseline_key ?? null,
    pgbackrest_backup_label: partial.pgbackrest_backup_label ?? null,
    ledger_sha256: partial.ledger_sha256 ?? null,
    pre_failure_ledger_sha256: partial.pre_failure_ledger_sha256 ?? null,
    blob_manifest_sha256: partial.blob_manifest_sha256 ?? null,
    baseline_blob_manifest_sha256: partial.baseline_blob_manifest_sha256 ?? null,
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
    `  baseline_loaded:            ${report.baseline_loaded}`,
    `  baseline_id:                ${report.baseline_id ?? '(none)'}`,
    `  baseline_sha256:            ${report.baseline_sha256 ?? '(none)'}`,
    `  baseline_key:               ${report.baseline_key ?? '(none)'}`,
    `  pgbackrest_backup_label:    ${report.pgbackrest_backup_label ?? '(none)'}`,
    `  ledger_sha256:              ${report.ledger_sha256 || '(empty)'}`,
    `  pre_failure_ledger_sha256:  ${report.pre_failure_ledger_sha256 || '(empty)'}`,
    `  ledger_checksum (diag):     ${report.ledger_checksum || '(empty)'}`,
    `  pre_failure_ledger (diag):  ${report.pre_failure_ledger_checksum || '(empty)'}`,
    `  matched_objects:            ${report.matched_objects}`,
    `  pre_failure_blob_objects:   ${report.pre_failure_blob_objects}`,
    `  restored_blob_objects:      ${report.restored_blob_objects}`,
    `  blob_manifest_sha256:       ${report.blob_manifest_sha256 ?? '(none)'}`,
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
