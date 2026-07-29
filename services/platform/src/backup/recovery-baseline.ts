/**
 * Immutable, collision-resistant recovery baseline (REDHAT-FIX-C5 / CAP-BAK-01).
 *
 * Captures a SHA-256-bound manifest at backup time that ties together:
 *   - pgBackRest backup label + stanza
 *   - target WAL LSN + timestamp window
 *   - restic snapshot id
 *   - per-table row counts (beliefs/sources/passages/claims at minimum)
 *   - evidence-ledger canonical digest (SHA-256 — never MD5-only)
 *   - blob-store manifest digest (SHA-256 of sorted content hashes)
 *
 * The object is retained in R2 (content-addressed + by-backup lookup). Fire-drill
 * parity loads the baseline from R2 alone — never from live mini state, never from
 * mutable backup_heartbeat as the sole oracle.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSecretsPath, getSecretValue } from '../config/secrets.ts';
import { type BackupConfig, loadBackupConfig } from './config.ts';
import {
  captureRowCounts,
  connectionFromDatabaseUrl,
  defaultSourceConnection,
  FIRE_DRILL_COUNT_TABLES,
  LEDGER_DOMAIN_TABLES,
  type LedgerDomainTable,
  type PsqlConnection,
  tableExists,
} from './evidence-ledger-verify.ts';
import { getBackupHeartbeat } from './heartbeat.ts';
import { hashLocalBlobStore } from './parity-check.ts';
import { listRepoPrefix } from './r2-provision.ts';

/** Parse pgbackrest info --output=json for the latest backup label (no base-backup import — avoid cycle). */
function parseLatestBackupLabel(infoJson: string): string | null {
  try {
    const data = JSON.parse(infoJson) as Array<{
      backup?: Array<{ label?: string; type?: string }>;
      name?: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const backups = data[0]?.backup ?? [];
    if (!Array.isArray(backups) || backups.length === 0) return null;
    const last = backups[backups.length - 1];
    return last?.label && last.label.length >= 8 ? last.label : null;
  } catch {
    const m = infoJson.match(/\b(\d{8}-\d{6}[FDI](?:_\d{8}-\d{6}[FDI])*)\b/);
    return m?.[1] ?? null;
  }
}

export const RECOVERY_BASELINE_SCHEMA = 'holo.recovery-baseline.v1' as const;
export const RECOVERY_BASELINE_OBJECT_NAME = 'recovery-baseline.json' as const;
export const RECOVERY_BASELINE_PREFIX = 'recovery-baselines' as const;

export type RecoveryBaseline = {
  schema_version: typeof RECOVERY_BASELINE_SCHEMA;
  /** Content-address of the document body (sha256 hex). Makes silent rewrite detectable. */
  baseline_id: string;
  captured_at: string;
  /** ISO-8601 PITR / backup-window target. */
  target_timestamp: string;
  /** Postgres WAL LSN at capture (non-empty). */
  target_lsn: string;
  stanza: string;
  pgbackrest_backup_label: string;
  restic_snapshot_id: string;
  row_counts: Record<string, number>;
  /** SHA-256 of canonical evidence-ledger form (64-hex or sha256:…). NEVER MD5-only. */
  ledger_sha256: string;
  /** SHA-256 of sorted blob content digests (manifest binding). */
  blob_manifest_sha256: string;
  algorithm: 'sha256';
  /** Optional per-table ledger digests (SHA-256). */
  ledger_per_table_sha256?: Record<string, string>;
};

export type RecoveryBaselineCaptureInput = {
  pgbackrestBackupLabel: string;
  resticSnapshotId: string;
  stanza?: string;
  targetTimestamp?: string;
  targetLsn?: string;
  rowCounts?: Record<string, number>;
  ledgerSha256?: string;
  ledgerPerTableSha256?: Record<string, string>;
  blobManifestSha256?: string;
  blobRoot?: string;
  databaseUrl?: string;
  conn?: PsqlConnection;
  env?: NodeJS.ProcessEnv;
  /**
   * When false (default), refuse upload if restic_snapshot_id is not listable in
   * the configured restic repository. Set true only for unit tests that inject
   * digests without a live restic repo.
   */
  skipResticVerify?: boolean;
};

export type RecoveryBaselineUploadResult = {
  ok: boolean;
  baseline: RecoveryBaseline | null;
  /** Content-addressed R2 key. */
  contentKey: string | null;
  /** Lookup key by backup label + restic id. */
  lookupKey: string | null;
  bucketName: string | null;
  uploaded: boolean;
  verified: boolean;
  errors: string[];
};

export type BaselineParityCompareInput = {
  baseline: RecoveryBaseline;
  /** Restored (or recomputed) row counts. */
  actualRowCounts: Record<string, number>;
  /** Restored ledger SHA-256 (64-hex or sha256:…). */
  actualLedgerSha256: string;
  /** Restored blob manifest SHA-256. */
  actualBlobManifestSha256?: string | null;
};

export type BaselineParityCompareResult = {
  ok: boolean;
  POSTGRES_PARITY_PASS: boolean;
  LEDGER_CHECKSUM_MATCH: boolean;
  BLOB_MANIFEST_MATCH: boolean | null;
  baseline_id: string;
  pgbackrest_backup_label: string;
  restic_snapshot_id: string;
  expected_ledger_sha256: string;
  actual_ledger_sha256: string;
  expected_row_counts: Record<string, number>;
  actual_row_counts: Record<string, number>;
  expected_blob_manifest_sha256: string;
  actual_blob_manifest_sha256: string | null;
  errors: string[];
  exitCode: number;
};

function run(
  cmd: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number }
): { status: number; stdout: string; stderr: string } {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    env: options?.env ?? process.env,
    timeout: options?.timeoutMs ?? 120_000,
  });
  return {
    status: res.status ?? 1,
    stdout: res.stdout?.toString() ?? '',
    stderr: res.stderr?.toString() ?? '',
  };
}

function awsEnv(cfg: BackupConfig, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {
    ...env,
    AWS_ACCESS_KEY_ID: cfg.accessKeyId,
    AWS_SECRET_ACCESS_KEY: cfg.secretAccessKey,
    AWS_DEFAULT_REGION: 'auto',
    AWS_EC2_METADATA_DISABLED: 'true',
  };
  if (cfg.sessionToken) {
    out.AWS_SESSION_TOKEN = cfg.sessionToken;
  } else {
    delete out.AWS_SESSION_TOKEN;
  }
  return out;
}

