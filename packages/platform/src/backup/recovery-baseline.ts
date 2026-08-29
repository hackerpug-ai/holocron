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
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSecretValue, resolveRepoRoot, resolveSecretsPathFromEnv } from '../config/secrets.ts';
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
import { pgToolEnv, resolveTrustedPsqlBin } from './trusted-bin.ts';

/** Re-export for descendant/hostile tests (GATE-FIX-S28R3-QA26). */
export { resolveTrustedPsqlBin };

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

/**
 * GATE-FIX-S28R3-QA21: trust-chain validate absolute root-owned executables
 * (mirrors r2_ro_validate_root_bin). No PATH/Homebrew discovery while credentials ambient.
 * Operational prerequisite: root-owned restic/pgbackrest at /usr/local/bin or /usr/bin.
 */
function validateRootOwnedBin(candidate: string): string | null {
  const cand = candidate.trim();
  if (!cand.startsWith('/')) return null;
  try {
    const parts = cand.split('/').filter(Boolean);
    let path = '';
    for (const part of parts) {
      path = `${path}/${part}`;
      let st = lstatSync(path);
      if (st.isSymbolicLink()) {
        const real = realpathSync(path);
        st = lstatSync(real);
      }
      const mode = st.mode & 0o777;
      if (st.uid !== 0) return null;
      if (mode & 0o022) return null;
    }
    const finalPath = realpathSync(cand);
    const st = lstatSync(finalPath);
    if (!st.isFile()) return null;
    if (st.uid !== 0) return null;
    if ((st.mode & 0o111) === 0) return null;
    if ((st.mode & 0o022) !== 0) return null;
    return finalPath;
  } catch {
    return null;
  }
}

/**
 * GATE-FIX-S28R3-QA22: every restic path — including options.resticBin — must
 * pass the same root-owned trust chain. User-owned absolute executables are refused
 * before any R2/restic credential env is constructed.
 */
function resolveTrustedResticBin(
  env: NodeJS.ProcessEnv,
  preResolved?: string | null
): string | null {
  if (preResolved) {
    return validateRootOwnedBin(preResolved);
  }
  const fromEnv = env.RESTIC_BIN?.trim();
  if (fromEnv) {
    const t = validateRootOwnedBin(fromEnv);
    if (t) return t;
  }
  for (const candidate of ['/usr/local/bin/restic', '/usr/bin/restic']) {
    const t = validateRootOwnedBin(candidate);
    if (t) return t;
  }
  return null;
}

/** Process runner signature for test injection BELOW the production trust boundary. */
export type ProcessRunResult = { status: number; stdout: string; stderr: string };
export type ProcessRunner = (
  cmd: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number }
) => ProcessRunResult;

function resolveTrustedPgbackrestBin(env: NodeJS.ProcessEnv): string | null {
  const fromEnv = env.PGBACKREST_BIN?.trim();
  if (fromEnv) {
    const t = validateRootOwnedBin(fromEnv);
    if (t) return t;
  }
  for (const candidate of ['/usr/local/bin/pgbackrest', '/usr/bin/pgbackrest']) {
    const t = validateRootOwnedBin(candidate);
    if (t) return t;
  }
  return null;
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
  /**
   * When true, allow emit of an all-zero domain row_counts map (intentional empty-DB
   * fixtures only). Default false — REDHAT-FIX-S28R2-H1 refuses zero/empty baselines.
   */
  allowEmptyDomainBaseline?: boolean;
  /**
   * GATE-FIX-QA3: wall-clock epoch when row_counts / ledger / blob digests were
   * actually captured. Required with backupStopAt for joint-truth binding.
   */
  payloadCapturedAt?: string;
  /**
   * GATE-FIX-QA3: real pgBackRest backup stop for the bound label (ISO).
   * Must come from backup metadata — never a fabricated stamp.
   */
  backupStopAt?: string;
  /**
   * Pattern A: real base backup completed with stop >= payload capture for this emit.
   */
  coverageProvenThroughCapture?: boolean;
  /**
   * Pattern B: row_counts/ledger/blob were derived from restore/as-of at backup stop.
   */
  asOfDerivedAtStop?: boolean;
  /**
   * When true, refuse wall-clock target_timestamp without recoverable binding proof.
   */
  enforceRecoverableBinding?: boolean;
};

/** GATE-FIX-QA3: inputs for jointly-truthful target_timestamp binding. */
export type RecoverableBaselineBindingInput = {
  /** When digests/counts/blob were actually captured (ISO-8601). */
  payloadCapturedAt: string;
  /** Backup stop from real pgBackRest metadata for the bound label (ISO-8601). */
  backupStopAt: string;
  pgbackrestBackupLabel: string;
  /** Pattern A: real backup stop >= payload capture after/for this emit. */
  coverageProvenThroughCapture?: boolean;
  /** Pattern B: payload derived from restore/as-of at backup stop S. */
  asOfDerivedAtStop?: boolean;
  /** Optional requested stamp — still validated for temporal relabel. */
  requestedTargetTimestamp?: string;
};

export type RecoverableBaselineBindingResult =
  | {
      ok: true;
      target_timestamp: string;
      pgbackrest_backup_label: string;
      mode: 'capture_then_cover' | 'as_of';
    }
  | { ok: false; errors: string[] };

/** Normalize Date to ISO; strip ms when whole seconds (pgBackRest style). */
function isoFromMs(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const iso = d.toISOString();
  return ms % 1000 === 0 ? iso.replace(/\.\d{3}Z$/, 'Z') : iso;
}

/**
 * Parse pgBackRest info JSON for the stop timestamp of a specific backup label.
 * Prefer timestamp.stop (unix seconds); fall back to label-encoded time.
 */
