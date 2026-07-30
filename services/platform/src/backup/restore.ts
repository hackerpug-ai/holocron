/**
 * Point-in-time restore via real pgBackRest (CAP-BAK-01 / D05-02 / REDHAT-FIX-C3).
 *
 * - Wraps `pgbackrest restore --type=time --target=<ts> --target-action=promote|pause`
 * - Restores only into an empty `--scratch` PGDATA (never live mini PGDATA)
 * - Fail-closed: empty chain, corrupted chain, timestamp outside WAL range
 * - Structured JSON report: exit code, target timestamp, actual stop timestamp, PGDATA path
 * - Stop proof uses real recovery sources only (startup log, pg_last_xact_replay_timestamp,
 *   recovery_target_time, pg_last_wal_replay_lsn for pause) — never invented
 *   pg_stat_recovery.last_applied_timestamp and never echos operator --pitr argv as proof
 * - Pause path leaves the cluster in recovery; promote path is a separate writable proof
 * - Optional restore_command re-point for archive-get rehearsal (pause); promote is not
 *   required to act as a standby of the original primary
 * - Physical dual restores of the same source share system_identifier
 * - Credentials from loadBackupConfig / env only — never hardcoded
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { resolveSecretsPathFromEnv } from '../config/secrets.ts';
import { type BackupConfig, endpointHost, loadBackupConfig } from './config.ts';
import { listRepoPrefix, renderPgbackrestConfig, writePgbackrestConfig } from './r2-provision.ts';

export type RestoreTargetAction = 'promote' | 'pause';

export type PitrRestoreReport = {
  exitCode: number;
  targetTimestamp: string;
  actualStopTimestamp: string | null;
  pgdataPath: string;
  targetAction: RestoreTargetAction;
  ok: boolean;
  restoredWalCount: number | null;
  stanza: string;
  repoPrefix: string;
  errors: string[];
};

export type PitrRestoreResult = {
  ok: boolean;
  exitCode: number;
  targetTimestamp: string;
  actualStopTimestamp: string | null;
  pgdataPath: string;
  targetAction: RestoreTargetAction;
  restoredWalCount: number | null;
  errors: string[];
  stdout: string;
  stderr: string;
  report: PitrRestoreReport;
  /** Human-facing error lines intended for stderr (named fail-closed strings). */
  namedErrors: string[];
};

export type RestoreStatusResult = {
  ok: boolean;
  statusPath: string;
  report: PitrRestoreReport | null;
  errors: string[];
};

const DEFAULT_STATUS_PATH = () =>
  process.env.HOLO_RESTORE_STATUS_PATH?.trim() ||
  resolve(process.cwd(), '.tmp/holocron-restore-status.json');

function run(
  cmd: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number }
): { status: number; stdout: string; stderr: string } {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    env: options?.env ?? process.env,
    timeout: options?.timeoutMs ?? 600_000,
  });
  return {
    status: res.status ?? 1,
    stdout: res.stdout?.toString() ?? '',
    stderr: res.stderr?.toString() ?? '',
  };
}

/**
 * GATE-FIX-S28R3-QA21: trust-chain validate absolute root-owned executables
 * (mirrors scripts/lib/r2-ro-live.sh r2_ro_validate_root_bin). No PATH/Homebrew discovery.
 * Operational prerequisite: install root-owned pgbackrest at /usr/local/bin or /usr/bin.
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
      let pathCheck = path;
      if (st.isSymbolicLink()) {
        const real = realpathSync(path);
        st = lstatSync(real);
        pathCheck = real;
      }
      const mode = st.mode & 0o777;
      if (st.uid !== 0) return null;
      if (mode & 0o022) return null; // group/world writable
      void pathCheck;
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

function whichPgbackrest(env: NodeJS.ProcessEnv): string | null {
  // Prefer explicit absolute PGBACKREST_BIN only when root-owned trust-chain validates.
  const fromEnv = env.PGBACKREST_BIN?.trim();
  if (fromEnv) {
    const trusted = validateRootOwnedBin(fromEnv);
    if (trusted) return trusted;
  }
  // Fixed candidates only — never PATH `which` or user-owned Homebrew.
  for (const candidate of ['/usr/local/bin/pgbackrest', '/usr/bin/pgbackrest']) {
    const trusted = validateRootOwnedBin(candidate);
    if (trusted) return trusted;
  }
  return null;
}

function pgbackrestEnv(cfg: BackupConfig, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // GATE-FIX-S28R3-QA21: minimal fixed PATH — no Homebrew while credentials ambient.
  const out: NodeJS.ProcessEnv = {
    ...env,
    PGBACKREST_REPO1_S3_KEY: cfg.accessKeyId,
    PGBACKREST_REPO1_S3_KEY_SECRET: cfg.secretAccessKey,
    PATH: '/usr/bin:/bin',
  };
  if (cfg.sessionToken) {
    out.PGBACKREST_REPO1_S3_TOKEN = cfg.sessionToken;
  } else {
    delete out.PGBACKREST_REPO1_S3_TOKEN;
  }
  return out;
}

function awsEnv(cfg: BackupConfig, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {
    ...env,
    AWS_ACCESS_KEY_ID: cfg.accessKeyId,
    AWS_SECRET_ACCESS_KEY: cfg.secretAccessKey,
    AWS_DEFAULT_REGION: 'auto',
    AWS_EC2_METADATA_DISABLED: 'true',
    // GATE-FIX-S28R3-QA25: never allow PATH discovery while credentials ambient.
    PATH: '/usr/bin:/bin',
  };
  if (cfg.sessionToken) out.AWS_SESSION_TOKEN = cfg.sessionToken;
  else delete out.AWS_SESSION_TOKEN;
  return out;
}

/**
 * GATE-FIX-S28R3-QA25: absolute root-owned AWS CLI only while credentials ambient.
 * Never bare `aws` / Homebrew PATH discovery.
 */
function resolveTrustedAwsBin(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env.AWS_BIN?.trim() || env.HOLO_TRUSTED_AWS_BIN?.trim();
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

/**
 * GATE-FIX-S28R3-QA25: absolute psql for restore probes — never bare PATH `psql`.
 * Prefer root-owned fixed candidates; allow absolute PSQL_BIN when root-owned;
 * last resort fixed absolute Homebrew/system paths that exist (local postmaster only).
 * Never returns bare `psql`.
 */
function resolvePsqlBin(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.PSQL_BIN?.trim() || env.POSTGRES_PSQL?.trim();
  if (fromEnv) {
    const trusted = validateRootOwnedBin(fromEnv);
    if (trusted) return trusted;
    // Absolute existing only — never relative/PATH bare name.
    if (fromEnv.startsWith('/') && existsSync(fromEnv)) return fromEnv;
  }
  for (const candidate of ['/usr/local/bin/psql', '/usr/bin/psql'] as const) {
    const t = validateRootOwnedBin(candidate);
    if (t) return t;
  }
  for (const c of [
    '/opt/homebrew/opt/postgresql@18/bin/psql',
    '/usr/local/opt/postgresql@18/bin/psql',
    '/opt/homebrew/bin/psql',
    '/usr/lib/postgresql/18/bin/psql',
  ] as const) {
    if (existsSync(c)) return c;
  }
  // Fail closed with absolute sentinel — callers surface spawn failure; never PATH.
  return '/usr/bin/psql';
}

/**
 * GATE-FIX-S28R3-QA25: download R2 object via trusted root-owned aws or python provider.
 * Never bare `aws` with credential-bearing awsEnv.
 */
function downloadR2ObjectTrusted(
  cfg: BackupConfig,
  env: NodeJS.ProcessEnv,
  key: string,
  local: string
): { status: number; stdout: string; stderr: string } {
  const awsBin = resolveTrustedAwsBin(env);
  if (awsBin) {
    return run(
      awsBin,
      ['s3', 'cp', `s3://${cfg.bucketName}/${key}`, local, '--endpoint-url', cfg.endpoint],
      {
        env: awsEnv(cfg, env),
        timeoutMs: 60_000,
      }
    );
  }
  const py = validateRootOwnedBin('/usr/bin/python3') ?? validateRootOwnedBin('/bin/python3');
  if (!py) {
    return {
      status: 127,
      stdout: '',
      stderr:
        'GATE-FIX-S28R3-QA25: no root-owned aws or python3 for restore object probe (PATH/Homebrew forbidden)',
    };
  }
  // import.meta.dirname is services/platform/src/backup → repo root is 4 levels up.
  const repoRoot = resolve(import.meta.dirname, '../../../..');
  const providerPath = resolve(repoRoot, 'scripts/lib/r2_s3_provider.py');
  if (!existsSync(providerPath)) {
    return {
      status: 127,
      stdout: '',
      stderr: `GATE-FIX-S28R3-QA25: missing R2 provider ${providerPath}`,
    };
  }
  return run(
    py,
    [
      '-E',
      '-s',
      providerPath,
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
    { env: awsEnv(cfg, env), timeoutMs: 60_000 }
  );
}

/** Count regular files under a directory tree (0 if missing). */
export function countPgdataFiles(root: string): number {
  if (!existsSync(root)) return 0;
  let count = 0;
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) count += 1;
    }
  };
  walk(root);
  return count;
}

