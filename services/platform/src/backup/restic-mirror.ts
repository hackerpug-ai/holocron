/**
 * Scheduled restic blob mirror → encrypted R2 prefix + SHA-256 parity (D04-04 / CAP-BAK-01).
 *
 * Flow (never skip steps):
 *   1. restic backup of content-addressed blob store
 *   2. restic check --read-data
 *   3. restore snapshot to temp + SHA-256 set compare (local == remote)
 *   4. ONLY after parity: upsert backup_heartbeat restic_blob_mirror + OTel span
 *
 * RESTIC_PASSWORD lives in the consolidated secrets store — never co-located as
 * plaintext next to the R2 restic objects (D04-06 audits).
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { defaultBlobRoot } from '../blob/store.ts';
import {
  defaultSecretsPath,
  getSecretValue,
  resolveRepoRoot,
  type SecretsMap,
} from '../config/secrets.ts';
import { createSql, type Sql } from '../db/client.ts';
import { redactForExport } from '../observability/langfuse-exporter.ts';
import { type BackupConfig, endpointHost, loadBackupConfig } from './config.ts';
import { ensureBackupHeartbeatTable } from './heartbeat.ts';
import {
  assertParity,
  compareHashSets,
  hashDirectoryTree,
  hashLocalBlobStore,
  type ParityCompareResult,
} from './parity-check.ts';
import { upsertSecretsFile } from './r2-provision.ts';

/** Re-export shared fail-closed assert (migrate-owned 0029; no forked DDL). */
export { ensureBackupHeartbeatTable } from './heartbeat.ts';

export const RESTIC_BLOB_MIRROR_JOB = 'restic_blob_mirror' as const;
export const RESTIC_BLOB_MIRROR_SPAN = 'backup:restic_blob_mirror' as const;
export const DEFAULT_RESTIC_PREFIX = 'restic' as const;

/** Local restic mirror config (required for production-truth config_removed induction). */
export function defaultResticMirrorConfigPath(repoRoot = resolveRepoRoot()): string {
  return (
    process.env.HOLO_RESTIC_CONFIG_PATH?.trim() ||
    resolve(repoRoot, 'services/platform/config/restic/mirror.conf')
  );
}

/** Ensure a real local restic mirror config file exists (no secrets in body). */
export function ensureResticMirrorConfigFile(options?: {
  repoRoot?: string;
  repository?: string;
  path?: string;
}): { path: string; created: boolean } {
  const path = options?.path ?? defaultResticMirrorConfigPath(options?.repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) return { path, created: false };
  const body = [
    '# Holocron restic blob-mirror local config (D04-04 / CAP-BAK-01)',
    '# Password lives in secrets store (RESTIC_PASSWORD) — never here.',
    `# repository=${options?.repository ?? '(from secrets/env)'}`,
    'required=true',
    '',
  ].join('\n');
  writeFileSync(path, body, { encoding: 'utf8', mode: 0o600 });
  return { path, created: true };
}

/**
 * Rename/remove the active restic mirror config (production-truth config_removed).
 * Returns backup path so callers can restore.
 */
export function removeResticMirrorConfig(options?: { path?: string; repoRoot?: string }): {
  config_path: string;
  backup_path: string | null;
  removed: boolean;
  existed_before: boolean;
} {
  const config_path = options?.path ?? defaultResticMirrorConfigPath(options?.repoRoot);
  const existed_before = existsSync(config_path);
  if (!existed_before) {
    // Ensure then remove so induction always mutates a real path.
    ensureResticMirrorConfigFile({ path: config_path, repoRoot: options?.repoRoot });
  }
  const backup_path = `${config_path}.induced-removed`;
  try {
    if (existsSync(backup_path)) rmSync(backup_path, { force: true });
    renameSync(config_path, backup_path);
    return { config_path, backup_path, removed: true, existed_before: true };
  } catch {
    return { config_path, backup_path: null, removed: false, existed_before };
  }
}

/** Restore config previously moved by removeResticMirrorConfig. */
export function restoreResticMirrorConfig(options: {
  config_path: string;
  backup_path: string | null;
}): boolean {
  if (!options.backup_path || !existsSync(options.backup_path)) return false;
  mkdirSync(dirname(options.config_path), { recursive: true });
  if (existsSync(options.config_path)) rmSync(options.config_path, { force: true });
  renameSync(options.backup_path, options.config_path);
  return true;
}