function sha256Utf8(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/** Normalize a digest to lowercase 64-hex; accept `sha256:` prefix. Reject MD5-only. */
export function normalizeSha256Digest(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  const hex = raw.startsWith('sha256:') ? raw.slice('sha256:'.length) : raw;
  if (/^[0-9a-f]{64}$/.test(hex)) return hex;
  return null;
}

/** True when a value looks like MD5-only (32 hex) and is not a valid SHA-256. */
export function isMd5OnlyDigest(value: string | null | undefined): boolean {
  if (!value) return false;
  const raw = value.trim().toLowerCase().replace(/^md5:/, '');
  return /^[0-9a-f]{32}$/.test(raw) && !normalizeSha256Digest(value);
}

export function formatSha256Digest(hex64: string): string {
  const n = normalizeSha256Digest(hex64);
  if (!n) throw new Error(`invalid sha256 digest: ${hex64}`);
  return n;
}

/**
 * SQL that emits one canonical line per row for a domain table (ORDER BY id).
 * Mirrors evidence-ledger-verify canonical form so restore parity is stable.
 */
function canonicalRowsSql(table: LedgerDomainTable): string | null {
  switch (table) {
    case 'beliefs':
      return `SELECT COALESCE(string_agg(line, E'\\n' ORDER BY sort_id), '')
        FROM (
          SELECT id AS sort_id,
            id::text || E'\\t' ||
            COALESCE(claim_id::text, '') || E'\\t' ||
            COALESCE(statement::text, '') || E'\\t' ||
            COALESCE(confidence::text, '') || E'\\t' ||
            COALESCE(supersedes_id::text, '') || E'\\t' ||
            COALESCE(tx_from::text, '') || E'\\t' ||
            COALESCE(tx_to::text, '') || E'\\t' ||
            COALESCE(valid_from::text, '') || E'\\t' ||
            COALESCE(valid_to::text, '') AS line
          FROM beliefs
        ) s`;
    case 'sources':
      return `SELECT COALESCE(string_agg(line, E'\\n' ORDER BY sort_id), '')
        FROM (
          SELECT id AS sort_id,
            id::text || E'\\t' ||
            COALESCE(source_kind::text, '') || E'\\t' ||
            COALESCE(document_id::text, '') || E'\\t' ||
            COALESCE(content_hash::text, '') || E'\\t' ||
            COALESCE(title::text, '') || E'\\t' ||
            COALESCE(url::text, '') AS line
          FROM sources
        ) s`;
    case 'passages':
      return `SELECT COALESCE(string_agg(line, E'\\n' ORDER BY sort_id), '')
        FROM (
          SELECT id AS sort_id,
            id::text || E'\\t' ||
            COALESCE(source_id::text, '') || E'\\t' ||
            COALESCE(document_id::text, '') || E'\\t' ||
            COALESCE(ordinal::text, '') || E'\\t' ||
            COALESCE(text::text, '') AS line
          FROM passages
        ) s`;
    case 'claims':
      return `SELECT COALESCE(string_agg(line, E'\\n' ORDER BY sort_id), '')
        FROM (
          SELECT id AS sort_id,
            id::text || E'\\t' ||
            COALESCE(source_id::text, '') || E'\\t' ||
            COALESCE(passage_id::text, '') || E'\\t' ||
            COALESCE(claim_text::text, '') || E'\\t' ||
            COALESCE(claim_category::text, '') || E'\\t' ||
            COALESCE(confidence::text, '') AS line
          FROM claims
        ) s`;
    case 'relations':
      return `SELECT COALESCE(string_agg(line, E'\\n' ORDER BY sort_id), '')
        FROM (
          SELECT id AS sort_id,
            id::text || E'\\t' ||
            COALESCE(relation_type::text, '') || E'\\t' ||
            COALESCE(subject_id::text, '') || E'\\t' ||
            COALESCE(object_id::text, '') || E'\\t' ||
            COALESCE(tx_from::text, '') || E'\\t' ||
            COALESCE(tx_to::text, '') || E'\\t' ||
            COALESCE(valid_from::text, '') || E'\\t' ||
            COALESCE(valid_to::text, '') AS line
          FROM relations
        ) s`;
    default:
      return null;
  }
}

function runPsql(
  conn: PsqlConnection,
  sql: string
): { status: number; stdout: string; stderr: string } {
  const args = [
    '-h',
    conn.host,
    '-p',
    String(conn.port),
    '-d',
    conn.database,
    '-v',
    'ON_ERROR_STOP=1',
    '-tAc',
    sql,
  ];
  if (conn.user) args.push('-U', conn.user);
  return run('psql', args, { env: conn.env ?? process.env, timeoutMs: 60_000 });
}

/** Query current WAL LSN (non-empty string on success). */
export function queryTargetLsn(conn: PsqlConnection): string | null {
  const r = runPsql(conn, 'SELECT pg_current_wal_lsn()::text');
  if (r.status !== 0) return null;
  const lsn = r.stdout.trim();
  return lsn.length > 0 ? lsn : null;
}

/**
 * Collision-resistant evidence-ledger digest (SHA-256).
 * Same canonical row form as MD5 path, but algorithm is SHA-256+.
 */
export function computeLedgerSha256(conn: PsqlConnection): {
  ok: boolean;
  ledger_sha256: string;
  per_table: Record<string, string>;
  errors: string[];
} {
  const errors: string[] = [];
  const per_table: Record<string, string> = {};
  const parts: string[] = [];

  for (const table of LEDGER_DOMAIN_TABLES) {
    if (!tableExists(conn, table)) {
      const empty = sha256Utf8('');
      per_table[table] = empty;
      parts.push(`${table}:${empty}`);
      errors.push(`table missing for ledger sha256: ${table}`);
      continue;
    }
    const sql = canonicalRowsSql(table);
    if (!sql) {
      errors.push(`no canonical SQL for table ${table}`);
      continue;
    }
    const r = runPsql(conn, sql);
    if (r.status !== 0) {
      errors.push(`ledger sha256 query failed for ${table}: ${r.stderr || r.stdout}`);
      const empty = sha256Utf8('');
      per_table[table] = empty;
      parts.push(`${table}:${empty}`);
      continue;
    }
    const digest = sha256Utf8(r.stdout);
    per_table[table] = digest;
    parts.push(`${table}:${digest}`);
  }

  const ledger_sha256 = sha256Utf8(parts.join('|'));
  return {
    ok: errors.length === 0 && normalizeSha256Digest(ledger_sha256) !== null,
    ledger_sha256,
    per_table,
    errors,
  };
}

/**
 * Blob manifest binding: SHA-256 over the sorted list of per-object content SHA-256 digests.
 * Empty store still yields a stable digest (sha256 of empty string) — callers may refuse it.
 */
export function computeBlobManifestSha256(blobRoot: string): string {
  const hashed = hashLocalBlobStore(blobRoot);
  const body = hashed.hashes.join('\n');
  return sha256Utf8(body);
}

/** Content-addressed R2 key for a baseline_id. */
export function contentAddressedBaselineKey(baselineId: string): string {
  const id = formatSha256Digest(baselineId);
  return `${RECOVERY_BASELINE_PREFIX}/sha256/${id}/${RECOVERY_BASELINE_OBJECT_NAME}`;
}

/** Lookup key bound to concrete backup label + restic snapshot. */
export function lookupBaselineKey(pgbackrestLabel: string, resticSnapshotId: string): string {
  const label = pgbackrestLabel.trim();
  const snap = resticSnapshotId.trim();
  if (label.length < 8) throw new Error(`pgbackrest_backup_label too short: ${label}`);
  if (snap.length < 8) throw new Error(`restic_snapshot_id too short: ${snap}`);
  return `${RECOVERY_BASELINE_PREFIX}/by-backup/${encodeURIComponent(label)}/${encodeURIComponent(snap)}/${RECOVERY_BASELINE_OBJECT_NAME}`;
}

/**
 * Canonical JSON for content addressing: stable key order, no baseline_id field.
 * Silent rewrite of any bound field yields a different content hash.
 */
export function canonicalBaselineBody(doc: Omit<RecoveryBaseline, 'baseline_id'>): string {
  const ordered: Record<string, unknown> = {
    algorithm: doc.algorithm,
    blob_manifest_sha256: formatSha256Digest(doc.blob_manifest_sha256),
    captured_at: doc.captured_at,
    ledger_per_table_sha256: doc.ledger_per_table_sha256
      ? Object.fromEntries(
          Object.keys(doc.ledger_per_table_sha256)
            .sort()
            .map((k) => {
              const dig = doc.ledger_per_table_sha256?.[k];
              if (!dig) throw new Error(`missing ledger_per_table_sha256 for ${k}`);
              return [k, formatSha256Digest(dig)];
            })
        )
      : undefined,
    ledger_sha256: formatSha256Digest(doc.ledger_sha256),
    pgbackrest_backup_label: doc.pgbackrest_backup_label,
    restic_snapshot_id: doc.restic_snapshot_id,
    row_counts: Object.fromEntries(
      Object.keys(doc.row_counts)
        .sort()
        .map((k) => [k, doc.row_counts[k]])
    ),
    schema_version: doc.schema_version,
    stanza: doc.stanza,
    target_lsn: doc.target_lsn,
    target_timestamp: doc.target_timestamp,
  };
  // Drop undefined keys
  for (const k of Object.keys(ordered)) {
    if (ordered[k] === undefined) delete ordered[k];
  }
  return `${JSON.stringify(ordered)}\n`;
}

export function computeBaselineId(doc: Omit<RecoveryBaseline, 'baseline_id'>): string {
  return sha256Utf8(canonicalBaselineBody(doc));
}

/**
 * Validate required fields and digest algorithms. Fail-closed on MD5-only ledger.
 */
export function validateRecoveryBaseline(doc: unknown): {
  ok: boolean;
  baseline: RecoveryBaseline | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (!doc || typeof doc !== 'object') {
    return { ok: false, baseline: null, errors: ['baseline is not an object'] };
  }
  const d = doc as Record<string, unknown>;

  if (d.schema_version !== RECOVERY_BASELINE_SCHEMA) {
    errors.push(`schema_version must be ${RECOVERY_BASELINE_SCHEMA}`);
  }
  const label = typeof d.pgbackrest_backup_label === 'string' ? d.pgbackrest_backup_label : '';
  const restic = typeof d.restic_snapshot_id === 'string' ? d.restic_snapshot_id : '';
  if (label.length < 8) errors.push('pgbackrest_backup_label length must be >= 8');
  if (restic.length < 8) errors.push('restic_snapshot_id length must be >= 8');

  const targetTs = typeof d.target_timestamp === 'string' ? d.target_timestamp : '';
  if (!targetTs || Number.isNaN(Date.parse(targetTs))) {
    errors.push('target_timestamp must be ISO-8601');
  }
  const targetLsn = typeof d.target_lsn === 'string' ? d.target_lsn.trim() : '';
  if (!targetLsn) errors.push('target_lsn must be non-empty');

  const stanza = typeof d.stanza === 'string' ? d.stanza : '';
  if (!stanza) errors.push('stanza must be non-empty');

  const row_counts =
    d.row_counts && typeof d.row_counts === 'object' && !Array.isArray(d.row_counts)
      ? (d.row_counts as Record<string, number>)
      : null;
  if (!row_counts) {
    errors.push('row_counts map required');
  } else {
    for (const [k, v] of Object.entries(row_counts)) {
      if (!Number.isInteger(v) || v < 0) {
        errors.push(`row_counts.${k} must be integer >= 0`);
      }
    }
  }

  const ledgerRaw = typeof d.ledger_sha256 === 'string' ? d.ledger_sha256 : '';
  const blobRaw = typeof d.blob_manifest_sha256 === 'string' ? d.blob_manifest_sha256 : '';
  if (isMd5OnlyDigest(ledgerRaw)) {
    errors.push('ledger_sha256 must be SHA-256 (not MD5-only)');
  }
  const ledger = normalizeSha256Digest(ledgerRaw);
  const blob = normalizeSha256Digest(blobRaw);
  if (!ledger) errors.push('ledger_sha256 must be 64-hex or sha256:…');
  if (!blob) errors.push('blob_manifest_sha256 must be 64-hex or sha256:…');

  const baseline_id = typeof d.baseline_id === 'string' ? d.baseline_id : '';
  if (!normalizeSha256Digest(baseline_id)) {
    errors.push('baseline_id must be 64-hex content address');
  }

  if (errors.length > 0 || !row_counts || !ledger || !blob) {
    return { ok: false, baseline: null, errors };
  }

  const baseline: RecoveryBaseline = {
    schema_version: RECOVERY_BASELINE_SCHEMA,
    baseline_id: formatSha256Digest(baseline_id),
    captured_at: typeof d.captured_at === 'string' ? d.captured_at : new Date().toISOString(),
    target_timestamp: targetTs,
    target_lsn: targetLsn,
    stanza,
    pgbackrest_backup_label: label,
    restic_snapshot_id: restic,
    row_counts,
    ledger_sha256: ledger,
    blob_manifest_sha256: blob,
    algorithm: 'sha256',
    ledger_per_table_sha256:
      d.ledger_per_table_sha256 && typeof d.ledger_per_table_sha256 === 'object'
        ? (d.ledger_per_table_sha256 as Record<string, string>)
        : undefined,
  };

  // Content-address integrity: recompute and compare.
  const { baseline_id: _drop, ...body } = baseline;
  const expectedId = computeBaselineId(body);
  if (expectedId !== baseline.baseline_id) {
    return {
      ok: false,
      baseline: null,
      errors: [
        `baseline_id content-address mismatch: declared=${baseline.baseline_id} computed=${expectedId}`,
      ],
    };
  }

  return { ok: true, baseline, errors: [] };
}

/** Sum of non-negative integer domain row counts (missing keys ignored). */
export function baselineDomainRowTotal(
  rowCounts: Record<string, number> | null | undefined
): number {
  if (!rowCounts) return 0;
  let total = 0;
  for (const v of Object.values(rowCounts)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

/**
 * True when a baseline is parity-meaningful: has at least one positive domain
 * row count and a restic id long enough to bind. Zero-count junk baselines that
 * caused gate step3 false POSTGRES_PARITY are rejected.
 */
export function isBaselineParityMeaningful(
  baseline: Pick<RecoveryBaseline, 'row_counts' | 'restic_snapshot_id'> | null | undefined
): boolean {
  if (!baseline) return false;
  if ((baseline.restic_snapshot_id ?? '').trim().length < 8) return false;
  return baselineDomainRowTotal(baseline.row_counts) > 0;
}

/**
 * Build RESTIC_* env for snapshot verification without importing restic-mirror
 * (avoids circular dependency: restic-mirror → recovery-baseline).
 */
function resticVerifyEnv(
  env: NodeJS.ProcessEnv
): { ok: true; env: NodeJS.ProcessEnv } | { ok: false; error: string } {
  const secretsPath = env.HOLO_SECRETS_PATH || env.SECRETS_PATH || defaultSecretsPath();
  try {
    // Always pass secretsPath so R2 + restic credentials resolve from secrets.yaml
    // even when not exported into the process environment.
    const cfg = loadBackupConfig({ env, secretsPath });
    const password =
      env.RESTIC_PASSWORD?.trim() ||
      env.HOLO_RESTIC_PASSWORD?.trim() ||
      getSecretValue('RESTIC_PASSWORD', { secretsPath, env }) ||
      '';
    if (password.length < 8) {
      return {
        ok: false,
        error: 'RESTIC_PASSWORD missing/short — refuse baseline bind without snapshot verification',
      };
    }
    const prefix =
      env.R2_RESTIC_PREFIX?.trim() ||
      getSecretValue('R2_RESTIC_PREFIX', { secretsPath, env }) ||
      'restic';
    const host = cfg.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const repository =
      env.RESTIC_REPOSITORY?.trim() ||
      `s3:https://${host}/${cfg.bucketName}/${prefix.replace(/^\/+|\/+$/g, '')}`;
    const out: NodeJS.ProcessEnv = {
      ...env,
      RESTIC_PASSWORD: password,
      RESTIC_REPOSITORY: repository,
      AWS_ACCESS_KEY_ID: cfg.accessKeyId,
      AWS_SECRET_ACCESS_KEY: cfg.secretAccessKey,
      AWS_DEFAULT_REGION: 'auto',
      AWS_EC2_METADATA_DISABLED: 'true',
    };
    if (cfg.sessionToken) out.AWS_SESSION_TOKEN = cfg.sessionToken;
    else delete out.AWS_SESSION_TOKEN;
    return { ok: true, env: out };
  } catch (e) {
    return {
      ok: false,
      error: `backup config missing for restic verify: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Verify a restic snapshot id exists in the configured restic repository
 * (`restic snapshots --json` / prefix match). Fail-closed when restic is
 * unreachable or the id is missing — never bind a ghost snapshot into R2.
 */
export function verifyResticSnapshotInRepo(options: {
  resticSnapshotId: string;
  env?: NodeJS.ProcessEnv;
  /** Optional pre-resolved restic bin. */
  resticBin?: string;
  /** When true, skip live restic (tests only). */
  skip?: boolean;
}): { ok: boolean; matchedId: string | null; error?: string; snapshotsChecked: number } {
  const snap = options.resticSnapshotId.trim();
  if (snap.length < 8) {
    return {
      ok: false,
      matchedId: null,
      error: `restic_snapshot_id too short to verify: ${snap.length}`,
      snapshotsChecked: 0,
    };
  }
  if (options.skip) {
    return { ok: true, matchedId: snap, snapshotsChecked: -1 };
  }

  const env = options.env ?? process.env;
  let resticBin = options.resticBin ?? null;
  if (!resticBin) {
    const which = run('which', ['restic'], { env, timeoutMs: 5_000 });
    resticBin =
      (which.status === 0 && which.stdout.trim()) ||
      (existsSync('/opt/homebrew/bin/restic') ? '/opt/homebrew/bin/restic' : null);
  }
  if (!resticBin) {
    return {
      ok: false,
      matchedId: null,
      error: 'restic binary missing — refuse baseline bind without snapshot verification',
      snapshotsChecked: 0,
    };
  }

  const renv = resticVerifyEnv(env);
  if (!renv.ok) {
    return { ok: false, matchedId: null, error: renv.error, snapshotsChecked: 0 };
  }

  const snaps = run(resticBin, ['snapshots', '--json'], { env: renv.env, timeoutMs: 120_000 });
  if (snaps.status !== 0) {
    return {
      ok: false,
      matchedId: null,
      error: `restic snapshots failed — refuse unlistable restic_snapshot_id: ${(snaps.stderr || snaps.stdout).slice(0, 400)}`,
      snapshotsChecked: 0,
    };
  }
  let parsed: Array<{ id?: string; short_id?: string }> = [];
  try {
    parsed = JSON.parse(snaps.stdout) as Array<{ id?: string; short_id?: string }>;
    if (!Array.isArray(parsed)) parsed = [];
  } catch {
    return {
      ok: false,
      matchedId: null,
      error: 'restic snapshots --json parse failed — refuse baseline bind',
      snapshotsChecked: 0,
    };
  }
  const needle = snap.toLowerCase();
  for (const row of parsed) {
    const id = (row.id ?? '').toLowerCase();
    const short = (row.short_id ?? '').toLowerCase();
    if (id === needle || short === needle || id.startsWith(needle) || needle.startsWith(short)) {
      return {
        ok: true,
        matchedId: row.id ?? row.short_id ?? snap,
        snapshotsChecked: parsed.length,
      };
    }
  }
  return {
    ok: false,
    matchedId: null,
    error: `restic snapshot not found / unlistable for id prefix "${snap}" — refuse baseline bind (no matching ID in repo)`,
    snapshotsChecked: parsed.length,
  };
}

/**
 * Build a complete recovery baseline document from live DB + blob root + bindings.
 * Always re-queries domain row_counts + ledger when a connection is available so
 * all-zero synthetic counts cannot replace real capture-DB state.
 */
export function buildRecoveryBaseline(input: RecoveryBaselineCaptureInput): RecoveryBaseline {
  const env = input.env ?? process.env;
  const conn =
    input.conn ??
    (input.databaseUrl
      ? connectionFromDatabaseUrl(input.databaseUrl, env)
      : defaultSourceConnection(env));

  const label = input.pgbackrestBackupLabel.trim();
  const restic = input.resticSnapshotId.trim();
  if (label.length < 8) {
    throw new Error(`pgbackrest_backup_label length must be >= 8 (got ${label.length})`);
  }
  if (restic.length < 8) {
    throw new Error(`restic_snapshot_id length must be >= 8 (got ${restic.length})`);
  }

  const target_timestamp = input.targetTimestamp ?? new Date().toISOString();
  const target_lsn = (input.targetLsn ?? queryTargetLsn(conn) ?? '').trim();
  if (!target_lsn) {
    throw new Error('target_lsn unavailable — refuse recovery baseline without WAL binding');
  }

  // Prefer live capture over caller-supplied zeros so emit never lies about domain state.
  let row_counts = input.rowCounts;
  const suppliedTotal = baselineDomainRowTotal(row_counts);
  if (!row_counts || suppliedTotal === 0) {
    try {
      const snap = captureRowCounts(conn, FIRE_DRILL_COUNT_TABLES);
      if (!row_counts || baselineDomainRowTotal(snap.row_counts) > 0) {
        row_counts = snap.row_counts;
      }
    } catch {
      // Keep supplied map if capture fails (e.g. unit inject with no live DB).
      if (!row_counts) row_counts = {};
    }
  }

  let ledger_sha256 = input.ledgerSha256;
  let ledger_per_table_sha256 = input.ledgerPerTableSha256;
  if (!ledger_sha256) {
    const ledger = computeLedgerSha256(conn);
    ledger_sha256 = ledger.ledger_sha256;
    ledger_per_table_sha256 = ledger.per_table;
  }
  if (isMd5OnlyDigest(ledger_sha256) || !normalizeSha256Digest(ledger_sha256)) {
    throw new Error('ledger_sha256 must be SHA-256 (not MD5-only)');
  }

  let blob_manifest_sha256 = input.blobManifestSha256;
  if (!blob_manifest_sha256) {
    if (!input.blobRoot) {
      throw new Error('blobRoot or blobManifestSha256 required for recovery baseline');
    }
    blob_manifest_sha256 = computeBlobManifestSha256(input.blobRoot);
  }
  if (!normalizeSha256Digest(blob_manifest_sha256)) {
    throw new Error('blob_manifest_sha256 must be SHA-256');
  }

  const partial: Omit<RecoveryBaseline, 'baseline_id'> = {
    schema_version: RECOVERY_BASELINE_SCHEMA,
    captured_at: new Date().toISOString(),
    target_timestamp,
    target_lsn,
    stanza: input.stanza?.trim() || env.PGBACKREST_STANZA?.trim() || 'main',
    pgbackrest_backup_label: label,
    restic_snapshot_id: restic,
    row_counts: row_counts ?? {},
    ledger_sha256: formatSha256Digest(ledger_sha256),
    blob_manifest_sha256: formatSha256Digest(blob_manifest_sha256),
    algorithm: 'sha256',
    ledger_per_table_sha256,
  };

  const baseline_id = computeBaselineId(partial);
  return { ...partial, baseline_id };
}

/** Upload UTF-8 body to R2 via real aws s3 cp (no mocks). */
export function putR2Object(options: {
  config: BackupConfig;
  key: string;
  body: string;
  env?: NodeJS.ProcessEnv;
}): { ok: boolean; key: string; error?: string } {
  const env = options.env ?? process.env;
  const cfg = options.config;
  const key = options.key.replace(/^\//, '');
  const dir = mkdtempSync(join(tmpdir(), 'holo-recovery-baseline-put-'));
  const local = join(dir, RECOVERY_BASELINE_OBJECT_NAME);
  try {
    writeFileSync(local, options.body, 'utf8');
    const res = run(
      'aws',
      [
        's3',
        'cp',
        local,
        `s3://${cfg.bucketName}/${key}`,
        '--endpoint-url',
        cfg.endpoint,
        '--content-type',
        'application/json',
      ],
      { env: awsEnv(cfg, env), timeoutMs: 120_000 }
    );
    if (res.status !== 0) {
      return {
        ok: false,
        key,
        error: `aws s3 cp put failed: ${(res.stderr || res.stdout).slice(0, 400)}`,
      };
    }
    return { ok: true, key };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Download R2 object body via real aws s3 cp. */
export function getR2Object(options: {
  config: BackupConfig;
  key: string;
  env?: NodeJS.ProcessEnv;
}): { ok: boolean; body: string | null; error?: string } {
  const env = options.env ?? process.env;
  const cfg = options.config;
  const key = options.key.replace(/^\//, '');
  const dir = mkdtempSync(join(tmpdir(), 'holo-recovery-baseline-get-'));
  const local = join(dir, RECOVERY_BASELINE_OBJECT_NAME);
  try {
    const res = run(
      'aws',
      ['s3', 'cp', `s3://${cfg.bucketName}/${key}`, local, '--endpoint-url', cfg.endpoint],
      { env: awsEnv(cfg, env), timeoutMs: 120_000 }
    );
    if (res.status !== 0 || !existsSync(local)) {
      return {
        ok: false,
        body: null,
        error: `aws s3 cp get failed: ${(res.stderr || res.stdout).slice(0, 400)}`,
      };
    }
    return { ok: true, body: readFileSync(local, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Upload baseline to R2 at content-addressed + by-backup keys; verify round-trip.
 */
export function uploadRecoveryBaseline(options: {
  config: BackupConfig;
  baseline: RecoveryBaseline;
  env?: NodeJS.ProcessEnv;
}): RecoveryBaselineUploadResult {
  const env = options.env ?? process.env;
  const cfg = options.config;
  const errors: string[] = [];
  const validated = validateRecoveryBaseline(options.baseline);
  if (!validated.ok || !validated.baseline) {
    return {
      ok: false,
      baseline: null,
      contentKey: null,
      lookupKey: null,
      bucketName: cfg.bucketName,
      uploaded: false,
      verified: false,
      errors: validated.errors,
    };
  }
  const baseline = validated.baseline;
  const contentKey = contentAddressedBaselineKey(baseline.baseline_id);
  const lookupKey = lookupBaselineKey(
    baseline.pgbackrest_backup_label,
    baseline.restic_snapshot_id
  );
  const body = `${JSON.stringify(baseline, null, 2)}\n`;

  const putContent = putR2Object({ config: cfg, key: contentKey, body, env });
  if (!putContent.ok) {
    errors.push(putContent.error ?? 'content-key upload failed');
  }
  const putLookup = putR2Object({ config: cfg, key: lookupKey, body, env });
  if (!putLookup.ok) {
    errors.push(putLookup.error ?? 'lookup-key upload failed');
  }

  let verified = false;
  if (errors.length === 0) {
    const got = getR2Object({ config: cfg, key: contentKey, env });
    if (!got.ok || !got.body) {
      errors.push(got.error ?? 'round-trip get failed');
    } else {
      try {
        const parsed = JSON.parse(got.body) as unknown;
        const reval = validateRecoveryBaseline(parsed);
        if (!reval.ok || reval.baseline?.baseline_id !== baseline.baseline_id) {
          errors.push(
            `round-trip validation failed: ${(reval.errors || []).join('; ') || 'id mismatch'}`
          );
        } else {
          verified = true;
        }
      } catch (e) {
        errors.push(`round-trip JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return {
    ok: errors.length === 0 && verified,
    baseline,
    contentKey,
    lookupKey,
    bucketName: cfg.bucketName,
    uploaded: putContent.ok && putLookup.ok,
    verified,
    errors,
  };
}

/**
 * Capture domain state + bindings and store immutable recovery baseline in R2.
 * Refuses upload when restic_snapshot_id is not present in the configured repo
 * (unless skipResticVerify is set).
 */
export function captureAndUploadRecoveryBaseline(
  input: RecoveryBaselineCaptureInput & { config?: BackupConfig; env?: NodeJS.ProcessEnv }
): RecoveryBaselineUploadResult {
  const env = input.env ?? process.env;
  const errors: string[] = [];
  let cfg: BackupConfig;
  try {
    cfg = input.config ?? loadBackupConfig({ env });
  } catch (e) {
    return {
      ok: false,
      baseline: null,
      contentKey: null,
      lookupKey: null,
      bucketName: null,
      uploaded: false,
      verified: false,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }

  // Fail closed before building/uploading when restic id is ghost/unlistable.
  if (!input.skipResticVerify) {
    const resticCheck = verifyResticSnapshotInRepo({
      resticSnapshotId: input.resticSnapshotId,
      env,
    });
    if (!resticCheck.ok) {
      return {
        ok: false,
        baseline: null,
        contentKey: null,
        lookupKey: null,
        bucketName: cfg.bucketName,
        uploaded: false,
        verified: false,
        errors: [
          resticCheck.error ??
            `restic snapshot not found / unlistable: ${input.resticSnapshotId.trim()}`,
        ],
      };
    }
  }

  let baseline: RecoveryBaseline;
  try {
    baseline = buildRecoveryBaseline({ ...input, env });
  } catch (e) {
    return {
      ok: false,
      baseline: null,
      contentKey: null,
      lookupKey: null,
      bucketName: cfg.bucketName,
      uploaded: false,
      verified: false,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }

  const uploaded = uploadRecoveryBaseline({ config: cfg, baseline, env });
  return {
    ...uploaded,
    errors: [...errors, ...uploaded.errors],
  };
}

export type LoadRecoveryBaselineOptions = {
  config?: BackupConfig;
  env?: NodeJS.ProcessEnv;
  /** Prefer content-addressed key when baseline_id known. */
  baselineId?: string;
  pgbackrestBackupLabel?: string;
  resticSnapshotId?: string;
  /** Explicit full key override. */
  key?: string;
};

/**
 * Load recovery baseline from R2 alone (no mini DB required).
 * Fail-closed when missing or failing content-address / SHA-256 validation.
 */
export function loadRecoveryBaselineFromR2(options: LoadRecoveryBaselineOptions = {}): {
  ok: boolean;
  baseline: RecoveryBaseline | null;
  key: string | null;
  errors: string[];
} {
  const env = options.env ?? process.env;
  const errors: string[] = [];
  let cfg: BackupConfig;
  try {
    cfg = options.config ?? loadBackupConfig({ env });
  } catch (e) {
    return {
      ok: false,
      baseline: null,
      key: null,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }

  let key = options.key?.replace(/^\//, '') ?? null;
  if (!key && options.baselineId) {
    try {
      key = contentAddressedBaselineKey(options.baselineId);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!key && options.pgbackrestBackupLabel && options.resticSnapshotId) {
    try {
      key = lookupBaselineKey(options.pgbackrestBackupLabel, options.resticSnapshotId);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!key) {
    return {
      ok: false,
      baseline: null,
      key: null,
      errors: errors.length
        ? errors
        : ['baseline key unresolved — provide baselineId or label+restic snapshot'],
    };
  }

  const got = getR2Object({ config: cfg, key, env });
  if (!got.ok || !got.body) {
    return {
      ok: false,
      baseline: null,
      key,
      errors: [got.error ?? 'baseline object missing from R2'],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(got.body);
  } catch (e) {
    return {
      ok: false,
      baseline: null,
      key,
      errors: [`baseline JSON parse failed: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const validated = validateRecoveryBaseline(parsed);
  if (!validated.ok || !validated.baseline) {
    return { ok: false, baseline: null, key, errors: validated.errors };
  }
  return { ok: true, baseline: validated.baseline, key, errors: [] };
}

/**
 * Compare restored digests/counts against an R2-loaded baseline.
 * Fail-closed on mismatch; never consults live mini for expected values.
 */
export function compareRestoredToBaseline(
  input: BaselineParityCompareInput
): BaselineParityCompareResult {
  const errors: string[] = [];
  const validated = validateRecoveryBaseline(input.baseline);
  if (!validated.ok || !validated.baseline) {
    return {
      ok: false,
      POSTGRES_PARITY_PASS: false,
      LEDGER_CHECKSUM_MATCH: false,
      BLOB_MANIFEST_MATCH: false,
      baseline_id: '',
      pgbackrest_backup_label: '',
      restic_snapshot_id: '',
      expected_ledger_sha256: '',
      actual_ledger_sha256: input.actualLedgerSha256 ?? '',
      expected_row_counts: {},
      actual_row_counts: input.actualRowCounts ?? {},
      expected_blob_manifest_sha256: '',
      actual_blob_manifest_sha256: input.actualBlobManifestSha256 ?? null,
      errors: validated.errors.length ? validated.errors : ['invalid baseline'],
      exitCode: 1,
    };
  }
  const baseline = validated.baseline;

  // Row counts: exact equality on union of keys (fail if empty expected).
  const expectedCounts = baseline.row_counts;
  const actualCounts = input.actualRowCounts ?? {};
  const keys = new Set([...Object.keys(expectedCounts), ...Object.keys(actualCounts)]);
  let countsOk = keys.size > 0;
  for (const k of keys) {
    if (expectedCounts[k] !== actualCounts[k]) {
      countsOk = false;
      errors.push(
        `row_count mismatch ${k}: expected=${expectedCounts[k] ?? '∅'} actual=${actualCounts[k] ?? '∅'}`
      );
    }
  }
  if (keys.size === 0) {
    errors.push('row_counts empty — refuse POSTGRES_PARITY_PASS');
  }

  const expectedLedger = formatSha256Digest(baseline.ledger_sha256);
  const actualLedger = normalizeSha256Digest(input.actualLedgerSha256);
  if (!actualLedger) {
    errors.push(
      isMd5OnlyDigest(input.actualLedgerSha256)
        ? 'actual ledger digest is MD5-only — refuse LEDGER_CHECKSUM_MATCH'
        : 'actual ledger_sha256 missing or not SHA-256'
    );
  }
  const ledgerOk = actualLedger !== null && actualLedger === expectedLedger;
  if (!ledgerOk && actualLedger) {
    errors.push(`LEDGER_CHECKSUM_MATCH=false: expected=${expectedLedger} actual=${actualLedger}`);
  }

  let blobMatch: boolean | null = null;
  const expectedBlob = formatSha256Digest(baseline.blob_manifest_sha256);
  const actualBlob = normalizeSha256Digest(input.actualBlobManifestSha256 ?? null);
  if (input.actualBlobManifestSha256 != null && input.actualBlobManifestSha256 !== '') {
    blobMatch = actualBlob !== null && actualBlob === expectedBlob;
    if (!blobMatch) {
      errors.push(
        `blob_manifest mismatch: expected=${expectedBlob} actual=${actualBlob ?? input.actualBlobManifestSha256}`
      );
    }
  }

  const ok = countsOk && ledgerOk && (blobMatch === null || blobMatch);
  return {
    ok,
    POSTGRES_PARITY_PASS: countsOk,
    LEDGER_CHECKSUM_MATCH: ledgerOk,
    BLOB_MANIFEST_MATCH: blobMatch,
    baseline_id: baseline.baseline_id,
    pgbackrest_backup_label: baseline.pgbackrest_backup_label,
    restic_snapshot_id: baseline.restic_snapshot_id,
    expected_ledger_sha256: expectedLedger,
    actual_ledger_sha256: actualLedger ?? String(input.actualLedgerSha256 ?? ''),
    expected_row_counts: expectedCounts,
    actual_row_counts: actualCounts,
    expected_blob_manifest_sha256: expectedBlob,
    actual_blob_manifest_sha256: actualBlob,
    errors,
    exitCode: ok ? 0 : 1,
  };
}

/**
 * Load baseline from R2 and compare restored state — fire-drill helper.
 * No DATABASE_URL to mini is required for the expected side.
 */
export function loadBaselineAndCompare(options: {
  load: LoadRecoveryBaselineOptions;
  actualRowCounts: Record<string, number>;
  actualLedgerSha256: string;
  actualBlobManifestSha256?: string | null;
}): BaselineParityCompareResult & { loadErrors: string[]; baseline: RecoveryBaseline | null } {
  const loaded = loadRecoveryBaselineFromR2(options.load);
  if (!loaded.ok || !loaded.baseline) {
    return {
      ok: false,
      POSTGRES_PARITY_PASS: false,
      LEDGER_CHECKSUM_MATCH: false,
      BLOB_MANIFEST_MATCH: false,
      baseline_id: '',
      pgbackrest_backup_label: '',
      restic_snapshot_id: '',
      expected_ledger_sha256: '',
      actual_ledger_sha256: options.actualLedgerSha256,
      expected_row_counts: {},
      actual_row_counts: options.actualRowCounts,
      expected_blob_manifest_sha256: '',
      actual_blob_manifest_sha256: options.actualBlobManifestSha256 ?? null,
      errors: loaded.errors.length
        ? loaded.errors
        : ['baseline missing from R2 — refuse PARITY_PASS'],
      exitCode: 1,
      loadErrors: loaded.errors,
      baseline: null,
    };
  }
  const cmp = compareRestoredToBaseline({
    baseline: loaded.baseline,
    actualRowCounts: options.actualRowCounts,
    actualLedgerSha256: options.actualLedgerSha256,
    actualBlobManifestSha256: options.actualBlobManifestSha256,
  });
  return { ...cmp, loadErrors: [], baseline: loaded.baseline };
}

async function resolveResticSnapshotFromHeartbeat(): Promise<string | null> {
  try {
    const row = await getBackupHeartbeat('restic_blob_mirror');
    const id = row?.last_snapshot_id?.trim() ?? null;
    return id && id.length >= 8 ? id : null;
  } catch {
    return null;
  }
}

async function resolvePgbackrestLabelFromHeartbeat(): Promise<string | null> {
  try {
    const row = await getBackupHeartbeat('base_backup');
    const id = row?.last_snapshot_id?.trim() ?? null;
    return id && id.length >= 8 ? id : null;
  } catch {
    return null;
  }
}

function resolvePgbackrestLabelFromInfo(cfg: BackupConfig, env: NodeJS.ProcessEnv): string | null {
  const pgbEnv: NodeJS.ProcessEnv = {
    ...env,
    PGBACKREST_REPO1_S3_KEY: cfg.accessKeyId,
    PGBACKREST_REPO1_S3_KEY_SECRET: cfg.secretAccessKey,
    PATH: env.PATH ?? '/opt/homebrew/bin:/usr/bin:/bin',
  };
  if (cfg.sessionToken) {
    pgbEnv.PGBACKREST_REPO1_S3_TOKEN = cfg.sessionToken;
  } else {
    delete pgbEnv.PGBACKREST_REPO1_S3_TOKEN;
  }
  const info = run(
    'pgbackrest',
    [`--config=${cfg.pgbackrestConfigPath}`, `--stanza=${cfg.stanza}`, 'info', '--output=json'],
    { env: pgbEnv, timeoutMs: 120_000 }
  );
  if (info.status !== 0) return null;
  return parseLatestBackupLabel(info.stdout);
}

export type BaselineHookResult = RecoveryBaselineUploadResult & {
  hook: 'base_backup' | 'restic_mirror';
  skipped: boolean;
  skipReason?: string;
};

/**
 * Hook from base-backup.ts after a successful base backup.
 * Emits a full baseline when a restic snapshot id is already known (heartbeat);
 * otherwise records skip so restic-mirror can complete the bound baseline.
 */
export async function emitBaseBackupRecoveryBaselineHook(options: {
  config: BackupConfig;
  pgbackrestBackupLabel: string;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
  blobRoot?: string;
  resticSnapshotId?: string | null;
  skipUpload?: boolean;
}): Promise<BaselineHookResult> {
  const env = options.env ?? process.env;
  const restic =
    options.resticSnapshotId?.trim() || (await resolveResticSnapshotFromHeartbeat()) || null;

  if (!restic || restic.length < 8) {
    return {
      ok: false,
      hook: 'base_backup',
      skipped: true,
      skipReason:
        'restic_snapshot_id not yet available — restic-mirror hook will emit bound baseline',
      baseline: null,
      contentKey: null,
      lookupKey: null,
      bucketName: options.config.bucketName,
      uploaded: false,
      verified: false,
      errors: [],
    };
  }

  if (options.skipUpload) {
    return {
      ok: false,
      hook: 'base_backup',
      skipped: true,
      skipReason: 'skipUpload',
      baseline: null,
      contentKey: null,
      lookupKey: null,
      bucketName: options.config.bucketName,
      uploaded: false,
      verified: false,
      errors: [],
    };
  }

  const result = captureAndUploadRecoveryBaseline({
    config: options.config,
    env,
    pgbackrestBackupLabel: options.pgbackrestBackupLabel,
    resticSnapshotId: restic,
    stanza: options.config.stanza,
    databaseUrl: options.databaseUrl,
    blobRoot: options.blobRoot,
  });
  return { ...result, hook: 'base_backup', skipped: false };
}

/**
 * Hook from restic-mirror.ts after parity-confirmed snapshot.
 * Binds restic snapshot id + latest pgBackRest label into an immutable R2 baseline.
 */
export async function bindResticSnapshotToRecoveryBaseline(options: {
  config: BackupConfig;
  resticSnapshotId: string;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
  blobRoot: string;
  pgbackrestBackupLabel?: string | null;
  skipUpload?: boolean;
}): Promise<BaselineHookResult> {
  const env = options.env ?? process.env;
  const restic = options.resticSnapshotId.trim();
  if (restic.length < 8) {
    return {
      ok: false,
      hook: 'restic_mirror',
      skipped: false,
      baseline: null,
      contentKey: null,
      lookupKey: null,
      bucketName: options.config.bucketName,
      uploaded: false,
      verified: false,
      errors: [`restic_snapshot_id too short: ${restic}`],
    };
  }

  const label =
    options.pgbackrestBackupLabel?.trim() ||
    (await resolvePgbackrestLabelFromHeartbeat()) ||
    resolvePgbackrestLabelFromInfo(options.config, env) ||
    null;

  if (!label || label.length < 8) {
    return {
      ok: false,
      hook: 'restic_mirror',
      skipped: true,
      skipReason:
        'pgbackrest_backup_label not yet available — base-backup hook will emit when restic id known',
      baseline: null,
      contentKey: null,
      lookupKey: null,
      bucketName: options.config.bucketName,
      uploaded: false,
      verified: false,
      errors: [],
    };
  }

  if (options.skipUpload) {
    return {
      ok: false,
      hook: 'restic_mirror',
      skipped: true,
      skipReason: 'skipUpload',
      baseline: null,
      contentKey: null,
      lookupKey: null,
      bucketName: options.config.bucketName,
      uploaded: false,
      verified: false,
      errors: [],
    };
  }

  const result = captureAndUploadRecoveryBaseline({
    config: options.config,
    env,
    pgbackrestBackupLabel: label,
    resticSnapshotId: restic,
    stanza: options.config.stanza,
    databaseUrl: options.databaseUrl,
    blobRoot: options.blobRoot,
  });
  return { ...result, hook: 'restic_mirror', skipped: false };
}

/**
 * List recovery-baseline objects under the recovery-baselines/ prefix (debug / evidence).
 */
export function listRecoveryBaselines(options?: {
  config?: BackupConfig;
  env?: NodeJS.ProcessEnv;
}): { count: number; raw: string; keys: string[] } {
  const env = options?.env ?? process.env;
  const cfg = options?.config ?? loadBackupConfig({ env });
  const listed = listRepoPrefix({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    endpoint: cfg.endpoint,
    bucketName: cfg.bucketName,
    prefix: RECOVERY_BASELINE_PREFIX,
    env,
  });
  const keys: string[] = [];
  for (const line of listed.raw.split('\n')) {
    const m = line.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\d+\s+(.+)$/);
    const key = (m?.[1] ?? '').trim();
    if (key.includes(RECOVERY_BASELINE_OBJECT_NAME)) keys.push(key);
  }
  return { count: keys.length, raw: listed.raw, keys };
}