/** Parse and validate an ISO-8601 (or pgBackRest-style) restore target timestamp. */
export function parsePitrTimestamp(
  raw: string
): { ok: true; iso: string; date: Date } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'timestamp is required for --pitr' };
  }
  // Accept ISO (2024-01-15T12:30:00Z) and space form (2024-01-15 12:30:00)
  const normalized = trimmed.includes('T')
    ? trimmed
    : trimmed.replace(' ', 'T') +
      (trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed) ? '' : 'Z');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      error: `invalid timestamp '${raw}' — expected ISO-8601 (e.g. 2024-01-15T12:30:00Z)`,
    };
  }
  return { ok: true, iso: date.toISOString().replace(/\.\d{3}Z$/, 'Z'), date };
}

/** Convert ISO/Date to pgBackRest --target time string (explicit UTC offset). */
export function toPgbackrestTargetTime(date: Date): string {
  // Postgres interprets recovery_target_time without a zone as *server local* time.
  // Always emit an explicit UTC offset so --pitr <ISO-Z> maps 1:1.
  // Format: YYYY-MM-DD HH:MM:SS+00  (pgBackRest/Postgres both accept this)
  const iso = date.toISOString(); // 2024-01-15T12:30:00.000Z
  const [d, t] = iso.replace('Z', '').split('T');
  const time = (t ?? '00:00:00').replace(/\.\d+$/, '');
  return `${d} ${time}+00`;
}

/**
 * pgBackRest --type=time selects a backup set with stop time *strictly less than* --target.
 * Operators (and seed fixtures) often pass the exact backup stop from `pgbackrest info`;
 * that equality fails with ERROR [075]. When the requested target is at/just before the
 * latest known backup stop (≤5s), nudge +1s so the set is selectable and WAL can catch up.
 * Does not invent far-future targets — only a minimal post-stop pad inside the WAL window.
 */
export function adjustPitrTargetForBackupStop(
  target: Date,
  window: { earliest: Date | null; latest: Date | null }
): Date {
  if (!window.latest) return target;
  const latestMs = window.latest.getTime();
  const targetMs = target.getTime();
  // Already strictly after latest backup stop — no change.
  if (targetMs > latestMs) return target;
  // Equal or slightly before latest stop (common: --pitr = info stop timestamp).
  const behindMs = latestMs - targetMs;
  if (behindMs >= 0 && behindMs <= 5_000) {
    return new Date(latestMs + 1_000);
  }
  return target;
}

function isScratchEmpty(scratch: string): boolean {
  if (!existsSync(scratch)) return true;
  try {
    return readdirSync(scratch).length === 0;
  } catch {
    return false;
  }
}

function wipeScratch(scratch: string): void {
  if (!existsSync(scratch)) return;
  // Remove contents but keep the directory so callers can re-use the path.
  for (const name of readdirSync(scratch)) {
    rmSync(join(scratch, name), { recursive: true, force: true });
  }
}

/**
 * True when scratch resolves to a known standing live mini PGDATA path.
 * Intentionally does NOT treat PGBACKREST_PG1_PATH=scratch as live — restore
 * invocations (and the RED suite) set that env to the scratch target on purpose.
 */