export type ResticMirrorConfig = {
  backup: BackupConfig;
  resticPassword: string;
  resticPrefix: string;
  /** s3:https://host/bucket/prefix */
  repository: string;
  blobRoot: string;
  resticBin: string;
  secretsPath: string;
};

export type BackupSpanRecord = {
  name: string;
  traceId: string;
  spanId: string;
  jobName: string;
  status: 'success' | 'failed';
  snapshotId: string | null;
  objectCount: number | null;
  attributes: Record<string, unknown>;
  startedAt: string;
  endedAt: string;
};

export type ResticMirrorResult = {
  ok: boolean;
  jobName: typeof RESTIC_BLOB_MIRROR_JOB;
  spanName: typeof RESTIC_BLOB_MIRROR_SPAN;
  repository: string;
  resticPrefix: string;
  bucketName: string;
  blobRoot: string;
  encrypted: true;
  plaintextRepo: false;
  /** Distinct from pgBackRest prefix. */
  separatePrefixFromPgbackrest: boolean;
  pgbackrestPrefix: string;
  initExit: number;
  backupExit: number;
  checkExit: number;
  checkStdout: string;
  snapshotId: string | null;
  snapshotsCount: number;
  objectCount: number;
  parity: ParityCompareResult | null;
  parityPassed: boolean;
  heartbeatUpdated: boolean;
  heartbeat: BackupHeartbeatRow | null;
  span: BackupSpanRecord | null;
  resticPasswordInSecrets: boolean;
  errors: string[];
  durationMs: number;
};

export type BackupHeartbeatRow = {
  job_name: string;
  last_success_at: string | null;
  last_wal_segment: string | null;
  last_snapshot_id: string | null;
  object_count: number | null;
  status: string | null;
  trace_id: string | null;
  updated_at: string | null;
};

export type RunResticMirrorOptions = {
  blobRoot?: string;
  secretsPath?: string;
  env?: NodeJS.ProcessEnv;
  /** Skip heartbeat DB write (parity/check still run). */
  skipHeartbeat?: boolean;
  /** Force re-init attempt (idempotent — existing repo is ok). */
  ensureInit?: boolean;
  databaseUrl?: string;
  /** When set, write span JSON evidence here. */
  spanEvidencePath?: string;
  sql?: Sql;
  /**
   * Production-truth config_removed: require local restic config file; if missing,
   * fail without advancing last_success_at (pure overdue / failed, never silent-healthy).
   */
  induceFault?: 'config_removed';
  /** Override restic config path (default services/platform/config/restic/mirror.conf). */
  resticConfigPath?: string;
};

function run(
  cmd: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number; cwd?: string }
): { status: number; stdout: string; stderr: string } {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    env: options?.env ?? process.env,
    timeout: options?.timeoutMs ?? 600_000,
    cwd: options?.cwd,
  });
  return {
    status: res.status ?? 1,
    stdout: res.stdout?.toString() ?? '',
    stderr: res.stderr?.toString() ?? '',
  };
}

function which(bin: string, env?: NodeJS.ProcessEnv): string | null {
  const res = run('which', [bin], { env });
  if (res.status !== 0) return null;
  const p = res.stdout.trim();
  return p.length > 0 ? p : null;
}

export function defaultResticPrefix(env: NodeJS.ProcessEnv = process.env): string {
  return env.R2_RESTIC_PREFIX?.trim() || DEFAULT_RESTIC_PREFIX;
}

export function buildResticRepository(cfg: {
  endpoint: string;
  bucketName: string;
  resticPrefix: string;
}): string {
  const host = endpointHost(cfg.endpoint);
  const prefix = cfg.resticPrefix.replace(/^\/+|\/+$/g, '');
  // restic S3 backend: s3:https://endpoint/bucket/path
  return `s3:https://${host}/${cfg.bucketName}/${prefix}`;
}

/**
 * Ensure RESTIC_PASSWORD exists in secrets store. Generates a strong password
 * on first use; never logs the value. Password is NOT stored under the restic
 * R2 prefix (lives only in secrets.yaml / env).
 */