export function parseBackupStopForLabel(
  infoJson: string,
  label: string
): { label: string; stopAt: string; stopMs: number; startMs: number | null } | null {
  const want = label.trim();
  if (!want) return null;
  try {
    const raw = JSON.parse(infoJson) as unknown;
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const stanza of arr) {
      const backups = (stanza as { backup?: unknown[] })?.backup;
      if (!Array.isArray(backups)) continue;
      for (const b of backups) {
        const row = b as {
          label?: string;
          timestamp?: { start?: number; stop?: number };
        };
        if ((row.label ?? '').trim() !== want) continue;
        const stopSec = row.timestamp?.stop;
        if (typeof stopSec === 'number' && stopSec > 0) {
          const stopMs = stopSec * 1000;
          const startSec = row.timestamp?.start;
          return {
            label: want,
            stopAt: isoFromMs(stopMs),
            stopMs,
            startMs: typeof startSec === 'number' && startSec > 0 ? startSec * 1000 : null,
          };
        }
      }
    }
  } catch {
    // fall through to label-encoded time
  }
  const m = want.match(/^(\d{8})-(\d{6})[FDI]/);
  if (m) {
    const date = m[1];
    const time = m[2];
    if (!date || !time) return null;
    const y = date.slice(0, 4);
    const mo = date.slice(4, 6);
    const d = date.slice(6, 8);
    const hh = time.slice(0, 2);
    const mm = time.slice(2, 4);
    const ss = time.slice(4, 6);
    const dt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`);
    if (!Number.isNaN(dt.getTime())) {
      return {
        label: want,
        stopAt: isoFromMs(dt.getTime()),
        stopMs: dt.getTime(),
        startMs: null,
      };
    }
  }
  return null;
}

/**
 * GATE-FIX-QA3: resolve a jointly-truthful target_timestamp for a recovery baseline.
 *
 * Pattern A (capture-then-cover): digests captured at T; real backup stop S >= T;
 * bind target_timestamp to T (recoverable within archive coverage through S).
 *
 * Pattern B (as-of derive): digests derived at stop S; bind target_timestamp to S.
 *
 * Refuses temporal relabeling: later-captured live payload must not be stamped
 * with an older stop S without as-of derivation / proven post-capture coverage.
 */
export function resolveRecoverableBaselineBinding(
  input: RecoverableBaselineBindingInput
): RecoverableBaselineBindingResult {
  const label = input.pgbackrestBackupLabel?.trim() ?? '';
  if (label.length < 8) {
    return {
      ok: false,
      errors: [
        'pgbackrest_backup_label missing or too short — refuse recoverable binding (no fabricated timestamps)',
      ],
    };
  }
  const captureMs = Date.parse(input.payloadCapturedAt);
  const stopMs = Date.parse(input.backupStopAt);
  if (Number.isNaN(captureMs)) {
    return {
      ok: false,
      errors: ['payloadCapturedAt must be ISO-8601 — refuse fabricated timestamp'],
    };
  }
  if (Number.isNaN(stopMs)) {
    return {
      ok: false,
      errors: [
        'backupStopAt must be ISO-8601 from real backup metadata — refuse fabricated timestamp',
      ],
    };
  }

  const requested = input.requestedTargetTimestamp?.trim();
  const requestedMs = requested ? Date.parse(requested) : Number.NaN;

  // AC-2: stamping an older target onto a later-captured payload is temporal relabeling
  // unless Pattern B as-of derivation applies (payload reflects state at S, not live T).
  if (
    requested &&
    !Number.isNaN(requestedMs) &&
    requestedMs + 1 < captureMs &&
    !input.asOfDerivedAtStop
  ) {
    return {
      ok: false,
      errors: [
        `refuse temporal relabeling: later-captured payload at ${input.payloadCapturedAt} cannot be labeled with older target_timestamp=${requested}`,
      ],
    };
  }

  // Pattern B — as-of/restore derive at stop S
  if (input.asOfDerivedAtStop) {
    if (requested && !Number.isNaN(requestedMs) && Math.abs(requestedMs - stopMs) > 2000) {
      return {
        ok: false,
        errors: [
          'as-of derived payload must bind target_timestamp to backup stop S (refuse mismatched stamp)',
        ],
      };
    }
    return {
      ok: true,
      target_timestamp: isoFromMs(stopMs),
      pgbackrest_backup_label: label,
      mode: 'as_of',
    };
  }

  // Pattern A — capture-then-cover: stop must cover capture; bind to T
  if (input.coverageProvenThroughCapture) {
    if (stopMs < captureMs) {
      return {
        ok: false,
        errors: [
          `refuse coverage claim: backup stop ${input.backupStopAt} is before payload capture ${input.payloadCapturedAt} (stop must be >= capture for capture-then-cover)`,
        ],
      };
    }
    let targetMs = captureMs;
    if (requested && !Number.isNaN(requestedMs)) {
      if (requestedMs > stopMs) {
        return {
          ok: false,
          errors: ['target_timestamp must be <= proven backup stop for capture-then-cover'],
        };
      }
      if (requestedMs + 1 < captureMs) {
        return {
          ok: false,
          errors: [
            `refuse temporal relabeling: cannot label later-captured payload with older target_timestamp=${requested}`,
          ],
        };
      }
      targetMs = requestedMs;
    }
    return {
      ok: true,
      target_timestamp: isoFromMs(targetMs),
      pgbackrest_backup_label: label,
      mode: 'capture_then_cover',
    };
  }

  // Unproven: capture after stop without cover/as-of (wall-clock emit defect class)
  if (captureMs > stopMs) {
    return {
      ok: false,
      errors: [
        `refuse temporal relabel / unproven coverage: payload captured at ${input.payloadCapturedAt} after backup stop ${input.backupStopAt} without capture-then-cover or as-of derivation`,
      ],
    };
  }

  return {
    ok: false,
    errors: [
      'refuse emit without coverageProvenThroughCapture (Pattern A) or asOfDerivedAtStop (Pattern B) — no fabricated timestamps',
    ],
  };
}

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
): ProcessRunResult {
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

/**
 * GATE-FIX-S28R3-QA26: absolute root-trusted psql only — never bare PATH or
 * user-owned absolute/Homebrew fallback with credentialed env.
 */
function resolvePsqlBin(env: NodeJS.ProcessEnv = process.env): string {
  return resolveTrustedPsqlBin(env);
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
  const env = conn.env ?? process.env;
  const bin = resolvePsqlBin(env);
  return run(bin, args, { env: pgToolEnv(env), timeoutMs: 60_000 });
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

/**
 * R2 prefix for recovery-baseline objects.
 *
 * Production keeps the standing `recovery-baselines/` namespace. The isolated
 * go/no-go lane must remain inside its minted `integration/...` capability, so
 * baseline objects are nested under that lane's pgBackRest prefix.
 */
export function recoveryBaselineObjectPrefix(
  config?: Pick<BackupConfig, 'pgbackrestPrefix'>,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (env.HOLO_GO_NO_GO_ISOLATED !== '1') return RECOVERY_BASELINE_PREFIX;
  const isolatedRoot = config?.pgbackrestPrefix?.trim().replace(/^\/+|\/+$/g, '') ?? '';
  if (!isolatedRoot.startsWith('integration/')) {
    throw new Error(
      'isolated recovery baseline requires config.pgbackrestPrefix under integration/'
    );
  }
  return `${isolatedRoot}/${RECOVERY_BASELINE_PREFIX}`;
}

/** Content-addressed R2 key for a baseline_id. */
export function contentAddressedBaselineKey(
  baselineId: string,
  objectPrefix: string = RECOVERY_BASELINE_PREFIX
): string {
  const id = formatSha256Digest(baselineId);
  return `${objectPrefix.replace(/^\/+|\/+$/g, '')}/sha256/${id}/${RECOVERY_BASELINE_OBJECT_NAME}`;
}

/** Lookup key bound to concrete backup label + restic snapshot. */
export function lookupBaselineKey(
  pgbackrestLabel: string,
  resticSnapshotId: string,
  objectPrefix: string = RECOVERY_BASELINE_PREFIX
): string {
  const label = pgbackrestLabel.trim();
  const snap = resticSnapshotId.trim();
  if (label.length < 8) throw new Error(`pgbackrest_backup_label too short: ${label}`);
  if (snap.length < 8) throw new Error(`restic_snapshot_id too short: ${snap}`);
  return `${objectPrefix.replace(/^\/+|\/+$/g, '')}/by-backup/${encodeURIComponent(label)}/${encodeURIComponent(snap)}/${RECOVERY_BASELINE_OBJECT_NAME}`;
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
  const secretsPath = resolveSecretsPathFromEnv(env);
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
      // GATE-FIX-S28R3-QA21: no Homebrew/PATH discovery while credentials ambient.
      PATH: '/usr/bin:/bin',
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
 * Exact restic snapshot match (REDHAT-FIX-S28R2-H2).
 *
 * Accept only:
 *   - exact full id equality
 *   - exact short_id equality
 *   - full-id prefix match when needle.length >= 8 and id.startsWith(needle)
 *
 * NEVER accept reverse short-id prefix matching (ghost ids that merely
 * begin with a real short_id must not bind as if present).
 */
export function matchResticSnapshotId(
  resticSnapshotId: string,
  snapshots: Array<{ id?: string; short_id?: string }>
): { ok: boolean; matchedId: string | null; error?: string; snapshotsChecked: number } {
  const snap = resticSnapshotId.trim();
  if (snap.length < 8) {
    return {
      ok: false,
      matchedId: null,
      error: `restic_snapshot_id too short to verify: ${snap.length}`,
      snapshotsChecked: snapshots.length,
    };
  }
  const needle = snap.toLowerCase();
  for (const row of snapshots) {
    const id = (row.id ?? '').toLowerCase();
    const short = (row.short_id ?? '').toLowerCase();
    if (id === needle || short === needle) {
      return {
        ok: true,
        matchedId: row.id ?? row.short_id ?? snap,
        snapshotsChecked: snapshots.length,
      };
    }
    // Full-id prefix only (needle is a prefix of id), never the reverse.
    if (needle.length >= 8 && id.length > 0 && id.startsWith(needle)) {
      return {
        ok: true,
        matchedId: row.id ?? snap,
        snapshotsChecked: snapshots.length,
      };
    }
  }
  return {
    ok: false,
    matchedId: null,
    error: `restic snapshot not found / unlistable for id "${snap}" — refuse baseline bind (no exact/prefix ID match in repo)`,
    snapshotsChecked: snapshots.length,
  };
}

/**
 * Verify a restic snapshot id exists in the configured restic repository
 * (`restic snapshots --json` / exact + full-id prefix match). Fail-closed when
 * restic is unreachable or the id is missing — never bind a ghost snapshot into R2.
 */
export function verifyResticSnapshotInRepo(options: {
  resticSnapshotId: string;
  env?: NodeJS.ProcessEnv;
  /**
   * Optional pre-resolved restic bin — MUST pass root-owned validateRootOwnedBin
   * (GATE-FIX-S28R3-QA22). User-owned absolute paths are refused before credentials.
   */
  resticBin?: string;
  /** When true, skip live restic (tests only). */
  skip?: boolean;
  /**
   * GATE-FIX-S28R3-QA22 test-only: inject a process runner BELOW the production
   * trust boundary. Does not accept a user-owned resticBin that receives credentials.
   * When set without resticBin, a synthetic trusted-label path is used only as the
   * runner argument (never spawnSync'd by production run()).
   */
  runProcess?: ProcessRunner;
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
  // GATE-FIX-S28R3-QA22: resolve + validate root-owned restic BEFORE any credential env.
  // Explicit options.resticBin uses the same validateRootOwnedBin chain (no user-owned bypass).
  const resticBin = resolveTrustedResticBin(env, options.resticBin ?? null);
  if (options.resticBin && !resticBin) {
    return {
      ok: false,
      matchedId: null,
      error:
        'restic binary missing or untrusted — refuse baseline bind (require root-owned /usr/local/bin/restic or /usr/bin/restic; PATH/Homebrew discovery forbidden; options.resticBin must pass root-owned trust chain)',
      snapshotsChecked: 0,
    };
  }
  if (!resticBin && !options.runProcess) {
    return {
      ok: false,
      matchedId: null,
      error:
        'restic binary missing or untrusted — refuse baseline bind (require root-owned /usr/local/bin/restic or /usr/bin/restic; PATH/Homebrew discovery forbidden)',
      snapshotsChecked: 0,
    };
  }

  // Credential env is constructed only AFTER the trust boundary above.
  const renv = resticVerifyEnv(env);
  if (!renv.ok) {
    return { ok: false, matchedId: null, error: renv.error, snapshotsChecked: 0 };
  }

  const runner: ProcessRunner = options.runProcess ?? run;
  // When runProcess is injected without a trusted on-disk bin, pass a fixed label only —
  // production run() is not used, so no untrusted executable receives credentials.
  const binForRunner = resticBin ?? '/usr/bin/restic';
  // GATE-FIX-S28R3-QA24: --no-lock so restore-only R2 creds (List/Get, no Put) can list
  // snapshots without creating exclusive locks in the restic repo.
  const snaps = runner(binForRunner, ['snapshots', '--json', '--no-lock'], {
    env: renv.env,
    timeoutMs: 120_000,
  });
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
  return matchResticSnapshotId(snap, parsed);
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

  // GATE-FIX-QA3: when recoverable-binding fields are present, require joint truth.
  // Synthetic fixture paths (C5/H1) omit these and keep prior wall-clock behavior.
  const hasBindingInput =
    input.payloadCapturedAt != null ||
    input.backupStopAt != null ||
    input.coverageProvenThroughCapture != null ||
    input.asOfDerivedAtStop != null ||
    input.enforceRecoverableBinding === true;

  let target_timestamp: string;
  if (hasBindingInput) {
    const captureAt = input.payloadCapturedAt?.trim() || new Date().toISOString();
    const stopAt = input.backupStopAt?.trim();
    if (!stopAt) {
      throw new Error(
        'backupStopAt required for recoverable baseline binding — refuse fabricated timestamp'
      );
    }
    const bound = resolveRecoverableBaselineBinding({
      payloadCapturedAt: captureAt,
      backupStopAt: stopAt,
      pgbackrestBackupLabel: label,
      coverageProvenThroughCapture: input.coverageProvenThroughCapture,
      asOfDerivedAtStop: input.asOfDerivedAtStop,
      requestedTargetTimestamp: input.targetTimestamp,
    });
    if (!bound.ok) {
      throw new Error(bound.errors.join('; '));
    }
    target_timestamp = bound.target_timestamp;
  } else {
    // Legacy synthetic/fixture path — operational emit must pass binding fields.
    target_timestamp = input.targetTimestamp ?? new Date().toISOString();
  }
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

  // REDHAT-FIX-S28R2-H1: refuse all-zero / empty required-domain baselines at emit
  // unless explicitly allowed for intentional empty-DB fixtures.
  const domainTotal = baselineDomainRowTotal(row_counts);
  if (domainTotal === 0 && !input.allowEmptyDomainBaseline) {
    throw new Error(
      'refuse zero/empty domain recovery baseline — domain row_counts total is 0 after capture (set allowEmptyDomainBaseline only for intentional empty-DB fixtures)'
    );
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

/** Upload UTF-8 body to R2 via trusted root-owned aws or python provider (no bare PATH). */
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
    const awsBin = resolveTrustedAwsBinForBaseline(env);
    if (awsBin) {
      const res = run(
        awsBin,
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
        {
          env: {
            ...awsEnv(cfg, env),
            PATH: '/usr/bin:/bin',
          },
          timeoutMs: 120_000,
        }
      );
      if (res.status === 0) return { ok: true, key };
      // Fall through to python provider.
    }
    const py = validateRootOwnedBin('/usr/bin/python3') ?? validateRootOwnedBin('/bin/python3');
    if (!py) {
      return {
        ok: false,
        key,
        error:
          'GATE-FIX-S28R3-QA25: no root-owned aws or python3 for recovery-baseline PUT (PATH/Homebrew forbidden)',
      };
    }
    const provider = `${resolveRepoRoot()}/scripts/lib/r2_s3_provider.py`;
    if (!existsSync(provider)) {
      return { ok: false, key, error: `GATE-FIX-S28R3-QA25: missing R2 provider ${provider}` };
    }
    const body = readFileSync(local, 'utf8');
    const res = spawnSync(
      py,
      [
        '-E',
        '-s',
        provider,
        'put-object',
        '--endpoint',
        cfg.endpoint,
        '--bucket',
        cfg.bucketName,
        '--key',
        key,
      ],
      {
        encoding: 'utf8',
        input: body,
        env: {
          ...awsEnv(cfg, env),
          PATH: '/usr/bin:/bin',
        },
        timeout: 120_000,
      }
    );
    if ((res.status ?? 1) !== 0) {
      return {
        ok: false,
        key,
        error: `recovery-baseline PUT failed: ${(res.stderr || res.stdout || '').toString().slice(0, 400)}`,
      };
    }
    return { ok: true, key };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * GATE-FIX-S28R3-QA24: resolve root-owned aws for restore-only PATH=/usr/bin:/bin.
 * Never bare PATH discovery (Homebrew aws forbidden while credentials ambient).
 */
function resolveTrustedAwsBinForBaseline(env: NodeJS.ProcessEnv): string | null {
  const fromEnv = env.AWS_BIN?.trim();
  if (fromEnv) {
    const t = validateRootOwnedBin(fromEnv);
    if (t) return t;
  }
  for (const candidate of ['/usr/local/bin/aws', '/usr/bin/aws'] as const) {
    const t = validateRootOwnedBin(candidate);
    if (t) return t;
  }
  return null;
}

/** Download R2 object body via trusted root-owned aws, else stdlib python provider. */
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
    const awsBin = resolveTrustedAwsBinForBaseline(env);
    if (awsBin) {
      const res = run(
        awsBin,
        ['s3', 'cp', `s3://${cfg.bucketName}/${key}`, local, '--endpoint-url', cfg.endpoint],
        {
          env: {
            ...awsEnv(cfg, env),
            PATH: '/usr/bin:/bin',
          },
          timeoutMs: 120_000,
        }
      );
      if (res.status === 0 && existsSync(local)) {
        return { ok: true, body: readFileSync(local, 'utf8') };
      }
      // Fall through to python provider when trusted aws fails (e.g. missing on host).
    }

    // Fallback: repository stdlib provider via root-owned python3 (same class as listRepoPrefix).
    const py = validateRootOwnedBin('/usr/bin/python3') ?? validateRootOwnedBin('/bin/python3');
    if (!py) {
      return {
        ok: false,
        body: null,
        error:
          'GATE-FIX-S28R3-QA24: no root-owned aws or python3 for recovery-baseline GET (PATH/Homebrew forbidden)',
      };
    }
    const provider = `${resolveRepoRoot()}/scripts/lib/r2_s3_provider.py`;
    if (!existsSync(provider)) {
      return {
        ok: false,
        body: null,
        error: `GATE-FIX-S28R3-QA24: missing R2 provider ${provider}`,
      };
    }
    const res = run(
      py,
      [
        '-E',
        '-s',
        provider,
        'get-object',
        '--endpoint',
        cfg.endpoint,
        '--bucket',
        cfg.bucketName,
        '--key',
        key,
        '--out-file',
        local,
      ],
      {
        env: {
          ...awsEnv(cfg, env),
          PATH: '/usr/bin:/bin',
        },
        timeoutMs: 120_000,
      }
    );
    if (res.status !== 0 || !existsSync(local)) {
      return {
        ok: false,
        body: null,
        error: `recovery-baseline GET failed: ${(res.stderr || res.stdout).slice(0, 400)}`,
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
  const objectPrefix = recoveryBaselineObjectPrefix(cfg, env);
  const contentKey = contentAddressedBaselineKey(baseline.baseline_id, objectPrefix);
  const lookupKey = lookupBaselineKey(
    baseline.pgbackrest_backup_label,
    baseline.restic_snapshot_id,
    objectPrefix
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

export type EmitLiveRecoveryBaselineOptions = {
  env?: NodeJS.ProcessEnv;
  config?: BackupConfig;
  databaseUrl?: string;
  blobRoot?: string;
  resticSnapshotId?: string;
  pgbackrestBackupLabel?: string;
  /**
   * GATE-FIX-QA3: epoch when digests are considered captured (default: now).
   * Used for joint-truth binding — never silently swapped for older stop.
   */
  payloadCapturedAt?: string;
  /** Injected real backup stop (ISO); live path resolves from pgBackRest info when omitted. */
  backupStopAt?: string;
  /** Requested target_timestamp — still subject to temporal-relabel refusal. */
  requestedTargetTimestamp?: string;
  coverageProvenThroughCapture?: boolean;
  asOfDerivedAtStop?: boolean;
  /**
   * Pattern A cover step when capture is after current stop. Tests inject;
   * live path may run a real base backup when not provided and cover is needed.
   */
  ensureCoverageThrough?: (captureAt: string) => {
    ok: boolean;
    backupStopAt?: string;
    pgbackrestBackupLabel?: string;
    errors?: string[];
  };
  /**
   * When true, skip live restic/pgBackRest resolve and only exercise binding
   * (+ optional ghost restic refuse). Used by pure inject tests.
   */
  skipLiveResolve?: boolean;
};

/**
 * GATE-FIX-QA2/QA3: operational emit of a parity-meaningful baseline bound to a
 * *listable* restic snapshot (exact verify) + real pgBackRest label/stop.
 *
 * GATE-FIX-QA3: entire payload is jointly truthful at target_timestamp via
 * Pattern A (capture-then-cover) or Pattern B (as-of). Refuses temporal
 * relabeling of later-captured digests onto an older stop S.
 */
export function emitLiveRecoveryBaseline(
  options?: EmitLiveRecoveryBaselineOptions
): RecoveryBaselineUploadResult & {
  restic_snapshot_id: string | null;
  pgbackrest_backup_label: string | null;
} {
  const env = options?.env ?? process.env;
  const fail = (
    errors: string[],
    partial?: { restic?: string | null; label?: string | null; bucket?: string | null }
  ): RecoveryBaselineUploadResult & {
    restic_snapshot_id: string | null;
    pgbackrest_backup_label: string | null;
  } => ({
    ok: false,
    baseline: null,
    contentKey: null,
    lookupKey: null,
    bucketName: partial?.bucket ?? null,
    uploaded: false,
    verified: false,
    errors,
    restic_snapshot_id: partial?.restic ?? null,
    pgbackrest_backup_label: partial?.label ?? null,
  });

  const payloadCapturedAt = options?.payloadCapturedAt?.trim() || new Date().toISOString();

  // ── skipLiveResolve: pure binding + fail-closed seams (GATE-FIX-QA3 tests) ──
  if (options?.skipLiveResolve) {
    let label = options.pgbackrestBackupLabel?.trim() || '';
    let stopAt = options.backupStopAt?.trim() || '';
    let coverage = options.coverageProvenThroughCapture === true;
    const asOf = options.asOfDerivedAtStop === true;
    if (!stopAt || label.length < 8) {
      return fail([
        'skipLiveResolve requires backupStopAt + pgbackrestBackupLabel for recoverable binding',
      ]);
    }
    if (!coverage && !asOf && Date.parse(payloadCapturedAt) > Date.parse(stopAt)) {
      if (options.ensureCoverageThrough) {
        const cover = options.ensureCoverageThrough(payloadCapturedAt);
        if (cover.ok && cover.backupStopAt && cover.pgbackrestBackupLabel) {
          coverage = true;
          stopAt = cover.backupStopAt;
          label = cover.pgbackrestBackupLabel;
        } else {
          return fail(
            cover.errors?.length
              ? cover.errors
              : ['no real backup/WAL coverage for capture point — refuse emit']
          );
        }
      }
    }
    const bound = resolveRecoverableBaselineBinding({
      payloadCapturedAt,
      backupStopAt: stopAt,
      pgbackrestBackupLabel: label,
      coverageProvenThroughCapture: coverage,
      asOfDerivedAtStop: asOf,
      requestedTargetTimestamp: options.requestedTargetTimestamp,
    });
    if (!bound.ok) {
      return fail(bound.errors, { label });
    }
    // Binding is coherent — still refuse upload without listable restic (QA2).
    const restic = options.resticSnapshotId?.trim() || '';
    if (!restic || restic.length < 8) {
      return fail(['restic_snapshot_id required after recoverable binding'], { label });
    }
    const resticCheck = verifyResticSnapshotInRepo({ resticSnapshotId: restic, env });
    if (!resticCheck.ok) {
      return fail(
        [
          resticCheck.error ??
            `restic snapshot not listable: ${restic} — refuse emit (fail closed)`,
        ],
        { restic, label }
      );
    }
    const blobRoot =
      options.blobRoot?.trim() ||
      env.HOLO_BLOB_ROOT?.trim() ||
      env.HOLOCRON_BLOB_ROOT?.trim() ||
      '';
    if (!blobRoot) {
      return fail(['blobRoot required for recovery baseline emit'], { restic, label });
    }
    let cfg: BackupConfig | undefined;
    try {
      const secretsPath = resolveSecretsPathFromEnv(env);
      cfg = options.config ?? loadBackupConfig({ env, secretsPath });
    } catch (e) {
      return fail([e instanceof Error ? e.message : String(e)], { restic, label });
    }
    const result = captureAndUploadRecoveryBaseline({
      config: cfg,
      env,
      pgbackrestBackupLabel: bound.pgbackrest_backup_label,
      resticSnapshotId: resticCheck.matchedId ?? restic,
      stanza: cfg.stanza,
      databaseUrl: options.databaseUrl,
      blobRoot,
      targetTimestamp: bound.target_timestamp,
      payloadCapturedAt,
      backupStopAt: stopAt,
      coverageProvenThroughCapture: bound.mode === 'capture_then_cover',
      asOfDerivedAtStop: bound.mode === 'as_of',
    });
    return {
      ...result,
      restic_snapshot_id: result.baseline?.restic_snapshot_id ?? restic,
      pgbackrest_backup_label: result.baseline?.pgbackrest_backup_label ?? label,
    };
  }

  const secretsPath = resolveSecretsPathFromEnv(env);
  let cfg: BackupConfig;
  try {
    cfg = options?.config ?? loadBackupConfig({ env, secretsPath });
  } catch (e) {
    return fail([e instanceof Error ? e.message : String(e)]);
  }

  // Prefer explicit restic id so ghost-refusal can be proven without full list.
  let restic = options?.resticSnapshotId?.trim() || '';
  if (!restic || restic.length < 8) {
    const listed = listResticSnapshotIds({ env });
    if (!listed.ok || listed.ids.length === 0) {
      return fail(
        [
          listed.error ??
            'no restic snapshots in repository — refuse emit without listable restic id',
        ],
        { bucket: cfg.bucketName }
      );
    }
    restic = listed.ids[listed.ids.length - 1]!;
  }

  // Fail closed on ghost/unlistable before any R2 upload (GATE-FIX-QA2 AC-2).
  const resticCheck = verifyResticSnapshotInRepo({ resticSnapshotId: restic, env });
  if (!resticCheck.ok) {
    return fail(
      [resticCheck.error ?? `restic snapshot not listable: ${restic} — refuse emit (fail closed)`],
      { restic, bucket: cfg.bucketName }
    );
  }
  restic = resticCheck.matchedId ?? restic;

  let label =
    options?.pgbackrestBackupLabel?.trim() || resolvePgbackrestLabelFromInfo(cfg, env) || '';
  if (label.length < 8) {
    return fail(['pgbackrest_backup_label unavailable from pgBackRest info — refuse emit'], {
      restic,
      bucket: cfg.bucketName,
    });
  }

  const blobRoot =
    options?.blobRoot?.trim() || env.HOLO_BLOB_ROOT?.trim() || env.HOLOCRON_BLOB_ROOT?.trim() || '';
  if (!blobRoot) {
    return fail(['blobRoot required (HOLO_BLOB_ROOT / --blob-root) for recovery baseline emit'], {
      restic,
      label,
      bucket: cfg.bucketName,
    });
  }

  // Resolve real backup stop for the bound label (GATE-FIX-QA3 joint truth).
  let stopAt = options?.backupStopAt?.trim() || '';
  let coverage = options?.coverageProvenThroughCapture === true;
  const asOf = options?.asOfDerivedAtStop === true;
  if (!stopAt) {
    const infoStop = resolvePgbackrestStopFromInfo(cfg, env, label);
    if (infoStop) stopAt = infoStop.stopAt;
  }
  if (!stopAt) {
    return fail(
      [
        'backup stop metadata unavailable for pgBackRest label — refuse emit without recoverable coverage proof',
      ],
      { restic, label, bucket: cfg.bucketName }
    );
  }

  // Pattern A: if capture is after stop, require cover (real base backup or inject).
  if (!coverage && !asOf && Date.parse(payloadCapturedAt) > Date.parse(stopAt)) {
    const coverFn =
      options?.ensureCoverageThrough ??
      ((captureAt: string) => ensureBaseBackupCoverageThroughCapture({ cfg, env, captureAt }));
    const cover = coverFn(payloadCapturedAt);
    if (cover.ok && cover.backupStopAt && cover.pgbackrestBackupLabel) {
      coverage = true;
      stopAt = cover.backupStopAt;
      label = cover.pgbackrestBackupLabel;
    } else {
      return fail(
        cover.errors?.length
          ? cover.errors
          : [
              `no real backup/WAL coverage through capture ${payloadCapturedAt} (latest stop ${stopAt}) — refuse emit`,
            ],
        { restic, label, bucket: cfg.bucketName }
      );
    }
  } else if (!coverage && !asOf && Date.parse(payloadCapturedAt) <= Date.parse(stopAt)) {
    // Capture at/before stop alone is not as-of proof; require explicit cover flag
    // from a coordinated backup that completed for this capture, or run cover.
    // Operational live emit: treat "stop already covers capture" after a cover
    // step that re-confirms the same stop (no temporal relabel of later state).
    // If operator did not pre-declare coverage, run cover to re-establish stop >= T.
    const coverFn =
      options?.ensureCoverageThrough ??
      ((captureAt: string) => ensureBaseBackupCoverageThroughCapture({ cfg, env, captureAt }));
    const cover = coverFn(payloadCapturedAt);
    if (cover.ok && cover.backupStopAt && cover.pgbackrestBackupLabel) {
      coverage = true;
      stopAt = cover.backupStopAt;
      label = cover.pgbackrestBackupLabel;
    } else if (Date.parse(stopAt) >= Date.parse(payloadCapturedAt)) {
      // Existing stop already >= capture; accept as Pattern A only when the
      // capture epoch is not after stop (no later-live digests for older S).
      coverage = true;
    } else {
      return fail(
        cover.errors?.length
          ? cover.errors
          : ['no real backup/WAL coverage for capture point — refuse emit'],
        { restic, label, bucket: cfg.bucketName }
      );
    }
  }

  const bound = resolveRecoverableBaselineBinding({
    payloadCapturedAt,
    backupStopAt: stopAt,
    pgbackrestBackupLabel: label,
    coverageProvenThroughCapture: coverage,
    asOfDerivedAtStop: asOf,
    requestedTargetTimestamp: options?.requestedTargetTimestamp,
  });
  if (!bound.ok) {
    return fail(bound.errors, { restic, label, bucket: cfg.bucketName });
  }

  const result = captureAndUploadRecoveryBaseline({
    config: cfg,
    env,
    pgbackrestBackupLabel: bound.pgbackrest_backup_label,
    resticSnapshotId: restic,
    stanza: cfg.stanza,
    databaseUrl: options?.databaseUrl,
    blobRoot,
    targetTimestamp: bound.target_timestamp,
    payloadCapturedAt,
    backupStopAt: stopAt,
    coverageProvenThroughCapture: bound.mode === 'capture_then_cover',
    asOfDerivedAtStop: bound.mode === 'as_of',
  });
  return {
    ...result,
    restic_snapshot_id: result.baseline?.restic_snapshot_id ?? restic,
    pgbackrest_backup_label: result.baseline?.pgbackrest_backup_label ?? label,
  };
}

/**
 * Resolve backup stop ISO for a label via live `pgbackrest info --output=json`.
 */
function resolvePgbackrestStopFromInfo(
  cfg: BackupConfig,
  env: NodeJS.ProcessEnv,
  label: string
): { stopAt: string; stopMs: number } | null {
  const pgbBin = resolveTrustedPgbackrestBin(env);
  if (!pgbBin) return null;
  const pgbEnv: NodeJS.ProcessEnv = {
    ...env,
    PGBACKREST_REPO1_S3_KEY: cfg.accessKeyId,
    PGBACKREST_REPO1_S3_KEY_SECRET: cfg.secretAccessKey,
    PATH: '/usr/bin:/bin',
  };
  if (cfg.sessionToken) {
    pgbEnv.PGBACKREST_REPO1_S3_TOKEN = cfg.sessionToken;
  } else {
    delete pgbEnv.PGBACKREST_REPO1_S3_TOKEN;
  }
  const info = run(
    pgbBin,
    [`--config=${cfg.pgbackrestConfigPath}`, `--stanza=${cfg.stanza}`, 'info', '--output=json'],
    { env: pgbEnv, timeoutMs: 120_000 }
  );
  if (info.status !== 0) return null;
  const parsed = parseBackupStopForLabel(info.stdout || '', label);
  if (!parsed) return null;
  return { stopAt: parsed.stopAt, stopMs: parsed.stopMs };
}

/**
 * Pattern A cover: run a real base backup and return stop >= captureAt when proven.
 * Fail closed when backup/info cannot prove coverage.
 */
function ensureBaseBackupCoverageThroughCapture(options: {
  cfg: BackupConfig;
  env: NodeJS.ProcessEnv;
  captureAt: string;
}): {
  ok: boolean;
  backupStopAt?: string;
  pgbackrestBackupLabel?: string;
  errors?: string[];
} {
  const { cfg, env, captureAt } = options;
  const captureMs = Date.parse(captureAt);
  if (Number.isNaN(captureMs)) {
    return { ok: false, errors: ['captureAt invalid — refuse coverage'] };
  }
  const pgbBin = resolveTrustedPgbackrestBin(env);
  if (!pgbBin) {
    return {
      ok: false,
      errors: [
        'pgbackrest binary missing or untrusted — require root-owned /usr/local/bin/pgbackrest or /usr/bin/pgbackrest (PATH/Homebrew forbidden)',
      ],
    };
  }
  const pgbEnv: NodeJS.ProcessEnv = {
    ...env,
    PGBACKREST_REPO1_S3_KEY: cfg.accessKeyId,
    PGBACKREST_REPO1_S3_KEY_SECRET: cfg.secretAccessKey,
    PATH: '/usr/bin:/bin',
  };
  if (cfg.sessionToken) {
    pgbEnv.PGBACKREST_REPO1_S3_TOKEN = cfg.sessionToken;
  } else {
    delete pgbEnv.PGBACKREST_REPO1_S3_TOKEN;
  }
  // Prefer incr after an existing full; fall back to full.
  const backup = run(
    pgbBin,
    [
      `--config=${cfg.pgbackrestConfigPath}`,
      `--stanza=${cfg.stanza}`,
      '--type=incr',
      '--no-archive-mode-check',
      '--log-path=/tmp/pgbackrest-logs',
      'backup',
    ],
    { env: pgbEnv, timeoutMs: 600_000 }
  );
  if (backup.status !== 0) {
    const full = run(
      pgbBin,
      [
        `--config=${cfg.pgbackrestConfigPath}`,
        `--stanza=${cfg.stanza}`,
        '--type=full',
        '--no-archive-mode-check',
        '--log-path=/tmp/pgbackrest-logs',
        'backup',
      ],
      { env: pgbEnv, timeoutMs: 600_000 }
    );
    if (full.status !== 0) {
      return {
        ok: false,
        errors: [
          `pgbackrest backup failed — cannot prove coverage through capture: ${(full.stderr || full.stdout || backup.stderr || backup.stdout).slice(0, 400)}`,
        ],
      };
    }
  }
  const info = run(
    pgbBin,
    [`--config=${cfg.pgbackrestConfigPath}`, `--stanza=${cfg.stanza}`, 'info', '--output=json'],
    { env: pgbEnv, timeoutMs: 120_000 }
  );
  if (info.status !== 0) {
    return {
      ok: false,
      errors: [
        `pgbackrest info after cover backup failed: ${(info.stderr || info.stdout).slice(0, 400)}`,
      ],
    };
  }
  const latestLabel = parseLatestBackupLabel(info.stdout || '');
  if (!latestLabel) {
    return { ok: false, errors: ['no backup label after cover backup — refuse coverage'] };
  }
  const stop = parseBackupStopForLabel(info.stdout || '', latestLabel);
  if (!stop) {
    return {
      ok: false,
      errors: [`could not parse stop for label ${latestLabel} — refuse coverage`],
    };
  }
  if (stop.stopMs < captureMs) {
    return {
      ok: false,
      errors: [
        `cover backup stop ${stop.stopAt} still before capture ${captureAt} — refuse coverage`,
      ],
    };
  }
  return {
    ok: true,
    backupStopAt: stop.stopAt,
    pgbackrestBackupLabel: latestLabel,
  };
}

/** List restic snapshot ids (newest last) via live `restic snapshots --json`. */
export function listResticSnapshotIds(options?: { env?: NodeJS.ProcessEnv }): {
  ok: boolean;
  ids: string[];
  error?: string;
} {
  const env = options?.env ?? process.env;
  const resticEnv = resticVerifyEnv(env);
  if (!resticEnv.ok) return { ok: false, ids: [], error: resticEnv.error };
  const resticBin = resolveTrustedResticBin(env);
  if (!resticBin) {
    return {
      ok: false,
      ids: [],
      error:
        'restic binary missing or untrusted — require root-owned /usr/local/bin/restic or /usr/bin/restic (PATH/Homebrew forbidden)',
    };
  }
  // GATE-FIX-S28R3-QA24: --no-lock for restore-only List/Get credentials.
  const snaps = run(resticBin, ['snapshots', '--json', '--no-lock'], {
    env: resticEnv.env,
    timeoutMs: 180_000,
  });
  if (snaps.status !== 0) {
    return {
      ok: false,
      ids: [],
      error: `restic snapshots failed: ${(snaps.stderr || snaps.stdout).slice(0, 400)}`,
    };
  }
  try {
    const parsed = JSON.parse(snaps.stdout) as Array<{ id?: string; short_id?: string }>;
    if (!Array.isArray(parsed))
      return { ok: false, ids: [], error: 'restic snapshots not an array' };
    const ids = parsed.map((r) => (r.id ?? r.short_id ?? '').trim()).filter((id) => id.length >= 8);
    return { ok: true, ids };
  } catch (e) {
    return {
      ok: false,
      ids: [],
      error: `restic snapshots parse failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
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
  const objectPrefix = recoveryBaselineObjectPrefix(cfg, env);
  if (!key && options.baselineId) {
    try {
      key = contentAddressedBaselineKey(options.baselineId, objectPrefix);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!key && options.pgbackrestBackupLabel && options.resticSnapshotId) {
    try {
      key = lookupBaselineKey(
        options.pgbackrestBackupLabel,
        options.resticSnapshotId,
        objectPrefix
      );
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
  const pgbBin = resolveTrustedPgbackrestBin(env);
  if (!pgbBin) return null;
  const pgbEnv: NodeJS.ProcessEnv = {
    ...env,
    PGBACKREST_REPO1_S3_KEY: cfg.accessKeyId,
    PGBACKREST_REPO1_S3_KEY_SECRET: cfg.secretAccessKey,
    PATH: '/usr/bin:/bin',
  };
  if (cfg.sessionToken) {
    pgbEnv.PGBACKREST_REPO1_S3_TOKEN = cfg.sessionToken;
  } else {
    delete pgbEnv.PGBACKREST_REPO1_S3_TOKEN;
  }
  const info = run(
    pgbBin,
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
 *
 * GATE-FIX-QA3: prefers Pattern A pre-capture (payloadCapturedAt + backupStopAt
 * with coverageProvenThroughCapture). Refuses wall-clock temporal relabel when
 * digests would be captured after an older stop without cover proof.
 */
export async function emitBaseBackupRecoveryBaselineHook(options: {
  config: BackupConfig;
  pgbackrestBackupLabel: string;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
  blobRoot?: string;
  resticSnapshotId?: string | null;
  skipUpload?: boolean;
  /** Pattern A: when digests were (or will be) captured. */
  payloadCapturedAt?: string;
  /** Real stop for pgbackrestBackupLabel from backup metadata. */
  backupStopAt?: string;
  coverageProvenThroughCapture?: boolean;
  asOfDerivedAtStop?: boolean;
  rowCounts?: Record<string, number>;
  ledgerSha256?: string;
  ledgerPerTableSha256?: Record<string, string>;
  blobManifestSha256?: string;
  targetLsn?: string;
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

  const label = options.pgbackrestBackupLabel.trim();
  const payloadCapturedAt = options.payloadCapturedAt?.trim() || new Date().toISOString();
  let stopAt = options.backupStopAt?.trim() || '';
  if (!stopAt) {
    const resolved = resolvePgbackrestStopFromInfo(options.config, env, label);
    if (resolved) stopAt = resolved.stopAt;
  }
  if (!stopAt) {
    // Label-encoded fallback so we never fall back to wall-clock without a stop.
    const fromLabel = parseBackupStopForLabel(JSON.stringify([]), label);
    if (fromLabel) stopAt = fromLabel.stopAt;
  }
  if (!stopAt) {
    return {
      ok: false,
      hook: 'base_backup',
      skipped: false,
      baseline: null,
      contentKey: null,
      lookupKey: null,
      bucketName: options.config.bucketName,
      uploaded: false,
      verified: false,
      errors: [
        'backup stop metadata unavailable — refuse recovery baseline without recoverable coverage proof',
      ],
    };
  }

  let coverage = options.coverageProvenThroughCapture === true;
  const asOf = options.asOfDerivedAtStop === true;
  if (!coverage && !asOf) {
    if (Date.parse(stopAt) >= Date.parse(payloadCapturedAt)) {
      // Coordinated base-backup: stop covers pre-capture, or label stop >= capture.
      coverage = true;
    } else {
      // Post-backup live capture after stop — Pattern A cover required.
      const cover = ensureBaseBackupCoverageThroughCapture({
        cfg: options.config,
        env,
        captureAt: payloadCapturedAt,
      });
      if (cover.ok && cover.backupStopAt && cover.pgbackrestBackupLabel) {
        coverage = true;
        stopAt = cover.backupStopAt;
        // Prefer cover label when it advanced.
        if (cover.pgbackrestBackupLabel.length >= 8) {
          // keep label from cover for binding
          const coverLabel = cover.pgbackrestBackupLabel;
          const bound = resolveRecoverableBaselineBinding({
            payloadCapturedAt,
            backupStopAt: stopAt,
            pgbackrestBackupLabel: coverLabel,
            coverageProvenThroughCapture: true,
          });
          if (!bound.ok) {
            return {
              ok: false,
              hook: 'base_backup',
              skipped: false,
              baseline: null,
              contentKey: null,
              lookupKey: null,
              bucketName: options.config.bucketName,
              uploaded: false,
              verified: false,
              errors: bound.errors,
            };
          }
          const result = captureAndUploadRecoveryBaseline({
            config: options.config,
            env,
            pgbackrestBackupLabel: bound.pgbackrest_backup_label,
            resticSnapshotId: restic,
            stanza: options.config.stanza,
            databaseUrl: options.databaseUrl,
            blobRoot: options.blobRoot,
            targetTimestamp: bound.target_timestamp,
            payloadCapturedAt,
            backupStopAt: stopAt,
            coverageProvenThroughCapture: true,
            rowCounts: options.rowCounts,
            ledgerSha256: options.ledgerSha256,
            ledgerPerTableSha256: options.ledgerPerTableSha256,
            blobManifestSha256: options.blobManifestSha256,
            targetLsn: options.targetLsn,
          });
          return { ...result, hook: 'base_backup', skipped: false };
        }
      } else {
        return {
          ok: false,
          hook: 'base_backup',
          skipped: false,
          baseline: null,
          contentKey: null,
          lookupKey: null,
          bucketName: options.config.bucketName,
          uploaded: false,
          verified: false,
          errors: cover.errors ?? [
            'refuse temporal relabel / unproven coverage after base backup stop',
          ],
        };
      }
    }
  }

  const bound = resolveRecoverableBaselineBinding({
    payloadCapturedAt,
    backupStopAt: stopAt,
    pgbackrestBackupLabel: label,
    coverageProvenThroughCapture: coverage,
    asOfDerivedAtStop: asOf,
  });
  if (!bound.ok) {
    return {
      ok: false,
      hook: 'base_backup',
      skipped: false,
      baseline: null,
      contentKey: null,
      lookupKey: null,
      bucketName: options.config.bucketName,
      uploaded: false,
      verified: false,
      errors: bound.errors,
    };
  }

  const result = captureAndUploadRecoveryBaseline({
    config: options.config,
    env,
    pgbackrestBackupLabel: bound.pgbackrest_backup_label,
    resticSnapshotId: restic,
    stanza: options.config.stanza,
    databaseUrl: options.databaseUrl,
    blobRoot: options.blobRoot,
    targetTimestamp: bound.target_timestamp,
    payloadCapturedAt,
    backupStopAt: stopAt,
    coverageProvenThroughCapture: bound.mode === 'capture_then_cover',
    asOfDerivedAtStop: bound.mode === 'as_of',
    rowCounts: options.rowCounts,
    ledgerSha256: options.ledgerSha256,
    ledgerPerTableSha256: options.ledgerPerTableSha256,
    blobManifestSha256: options.blobManifestSha256,
    targetLsn: options.targetLsn,
  });
  return { ...result, hook: 'base_backup', skipped: false };
}

/**
 * Hook from restic-mirror.ts after parity-confirmed snapshot.
 * Binds restic snapshot id + latest pgBackRest label into an immutable R2 baseline.
 * GATE-FIX-QA3: joint-truth binding; fail closed on temporal relabel.
 */
export async function bindResticSnapshotToRecoveryBaseline(options: {
  config: BackupConfig;
  resticSnapshotId: string;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
  blobRoot: string;
  pgbackrestBackupLabel?: string | null;
  skipUpload?: boolean;
  payloadCapturedAt?: string;
  backupStopAt?: string;
  coverageProvenThroughCapture?: boolean;
  asOfDerivedAtStop?: boolean;
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

  let label =
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

  // Pattern A: capture epoch at restic bind time; require stop coverage.
  const payloadCapturedAt = options.payloadCapturedAt?.trim() || new Date().toISOString();
  let stopAt = options.backupStopAt?.trim() || '';
  if (!stopAt) {
    const resolved = resolvePgbackrestStopFromInfo(options.config, env, label);
    if (resolved) stopAt = resolved.stopAt;
  }
  if (!stopAt) {
    const fromLabel = parseBackupStopForLabel(JSON.stringify([]), label);
    if (fromLabel) stopAt = fromLabel.stopAt;
  }
  if (!stopAt) {
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
      errors: [
        'backup stop metadata unavailable — refuse restic-bound baseline without coverage proof',
      ],
    };
  }

  let coverage = options.coverageProvenThroughCapture === true;
  const asOf = options.asOfDerivedAtStop === true;
  if (!coverage && !asOf) {
    if (Date.parse(stopAt) >= Date.parse(payloadCapturedAt)) {
      coverage = true;
    } else {
      const cover = ensureBaseBackupCoverageThroughCapture({
        cfg: options.config,
        env,
        captureAt: payloadCapturedAt,
      });
      if (cover.ok && cover.backupStopAt && cover.pgbackrestBackupLabel) {
        coverage = true;
        stopAt = cover.backupStopAt;
        label = cover.pgbackrestBackupLabel;
      } else {
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
          errors: cover.errors ?? [
            'refuse temporal relabel / unproven coverage for restic-bound baseline',
          ],
        };
      }
    }
  }

  const bound = resolveRecoverableBaselineBinding({
    payloadCapturedAt,
    backupStopAt: stopAt,
    pgbackrestBackupLabel: label,
    coverageProvenThroughCapture: coverage,
    asOfDerivedAtStop: asOf,
  });
  if (!bound.ok) {
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
      errors: bound.errors,
    };
  }

  const result = captureAndUploadRecoveryBaseline({
    config: options.config,
    env,
    pgbackrestBackupLabel: bound.pgbackrest_backup_label,
    resticSnapshotId: restic,
    stanza: options.config.stanza,
    databaseUrl: options.databaseUrl,
    blobRoot: options.blobRoot,
    targetTimestamp: bound.target_timestamp,
    payloadCapturedAt,
    backupStopAt: stopAt,
    coverageProvenThroughCapture: bound.mode === 'capture_then_cover',
    asOfDerivedAtStop: bound.mode === 'as_of',
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
  const objectPrefix = recoveryBaselineObjectPrefix(cfg, env);
  const listed = listRepoPrefix({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    endpoint: cfg.endpoint,
    bucketName: cfg.bucketName,
    prefix: objectPrefix,
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