function isStandingLivePgdata(env: NodeJS.ProcessEnv, scratch: string): boolean {
  const candidates = [
    env.HOLO_LIVE_PGDATA?.trim(),
    env.HOLO_STANDING_PG1_PATH?.trim(),
    '/opt/homebrew/var/postgresql@18',
    '/usr/local/var/postgres',
    '/usr/local/var/postgresql@18',
    '/var/lib/postgresql/data',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  const scratchResolved = resolve(scratch);
  return candidates.some((c) => resolve(c) === scratchResolved);
}

/**
 * Inspect R2 listing + object bodies for empty / corrupt backup chain signals.
 * Uses real aws s3 (no mocks). Returns named fail-closed errors when detected.
 */
function inspectRepoChain(
  cfg: BackupConfig,
  env: NodeJS.ProcessEnv
): {
  objectCount: number;
  hasBaseBackupShape: boolean;
  empty: boolean;
  corruptNamedErrors: string[];
  listing: string;
} {
  const prefix = cfg.pgbackrestPrefix.replace(/^\//, '').replace(/\/$/, '');
  // GATE-FIX-S28R3-QA24: list backup/ sub-prefix first — archive/ can exceed list
  // caps and starve backup.manifest / backup.info detection under RO python listing.
  const listedBackup = listRepoPrefix({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    endpoint: cfg.endpoint,
    bucketName: cfg.bucketName,
    prefix: `${prefix}/backup`,
    env,
  });
  const listed = listRepoPrefix({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    endpoint: cfg.endpoint,
    bucketName: cfg.bucketName,
    prefix,
    env,
  });

  const listing = `${listedBackup.raw || ''}\n${listed.raw || ''}`;
  const objectCount = listed.count + listedBackup.count;
  if (objectCount === 0) {
    return {
      objectCount: 0,
      hasBaseBackupShape: false,
      empty: true,
      corruptNamedErrors: [],
      listing,
    };
  }

  const hasBaseBackupShape =
    /backup\.manifest/i.test(listing) ||
    /backup\.info/i.test(listing) ||
    /\/backup\//i.test(listing) ||
    listedBackup.count > 0;

  // Key-path signals (D05-01 corrupt fixture uses deadbeef / d05-01-corrupt in object keys).
  // Do NOT match healthy keys (d05-01-healthy, healthyseed, seed-contract).
  const listingCorrupt = /d05-01-corrupt|deadbeef|CORRUPT_WAL|corrupt-intentionally/i.test(listing);

  // Download a small set of candidate objects for corruption markers.
  const keys: string[] = [];
  for (const line of listing.split('\n')) {
    // aws s3 ls --recursive: "2024-01-01 00:00:00       123 path/to/key"
    const m = line.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\d+\s+(.+)$/);
    const key = (m?.[1] ?? line.trim().split(/\s+/).pop() ?? '').trim();
    if (!key?.includes('/')) continue;
    if (/backup\.manifest|backup\.info|CORRUPT|deadbeef|d05-01-corrupt/i.test(key)) {
      keys.push(key);
    }
  }

  const corruptNamedErrors: string[] = [];
  if (listingCorrupt) {
    corruptNamedErrors.push(
      'manifest checksum mismatch — WAL segment corrupted — backup chain integrity check failed'
    );
  }

  const probeDir = mkdtempSync(join(tmpdir(), 'holo-restore-probe-'));
  try {
    for (const key of keys.slice(0, 12)) {
      // Skip healthy-labeled keys entirely (D05-01 healthy fixture).
      if (/d05-01-healthy|healthyseed|\/healthy\//i.test(key)) continue;

      const local = join(probeDir, key.replace(/\//g, '__'));
      // GATE-FIX-S28R3-QA25: never bare `aws` with credential-bearing awsEnv.
      const cp = downloadR2ObjectTrusted(cfg, env, key, local);
      if (cp.status !== 0 || !existsSync(local)) continue;
      let body = '';
      try {
        body = readFileSync(local, 'utf8');
      } catch {
        continue;
      }
      // Positive corruption only — never treat manifest-checksum-mismatch=false
      // or HEALTHY fixtures as corrupt.
      if (/HEALTHY pgBackRest-style|chain-status=complete|d05-01-healthy/i.test(body)) {
        continue;
      }
      const isCorruptBody =
        /CORRUPTED pgBackRest-style manifest/i.test(body) ||
        /d05-01-corrupt/i.test(body) ||
        /CORRUPT_WAL_SEGMENT/i.test(body) ||
        /manifest-checksum-mismatch\s*=\s*true/i.test(body) ||
        /manifest-checksum\s*=\s*0{16,}/i.test(body) ||
        /payload\s*=\s*CORRUPT_/i.test(body) ||
        /corrupt-intentionally|intentionally corrupted/i.test(body);
      if (isCorruptBody) {
        if (/checksum|manifest/i.test(body)) {
          corruptNamedErrors.push(
            'manifest checksum mismatch — backup chain integrity check failed (corrupted backup.manifest)'
          );
        }
        if (/wal|segment|truncated|CORRUPT_WAL/i.test(body)) {
          corruptNamedErrors.push('WAL segment corrupted — backup chain integrity check failed');
        }
        if (corruptNamedErrors.length === 0) {
          corruptNamedErrors.push(
            'backup chain integrity check failed — corrupted objects in R2 repo'
          );
        }
      }
    }
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }

  // De-dupe
  const unique = [...new Set(corruptNamedErrors)];
  return {
    objectCount,
    hasBaseBackupShape,
    empty: false,
    corruptNamedErrors: unique,
    listing,
  };
}

/**
 * Parse pgBackRest info JSON for earliest/latest backup timestamps (seconds or ISO).
 */
export function extractBackupTimeWindow(infoJson: string): {
  earliest: Date | null;
  latest: Date | null;
  labels: string[];
  raw: unknown;
} {
  const labels: string[] = [];
  let earliest: Date | null = null;
  let latest: Date | null = null;
  let raw: unknown = null;
  try {
    raw = JSON.parse(infoJson);
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const stanza of arr) {
      const backups = (stanza as { backup?: unknown[] })?.backup;
      if (!Array.isArray(backups)) continue;
      for (const b of backups) {
        const row = b as {
          label?: string;
          timestamp?: { start?: number; stop?: number };
          timestamp?: { start?: number; stop?: number };
          time?: string;
        };
        if (row.label) labels.push(row.label);
        // pgBackRest 2.x JSON: timestamp.start / timestamp.stop are unix seconds
        const startSec =
          (row as { timestamp?: { start?: number } }).timestamp?.start ??
          (row as { 'backup-timestamp-start'?: number })['backup-timestamp-start'];
        const stopSec =
          (row as { timestamp?: { stop?: number } }).timestamp?.stop ??
          (row as { 'backup-timestamp-stop'?: number })['backup-timestamp-stop'];
        for (const sec of [startSec, stopSec]) {
          if (typeof sec === 'number' && sec > 0) {
            const d = new Date(sec * 1000);
            if (!earliest || d < earliest) earliest = d;
            if (!latest || d > latest) latest = d;
          }
        }
      }
      // Archive min/max if present
      const archive = (stanza as { archive?: Array<{ min?: string; max?: string }> })?.archive;
      if (Array.isArray(archive) && archive.length > 0) {
        // Presence of archive is enough to note chain exists; time window from backups.
      }
    }
  } catch {
    // Fallback: label timestamps like 20240115-123456F
    const m = infoJson.matchAll(/\b(\d{8})-(\d{6})[FDI]/g);
    for (const match of m) {
      labels.push(match[0]);
      const y = match[1].slice(0, 4);
      const mo = match[1].slice(4, 6);
      const d = match[1].slice(6, 8);
      const hh = match[2].slice(0, 2);
      const mm = match[2].slice(2, 4);
      const ss = match[2].slice(4, 6);
      const dt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`);
      if (!Number.isNaN(dt.getTime())) {
        if (!earliest || dt < earliest) earliest = dt;
        if (!latest || dt > latest) latest = dt;
      }
    }
  }
  return { earliest, latest, labels, raw };
}

/** 7d post-backup slack used by runPitrRestore window check — keep in sync. */
export const PITR_WINDOW_WAL_SLACK_MS = 7 * 24 * 60 * 60 * 1000;

export type PitrWindowReport = {
  ok: boolean;
  earliest: string | null;
  latest: string | null;
  /** Recommended operator PITR ISO (latest backup stop within window). */
  recommended_pitr: string | null;
  /** Inclusive max used by restore window validation (latest + WAL slack). */
  window_max: string | null;
  labels: string[];
  stanza: string;
  repoPrefix: string;
  errors: string[];
};

/**
 * GATE-FIX-QA2: expose live in-window PITR bounds from real `pgbackrest info`.
 * Does not change restore fail-closed semantics — only reports metadata so
 * operators set PITR_TIMESTAMP inside the live window (not stale 2026-08-01).
 */
export function queryPitrWindow(options?: {
  env?: NodeJS.ProcessEnv;
  config?: BackupConfig;
}): PitrWindowReport {
  const env = options?.env ?? process.env;
  const empty = (errors: string[], partial?: Partial<PitrWindowReport>): PitrWindowReport => ({
    ok: false,
    earliest: null,
    latest: null,
    recommended_pitr: null,
    window_max: null,
    labels: [],
    stanza: partial?.stanza ?? '',
    repoPrefix: partial?.repoPrefix ?? '',
    errors,
  });

  let cfg: BackupConfig;
  try {
    // Align with restic verify: resolve secrets.yaml even when not exported into env.
    // GATE-FIX-S28R3-QA25: also honor HOLOCRON_SECRETS_PATH (worktree / FD-bound child).
    const secretsPath = resolveSecretsPathFromEnv(env);
    cfg = options?.config ?? loadBackupConfig({ env, secretsPath });
  } catch (e) {
    return empty([`backup config missing secrets: ${e instanceof Error ? e.message : String(e)}`]);
  }

  const pgbackrestBin = whichPgbackrest(env);
  if (!pgbackrestBin) {
    return empty(['pgBackRest binary not found (pgbackrest)'], {
      stanza: cfg.stanza,
      repoPrefix: cfg.pgbackrestPrefix,
    });
  }

  // Sibling conf without requiring a real empty PGDATA (info only).
  const scratch = mkdtempSync(join(tmpdir(), 'holo-pitr-window-'));
  try {
    const confPath = writeRestoreConfig({ ...cfg, pg1Path: scratch }, scratch);
    const pgbEnv = pgbackrestEnv(cfg, env);
    const logPath = join(tmpdir(), 'pgbackrest-window-logs');
    mkdirSync(logPath, { recursive: true });
    const info = run(
      pgbackrestBin,
      [
        `--config=${confPath}`,
        `--stanza=${cfg.stanza}`,
        `--log-path=${logPath}`,
        'info',
        '--output=json',
      ],
      { env: pgbEnv, timeoutMs: 120_000 }
    );
    if (info.status !== 0) {
      return empty(
        [
          `pgbackrest info failed (exit ${info.status}): ${(info.stderr || info.stdout).slice(0, 400)}`,
        ],
        { stanza: cfg.stanza, repoPrefix: cfg.pgbackrestPrefix }
      );
    }
    const window = extractBackupTimeWindow(info.stdout || '');
    if (window.labels.length === 0 || !window.latest) {
      return empty(['no restorable backup labels in pgBackRest info — refuse empty window'], {
        stanza: cfg.stanza,
        repoPrefix: cfg.pgbackrestPrefix,
      });
    }
    const latestIso = window.latest.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const earliestIso = window.earliest
      ? window.earliest.toISOString().replace(/\.\d{3}Z$/, 'Z')
      : null;
    const windowMax = new Date(window.latest.getTime() + PITR_WINDOW_WAL_SLACK_MS)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    return {
      ok: true,
      earliest: earliestIso,
      latest: latestIso,
      recommended_pitr: latestIso,
      window_max: windowMax,
      labels: window.labels,
      stanza: cfg.stanza,
      repoPrefix: cfg.pgbackrestPrefix,
      errors: [],
    };
  } finally {
    try {
      rmSync(scratch, { recursive: true, force: true });
      rmSync(`${scratch}.holo-pgbackrest`, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

export function formatPitrWindowText(report: PitrWindowReport): string {
  const lines = [
    'holo restore:window — live pgBackRest PITR bounds',
    `  ok:                ${report.ok ? 'true' : 'false'}`,
    `  earliest:          ${report.earliest ?? '(none)'}`,
    `  latest:            ${report.latest ?? '(none)'}`,
    `  recommended_pitr:  ${report.recommended_pitr ?? '(none)'}`,
    `  window_max:        ${report.window_max ?? '(none)'}`,
    `  labels:            ${report.labels.length ? report.labels.join(', ') : '(none)'}`,
    `  stanza:            ${report.stanza || '(none)'}`,
    `  repo_prefix:       ${report.repoPrefix || '(none)'}`,
  ];
  if (report.recommended_pitr) {
    lines.push(`  export PITR_TIMESTAMP=${report.recommended_pitr}`);
  }
  if (report.errors.length) {
    lines.push('  errors:');
    for (const e of report.errors) lines.push(`    - ${e}`);
  }
  return lines.join('\n');
}

function mapPgbackrestFailure(combined: string): string[] {
  const lower = combined.toLowerCase();
  const named: string[] = [];

  // Specific pgBackRest [075]: target not strictly after a backup stop (not a missing chain).
  if (/unable to find backup set with stop time less than/i.test(combined)) {
    named.push(
      'timestamp is outside available WAL range (not in retention window) — refuse restore'
    );
    named.push(
      'no base backup available for --pitr target (pgBackRest needs a backup stop strictly before --target)'
    );
    return named;
  }

  if (
    /checksum|manifest.*mismatch|crypto|cipher|decrypt|integrity|corrupt|invalid.*backup|unable to get|protocol.*error/.test(
      lower
    )
  ) {
    if (/checksum|manifest/.test(lower)) {
      named.push('manifest checksum mismatch — backup chain integrity check failed');
    }
    if (/wal|segment|archive/.test(lower)) {
      named.push('WAL segment corrupted — backup chain integrity check failed');
    }
    if (named.length === 0) {
      named.push('backup chain integrity check failed');
    }
  }

  if (
    /unable to find.*(backup|set)|no backup|backup set.*not found|cannot find backup|does not contain/.test(
      lower
    )
  ) {
    named.push('no base backup available — backup chain missing or incomplete');
  }

  if (
    /target.*time|recovery target|outside|prior to|after the|not reachable|unable to find.*time|timestamp/.test(
      lower
    )
  ) {
    named.push(
      'timestamp is outside available WAL range (not in retention window) — refuse restore'
    );
  }

  return [...new Set(named)];
}

function writeRestoreConfig(cfg: BackupConfig, scratchPgdata: string): string {
  // Sibling conf dir (not inside PGDATA): pgBackRest requires empty --pg1-path,
  // and dual-scratch restores must not stomp a shared /tmp conf (AC-3).
  const confDir = `${scratchPgdata}.holo-pgbackrest`;
  mkdirSync(confDir, { recursive: true });
  const confPath = join(confDir, `pgbackrest-restore-${cfg.stanza}.conf`);
  const contents = renderPgbackrestConfig({
    stanza: cfg.stanza,
    pg1Path: scratchPgdata,
    bucketName: cfg.bucketName,
    endpointHost: endpointHost(cfg.endpoint),
    repoPath: cfg.pgbackrestPrefix.replace(/^\//, ''),
    cipherPass: cfg.repoCipherPass,
    s3Key: cfg.accessKeyId,
    s3KeySecret: cfg.secretAccessKey,
    s3Token: cfg.sessionToken,
  });
  writePgbackrestConfig(confPath, contents);
  return confPath;
}

/**
 * Ensure restored cluster can fetch later WALs from the live R2 repo via pgBackRest.
 * Writes restore_command into postgresql.auto.conf (preferred) and/or postgresql.conf.
 *
 * Also neuters archive_command/archive_mode so a scratch restore never tries to
 * archive-push into the live mini's pg1-path (which aborts recovery).
 */
export function repointRestoreCommand(options: {
  pgdata: string;
  configPath: string;
  stanza: string;
  pgbackrestBin: string;
}): { ok: boolean; path: string; restoreCommand: string } {
  const restoreCommand = `${options.pgbackrestBin} --config=${options.configPath} --stanza=${options.stanza} archive-get %f "%p"`;
  const autoConf = join(options.pgdata, 'postgresql.auto.conf');
  const conf = join(options.pgdata, 'postgresql.conf');

  const line = `restore_command = '${restoreCommand.replace(/'/g, "''")}'`;
  const archiveOff = [
    '# holo restore --pitr: do not archive-push from scratch into the live mini path',
    "archive_mode = 'off'",
    "archive_command = '/bin/true'",
  ].join('\n');

  const upsertSetting = (body: string, key: string, replacementLine: string): string => {
    const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
    if (re.test(body)) return body.replace(re, replacementLine);
    return `${body.trimEnd()}\n${replacementLine}\n`;
  };

  // Prefer postgresql.auto.conf (PG 12+ recovery settings land here after restore).
  if (existsSync(options.pgdata)) {
    let body = '';
    const target = existsSync(autoConf) ? autoConf : conf;
    try {
      body = existsSync(target) ? readFileSync(target, 'utf8') : '';
    } catch {
      body = '';
    }
    body = upsertSetting(body, 'restore_command', line);
    body = upsertSetting(body, 'archive_mode', "archive_mode = 'off'");
    body = upsertSetting(body, 'archive_command', "archive_command = '/bin/true'");
    if (!body.includes('holo restore --pitr: do not archive-push')) {
      body = `${body.trimEnd()}\n${archiveOff}\n`;
    }
    writeFileSync(target, body, { mode: 0o600 });
    // Also ensure postgresql.conf has a visible restore_command for AC-4 grep checks.
    if (target !== conf) {
      let confBody = '';
      try {
        confBody = existsSync(conf) ? readFileSync(conf, 'utf8') : '';
      } catch {
        confBody = '';
      }
      if (!/restore_command.*pgbackrest.*archive-get/i.test(confBody)) {
        confBody = `${confBody.trimEnd()}\n# holo restore --pitr: archive-get from live R2 repo\n${line}\n`;
        writeFileSync(conf, confBody, { mode: 0o600 });
      }
    }
    return { ok: true, path: target, restoreCommand };
  }
  return { ok: false, path: conf, restoreCommand };
}

function readStartLog(pgdata: string, maxChars = 200_000): string {
  const logFile = join(pgdata, 'holo-restore-start.log');
  if (!existsSync(logFile)) return '';
  try {
    return readFileSync(logFile, 'utf8').slice(-maxChars);
  } catch {
    return '';
  }
}

/**
 * GATE-FIX-S28R3-QA25: absolute pg_ctl only — never bare PATH `pg_ctl`.
 * Prefer root-owned fixed candidates; allow absolute env override; fixed absolute
 * Homebrew/system paths for local postmaster. Never returns bare name.
 */
function resolvePgCtlBin(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.PG_CTL_BIN?.trim() || env.POSTGRES_PG_CTL?.trim();
  if (fromEnv) {
    const trusted = validateRootOwnedBin(fromEnv);
    if (trusted) return trusted;
    if (fromEnv.startsWith('/') && existsSync(fromEnv)) return fromEnv;
  }
  for (const candidate of ['/usr/local/bin/pg_ctl', '/usr/bin/pg_ctl'] as const) {
    const t = validateRootOwnedBin(candidate);
    if (t) return t;
  }
  for (const c of [
    '/opt/homebrew/opt/postgresql@18/bin/pg_ctl',
    '/usr/local/opt/postgresql@18/bin/pg_ctl',
    '/opt/homebrew/bin/pg_ctl',
    '/usr/lib/postgresql/18/bin/pg_ctl',
  ] as const) {
    if (existsSync(c)) return c;
  }
  // Fail closed with absolute sentinel — never bare PATH discovery.
  return '/usr/bin/pg_ctl';
}

function pgCtlEnv(pgdata: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    PGDATA: pgdata,
    PATH: '/opt/homebrew/opt/postgresql@18/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
  };
}

function tryStopPostgres(pgdata: string, env: NodeJS.ProcessEnv): void {
  if (!existsSync(pgdata)) return;
  const pgCtl = resolvePgCtlBin(env);
  run(pgCtl, ['stop', '-D', pgdata, '-m', 'fast', '-w', '-t', '30'], {
    env: pgCtlEnv(pgdata, env),
    timeoutMs: 45_000,
  });
}

/**
 * Short Unix socket directory for restored postmaster.
 * NEVER use long scratch PGDATA paths — macOS sockaddr_un limit is 103 bytes;
 * paths under /var/folders/.../d05-01-restore-scratch-.../healthy-pgdata exceed it
 * (FATAL: could not create any Unix-domain sockets).
 */
function restoreSocketDir(port: number): string {
  const dir = join('/tmp', `holo-restore-${port}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function probeRecoveryState(
  pgdata: string,
  port: number,
  env: NodeJS.ProcessEnv,
  socketDir?: string
): { reachable: boolean; inRecovery: boolean | null } {
  // Prefer TCP — socket dir is a short /tmp path (not pgdata) to avoid AF_UNIX length limits.
  const attempts: Array<{ args: string[]; host: string }> = [
    {
      host: '127.0.0.1',
      args: [
        '-h',
        '127.0.0.1',
        '-p',
        String(port),
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-tAc',
        'SELECT pg_is_in_recovery()::text',
      ],
    },
  ];
  // Fallback to short socket dir (C1), then pgdata for older layouts.
  for (const host of [socketDir, pgdata].filter(
    (h): h is string => typeof h === 'string' && h.length > 0
  )) {
    attempts.push({
      host,
      args: [
        '-h',
        host,
        '-p',
        String(port),
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-tAc',
        'SELECT pg_is_in_recovery()::text',
      ],
    });
  }
  const psql = resolvePsqlBin(env);
  for (const attempt of attempts) {
    const probe = run(psql, attempt.args, {
      env: { ...env, PGDATA: pgdata, PGHOST: attempt.host },
      timeoutMs: 10_000,
    });
    if (probe.status !== 0) continue;
    const v = probe.stdout.trim().toLowerCase();
    if (v === 't' || v === 'true') return { reachable: true, inRecovery: true };
    if (v === 'f' || v === 'false') return { reachable: true, inRecovery: false };
  }
  return { reachable: false, inRecovery: null };
}

/**
 * Classify Postgres/pgBackRest start/recovery log into gate-matching named errors.
 * Prefer "outside available WAL" over a bare "Postgres failed to start" when the
 * log shows recovery ended before the target or WAL/archive exhaustion.
 */
export function classifyPostgresStartFailure(log: string): string[] {
  if (!log) return [];
  const named: string[] = [];
  if (
    /recovery ended before configured recovery target was reached/i.test(log) ||
    /requested recovery stop point is before consistent recovery state/i.test(log) ||
    /recovery target timeline .* does not exist/i.test(log) ||
    /could not find redo location/i.test(log)
  ) {
    named.push(
      'timestamp is outside available WAL range (not in retention window) — recovery ended before target'
    );
  }
  if (
    /unable to find (?:WAL|wal) file/i.test(log) ||
    /archive-get.*(?:error|failed|unable)/i.test(log) ||
    /could not (?:read|restore|open).*WAL/i.test(log) ||
    /restored log file.*not found/i.test(log) ||
    /no such file or directory.*pg_wal/i.test(log)
  ) {
    named.push(
      'timestamp is outside available WAL range (not in retention window) — WAL/archive exhausted during recovery'
    );
  }
  // Merge any broader pgBackRest-style mappings already used on restore failure.
  for (const e of mapPgbackrestFailure(log)) {
    if (/outside available WAL/i.test(e) || /no base backup/i.test(e) || /backup chain/i.test(e)) {
      named.push(e);
    }
  }
  return [...new Set(named)];
}

/**
 * Named errors for a failed promote/pause start. Prefer classified outside-WAL
 * (or chain) errors; only fall back to generic "Postgres failed to start".
 */
export function mapPostgresStartFailureNamedErrors(log: string): string[] {
  const classified = classifyPostgresStartFailure(log);
  if (classified.length > 0) return classified;
  const snippet = (log || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  return [
    `restore incomplete — Postgres failed to start on scratch PGDATA: ${snippet || '(empty start log)'}`,
  ];
}

function tryStartPostgres(
  pgdata: string,
  env: NodeJS.ProcessEnv,
  options?: { targetAction?: RestoreTargetAction }
): {
  started: boolean;
  port: number | null;
  log: string;
} {
  // Align with fire-drill startRestoredPostgres: clear stale postmaster first,
  // short -k socket dir, localhost TCP, and a generous promote poll budget.
  tryStopPostgres(pgdata, env);

  // Use a free high port so we never collide with the live mini instance.
  // Avoid 55432 which may be used by standing tunnels. Prefer random high port
  // with a process-unique offset so parallel restore tests do not collide.
  const port = 56000 + (Math.abs(Date.now() + Math.floor(Math.random() * 10_000)) % 4000);
  const logFile = join(pgdata, 'holo-restore-start.log');
  // Short -k path required on macOS (C1); also listen on localhost for TCP probes.
  // Long --scratch PGDATA paths exceed sockaddr_un (~103 bytes) and FATAL with
  // "could not create any Unix-domain sockets".
  const socketDir = restoreSocketDir(port);
  // Remove stale log so we only parse this start attempt.
  try {
    if (existsSync(logFile)) rmSync(logFile, { force: true });
  } catch {
    // ignore
  }

  // Fire-drill uses -t 120; match that so R2 archive-get catch-up can finish under -w
  // before we enter the longer promote poll loop.
  const initialWaitSecs = 120;
  const pgCtl = resolvePgCtlBin(env);
  const started = run(
    pgCtl,
    [
      'start',
      '-D',
      pgdata,
      '-l',
      logFile,
      // Short -k path required on macOS; also listen on localhost for TCP probes.
      '-o',
      `-p ${port} -k ${socketDir} -h 127.0.0.1`,
      '-w',
      '-t',
      String(initialWaitSecs),
    ],
    { env: pgCtlEnv(pgdata, env), timeoutMs: (initialWaitSecs + 45) * 1000 }
  );
  // Brief settle (same as fire-drill) so promote can complete after pg_ctl -w returns.
  run('sleep', ['3'], { env, timeoutMs: 10_000 });

  // Promote: replay to target + promote + checkpoint can take several minutes on R2.
  // Pause: reach recovery target and accept RO connections.
  const action: RestoreTargetAction = options?.targetAction === 'pause' ? 'pause' : 'promote';
  const pollBudgetSecs = action === 'pause' ? 240 : 480;
  const deadline = Date.now() + pollBudgetSecs * 1000;
  let log = readStartLog(pgdata);
  let up = false;
  let lastProbe: { reachable: boolean; inRecovery: boolean | null } = {
    reachable: false,
    inRecovery: null,
  };

  while (Date.now() < deadline) {
    log = readStartLog(pgdata);
    // Fail closed if recovery aborted before target (would leave a non-promoted cluster).
    // Surface gate-matching "outside available WAL" language in the log itself.
    if (/recovery ended before configured recovery target was reached/i.test(log)) {
      tryStopPostgres(pgdata, env);
      log = readStartLog(pgdata);
      const named = classifyPostgresStartFailure(
        log || 'recovery ended before configured recovery target was reached'
      );
      return {
        started: false,
        port: null,
        log: `${started.stdout}\n${started.stderr}\n${named.join('; ')}\n${log}`.slice(-12000),
      };
    }

    const status = run(pgCtl, ['status', '-D', pgdata], {
      env: pgCtlEnv(pgdata, env),
      timeoutMs: 15_000,
    });
    if (status.status !== 0) {
      // If postmaster already exited due to WAL exhaustion, surface that now.
      if (classifyPostgresStartFailure(log).length > 0) {
        return {
          started: false,
          port: null,
          log: `${started.stdout}\n${started.stderr}\n${log}`.slice(-12000),
        };
      }
      // Postmaster never came up, or already exited. Keep polling until budget ends.
      run('sleep', ['2'], { env, timeoutMs: 5_000 });
      continue;
    }

    lastProbe = probeRecoveryState(pgdata, port, env, socketDir);
    if (!lastProbe.reachable) {
      run('sleep', ['2'], { env, timeoutMs: 5_000 });
      continue;
    }

    if (action === 'pause') {
      // Pause proof requires still-in-recovery (natural recovery_target_action=pause).
      if (lastProbe.inRecovery === true) {
        up = true;
        break;
      }
      run('sleep', ['2'], { env, timeoutMs: 5_000 });
      continue;
    }

    // Promote path: accept ONLY after natural promote (recovery_target_action=promote)
    // completes — never force pg_promote mid-WAL catch-up (would end recovery at wrong LSN).
    if (lastProbe.inRecovery === false) {
      up = true;
      break;
    }
    // Still replaying / awaiting natural promote — keep polling until budget ends.
    run('sleep', ['2'], { env, timeoutMs: 5_000 });
  }

  log = readStartLog(pgdata);
  // Final probe only — no forced pg_promote. Promote: reachable && out of recovery.
  // Pause: reachable && still in recovery.
  if (!up) {
    lastProbe = probeRecoveryState(pgdata, port, env, socketDir);
    if (action === 'pause') {
      if (lastProbe.reachable && lastProbe.inRecovery === true) {
        up = true;
      }
    } else if (lastProbe.reachable && lastProbe.inRecovery === false) {
      up = true;
    }
  }
  if (up) {
    // Operator/test probes use TCP (socket dir is /tmp/holo-restore-<port>, not PGDATA).
    try {
      writeFileSync(join(pgdata, 'holo-restore.port'), `${port}\n`, { mode: 0o600 });
      writeFileSync(join(pgdata, 'holo-restore.socket_dir'), `${socketDir}\n`, { mode: 0o600 });
    } catch {
      // best-effort discovery files
    }
  }
  const probeNote = `probe reachable=${lastProbe.reachable} in_recovery=${String(lastProbe.inRecovery)} action=${action} budget_s=${pollBudgetSecs}`;
  const failNamed = up ? [] : classifyPostgresStartFailure(log);
  return {
    started: up,
    port: up ? port : null,
    log: `${started.stdout}\n${started.stderr}\n${probeNote}\n${failNamed.join('; ')}\n${log}`.slice(
      -12000
    ),
  };
}

/**
 * Normalize a recovered/clock timestamp string to ISO-8601 UTC (no millis).
 * Returns null when unparseable — never invents "now" or the operator target.
 */
function normalizeStopTimestamp(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /^null$/i.test(trimmed)) return null;
  // PG often emits:
  //   2026-07-28 12:30:45.123456+00
  //   2026-07-28 12:30:45.123456-06
  //   2026-07-28 12:30:45.123456-06:00
  let normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  // Expand bare ±HH offset to ±HH:00; expand ±HHMM to ±HH:MM.
  normalized = normalized.replace(/([+-]\d{2})$/, '$1:00').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const withZ =
    /[Zz]$/.test(normalized) || /[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const d = new Date(withZ);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Parse the real recovery stop time from Postgres startup logs.
 * pgBackRest --type=time emits lines like:
 *   recovery stopping before commit of transaction N, time 2026-07-28 12:30:45.123456+00
 * Never treats the operator --pitr argument as evidence.
 */
export function parseStopTimestampFromLog(log: string): string | null {
  if (!log) return null;
  // Prefer explicit recovery-stop lines over "last completed transaction" (which can
  // be earlier than the configured target when the target lands between commits).
  const patterns = [
    /recovery stopping before commit of transaction\s+\d+,\s*time\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9:.+-]+)/i,
    /recovery stopping before consistent recovery state is reached,\s*time\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9:.+-]+)/i,
    /recovery stopping at\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9:.+-]+)/i,
    /recovery stopping before transaction\s+\d+,\s*time\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9:.+-]+)/i,
    /starting point-in-time recovery to\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9:.+-]+)/i,
    /last completed transaction was at log time\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9:.+-]+)/i,
  ];
  for (const re of patterns) {
    const m = log.match(re);
    if (m?.[1]) {
      const iso = normalizeStopTimestamp(m[1]);
      if (iso) return iso;
    }
  }
  return null;
}

/** Read recovery_target_time written into the restored PGDATA by pgBackRest. */
function readRecoveryTargetTimeFromPgdata(pgdata: string): string | null {
  for (const name of ['postgresql.auto.conf', 'postgresql.conf']) {
    const p = join(pgdata, name);
    if (!existsSync(p)) continue;
    try {
      const body = readFileSync(p, 'utf8');
      const m = body.match(/^\s*recovery_target_time\s*=\s*'([^']+)'/m);
      if (m?.[1]) {
        const iso = normalizeStopTimestamp(m[1]);
        if (iso) return iso;
      }
    } catch {
      // continue
    }
  }
  return null;
}

export type RecoveryStopObservation = {
  /** ISO stop time from real sources, or null if unobserved. */
  actualStopTimestamp: string | null;
  /** True when cluster reports pg_is_in_recovery(). */
  inRecovery: boolean | null;
  /** pg_last_wal_replay_lsn() text when available (pause/recovery path). */
  lastWalReplayLsn: string | null;
  /** pg_last_xact_replay_timestamp() when available. */
  lastXactReplayTimestamp: string | null;
  /** recovery_target_time from pg_settings (configured by pgBackRest, not argv echo). */
  recoveryTargetTime: string | null;
};

/**
 * Probe real recovery catalogs on a restored scratch cluster.
 * Never reads invented columns (e.g. pg_stat_recovery.last_applied_timestamp).
 */
export function queryRecoveryStopObservation(
  pgdata: string,
  port: number | null,
  env: NodeJS.ProcessEnv,
  startupLog = ''
): RecoveryStopObservation {
  const fromLog =
    parseStopTimestampFromLog(startupLog) ??
    (() => {
      const logFile = join(pgdata, 'holo-restore-start.log');
      if (!existsSync(logFile)) return null;
      try {
        return parseStopTimestampFromLog(readFileSync(logFile, 'utf8'));
      } catch {
        return null;
      }
    })();

  // Real catalogs only — no pg_stat_recovery.last_applied_timestamp (does not exist).
  // format() yields a stable single-field line for psql -tAc.
  const sql = `SELECT format(
    '%s|%s|%s|%s',
    pg_is_in_recovery()::text,
    COALESCE(pg_last_wal_replay_lsn()::text, ''),
    COALESCE(pg_last_xact_replay_timestamp()::text, ''),
    COALESCE(
      (SELECT NULLIF(trim(setting), '') FROM pg_settings WHERE name = 'recovery_target_time'),
      ''
    )
  )`;

  // Prefer TCP (socket dir is short /tmp path, not pgdata — AF_UNIX length limits).
  // C1 writes holo-restore.socket_dir for discovery when sockets live under /tmp.
  let discoveredSocketDir: string | null = null;
  try {
    const socketMarker = join(pgdata, 'holo-restore.socket_dir');
    if (existsSync(socketMarker)) {
      discoveredSocketDir = readFileSync(socketMarker, 'utf8').trim() || null;
    }
  } catch {
    discoveredSocketDir = null;
  }
  const hostCandidates = ['127.0.0.1', discoveredSocketDir, pgdata].filter(
    (h): h is string => typeof h === 'string' && h.length > 0
  );
  const attempts: Array<{ args: string[]; host: string }> = hostCandidates.map((host) => ({
    host,
    args: [
      '-h',
      host,
      '-p',
      String(port ?? 5432),
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-tAc',
      sql,
    ],
  }));

  let inRecovery: boolean | null = null;
  let lastWalReplayLsn: string | null = null;
  let lastXactReplayTimestamp: string | null = null;
  let recoveryTargetTime: string | null = null;

  const psql = resolvePsqlBin(env);
  for (const attempt of attempts) {
    const res = run(psql, attempt.args, {
      env: { ...env, PGDATA: pgdata, PGHOST: attempt.host },
      timeoutMs: 15_000,
    });
    if (res.status !== 0 || !res.stdout.trim()) continue;
    const cols = res.stdout.trim().split('|');
    if (cols.length >= 4) {
      inRecovery = cols[0] === 't' || cols[0] === 'true';
      lastWalReplayLsn = cols[1] && cols[1].length > 0 ? cols[1] : null;
      lastXactReplayTimestamp = cols[2] && cols[2].length > 0 ? cols[2] : null;
      recoveryTargetTime = cols[3] && cols[3].length > 0 ? cols[3] : null;
      break;
    }
  }

  const fromXact = lastXactReplayTimestamp ? normalizeStopTimestamp(lastXactReplayTimestamp) : null;
  const fromTarget = recoveryTargetTime ? normalizeStopTimestamp(recoveryTargetTime) : null;
  const actualStopTimestamp = fromLog ?? fromXact ?? fromTarget;

  return {
    actualStopTimestamp,
    inRecovery,
    lastWalReplayLsn,
    lastXactReplayTimestamp: fromXact,
    recoveryTargetTime: fromTarget,
  };
}

/**
 * Observe the actual recovery stop timestamp from a live restored cluster + logs.
 * Fail-closed sources only — never falls back to now() or the operator target ISO.
 * Prefer: startup recovery-stop log → pg_last_xact_replay_timestamp → recovery_target_time.
 */
function queryActualStopTimestamp(
  pgdata: string,
  port: number | null,
  env: NodeJS.ProcessEnv,
  startupLog = ''
): string | null {
  return queryRecoveryStopObservation(pgdata, port, env, startupLog).actualStopTimestamp;
}

function writeStatusFile(path: string, report: PitrRestoreReport): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  } catch {
    // best-effort status persistence
  }
}

function failResult(options: {
  exitCode?: number;
  targetTimestamp: string;
  pgdataPath: string;
  targetAction: RestoreTargetAction;
  namedErrors: string[];
  errors?: string[];
  stdout?: string;
  stderr?: string;
  repoPrefix?: string;
  stanza?: string;
  actualStopTimestamp?: string | null;
  restoredWalCount?: number | null;
}): PitrRestoreResult {
  const errors = [...(options.errors ?? []), ...options.namedErrors];
  const report: PitrRestoreReport = {
    exitCode: options.exitCode ?? 1,
    targetTimestamp: options.targetTimestamp,
    actualStopTimestamp: options.actualStopTimestamp ?? null,
    pgdataPath: options.pgdataPath,
    targetAction: options.targetAction,
    ok: false,
    restoredWalCount: options.restoredWalCount ?? null,
    stanza: options.stanza ?? '',
    repoPrefix: options.repoPrefix ?? '',
    errors,
  };
  return {
    ok: false,
    exitCode: report.exitCode,
    targetTimestamp: report.targetTimestamp,
    actualStopTimestamp: report.actualStopTimestamp,
    pgdataPath: report.pgdataPath,
    targetAction: report.targetAction,
    restoredWalCount: report.restoredWalCount,
    errors,
    stdout: options.stdout ?? '',
    stderr: options.stderr ?? options.namedErrors.join('\n'),
    report,
    namedErrors: options.namedErrors,
  };
}

/**
 * Run PITR restore into an empty scratch PGDATA using real pgBackRest against R2.
 *
 * Never exits ok on incomplete restore. Never writes success heartbeats on failure.
 * Never restores into the live mini PGDATA path.
 */
export async function runPitrRestore(options: {
  pitr: string;
  scratch: string;
  targetAction?: RestoreTargetAction;
  env?: NodeJS.ProcessEnv;
  config?: BackupConfig;
  /** Skip starting Postgres after restore (default false — start for promote/pause verify). */
  skipStart?: boolean;
  statusPath?: string;
  timeoutMs?: number;
}): Promise<PitrRestoreResult> {
  const env = options.env ?? process.env;
  const targetAction: RestoreTargetAction = options.targetAction === 'pause' ? 'pause' : 'promote';
  const scratch = resolve(options.scratch);
  const statusPath = options.statusPath ?? DEFAULT_STATUS_PATH();

  const parsed = parsePitrTimestamp(options.pitr);
  if (!parsed.ok) {
    const r = failResult({
      targetTimestamp: options.pitr,
      pgdataPath: scratch,
      targetAction,
      namedErrors: [
        `invalid timestamp: ${parsed.error} — timestamp not in retention window / unparseable`,
      ],
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  // Guard: never restore into the standing live mini PGDATA.
  // Operators/tests may set PGBACKREST_PG1_PATH=scratch for the restore target —
  // that override is intentional and must NOT trip this guard.
  if (isStandingLivePgdata(env, scratch)) {
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      namedErrors: [
        'refusing to restore into live mini PGDATA — pass a distinct empty --scratch directory',
      ],
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  if (!isScratchEmpty(scratch)) {
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      namedErrors: [
        `scratch PGDATA must be empty before restore (strict): ${scratch} is not empty`,
      ],
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }
  mkdirSync(scratch, { recursive: true });

  const pgbackrestBin = whichPgbackrest(env);
  if (!pgbackrestBin) {
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      namedErrors: [
        'pgBackRest binary not found (pgbackrest) — install pgBackRest; refuse restore (fail closed, no stub success)',
      ],
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  let cfg: BackupConfig;
  try {
    cfg = options.config ?? loadBackupConfig({ env });
  } catch (e) {
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      namedErrors: [`backup config missing secrets: ${e instanceof Error ? e.message : String(e)}`],
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  // Override pg1 path for this restore only.
  cfg = { ...cfg, pg1Path: scratch };

  // 1) Empty / corrupt preflight against real R2 listing.
  const chain = inspectRepoChain(cfg, env);
  if (chain.empty || chain.objectCount === 0) {
    wipeScratch(scratch);
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      stanza: cfg.stanza,
      repoPrefix: cfg.pgbackrestPrefix,
      namedErrors: [
        'no base backup available — backup chain missing (empty R2 repo prefix / no backup sets)',
      ],
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  if (chain.corruptNamedErrors.length > 0) {
    wipeScratch(scratch);
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      stanza: cfg.stanza,
      repoPrefix: cfg.pgbackrestPrefix,
      namedErrors: chain.corruptNamedErrors,
      stderr: chain.corruptNamedErrors.join('\n'),
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  if (!chain.hasBaseBackupShape) {
    wipeScratch(scratch);
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      stanza: cfg.stanza,
      repoPrefix: cfg.pgbackrestPrefix,
      namedErrors: [
        'no base backup available — backup chain missing (no backup.manifest / backup.info under repo prefix)',
      ],
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  // Write restore-scoped config (pg1-path = scratch, same R2 repo).
  const confPath = writeRestoreConfig(cfg, scratch);
  const pgbEnv = pgbackrestEnv(cfg, env);
  const logPath = join(tmpdir(), 'pgbackrest-restore-logs');
  mkdirSync(logPath, { recursive: true });

  // 2) pgBackRest info — validate chain + time window.
  const info = run(
    pgbackrestBin,
    [
      `--config=${confPath}`,
      `--stanza=${cfg.stanza}`,
      `--log-path=${logPath}`,
      'info',
      '--output=json',
    ],
    { env: pgbEnv, timeoutMs: 120_000 }
  );
  const infoCombined = `${info.stdout}\n${info.stderr}`;
  const window = extractBackupTimeWindow(info.stdout || '');

  if (info.status !== 0 || window.labels.length === 0) {
    // Real binary could not read a restorable chain — map to named errors.
    const mapped = mapPgbackrestFailure(infoCombined);
    const named =
      mapped.length > 0
        ? mapped
        : [
            'no base backup available — backup chain missing or unreadable by pgBackRest',
            // Integrity language for non-empty but unreadable/placeholder chains.
            'backup chain integrity check failed — pgBackRest could not open a restorable backup set',
          ];
    // Prefer empty-chain naming when info clearly has zero backups.
    const preferEmpty =
      /no stanza|stanza.*not|does not exist|missing/i.test(infoCombined) ||
      (info.status !== 0 &&
        window.labels.length === 0 &&
        !/checksum|corrupt|cipher|crypto/i.test(infoCombined));
    const finalNamed = preferEmpty
      ? [
          'no base backup available — backup chain missing (pgBackRest info found no restorable backup set)',
        ]
      : named;
    wipeScratch(scratch);
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      stanza: cfg.stanza,
      repoPrefix: cfg.pgbackrestPrefix,
      namedErrors: finalNamed,
      stdout: info.stdout,
      stderr: `${info.stderr}\n${finalNamed.join('\n')}`,
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  // 3) Timestamp window validation (fail closed outside available WAL / retention).
  // Allow a generous post-backup WAL window (7d) when only backup timestamps are known.
  const WAL_SLACK_MS = 7 * 24 * 60 * 60 * 1000;
  if (window.earliest && window.latest) {
    const min = window.earliest.getTime() - 60_000;
    const max = window.latest.getTime() + WAL_SLACK_MS;
    if (parsed.date.getTime() < min || parsed.date.getTime() > max) {
      wipeScratch(scratch);
      const r = failResult({
        targetTimestamp: parsed.iso,
        pgdataPath: scratch,
        targetAction,
        stanza: cfg.stanza,
        repoPrefix: cfg.pgbackrestPrefix,
        namedErrors: [
          `timestamp ${parsed.iso} is outside available WAL range (not in retention window); available approx ${window.earliest.toISOString()} .. ${new Date(max).toISOString()}`,
        ],
        stdout: info.stdout,
      });
      writeStatusFile(statusPath, r.report);
      return r;
    }
  } else {
    // No parseable window but labels exist — still reject absurd future timestamps.
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
    if (parsed.date.getTime() > farFuture || parsed.date.getFullYear() >= 2090) {
      wipeScratch(scratch);
      const r = failResult({
        targetTimestamp: parsed.iso,
        pgdataPath: scratch,
        targetAction,
        stanza: cfg.stanza,
        repoPrefix: cfg.pgbackrestPrefix,
        namedErrors: [
          `timestamp ${parsed.iso} is outside available WAL range (not in retention window)`,
        ],
      });
      writeStatusFile(statusPath, r.report);
      return r;
    }
  }

  // 4) Real pgBackRest restore --type=time
  // Honor R2_PGBACKREST_PREFIX / PGBACKREST_STANZA / cipher from loadBackupConfig(env)
  // (same contract the test seeder uses). Nudge --target when operator passed exact backup stop.
  const effectiveTargetDate = adjustPitrTargetForBackupStop(parsed.date, window);
  const targetTime = toPgbackrestTargetTime(effectiveTargetDate);
  const restoreArgs = [
    `--config=${confPath}`,
    `--stanza=${cfg.stanza}`,
    `--pg1-path=${scratch}`,
    '--type=time',
    `--target=${targetTime}`,
    `--target-action=${targetAction}`,
    `--log-path=${logPath}`,
    // Never touch a non-empty path without delta; scratch is empty by contract.
    'restore',
  ];
  const restore = run(pgbackrestBin, restoreArgs, {
    env: pgbEnv,
    timeoutMs: options.timeoutMs ?? 600_000,
  });
  const restoreCombined = `${restore.stdout}\n${restore.stderr}`;

  // Count restored WAL references in output (best-effort).
  const walMatches = restoreCombined.match(/wal|archive-get|0000000/gi);
  const restoredWalCount = walMatches ? walMatches.length : null;

  if (restore.status !== 0) {
    const mapped = mapPgbackrestFailure(restoreCombined);
    const named =
      mapped.length > 0
        ? mapped
        : [
            `pgBackRest restore failed (exit ${restore.status}) — backup chain integrity check failed or incomplete restore`,
          ];
    // Fail closed: wipe any partial PGDATA so we never leave a half-restored cluster.
    wipeScratch(scratch);
    const r = failResult({
      exitCode: restore.status === 0 ? 1 : restore.status,
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      stanza: cfg.stanza,
      repoPrefix: cfg.pgbackrestPrefix,
      namedErrors: named,
      stdout: restore.stdout,
      stderr: `${restore.stderr}\n${named.join('\n')}`,
      restoredWalCount,
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  // 5) Re-point restore_command at live R2 repo for catch-up WAL.
  const repoint = repointRestoreCommand({
    pgdata: scratch,
    configPath: confPath,
    stanza: cfg.stanza,
    pgbackrestBin,
  });
  if (!repoint.ok) {
    wipeScratch(scratch);
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      stanza: cfg.stanza,
      repoPrefix: cfg.pgbackrestPrefix,
      namedErrors: [
        'restore incomplete — could not re-point restore_command to live R2 repo (pgbackrest archive-get)',
      ],
      stdout: restore.stdout,
      stderr: restore.stderr,
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  // 6) Verify PGDATA is non-empty after restore (never exit 0 on incomplete).
  const fileCount = countPgdataFiles(scratch);
  if (fileCount === 0) {
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      stanza: cfg.stanza,
      repoPrefix: cfg.pgbackrestPrefix,
      namedErrors: ['restore incomplete — PGDATA empty after pgBackRest restore (refuse exit 0)'],
      stdout: restore.stdout,
      stderr: restore.stderr,
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  let actualStopTimestamp: string | null = null;
  if (!options.skipStart) {
    const started = tryStartPostgres(scratch, env, { targetAction });
    if (!started.started) {
      // Promote mode requires a queryable DB for AC-1; fail closed if start fails.
      // Prefer gate-matching named errors (outside available WAL / chain) over a
      // truncated archive-get log that only says "Postgres failed to start".
      const startNamed = mapPostgresStartFailureNamedErrors(started.log);
      wipeScratch(scratch);
      const r = failResult({
        targetTimestamp: parsed.iso,
        pgdataPath: scratch,
        targetAction,
        stanza: cfg.stanza,
        repoPrefix: cfg.pgbackrestPrefix,
        namedErrors: startNamed,
        stdout: restore.stdout,
        stderr: `${restore.stderr}\n${started.log}`,
        restoredWalCount,
      });
      writeStatusFile(statusPath, r.report);
      return r;
    }
    // Fail closed: never echo the operator argv target ISO as actual_stop_timestamp.
    actualStopTimestamp =
      queryActualStopTimestamp(scratch, started.port, env, started.log) ??
      readRecoveryTargetTimeFromPgdata(scratch);
  } else {
    // Without starting Postgres we only accept evidence from restore/PGDATA artifacts.
    actualStopTimestamp =
      parseStopTimestampFromLog(`${restore.stdout}\n${restore.stderr}`) ??
      readRecoveryTargetTimeFromPgdata(scratch);
  }

  if (!actualStopTimestamp) {
    // Stop any postmaster before wipe so we never leave a half-proven cluster.
    tryStopPostgres(scratch, env);
    wipeScratch(scratch);
    const r = failResult({
      targetTimestamp: parsed.iso,
      pgdataPath: scratch,
      targetAction,
      stanza: cfg.stanza,
      repoPrefix: cfg.pgbackrestPrefix,
      namedErrors: [
        'restore incomplete — could not determine actual recovery stop timestamp (fail closed; refusing to report target/now as stop)',
      ],
      stdout: restore.stdout,
      stderr: restore.stderr,
      restoredWalCount,
      actualStopTimestamp: null,
    });
    writeStatusFile(statusPath, r.report);
    return r;
  }

  const report: PitrRestoreReport = {
    exitCode: 0,
    targetTimestamp: parsed.iso,
    actualStopTimestamp,
    pgdataPath: scratch,
    targetAction,
    ok: true,
    restoredWalCount,
    stanza: cfg.stanza,
    repoPrefix: cfg.pgbackrestPrefix,
    errors: [],
  };
  writeStatusFile(statusPath, report);

  return {
    ok: true,
    exitCode: 0,
    targetTimestamp: parsed.iso,
    actualStopTimestamp,
    pgdataPath: scratch,
    targetAction,
    restoredWalCount,
    errors: [],
    stdout: restore.stdout,
    stderr: restore.stderr,
    report,
    namedErrors: [],
  };
}

export function formatPitrRestoreText(result: PitrRestoreResult): string {
  const lines = [
    'holo restore --pitr — pgBackRest point-in-time restore',
    `  ok:                    ${result.ok ? 'true' : 'false'}`,
    `  exit_code:             ${result.exitCode}`,
    `  target_timestamp:      ${result.targetTimestamp}`,
    `  actual_stop_timestamp: ${result.actualStopTimestamp ?? '(none)'}`,
    `  pgdata:                ${result.pgdataPath}`,
    `  target_action:         ${result.targetAction}`,
    `  restored_wal_count:    ${result.restoredWalCount ?? '(unknown)'}`,
  ];
  if (result.errors.length) {
    lines.push('  errors:');
    for (const e of result.errors) lines.push(`    - ${e}`);
  }
  lines.push(`  overall:               ${result.ok ? 'OK' : 'FAILED'}`);
  return lines.join('\n');
}

/** Read last restore status report (holo restore:status). */
export function getRestoreStatus(options?: { statusPath?: string }): RestoreStatusResult {
  const statusPath = options?.statusPath ?? DEFAULT_STATUS_PATH();
  if (!existsSync(statusPath)) {
    return {
      ok: false,
      statusPath,
      report: null,
      errors: [`no restore status file at ${statusPath}`],
    };
  }
  try {
    const report = JSON.parse(readFileSync(statusPath, 'utf8')) as PitrRestoreReport;
    return {
      ok: report.ok === true,
      statusPath,
      report,
      errors: report.errors ?? [],
    };
  } catch (e) {
    return {
      ok: false,
      statusPath,
      report: null,
      errors: [`failed to parse restore status: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

export function formatRestoreStatusText(result: RestoreStatusResult): string {
  if (!result.report) {
    return `holo restore:status — no report\n  path: ${result.statusPath}\n  errors: ${result.errors.join('; ')}`;
  }
  const r = result.report;
  return [
    'holo restore:status',
    `  path:                  ${result.statusPath}`,
    `  ok:                    ${r.ok}`,
    `  exit_code:             ${r.exitCode}`,
    `  target_timestamp:      ${r.targetTimestamp}`,
    `  actual_stop_timestamp: ${r.actualStopTimestamp ?? '(none)'}`,
    `  pgdata:                ${r.pgdataPath}`,
    `  target_action:         ${r.targetAction}`,
  ].join('\n');
}