export function ensureResticPassword(options?: { secretsPath?: string; env?: NodeJS.ProcessEnv }): {
  password: string;
  generated: boolean;
  secretsPath: string;
} {
  const env = options?.env ?? process.env;
  const secretsPath = options?.secretsPath ?? defaultSecretsPath();
  const existing = getSecretValue('RESTIC_PASSWORD', { secretsPath, env });
  if (existing && existing.length >= 16) {
    return { password: existing, generated: false, secretsPath };
  }
  const password = randomBytes(32).toString('base64url');
  upsertSecretsFile(secretsPath, { RESTIC_PASSWORD: password } satisfies SecretsMap);
  // Also export for this process so subsequent getSecretValue(env-first) works.
  env.RESTIC_PASSWORD = password;
  return { password, generated: true, secretsPath };
}

export function ensureResticPrefixSecret(options?: {
  secretsPath?: string;
  env?: NodeJS.ProcessEnv;
  prefix?: string;
}): { prefix: string; secretsPath: string } {
  const env = options?.env ?? process.env;
  const secretsPath = options?.secretsPath ?? defaultSecretsPath();
  const fromEnvOrFile =
    getSecretValue('R2_RESTIC_PREFIX', { secretsPath, env }) ||
    options?.prefix ||
    defaultResticPrefix(env);
  const prefix = fromEnvOrFile.replace(/^\/+|\/+$/g, '') || DEFAULT_RESTIC_PREFIX;
  if (prefix === 'pgbackrest' || prefix.startsWith('pgbackrest/')) {
    throw new Error(`R2_RESTIC_PREFIX must be distinct from pgBackRest prefix; got '${prefix}'`);
  }
  upsertSecretsFile(secretsPath, {
    R2_RESTIC_PREFIX: prefix,
  } satisfies SecretsMap);
  env.R2_RESTIC_PREFIX = prefix;
  return { prefix, secretsPath };
}

export function loadResticMirrorConfig(options?: {
  blobRoot?: string;
  secretsPath?: string;
  env?: NodeJS.ProcessEnv;
}): ResticMirrorConfig {
  const env = options?.env ?? process.env;
  const secretsPath = options?.secretsPath ?? defaultSecretsPath();
  const backup = loadBackupConfig({ secretsPath, env });
  const { password } = ensureResticPassword({ secretsPath, env });
  const { prefix } = ensureResticPrefixSecret({ secretsPath, env });
  const repository = buildResticRepository({
    endpoint: backup.endpoint,
    bucketName: backup.bucketName,
    resticPrefix: prefix,
  });
  const resticBin =
    which('restic', env) ||
    (existsSync('/opt/homebrew/bin/restic') ? '/opt/homebrew/bin/restic' : 'restic');
  const blobRoot = resolve(options?.blobRoot ?? defaultBlobRoot(resolveRepoRoot()));
  return {
    backup,
    resticPassword: password,
    resticPrefix: prefix,
    repository,
    blobRoot,
    resticBin,
    secretsPath,
  };
}

export function resticEnv(
  cfg: ResticMirrorConfig,
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  out.RESTIC_PASSWORD = cfg.resticPassword;
  out.RESTIC_REPOSITORY = cfg.repository;
  out.AWS_ACCESS_KEY_ID = cfg.backup.accessKeyId;
  out.AWS_SECRET_ACCESS_KEY = cfg.backup.secretAccessKey;
  out.AWS_DEFAULT_REGION = 'auto';
  out.AWS_EC2_METADATA_DISABLED = 'true';
  // R2 is path-style / custom endpoint — restic uses the host from the repository URL.
  if (cfg.backup.sessionToken) {
    out.AWS_SESSION_TOKEN = cfg.backup.sessionToken;
  } else {
    delete out.AWS_SESSION_TOKEN;
  }
  // Never pass RESTIC_PASSWORD via argv; never log these.
  return out;
}

/** Hex trace id (32 hex chars) for OTel / heartbeat correlation. */
export function newTraceId(): string {
  return randomBytes(16).toString('hex');
}

export function newSpanId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Emit backup:restic_blob_mirror span via langfuse-exporter redaction path.
 * Always records a local span; attempts Langfuse only when configured (non-fatal).
 */
export function emitResticBlobMirrorSpan(args: {
  status: 'success' | 'failed';
  snapshotId: string | null;
  objectCount: number | null;
  jobName?: string;
  errorMessage?: string | null;
  startedAt?: Date;
  endedAt?: Date;
  evidencePath?: string;
}): BackupSpanRecord {
  const startedAt = (args.startedAt ?? new Date()).toISOString();
  const endedAt = (args.endedAt ?? new Date()).toISOString();
  const traceId = newTraceId();
  const spanId = newSpanId();
  const rawAttributes = {
    job_name: args.jobName ?? RESTIC_BLOB_MIRROR_JOB,
    status: args.status,
    snapshot_id: args.snapshotId,
    object_count: args.objectCount,
    span_name: RESTIC_BLOB_MIRROR_SPAN,
    error: args.errorMessage ?? null,
  };
  // redactForExport strips password/token/secret keys if ever present
  const attributes = redactForExport(rawAttributes) as Record<string, unknown>;
  const span: BackupSpanRecord = {
    name: RESTIC_BLOB_MIRROR_SPAN,
    traceId,
    spanId,
    jobName: args.jobName ?? RESTIC_BLOB_MIRROR_JOB,
    status: args.status,
    snapshotId: args.snapshotId,
    objectCount: args.objectCount,
    attributes,
    startedAt,
    endedAt,
  };
  if (args.evidencePath) {
    const dir = dirname(args.evidencePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(args.evidencePath, `${JSON.stringify(span, null, 2)}\n`, { mode: 0o600 });
  }
  return span;
}

/**
 * Idempotent heartbeat upsert. Call ONLY after SHA-256 parity passes.
 * Requires migrate-owned backup_heartbeat (0029); no runtime CREATE TABLE.
 */
export async function upsertBackupHeartbeat(
  sql: Sql,
  row: {
    jobName: string;
    lastSnapshotId: string;
    objectCount: number;
    status: 'success' | 'failed';
    traceId: string;
    lastWalSegment?: string | null;
    lastSuccessAt?: Date;
  }
): Promise<BackupHeartbeatRow> {
  await ensureBackupHeartbeatTable(sql);
  const successAt = row.lastSuccessAt ?? new Date();
  const rows = await sql<BackupHeartbeatRow[]>`
    INSERT INTO backup_heartbeat (
      job_name,
      last_success_at,
      last_wal_segment,
      last_snapshot_id,
      object_count,
      status,
      trace_id,
      updated_at
    ) VALUES (
      ${row.jobName},
      ${successAt.toISOString()},
      ${row.lastWalSegment ?? null},
      ${row.lastSnapshotId},
      ${row.objectCount},
      ${row.status},
      ${row.traceId},
      now()
    )
    ON CONFLICT (job_name) DO UPDATE SET
      last_success_at = EXCLUDED.last_success_at,
      last_wal_segment = COALESCE(EXCLUDED.last_wal_segment, backup_heartbeat.last_wal_segment),
      last_snapshot_id = EXCLUDED.last_snapshot_id,
      object_count = EXCLUDED.object_count,
      status = EXCLUDED.status,
      trace_id = EXCLUDED.trace_id,
      updated_at = now()
    RETURNING
      job_name,
      last_success_at::text,
      last_wal_segment,
      last_snapshot_id,
      object_count::int AS object_count,
      status,
      trace_id,
      updated_at::text
  `;
  const out = rows[0];
  if (!out) throw new Error(`backup_heartbeat upsert returned no row for ${row.jobName}`);
  return out;
}

export async function readBackupHeartbeat(
  sql: Sql,
  jobName: string
): Promise<BackupHeartbeatRow | null> {
  await ensureBackupHeartbeatTable(sql);
  const rows = await sql<BackupHeartbeatRow[]>`
    SELECT
      job_name,
      last_success_at::text,
      last_wal_segment,
      last_snapshot_id,
      object_count::int AS object_count,
      status,
      trace_id,
      updated_at::text
    FROM backup_heartbeat
    WHERE job_name = ${jobName}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listBackupHeartbeats(sql: Sql): Promise<BackupHeartbeatRow[]> {
  await ensureBackupHeartbeatTable(sql);
  return sql<BackupHeartbeatRow[]>`
    SELECT
      job_name,
      last_success_at::text,
      last_wal_segment,
      last_snapshot_id,
      object_count::int AS object_count,
      status,
      trace_id,
      updated_at::text
    FROM backup_heartbeat
    ORDER BY job_name
  `;
}

function parseLatestSnapshotId(snapshotsJson: string): {
  snapshotId: string | null;
  count: number;
} {
  try {
    const parsed = JSON.parse(snapshotsJson) as Array<{ id?: string; short_id?: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { snapshotId: null, count: 0 };
    }
    // restic snapshots --json is newest-last typically; take the last entry.
    const last = parsed[parsed.length - 1];
    const id = last?.id ?? last?.short_id ?? null;
    return { snapshotId: id, count: parsed.length };
  } catch {
    return { snapshotId: null, count: 0 };
  }
}

/**
 * Run the full mirror job. Heartbeat is written ONLY after parity passes.
 */
export async function runResticBlobMirror(
  options: RunResticMirrorOptions = {}
): Promise<ResticMirrorResult> {
  const started = Date.now();
  const startedAt = new Date();
  const env = options.env ?? process.env;
  const errors: string[] = [];
  const resticConfigPath =
    options.resticConfigPath ??
    env.HOLO_RESTIC_CONFIG_PATH?.trim() ??
    defaultResticMirrorConfigPath();

  // Production-truth config_removed: missing local config aborts before any success cycle.
  // Never advances last_success_at (pure overdue / non-success — not silent-healthy).
  if (options.induceFault === 'config_removed') {
    if (!existsSync(resticConfigPath)) {
      errors.push(
        `overdue: config removed — backup config missing for job ${RESTIC_BLOB_MIRROR_JOB} (path=${resticConfigPath})`
      );
      const endedAt = new Date();
      const span = emitResticBlobMirrorSpan({
        status: 'failed',
        snapshotId: null,
        objectCount: null,
        errorMessage: errors.join('; ').slice(0, 500),
        startedAt,
        endedAt,
        evidencePath: options.spanEvidencePath,
      });
      return {
        ok: false,
        jobName: RESTIC_BLOB_MIRROR_JOB,
        spanName: RESTIC_BLOB_MIRROR_SPAN,
        repository: '(config-missing)',
        resticPrefix: defaultResticPrefix(env),
        bucketName: '',
        blobRoot: options.blobRoot ?? defaultBlobRoot(resolveRepoRoot()),
        encrypted: true,
        plaintextRepo: false,
        separatePrefixFromPgbackrest: true,
        pgbackrestPrefix: 'pgbackrest',
        initExit: 1,
        backupExit: 1,
        checkExit: 1,
        checkStdout: '',
        snapshotId: null,
        snapshotsCount: 0,
        objectCount: 0,
        parity: null,
        parityPassed: false,
        heartbeatUpdated: false,
        heartbeat: null,
        span,
        resticPasswordInSecrets: false,
        errors,
        durationMs: Date.now() - started,
      };
    }
  } else {
    // Healthy runs ensure the config file exists so a later config_removed is distinguishable.
    ensureResticMirrorConfigFile({ path: resticConfigPath });
  }

  const cfg = loadResticMirrorConfig({
    blobRoot: options.blobRoot,
    secretsPath: options.secretsPath,
    env,
  });

  const renv = resticEnv(cfg, env);
  const separatePrefixFromPgbackrest =
    cfg.resticPrefix !== cfg.backup.pgbackrestPrefix &&
    !cfg.resticPrefix.startsWith(`${cfg.backup.pgbackrestPrefix}/`) &&
    !cfg.backup.pgbackrestPrefix.startsWith(`${cfg.resticPrefix}/`);

  if (!separatePrefixFromPgbackrest) {
    errors.push(
      `restic prefix '${cfg.resticPrefix}' collides with pgBackRest prefix '${cfg.backup.pgbackrestPrefix}'`
    );
  }

  mkdirSync(cfg.blobRoot, { recursive: true });

  // 0) init repo if needed (encrypted via RESTIC_PASSWORD)
  let initExit = 0;
  if (options.ensureInit !== false) {
    const init = run(cfg.resticBin, ['init'], { env: renv, timeoutMs: 180_000 });
    initExit = init.status;
    // exit 1 with "already initialized" is success for idempotent re-runs
    const already =
      init.stderr.includes('already initialized') ||
      init.stdout.includes('already initialized') ||
      init.stderr.includes('config file already exists') ||
      init.stderr.includes('repository master key and config already initialized');
    if (init.status !== 0 && !already) {
      errors.push(`restic init failed: ${(init.stderr || init.stdout).slice(0, 500)}`);
    } else {
      initExit = 0;
    }
  }

  // 1) backup
  const backup = run(
    cfg.resticBin,
    [
      'backup',
      cfg.blobRoot,
      '--host',
      'holocron',
      '--tag',
      'blob-mirror',
      '--tag',
      'd04-04',
      '--json',
    ],
    { env: renv, timeoutMs: 600_000 }
  );
  const backupExit = backup.status;
  if (backupExit !== 0) {
    errors.push(`restic backup failed: ${(backup.stderr || backup.stdout).slice(0, 800)}`);
  }

  // 2) check --read-data (mandatory — never skip)
  const check = run(cfg.resticBin, ['check', '--read-data'], {
    env: renv,
    timeoutMs: 900_000,
  });
  const checkExit = check.status;
  const checkStdout = `${check.stdout}\n${check.stderr}`.trim();
  if (checkExit !== 0) {
    errors.push(`restic check --read-data failed: ${checkStdout.slice(0, 800)}`);
  }

  // 3) snapshots + restore for real content hash parity
  const snaps = run(cfg.resticBin, ['snapshots', '--json'], {
    env: renv,
    timeoutMs: 120_000,
  });
  const { snapshotId, count: snapshotsCount } = parseLatestSnapshotId(snaps.stdout);
  if (!snapshotId) {
    errors.push('restic snapshots returned zero snapshots (no snapshot id)');
  }

  let parity: ParityCompareResult | null = null;
  let parityPassed = false;
  let objectCount = 0;
  let restoreDir: string | null = null;

  try {
    if (snapshotId && checkExit === 0 && backupExit === 0) {
      const localHashes = hashLocalBlobStore(cfg.blobRoot);
      objectCount = localHashes.hashes.length;

      restoreDir = mkdtempSync(join(tmpdir(), 'holocron-restic-parity-'));
      // Restore into restoreDir; restic recreates absolute path structure under target.
      const restore = run(cfg.resticBin, ['restore', snapshotId, '--target', restoreDir], {
        env: renv,
        timeoutMs: 600_000,
      });
      if (restore.status !== 0) {
        errors.push(
          `restic restore for parity failed: ${(restore.stderr || restore.stdout).slice(0, 500)}`
        );
      } else {
        // restic restore preserves absolute paths under target → find the blob root mirror
        const remoteRoot = findRestoredBlobRoot(restoreDir, cfg.blobRoot);
        const remoteHashes = hashDirectoryTree(remoteRoot);
        try {
          parity = assertParity(localHashes, remoteHashes, 'SHA-256 local↔remote blob parity');
          parityPassed = true;
          objectCount = parity.localCount;
        } catch (err) {
          parity = compareHashSets(localHashes, remoteHashes);
          parityPassed = false;
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
    }
  } finally {
    if (restoreDir && existsSync(restoreDir)) {
      rmSync(restoreDir, { recursive: true, force: true });
    }
  }

  // 4) Heartbeat + span ONLY after parity confirmation
  let heartbeatUpdated = false;
  let heartbeat: BackupHeartbeatRow | null = null;
  let span: BackupSpanRecord | null = null;
  const endedAt = new Date();

  if (parityPassed && snapshotId) {
    span = emitResticBlobMirrorSpan({
      status: 'success',
      snapshotId,
      objectCount,
      startedAt,
      endedAt,
      evidencePath: options.spanEvidencePath,
    });

    if (!options.skipHeartbeat) {
      const sql = options.sql ?? createSql(options.databaseUrl);
      const ownsSql = !options.sql;
      try {
        heartbeat = await upsertBackupHeartbeat(sql, {
          jobName: RESTIC_BLOB_MIRROR_JOB,
          lastSnapshotId: snapshotId,
          objectCount,
          status: 'success',
          traceId: span.traceId,
        });
        heartbeatUpdated = true;
      } catch (err) {
        errors.push(`heartbeat upsert failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (ownsSql) await sql.end({ timeout: 5 });
      }
    }
  } else {
    // Failed path: emit failed span but NEVER set success heartbeat
    span = emitResticBlobMirrorSpan({
      status: 'failed',
      snapshotId,
      objectCount: objectCount || null,
      errorMessage: errors.join('; ').slice(0, 500) || 'parity or restic check failed',
      startedAt,
      endedAt,
      evidencePath: options.spanEvidencePath,
    });
  }

  const ok =
    errors.length === 0 &&
    parityPassed &&
    checkExit === 0 &&
    backupExit === 0 &&
    Boolean(snapshotId) &&
    separatePrefixFromPgbackrest &&
    (options.skipHeartbeat || heartbeatUpdated);

  return {
    ok,
    jobName: RESTIC_BLOB_MIRROR_JOB,
    spanName: RESTIC_BLOB_MIRROR_SPAN,
    repository: redactRepo(cfg.repository),
    resticPrefix: cfg.resticPrefix,
    bucketName: cfg.backup.bucketName,
    blobRoot: cfg.blobRoot,
    encrypted: true,
    plaintextRepo: false,
    separatePrefixFromPgbackrest,
    pgbackrestPrefix: cfg.backup.pgbackrestPrefix,
    initExit,
    backupExit,
    checkExit,
    checkStdout: checkStdout.slice(0, 2000),
    snapshotId,
    snapshotsCount,
    objectCount,
    parity,
    parityPassed,
    heartbeatUpdated,
    heartbeat,
    span,
    resticPasswordInSecrets: Boolean(
      getSecretValue('RESTIC_PASSWORD', { secretsPath: cfg.secretsPath, env })
    ),
    errors,
    durationMs: Date.now() - started,
  };
}

function redactRepo(repo: string): string {
  // Keep structure; strip any accidental credential material if present in URL.
  return repo.replace(/\/\/([^@/]+)@/, '//***@');
}

/**
 * restic restore --target T of an absolute path /a/b/c lands at T/a/b/c.
 * Find that restored tree, falling back to T itself.
 */
export function findRestoredBlobRoot(restoreTarget: string, originalBlobRoot: string): string {
  const abs = resolve(originalBlobRoot);
  const candidate = join(restoreTarget, abs);
  if (existsSync(candidate)) return candidate;

  // Walk restore target for a directory that contains sha256-shaped leaves.
  const found = findContentAddressedRoot(restoreTarget);
  if (found) return found;
  return restoreTarget;
}

function findContentAddressedRoot(root: string): string | null {
  // Heuristic: a directory with subdirs named [0-9a-f]{2}
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    const hexDirs = entries.filter((e) => e.isDirectory() && /^[0-9a-f]{2}$/i.test(e.name));
    if (hexDirs.length > 0) return root;
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('.')) continue;
      const nested = findContentAddressedRoot(join(root, e.name));
      if (nested) return nested;
    }
  } catch {
    return null;
  }
  return null;
}

export function formatMirrorText(result: ResticMirrorResult): string {
  const lines = [
    'holo backup:mirror — restic blob mirror + SHA-256 parity (D04-04)',
    `  ok:              ${result.ok}`,
    `  bucket:          ${result.bucketName}`,
    `  restic_prefix:   ${result.resticPrefix} (pgbackrest=${result.pgbackrestPrefix}, separate=${result.separatePrefixFromPgbackrest})`,
    `  repository:      ${result.repository}`,
    `  encrypted:       ${result.encrypted} (plaintext=${result.plaintextRepo})`,
    `  blob_root:       ${result.blobRoot}`,
    `  backup_exit:     ${result.backupExit}`,
    `  check_exit:      ${result.checkExit} (restic check --read-data)`,
    `  snapshots:       ${result.snapshotsCount}`,
    `  snapshot_id:     ${result.snapshotId ?? '(none)'}`,
    `  object_count:    ${result.objectCount}`,
    `  parity:          ${result.parityPassed ? 'PASS' : 'FAIL'} (local=${result.parity?.localCount ?? 0} remote=${result.parity?.remoteCount ?? 0})`,
    `  heartbeat:       ${result.heartbeatUpdated ? 'upserted' : 'not updated (parity required)'}`,
    `  span:            ${result.span?.name ?? '(none)'} trace_id=${result.span?.traceId?.slice(0, 16) ?? ''}…`,
    `  RESTIC_PASSWORD: ${result.resticPasswordInSecrets ? 'in secrets store' : 'MISSING'}`,
    `  duration_ms:     ${result.durationMs}`,
  ];
  if (result.errors.length > 0) {
    lines.push('  errors:');
    for (const e of result.errors) lines.push(`    - ${e}`);
  }
  return lines.join('\n');
}

export function formatBackupStatusText(rows: BackupHeartbeatRow[]): string {
  if (rows.length === 0) {
    return 'holo backup:status — no backup_heartbeat rows';
  }
  const lines = ['holo backup:status — backup_heartbeat'];
  for (const r of rows) {
    lines.push(
      `  ${r.job_name}: status=${r.status ?? 'null'} snapshot=${r.last_snapshot_id ?? 'null'} ` +
        `objects=${r.object_count ?? 'null'} last_success_at=${r.last_success_at ?? 'null'} ` +
        `trace_id=${r.trace_id ? `${r.trace_id.slice(0, 16)}…` : 'null'}`
    );
  }
  return lines.join('\n');
}
