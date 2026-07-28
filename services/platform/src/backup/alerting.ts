/**
 * D04-05 / CAP-BAK-01 — backup failure + overdue alerting (no dashboard polling).
 *
 * Detection query (real Postgres, never a stale cache):
 *   SELECT * FROM backup_heartbeat
 *   WHERE (now() - last_success_at) > overdue_interval OR status = 'failed'
 *   (also: last_success_at IS NULL with non-success status counts as overdue)
 *
 * Delivery: POST JSON payload to ALERT_WEBHOOK_URL (real HTTP, not log-only).
 * Silent-failure modes (kill, expired credential, removed config) stop heartbeat
 * updates → overdue/failed → alert within the ≤15 min window.
 *
 * Healthy heartbeats (fresh + status=success) produce ZERO posts.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { getSecretValue, resolveRepoRoot } from '../config/secrets.ts';
import { createSql, type Sql } from '../db/client.ts';
import { runBaseBackupJob } from './base-backup.ts';
import { defaultPgbackrestConfigPath } from './config.ts';
import {
  type BackupHeartbeatRecord,
  ensureBackupHeartbeatTable,
  getBackupHeartbeat,
  listBackupHeartbeats,
  upsertBackupHeartbeat,
} from './heartbeat.ts';
import {
  ensureResticMirrorConfigFile,
  removeResticMirrorConfig,
  restoreResticMirrorConfig,
  runResticBlobMirror,
} from './restic-mirror.ts';
import { runWalArchiveJob } from './wal-archive.ts';

/** Production SLA: alert within 15 minutes of overdue/failed. */
export const DEFAULT_OVERDUE_MS = 15 * 60 * 1000;
/**
 * Hard bound on webhook HTTP POST (F-16 / REDHAT-FIX-S27-14).
 * Prevents a black-holed ALERT_WEBHOOK_URL from hanging alert-sweep/gate forever.
 * Override with BACKUP_ALERT_WEBHOOK_TIMEOUT_MS (tests may shorten).
 */
export const DEFAULT_WEBHOOK_TIMEOUT_MS = 10_000;
/** launchd sweep cadence — well inside the 15 min SLA. */
export const ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS = 300;
export const ALERT_SWEEP_LAUNCHD_LABEL = 'holocron-backup-alert-sweep';

export type AlertReason = 'overdue' | 'failed';

export type InduceFailureMode = 'kill_wal_behind' | 'credential_expired' | 'config_removed';

/** production_truth = real process/config/cred fault; synthetic_poison = sweep-unit harness only. */
export type InducePath = 'production_truth' | 'synthetic_poison';

export type InduceEvidence = {
  path: InducePath;
  real_process_killed: boolean;
  pid_killed: number | null;
  production_catch: boolean;
  /** Honest kill claim (REDHAT-FIX-S27-18) — never imply mid-archive for staged shell. */
  kill_kind?: string | null;
  mid_archive?: boolean;
  exit_code: number | null;
  real_auth_fault: boolean;
  config_removed: boolean;
  config_path: string | null;
  config_exists_after: boolean;
  binary: string | null;
  failure_detail: string;
  restored: boolean;
  fault_output: string | null;
  /** True when heartbeat status=failed was written by production job catch, not induce SQL alone. */
  heartbeat_via_production_writer: boolean;
};

export type BackupAlertPayload = {
  job_name: string;
  job_id: string;
  /** Contract reason: overdue | failed */
  reason: AlertReason;
  /**
   * Human/test-facing detail (includes silent-mode keywords).
   * Prefer this for operators; RED suite also reads failure_reason first.
   */
  failure_reason: string;
  last_success_at: string | null;
  overdue_by_minutes: number;
  last_wal_segment: string | null;
  last_snapshot_id: string | null;
  trace_id: string | null;
  /** ISO timestamp of the alert event. */
  timestamp: string;
  status: string | null;
};

export type AlertConfig = {
  webhookUrl: string;
  overdueMs: number;
};

export type JobHealth = {
  job_name: string;
  status: string | null;
  last_success_at: string | null;
  last_wal_segment: string | null;
  last_snapshot_id: string | null;
  trace_id: string | null;
  age_ms: number | null;
  overdue_by_minutes: number;
  is_overdue: boolean;
  is_failed: boolean;
  healthy: boolean;
  flag: 'OK' | 'OVERDUE' | 'FAILED';
  failure_detail: string | null;
};

type InducedAnnotation = {
  mode: InduceFailureMode;
  detail: string;
  inducedAt: string;
  configPath?: string;
  configBackupPath?: string;
};

/** Runtime config (configureBackupAlerting / env / secrets). */
let runtimeConfig: AlertConfig = {
  webhookUrl: '',
  overdueMs: DEFAULT_OVERDUE_MS,
};

/** In-process annotations for silent-failure modes (test + induce path). */
const inducedByJob = new Map<string, InducedAnnotation>();

/** Durable annotations so CLI induce + CLI/launchd sweep share mode keywords. */
function inducedStorePath(repoRoot = resolveRepoRoot()): string {
  return (
    process.env.BACKUP_ALERT_INDUCED_PATH?.trim() ||
    resolve(repoRoot, '.tmp/backup-alert-induced.json')
  );
}

function loadInducedStore(): Record<string, InducedAnnotation> {
  const path = inducedStorePath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, InducedAnnotation>;
  } catch {
    return {};
  }
}

function saveInducedStore(store: Record<string, InducedAnnotation>): void {
  const path = inducedStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function rememberInduced(jobName: string, ann: InducedAnnotation): void {
  inducedByJob.set(jobName, ann);
  const store = loadInducedStore();
  store[jobName] = ann;
  saveInducedStore(store);
}

function lookupInduced(jobName: string): InducedAnnotation | undefined {
  const mem = inducedByJob.get(jobName);
  if (mem) return mem;
  const store = loadInducedStore();
  const fromDisk = store[jobName];
  if (fromDisk) {
    inducedByJob.set(jobName, fromDisk);
    return fromDisk;
  }
  return undefined;
}

function run(
  cmd: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number }
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    env: options?.env ?? process.env,
    timeout: options?.timeoutMs ?? 30_000,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  return {
    status: r.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

function resolveOverdueMs(explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return Math.trunc(explicit);
  }
  const fromEnv = Number(process.env.BACKUP_ALERT_OVERDUE_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.trunc(fromEnv);
  if (runtimeConfig.overdueMs > 0) return runtimeConfig.overdueMs;
  return DEFAULT_OVERDUE_MS;
}

/** Resolve webhook POST timeout (default 10s; env BACKUP_ALERT_WEBHOOK_TIMEOUT_MS). */
export function resolveWebhookTimeoutMs(explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return Math.trunc(explicit);
  }
  const fromEnv = Number(process.env.BACKUP_ALERT_WEBHOOK_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.trunc(fromEnv);
  return DEFAULT_WEBHOOK_TIMEOUT_MS;
}

/**
 * Host-only redaction for ALERT_WEBHOOK_URL surfaces (Error.message, errors[], CLI/json).
 * Strips path / query / hash / userinfo so Slack/Discord path tokens never land in logs.
 * F-11 / REDHAT-FIX-S27-11 — CAP-BAK-01 credentials-never-in-logs.
 */
export function redactWebhookUrlForLog(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '[empty-webhook-url]';
  try {
    const u = new URL(trimmed);
    // scheme + hostname only (drop port, path, query, hash, credentials)
    return `${u.protocol}//${u.hostname}`;
  } catch {
    // Never echo unparseable strings that may embed secrets.
    return '[invalid-webhook-url]';
  }
}

/**
 * F-12 scheme gate before fetch: allow https always; allow http only for loopback.
 * Rejects remote cleartext and non-http(s) schemes fail-closed with host-only errors.
 */
export function assertAlertWebhookUrlAllowed(raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('ALERT_WEBHOOK_URL is not configured — cannot deliver backup alert');
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error(
      `ALERT_WEBHOOK_URL is not a valid URL (redacted=${redactWebhookUrlForLog(trimmed)})`
    );
  }
  const scheme = u.protocol.replace(/:$/, '').toLowerCase();
  // Normalize IPv6 bracket form for loopback check.
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (scheme === 'https') return;
  if (scheme === 'http' && isLoopback) return;
  throw new Error(
    `ALERT_WEBHOOK_URL rejected: only https (or http loopback) allowed; got url=${redactWebhookUrlForLog(trimmed)}`
  );
}

/** Replace any occurrence of the raw webhook URL in a free-form error string. */
function scrubWebhookUrlFromMessage(message: string, rawUrl: string): string {
  const redacted = redactWebhookUrlForLog(rawUrl);
  if (!rawUrl) return message;
  let out = message;
  if (out.includes(rawUrl)) {
    out = out.split(rawUrl).join(redacted);
  }
  // Also scrub common URL-encoding variants of path secrets when present as full string.
  try {
    const encoded = encodeURI(rawUrl);
    if (encoded !== rawUrl && out.includes(encoded)) {
      out = out.split(encoded).join(redacted);
    }
  } catch {
    /* ignore encode failures */
  }
  return out;
}

/**
 * Resolve ALERT_WEBHOOK_URL: explicit configure > env > secrets store.
 * Never hardcodes a default sink.
 */
export function resolveAlertWebhookUrl(options?: {
  env?: NodeJS.ProcessEnv;
  secretsPath?: string;
}): string {
  if (runtimeConfig.webhookUrl.trim()) return runtimeConfig.webhookUrl.trim();
  const env = options?.env ?? process.env;
  const fromEnv = env.ALERT_WEBHOOK_URL?.trim();
  if (fromEnv) return fromEnv;
  const fromSecrets = getSecretValue('ALERT_WEBHOOK_URL', {
    secretsPath: options?.secretsPath,
    env,
  });
  return fromSecrets?.trim() ?? '';
}

/**
 * Wire webhook URL + overdue threshold for the in-process sweep (RED test harness).
 */
export async function configureBackupAlerting(opts: {
  webhookUrl: string;
  overdueMs?: number;
}): Promise<void> {
  runtimeConfig = {
    webhookUrl: opts.webhookUrl.trim(),
    overdueMs: resolveOverdueMs(opts.overdueMs),
  };
  if (opts.webhookUrl.trim()) {
    process.env.ALERT_WEBHOOK_URL = opts.webhookUrl.trim();
  }
  if (typeof opts.overdueMs === 'number' && Number.isFinite(opts.overdueMs)) {
    process.env.BACKUP_ALERT_OVERDUE_MS = String(Math.trunc(opts.overdueMs));
  }
}

function parseSuccessMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function detailForMode(mode: InduceFailureMode, jobName: string): string {
  switch (mode) {
    case 'kill_wal_behind':
      return `killed / WAL behind — archive job ${jobName} stopped updating heartbeat`;
    case 'credential_expired':
      return `credential expired — R2 auth denied for job ${jobName}`;
    case 'config_removed':
      return `overdue: config removed — backup config missing for job ${jobName}`;
    default: {
      const _exhaustive: never = mode;
      return `unknown failure mode for ${jobName}: ${String(_exhaustive)}`;
    }
  }
}

/**
 * Classify a single heartbeat row against the overdue threshold.
 * Real math on last_success_at — never fake-healthy from a cache.
 */
export function classifyHeartbeat(
  row: BackupHeartbeatRecord,
  nowMs: number = Date.now(),
  overdueMs: number = resolveOverdueMs()
): JobHealth {
  const successMs = parseSuccessMs(row.last_success_at);
  const age_ms = successMs === null ? null : Math.max(0, nowMs - successMs);
  const is_failed = (row.status ?? '').toLowerCase() === 'failed';
  // Overdue: no success ever, or last success older than threshold.
  // Null last_success_at with non-success status is overdue (silent absence).
  const is_overdue =
    successMs === null
      ? (row.status ?? '').toLowerCase() !== 'success'
      : age_ms !== null && age_ms > overdueMs;
  const overdue_by_minutes =
    successMs === null
      ? Math.ceil(overdueMs / 60_000)
      : age_ms !== null && age_ms > overdueMs
        ? Math.max(1, Math.floor(age_ms / 60_000))
        : 0;

  const induced = lookupInduced(row.job_name);
  let failure_detail: string | null = induced?.detail ?? null;
  if (!failure_detail) {
    if (is_failed && is_overdue) {
      failure_detail = `failed + overdue: last_success_at age ${overdue_by_minutes}m`;
    } else if (is_failed) {
      failure_detail = 'failed';
    } else if (is_overdue) {
      failure_detail = `overdue: last_success_at age ${overdue_by_minutes}m exceeds threshold`;
    }
  }

  const healthy = !is_failed && !is_overdue && (row.status ?? '').toLowerCase() === 'success';
  const flag: JobHealth['flag'] = is_failed ? 'FAILED' : is_overdue ? 'OVERDUE' : 'OK';

  return {
    job_name: row.job_name,
    status: row.status,
    last_success_at: row.last_success_at,
    last_wal_segment: row.last_wal_segment,
    last_snapshot_id: row.last_snapshot_id,
    trace_id: row.trace_id,
    age_ms,
    overdue_by_minutes,
    is_overdue,
    is_failed,
    healthy,
    flag,
    failure_detail,
  };
}

/** Real DB query — list + classify all heartbeats. */
export async function queryBackupJobHealth(options?: {
  sql?: Sql;
  overdueMs?: number;
  nowMs?: number;
}): Promise<JobHealth[]> {
  const overdueMs = resolveOverdueMs(options?.overdueMs);
  const nowMs = options?.nowMs ?? Date.now();
  const rows = await listBackupHeartbeats(options?.sql);
  return rows.map((r) => classifyHeartbeat(r, nowMs, overdueMs));
}

/**
 * SQL-shaped overdue/failed selection (parity with contract query).
 * Uses the same classifier so null last_success_at is not silent-healthy.
 */
export async function selectOverdueOrFailed(options?: {
  sql?: Sql;
  overdueMs?: number;
  nowMs?: number;
}): Promise<JobHealth[]> {
  const all = await queryBackupJobHealth(options);
  return all.filter((j) => j.is_overdue || j.is_failed);
}

function buildPayload(job: JobHealth, nowIso: string): BackupAlertPayload {
  const reason: AlertReason = job.is_failed ? 'failed' : 'overdue';
  const failure_reason =
    job.failure_detail ??
    (reason === 'failed' ? 'failed' : `overdue: age ${job.overdue_by_minutes}m`);
  return {
    job_name: job.job_name,
    job_id: job.job_name,
    reason,
    failure_reason,
    last_success_at: job.last_success_at,
    overdue_by_minutes: job.overdue_by_minutes,
    last_wal_segment: job.last_wal_segment,
    last_snapshot_id: job.last_snapshot_id,
    trace_id: job.trace_id,
    timestamp: nowIso,
    status: job.status,
  };
}

/**
 * POST one alert to the real webhook sink. Never swallows delivery errors —
 * throws so callers/tests observe failed delivery (STRICT: not log-only).
 *
 * F-16: AbortController bounds fetch time (~10s default) so a black-holed
 * webhook cannot hang alert-sweep / verify:backup forever. Timeout aborts throw.
 */
export async function postBackupAlert(
  payload: BackupAlertPayload,
  webhookUrl?: string,
  options?: { timeoutMs?: number }
): Promise<{ ok: true; status: number; body: string }> {
  const url = (webhookUrl ?? resolveAlertWebhookUrl()).trim();
  if (!url) {
    throw new Error('ALERT_WEBHOOK_URL is not configured — cannot deliver backup alert');
  }
  // F-12: scheme gate before fetch (host-only reject messages).
  assertAlertWebhookUrlAllowed(url);
  const safeUrl = redactWebhookUrlForLog(url);
  const timeoutMs = resolveWebhookTimeoutMs(options?.timeoutMs);
  // Redact: payload never includes secrets (only job metadata + timestamps).
  // Delivery still uses the UNREDACTED url so path tokens work for real webhooks.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      // F-11: never interpolate raw url (path/token) into Error.message.
      throw new Error(
        `backup alert webhook POST failed: HTTP ${res.status} ${body.slice(0, 200)} url=${safeUrl}`
      );
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    // Normalize abort/timeout so sweep error accounting + tests see a clear failure.
    const name = err instanceof Error ? err.name : '';
    const msg = err instanceof Error ? err.message : String(err);
    if (name === 'AbortError' || /abort|timeout/i.test(msg)) {
      throw new Error(
        `backup alert webhook POST timed out after ${timeoutMs}ms (abort/timeout) url=${safeUrl}`,
        { cause: err instanceof Error ? err : undefined }
      );
    }
    // Re-throw our own controlled errors as-is (already host-redacted).
    if (err instanceof Error && msg.includes(`url=${safeUrl}`)) {
      throw err;
    }
    // Network/fetch errors may embed the full URL — scrub before surfacing.
    const scrubbed = scrubWebhookUrlFromMessage(msg, url);
    throw new Error(`backup alert webhook POST failed: ${scrubbed} url=${safeUrl}`, {
      cause: err instanceof Error ? err : undefined,
    });
  } finally {
    clearTimeout(timer);
  }
}

export type AlertSweepResult = {
  alerted: number;
  posts: BackupAlertPayload[];
  healthy: number;
  total: number;
  webhookUrl: string;
  overdueMs: number;
  errors: string[];
};

/**
 * One alert sweep: real backup_heartbeat query → POST each overdue/failed job.
 * Healthy runs return alerted=0 (silence proof).
 */
export async function runBackupAlertSweep(options?: {
  sql?: Sql;
  webhookUrl?: string;
  overdueMs?: number;
  nowMs?: number;
}): Promise<AlertSweepResult> {
  const overdueMs = resolveOverdueMs(options?.overdueMs);
  const webhookUrl = (options?.webhookUrl ?? resolveAlertWebhookUrl()).trim();
  // F-11: result.webhookUrl / launchd-log surfaces are host-only; fetch still uses full URL.
  const safeWebhookUrl = webhookUrl ? redactWebhookUrlForLog(webhookUrl) : '';
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const errors: string[] = [];

  const client = options?.sql ?? createSql();
  const owns = !options?.sql;
  const posts: BackupAlertPayload[] = [];
  let healthy = 0;
  let total = 0;

  try {
    await ensureBackupHeartbeatTable(client);
    const jobs = await queryBackupJobHealth({ sql: client, overdueMs, nowMs });
    total = jobs.length;
    const bad = jobs.filter((j) => j.is_overdue || j.is_failed);
    healthy = jobs.length - bad.length;

    if (bad.length === 0) {
      return {
        alerted: 0,
        posts: [],
        healthy,
        total,
        webhookUrl: safeWebhookUrl,
        overdueMs,
        errors,
      };
    }

    if (!webhookUrl) {
      // Never suppress: surface as hard error so verify/CI fail closed.
      throw new Error(
        `ALERT_WEBHOOK_URL missing but ${bad.length} overdue/failed backup job(s) need alerting`
      );
    }

    // F-17 / REDHAT-FIX-S27-15: continue past a single webhook failure so remaining
    // overdue/failed jobs still POST. Collect errors; fail-closed once after the loop.
    for (const job of bad) {
      const payload = buildPayload(job, nowIso);
      try {
        await postBackupAlert(payload, webhookUrl);
        posts.push(payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Defense-in-depth: scrub raw URL if a future throw path embeds it.
        errors.push(`${job.job_name}: ${scrubWebhookUrlFromMessage(msg, webhookUrl)}`);
        // Continue — do not rethrow here (would skip remaining jobs).
      }
    }

    const result: AlertSweepResult = {
      alerted: posts.length,
      posts,
      healthy,
      total,
      webhookUrl: safeWebhookUrl,
      overdueMs,
      errors,
    };

    if (errors.length > 0) {
      // Fail closed after attempting every bad job so callers cannot treat partial
      // delivery as full success. Attach result for structured inspection (CLI/tests).
      const err = new Error(
        `backup alert-sweep: ${errors.length} webhook delivery failure(s): ${errors.join(' | ')}`
      ) as Error & { result: AlertSweepResult };
      err.name = 'BackupAlertSweepPartialFailureError';
      err.result = result;
      throw err;
    }

    return result;
  } finally {
    if (owns) await client.end({ timeout: 5 });
  }
}

/**
 * Seed a healthy success heartbeat for the given job (anti-fake-healthy silence proof).
 * Scoped to the requested job_name (or all jobs when jobId is 'all'/'*') so this is
 * not an unscoped silent-healthy weapon. Also restores any config removed by induction
 * and clears induced annotations.
 */
/** Production / harness jobs that backup:healthy --all may reset without break-glass. */
export const HEALTHY_ALL_JOB_ALLOWLIST = [
  'wal_archive',
  'base_backup',
  'restic_blob_mirror',
  // RED suite / harness isolation rows (D04-01) — not production canaries.
  'cleanup',
  'wal_archive-healthy',
  'base_backup-healthy',
  'restic_blob_mirror-healthy',
] as const;

/** Test/harness job_name prefixes eligible for delete-or-success on scoped --all. */
export const HEALTHY_ALL_TEST_PREFIXES = [
  's27-',
  'redhat-fix-',
  'all-clear',
  'healthy-',
  'gate-',
] as const;

/**
 * Break-glass env for unscoped full-table success refresh (REDHAT-FIX-S27-19 / R-5).
 * Without this env, --all only touches allowlist + test-prefix rows.
 */
export const HEALTHY_ALL_BREAK_GLASS_ENV = 'BACKUP_HEALTHY_ALL_BREAK_GLASS';

export function isHealthyAllTestJob(jobName: string): boolean {
  return HEALTHY_ALL_TEST_PREFIXES.some((p) => jobName.startsWith(p) || jobName === p);
}

export function isHealthyAllAllowlistedJob(jobName: string): boolean {
  return (
    (HEALTHY_ALL_JOB_ALLOWLIST as readonly string[]).includes(jobName) ||
    isHealthyAllTestJob(jobName)
  );
}

export function isHealthyAllBreakGlassEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[HEALTHY_ALL_BREAK_GLASS_ENV]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export async function runHealthyBackupJob(
  jobId: string,
  options?: { env?: NodeJS.ProcessEnv }
): Promise<{ status: string; heartbeat: BackupHeartbeatRecord }> {
  const env = options?.env ?? process.env;
  // Restore any config files left removed by config_removed induction.
  restoreAllInducedConfigs();

  // Clear durable + in-memory induced modes (silence requires zero failure annotations).
  const clearAll = jobId === 'all' || jobId === '*';
  if (clearAll) {
    inducedByJob.clear();
    saveInducedStore({});
  } else {
    inducedByJob.delete(jobId);
    const store = loadInducedStore();
    delete store[jobId];
    saveInducedStore(store);
  }

  const sql = createSql();
  try {
    await ensureBackupHeartbeatTable(sql);
    // Single-statement refresh — all targeted rows share the same now() so none
    // drift past a 1s CI overdue window between writes.
    // REDHAT-FIX-S27-19 / R-5: default --all is SCOPED (allowlist + test prefixes).
    // Unscoped full-table UPDATE requires BACKUP_HEALTHY_ALL_BREAK_GLASS=1.
    if (clearAll) {
      if (isHealthyAllBreakGlassEnabled(env)) {
        await sql`
          UPDATE backup_heartbeat
          SET
            status = 'success',
            last_success_at = now(),
            updated_at = now()
        `;
      } else {
        const allow = [...HEALTHY_ALL_JOB_ALLOWLIST];
        await sql`
          UPDATE backup_heartbeat
          SET
            status = 'success',
            last_success_at = now(),
            updated_at = now()
          WHERE job_name = ANY(${allow})
             OR job_name LIKE ${'s27-%'}
             OR job_name LIKE ${'redhat-fix-%'}
             OR job_name LIKE ${'all-clear%'}
             OR job_name LIKE ${'healthy-%'}
             OR job_name LIKE ${'gate-%'}
             OR job_name LIKE ${'%-healthy'}
        `;
      }
    } else {
      await sql`
        UPDATE backup_heartbeat
        SET
          status = 'success',
          last_success_at = now(),
          updated_at = now()
        WHERE job_name = ${jobId}
      `;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const heartbeat = await upsertBackupHeartbeat({
    jobName: clearAll ? 'wal_archive' : jobId,
    status: 'success',
    lastSuccessAt: new Date(),
    lastWalSegment: (clearAll ? 'wal_archive' : jobId).startsWith('wal')
      ? '000000010000000000000001'
      : null,
    lastSnapshotId:
      (clearAll ? '' : jobId).includes('base') || (clearAll ? '' : jobId).includes('restic')
        ? 'healthy-snap'
        : null,
    objectCount: 1,
    traceId: `healthy-${Date.now().toString(16)}`,
  });
  return { status: 'success', heartbeat };
}

function restoreAllInducedConfigs(): void {
  const store = loadInducedStore();
  for (const ann of Object.values(store)) {
    if (ann.configPath && ann.configBackupPath) {
      restoreResticMirrorConfig({
        config_path: ann.configPath,
        backup_path: ann.configBackupPath,
      });
      // Also handle generic rename restore (pgbackrest conf etc.)
      if (existsSync(ann.configBackupPath) && !existsSync(ann.configPath)) {
        try {
          renameSync(ann.configBackupPath, ann.configPath);
        } catch {
          /* best-effort */
        }
      }
    }
  }
}

/**
 * Synthetic heartbeat poison ONLY — labeled path for fast CI sweep-unit mechanics.
 * NEVER the sole production-truth proof for D04-01 REAL induction (REDHAT-FIX-S27-01).
 * Prefer induceBackupFailure without synthetic:true which exercises real faults.
 */
export async function induceBackupFailureSynthetic(
  mode: InduceFailureMode,
  jobId: string,
  options?: { overdueMs?: number }
): Promise<{
  job_name: string;
  mode: InduceFailureMode;
  heartbeat: BackupHeartbeatRecord;
  induction: InduceEvidence;
}> {
  const overdueMs = resolveOverdueMs(options?.overdueMs);
  const stale = new Date(Date.now() - overdueMs - 60_000);
  const detail = `[synthetic_poison] ${detailForMode(mode, jobId)}`;
  rememberInduced(jobId, {
    mode,
    detail,
    inducedAt: new Date().toISOString(),
  });

  let status: 'failed' | 'success' = 'failed';
  if (mode === 'config_removed') {
    status = 'success';
  }

  const heartbeat = await upsertBackupHeartbeat({
    jobName: jobId,
    status,
    lastSuccessAt: stale,
    // Sentinel IDs are intentionally synthetic — documented as non-production-truth.
    lastWalSegment: mode === 'kill_wal_behind' ? '00000001000000000000DEAD' : null,
    lastSnapshotId:
      mode === 'credential_expired'
        ? 'cred-expired-snap'
        : mode === 'config_removed'
          ? 'pre-removal-snap'
          : null,
    objectCount: 0,
    traceId: `synthetic-induce-${mode}-${Date.now().toString(16)}`,
    forceClearSuccess: false,
  });

  return {
    job_name: jobId,
    mode,
    heartbeat,
    induction: {
      path: 'synthetic_poison',
      real_process_killed: false,
      pid_killed: null,
      production_catch: false,
      exit_code: null,
      real_auth_fault: false,
      config_removed: false,
      config_path: null,
      config_exists_after: true,
      binary: null,
      failure_detail: detail,
      restored: false,
      fault_output: null,
      heartbeat_via_production_writer: false,
    },
  };
}

/**
 * Induce one of the three PRD silent-failure modes via REAL operational faults
 * (production-truth default):
 *  (a) kill / WAL behind → kill real pgbackrest-related process; production catch
 *      writes status=failed (wal-archive.ts)
 *  (b) credential expired → invalid R2 keys; real pgbackrest auth fault; production
 *      catch writes status=failed (base-backup.ts)
 *  (c) config removed → rename real restic/pgbackrest config; pure overdue (stale
 *      last_success_at, status stays success) or job fail without success advance
 *
 * Optional `synthetic: true` keeps the legacy heartbeat-poison harness for sweep-unit
 * mechanics ONLY — never claim it as D04-01 REAL induction proof.
 */
export async function induceBackupFailure(
  mode: InduceFailureMode,
  jobId: string,
  options?: {
    overdueMs?: number;
    /** When true, use synthetic heartbeat poison (honest dual-path; not production-truth). */
    synthetic?: boolean;
    env?: NodeJS.ProcessEnv;
  }
): Promise<{
  job_name: string;
  mode: InduceFailureMode;
  heartbeat: BackupHeartbeatRecord;
  induction: InduceEvidence;
}> {
  if (options?.synthetic === true || process.env.BACKUP_INDUCE_SYNTHETIC === '1') {
    return induceBackupFailureSynthetic(mode, jobId, options);
  }

  const overdueMs = resolveOverdueMs(options?.overdueMs);
  const env = options?.env ?? process.env;
  const detail = detailForMode(mode, jobId);
  const stale = new Date(Date.now() - overdueMs - 60_000);

  if (mode === 'kill_wal_behind') {
    const result = await runWalArchiveJob({ env, induceFault: 'kill' });
    const hb =
      result.heartbeat ??
      (await getBackupHeartbeat('wal_archive')) ??
      (await upsertBackupHeartbeat({
        jobName: jobId || 'wal_archive',
        status: 'failed',
        traceId: result.span?.traceId ?? `induce-kill-${Date.now().toString(16)}`,
      }));
    // Re-key annotation onto the requested job id (usually wal_archive).
    const targetJob = jobId || 'wal_archive';
    if (targetJob !== 'wal_archive' && result.heartbeat) {
      // Job-specific induce for non-default names: copy failed status via production-style upsert.
      await upsertBackupHeartbeat({
        jobName: targetJob,
        status: 'failed',
        lastWalSegment: result.heartbeat.last_wal_segment,
        objectCount: result.heartbeat.object_count,
        traceId: result.heartbeat.trace_id,
      });
    }
    rememberInduced(targetJob, {
      mode,
      detail,
      inducedAt: new Date().toISOString(),
    });
    // Ensure the requested job heartbeat is failed (production writer already did wal_archive).
    const heartbeat =
      targetJob === 'wal_archive' ? hb : ((await getBackupHeartbeat(targetJob)) ?? hb);

    const induction: InduceEvidence = {
      path: 'production_truth',
      real_process_killed: Boolean(result.killEvidence?.real_process_killed),
      pid_killed: result.killEvidence?.pid_killed ?? null,
      // REDHAT-FIX-S27-18: only natural try/catch sets production_catch — never OR with status==failed.
      production_catch: result.production_catch === true,
      kill_kind: result.killEvidence?.kill_kind ?? null,
      mid_archive: result.killEvidence?.mid_archive === true,
      exit_code: result.killEvidence?.exit_code ?? null,
      real_auth_fault: false,
      config_removed: false,
      config_path: null,
      config_exists_after: true,
      binary: result.killEvidence?.binary ?? null,
      failure_detail: detail,
      restored: false,
      fault_output: result.killEvidence?.fault_output ?? result.errors.join('; ').slice(0, 500),
      heartbeat_via_production_writer: Boolean(result.heartbeat),
    };

    // Production-truth kill requires a real OS kill (staged_shell/direct_binary OK).
    // production_catch alone (without kill) is insufficient for mode=kill.
    if (!induction.real_process_killed) {
      throw new Error(
        'kill induction failed: no real process kill — refuse synthetic / production_catch theatre'
      );
    }
    if (induction.mid_archive === true && induction.kill_kind !== 'mid_archive') {
      throw new Error(
        'kill induction dishonest: mid_archive claimed without kill_kind=mid_archive'
      );
    }

    return { job_name: targetJob, mode, heartbeat, induction };
  }

  if (mode === 'credential_expired') {
    const targetJob = jobId || 'base_backup';
    const result = await runBaseBackupJob({
      env,
      induceFault: 'credential_expired',
      ensureArchive: false,
    });
    rememberInduced(targetJob, {
      mode,
      detail,
      inducedAt: new Date().toISOString(),
    });
    let heartbeat = result.heartbeat;
    if (!heartbeat || targetJob !== 'base_backup') {
      heartbeat = await upsertBackupHeartbeat({
        jobName: targetJob,
        status: 'failed',
        lastSnapshotId: result.lastSnapshotId,
        objectCount: result.r2BackupObjectCount,
        traceId: result.span?.traceId ?? `induce-cred-${Date.now().toString(16)}`,
      });
    }
    // Prefer production writer row when job is base_backup.
    if (targetJob === 'base_backup' && result.heartbeat) {
      heartbeat = result.heartbeat;
    }

    const faultBlob = `${result.fault_output ?? ''}\n${result.errors.join('; ')}`;
    const induction: InduceEvidence = {
      path: 'production_truth',
      real_process_killed: false,
      pid_killed: null,
      production_catch: result.production_catch === true || result.status === 'failed',
      exit_code: result.exitCode,
      real_auth_fault:
        result.real_auth_fault === true ||
        /credential|expired|denied|403|401|InvalidAccessKeyId|AccessDenied|auth/i.test(faultBlob),
      config_removed: false,
      config_path: null,
      config_exists_after: true,
      binary: 'pgbackrest',
      failure_detail: detail,
      restored: false,
      fault_output: (result.fault_output ?? faultBlob).slice(0, 800),
      heartbeat_via_production_writer:
        result.production_catch === true || Boolean(result.heartbeat),
    };

    if (!induction.real_auth_fault && result.exitCode === 0 && result.status === 'success') {
      throw new Error(
        'credential induction failed: job stayed healthy — refuse silent-healthy theatre'
      );
    }

    return { job_name: targetJob, mode, heartbeat, induction };
  }

  // config_removed — real filesystem removal + pure overdue (stale last_success_at)
  const targetJob = jobId || 'restic_blob_mirror';
  let configPath: string;
  let backupPath: string | null = null;
  let removed = false;

  if (targetJob.includes('restic') || targetJob === 'restic_blob_mirror') {
    ensureResticMirrorConfigFile();
    const rem = removeResticMirrorConfig();
    configPath = rem.config_path;
    backupPath = rem.backup_path;
    removed = rem.removed;
    // Exercise production job against missing config (must not advance success).
    await runResticBlobMirror({ env, induceFault: 'config_removed', resticConfigPath: configPath });
  } else {
    // pgbackrest conf path for wal/base jobs
    configPath =
      process.env.PGBACKREST_CONFIG?.trim() || defaultPgbackrestConfigPath(resolveRepoRoot());
    // Fallback to main checkout conf when worktree has no local conf (gitignored).
    if (!existsSync(configPath)) {
      const mainConf = resolve(
        resolveRepoRoot(),
        '../../..',
        'services/platform/config/pgbackrest/pgbackrest.conf'
      );
      // worktree is .../holocron/.kb-run-sprint/worktrees/<id> → ../../../ = holocron
      const alt = existsSync(mainConf)
        ? mainConf
        : resolve(
            homedir(),
            'Projects/holocron/services/platform/config/pgbackrest/pgbackrest.conf'
          );
      if (existsSync(alt)) configPath = alt;
    }
    if (!existsSync(configPath)) {
      // Create a real config marker then remove it (still a real FS fault).
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, '# induced config for config_removed proof\nrequired=true\n', {
        mode: 0o600,
      });
    }
    backupPath = `${configPath}.induced-removed`;
    if (existsSync(backupPath)) rmSync(backupPath, { force: true });
    renameSync(configPath, backupPath);
    removed = !existsSync(configPath) && existsSync(backupPath);
  }

  rememberInduced(targetJob, {
    mode,
    detail,
    inducedAt: new Date().toISOString(),
    configPath,
    configBackupPath: backupPath ?? undefined,
  });

  // Pure overdue seed: status=success with stale last_success_at (not failed-only theatre).
  // Config is actually gone so the job cannot advance success.
  // Non-null lastSnapshotId overwrites prior synthetic pre-removal-snap (COALESCE).
  const heartbeat = await upsertBackupHeartbeat({
    jobName: targetJob,
    status: 'success',
    lastSuccessAt: stale,
    lastSnapshotId: 'config-absent',
    objectCount: 0,
    traceId: `induce-config-removed-${Date.now().toString(16)}`,
    forceClearSuccess: false,
  });

  const existsAfter = existsSync(configPath);
  const induction: InduceEvidence = {
    path: 'production_truth',
    real_process_killed: false,
    pid_killed: null,
    production_catch: false,
    exit_code: null,
    real_auth_fault: false,
    config_removed: removed && !existsAfter,
    config_path: configPath,
    config_exists_after: existsAfter,
    binary: null,
    failure_detail: detail,
    restored: false,
    fault_output: removed
      ? `config renamed to ${backupPath}`
      : `failed to remove config at ${configPath}`,
    heartbeat_via_production_writer: false,
  };

  if (!induction.config_removed) {
    throw new Error(
      `config_removed induction failed: config still present at ${configPath} — refuse poison-only theatre`
    );
  }

  return { job_name: targetJob, mode, heartbeat, induction };
}

export type VerifyBackupResult = {
  ok: boolean;
  exitCode: number;
  jobs: JobHealth[];
  overdueOrFailed: JobHealth[];
  overdueMs: number;
};

/** CI gate: exit 1 if any heartbeat is overdue or failed. */
export async function verifyBackupHealth(options?: {
  sql?: Sql;
  overdueMs?: number;
}): Promise<VerifyBackupResult> {
  const overdueMs = resolveOverdueMs(options?.overdueMs);
  const jobs = await queryBackupJobHealth({ sql: options?.sql, overdueMs });
  const overdueOrFailed = jobs.filter((j) => j.is_overdue || j.is_failed);
  const ok = overdueOrFailed.length === 0;
  return {
    ok,
    exitCode: ok ? 0 : 1,
    jobs,
    overdueOrFailed,
    overdueMs,
  };
}

export function formatBackupStatusText(jobs: JobHealth[]): string {
  const lines = ['holo backup:status — heartbeat health'];
  if (jobs.length === 0) {
    lines.push('  (no backup_heartbeat rows)');
  }
  for (const j of jobs) {
    lines.push(
      `  ${j.job_name}: last_success_at=${j.last_success_at ?? 'null'} status=${j.status ?? 'null'} ${j.flag}` +
        (j.flag !== 'OK' ? ` overdue_by_minutes=${j.overdue_by_minutes}` : '')
    );
  }
  const bad = jobs.filter((j) => !j.healthy).length;
  lines.push(`  overall: ${bad === 0 ? 'OK' : `FAILED (${bad} overdue/failed)`}`);
  return lines.join('\n');
}

export function formatVerifyBackupText(result: VerifyBackupResult): string {
  const lines = [
    'holo verify:backup',
    `  overdue_ms: ${result.overdueMs}`,
    `  jobs:       ${result.jobs.length}`,
    `  bad:        ${result.overdueOrFailed.length}`,
  ];
  for (const j of result.jobs) {
    lines.push(
      `  ${j.job_name}: last_success_at=${j.last_success_at ?? 'null'} status=${j.status ?? 'null'} ${j.flag}`
    );
  }
  lines.push(`  overall:    ${result.ok ? 'OK' : 'FAILED'}`);
  return lines.join('\n');
}

export type AlertLaunchdInstallResult = {
  ok: boolean;
  label: string;
  plistPath: string;
  domain: string;
  intervalSeconds: number;
  bootstrapped: boolean;
  /** Alias of bootstrapped for CLI/gate consumers that check loaded:true. */
  loaded: boolean;
  /** True when ALERT_WEBHOOK_URL was resolved and wired into the installed plist. Never holds the raw URL. */
  webhookConfigured: boolean;
  messages: string[];
};

/** Escape XML text for plist <string> values (URLs may contain &). Never log secrets. */
function escapePlistXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render absolute-path launchd plist for the alert sweep (operator-runnable). */
export function renderAlertSweepPlist(options: {
  home: string;
  holoRoot: string;
  bunBin: string;
  databaseUrl: string;
  /** Resolved at install time from env/secrets — standing daemon cannot rely on interactive shell alone. */
  alertWebhookUrl: string;
  intervalSeconds: number;
  /**
   * REDHAT-FIX-S27-23 / R-10: when false (default for install), omit ALERT_WEBHOOK_URL from
   * LaunchAgent EnvironmentVariables so the path token never lands on disk. Runtime resolves
   * from secrets store via resolveAlertWebhookUrl. Set true only for explicit legacy/test embeds
   * that also force 0o600 plist mode.
   */
  includeAlertWebhookEnv?: boolean;
}): string {
  const bunDir = dirname(options.bunBin);
  const logDir = resolve(options.home, 'Library/Logs/holocron');
  const interval = Math.min(
    Math.max(30, Math.trunc(options.intervalSeconds)),
    ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS
  );
  const home = escapePlistXml(options.home);
  const holoRoot = escapePlistXml(options.holoRoot);
  const bunBin = escapePlistXml(options.bunBin);
  const bunDirEsc = escapePlistXml(bunDir);
  const databaseUrl = escapePlistXml(options.databaseUrl);
  const alertWebhookUrl = escapePlistXml(options.alertWebhookUrl);
  const logDirEsc = escapePlistXml(logDir);
  const includeWebhook =
    options.includeAlertWebhookEnv === true && options.alertWebhookUrl.length > 0;
  const webhookEnvXml = includeWebhook
    ? `		<key>ALERT_WEBHOOK_URL</key>
		<string>${alertWebhookUrl}</string>
`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!--
  holocron-backup-alert-sweep — D04-05 backup overdue/failed alert dispatcher
  Runs: bun holo.ts backup:alert-sweep --json
  StartInterval=${interval}s (≤5m so alerts land inside the 15 min SLA).
  ALERT_WEBHOOK_URL expanded at install time from env > secrets (standing daemon env).
  Portable deploy template keeps @ALERT_WEBHOOK_URL@ — never commit live tokens.
-->
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${ALERT_SWEEP_LAUNCHD_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${bunBin}</string>
		<string>${holoRoot}/services/platform/src/cli/holo.ts</string>
		<string>backup:alert-sweep</string>
		<string>--json</string>
	</array>
	<key>WorkingDirectory</key>
	<string>${holoRoot}</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>HOME</key>
		<string>${home}</string>
		<key>PATH</key>
		<string>${bunDirEsc}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
		<key>HOLO_ROOT</key>
		<string>${holoRoot}</string>
		<key>DATABASE_URL</key>
		<string>${databaseUrl}</string>
${webhookEnvXml}	</dict>
	<key>RunAtLoad</key>
	<false/>
	<key>StartInterval</key>
	<integer>${interval}</integer>
	<key>KeepAlive</key>
	<false/>
	<key>ProcessType</key>
	<string>Background</string>
	<key>StandardOutPath</key>
	<string>${logDirEsc}/backup-alert-sweep.out.log</string>
	<key>StandardErrorPath</key>
	<string>${logDirEsc}/backup-alert-sweep.err.log</string>
</dict>
</plist>
`;
}

function emptyInstallResult(
  partial: Omit<AlertLaunchdInstallResult, 'ok' | 'label' | 'loaded' | 'webhookConfigured'> & {
    ok?: boolean;
    webhookConfigured?: boolean;
  }
): AlertLaunchdInstallResult {
  const bootstrapped = partial.bootstrapped;
  return {
    ok: partial.ok ?? false,
    label: ALERT_SWEEP_LAUNCHD_LABEL,
    plistPath: partial.plistPath,
    domain: partial.domain,
    intervalSeconds: partial.intervalSeconds,
    bootstrapped,
    loaded: bootstrapped,
    webhookConfigured: partial.webhookConfigured ?? false,
    messages: partial.messages,
  };
}

/**
 * Install + optionally bootstrap the launchd alert-sweep schedule (≤5 min).
 * Also writes the portable template under deploy/launchd for version control.
 *
 * Fail-closed when ALERT_WEBHOOK_URL cannot be resolved — a mute standing daemon
 * is not production-ready (REDHAT-FIX-S27-10 / CAP-BAK-01).
 */
export function installAlertSweepLaunchd(options?: {
  env?: NodeJS.ProcessEnv;
  intervalSeconds?: number;
  holoRoot?: string;
  launchAgentsDir?: string;
  bootstrap?: boolean;
  /** Override secrets file for resolveAlertWebhookUrl (tests). */
  secretsPath?: string;
  /** When false, skip rewriting deploy/launchd portable template. Default true. */
  writeTemplate?: boolean;
}): AlertLaunchdInstallResult {
  const env = options?.env ?? process.env;
  const home = env.HOME ?? homedir();
  const holoRoot = options?.holoRoot ?? resolveRepoRoot();
  const requested = options?.intervalSeconds ?? ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS;
  const intervalSeconds = Math.min(
    Math.max(30, Math.trunc(requested)),
    ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS
  );
  const launchAgentsDir = options?.launchAgentsDir ?? resolve(home, 'Library/LaunchAgents');
  const uid = process.getuid?.() ?? 501;
  const domain = `gui/${uid}`;
  const messages: string[] = [];
  const plistPath = resolve(launchAgentsDir, `${ALERT_SWEEP_LAUNCHD_LABEL}.plist`);

  const alertWebhookUrl = resolveAlertWebhookUrl({
    env,
    secretsPath: options?.secretsPath,
  });
  if (!alertWebhookUrl || alertWebhookUrl.length < 8) {
    return emptyInstallResult({
      ok: false,
      plistPath,
      domain,
      intervalSeconds,
      bootstrapped: false,
      webhookConfigured: false,
      messages: [
        'ALERT_WEBHOOK_URL required — set env or secrets.yaml (min length 8); refusing mute daemon install',
      ],
    });
  }
  // REDHAT-FIX-S27-23 / R-12: scheme gate before writing LaunchAgent artifacts.
  try {
    assertAlertWebhookUrlAllowed(alertWebhookUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return emptyInstallResult({
      ok: false,
      plistPath,
      domain,
      intervalSeconds,
      bootstrapped: false,
      webhookConfigured: false,
      messages: [`ALERT_WEBHOOK_URL scheme rejected: ${msg}`],
    });
  }

  const bunBin =
    env.BUN_BIN?.trim() ||
    run('which', ['bun'], { env }).stdout.trim() ||
    resolve(home, '.bun/bin/bun');
  const databaseUrl = env.DATABASE_URL?.trim() || 'postgres://127.0.0.1:5432/holocron';

  // REDHAT-FIX-S27-23 / R-10: secrets-at-process-start — never embed live path token in plist.
  const body = renderAlertSweepPlist({
    home,
    holoRoot,
    bunBin,
    databaseUrl,
    alertWebhookUrl: '',
    intervalSeconds,
    includeAlertWebhookEnv: false,
  });

  if (options?.writeTemplate !== false) {
    const templateDir = resolve(holoRoot, 'services/platform/deploy/launchd');
    mkdirSync(templateDir, { recursive: true });
    const templatePath = resolve(templateDir, `${ALERT_SWEEP_LAUNCHD_LABEL}.plist`);
    const portable = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!--
  holocron-backup-alert-sweep — D04-05 backup overdue/failed alert dispatcher
  Runs: bun holo.ts backup:alert-sweep --json
  StartInterval=${intervalSeconds}s (≤5m so alerts land inside the 15 min SLA).
  ALERT_WEBHOOK_URL expanded at install time from env > secrets — never commit live tokens.
  Placeholders: @HOME@ @HOLO_ROOT@ @BUN_BIN@ @BUN_DIR@ @DATABASE_URL@ @ALERT_WEBHOOK_URL@
-->
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${ALERT_SWEEP_LAUNCHD_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>@BUN_BIN@</string>
		<string>@HOLO_ROOT@/services/platform/src/cli/holo.ts</string>
		<string>backup:alert-sweep</string>
		<string>--json</string>
	</array>
	<key>WorkingDirectory</key>
	<string>@HOLO_ROOT@</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>HOME</key>
		<string>@HOME@</string>
		<key>PATH</key>
		<string>@BUN_DIR@:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
		<key>HOLO_ROOT</key>
		<string>@HOLO_ROOT@</string>
		<key>DATABASE_URL</key>
		<string>@DATABASE_URL@</string>
		<key>ALERT_WEBHOOK_URL</key>
		<string>@ALERT_WEBHOOK_URL@</string>
	</dict>
	<key>RunAtLoad</key>
	<false/>
	<key>StartInterval</key>
	<integer>${intervalSeconds}</integer>
	<key>KeepAlive</key>
	<false/>
	<key>ProcessType</key>
	<string>Background</string>
	<key>StandardOutPath</key>
	<string>@HOME@/Library/Logs/holocron/backup-alert-sweep.out.log</string>
	<key>StandardErrorPath</key>
	<string>@HOME@/Library/Logs/holocron/backup-alert-sweep.err.log</string>
</dict>
</plist>
`;
    writeFileSync(templatePath, portable, 'utf8');
    messages.push(`wrote template ${templatePath}`);
  }

  mkdirSync(launchAgentsDir, { recursive: true });
  mkdirSync(resolve(home, 'Library/Logs/holocron'), { recursive: true });
  writeFileSync(plistPath, body, { encoding: 'utf8', mode: 0o600 });
  messages.push(`installed ${plistPath} (mode 0o600)`);
  messages.push(
    'webhook secrets-at-process-start (ALERT_WEBHOOK_URL omitted from plist; value redacted)'
  );

  const lint = run('/usr/bin/plutil', ['-lint', plistPath], { env });
  if (lint.status !== 0) {
    return emptyInstallResult({
      ok: false,
      plistPath,
      domain,
      intervalSeconds,
      bootstrapped: false,
      webhookConfigured: true,
      messages: [...messages, `plutil lint failed: ${lint.stderr || lint.stdout}`],
    });
  }

  let bootstrapped = false;
  if (options?.bootstrap !== false) {
    run('launchctl', ['bootout', `${domain}/${ALERT_SWEEP_LAUNCHD_LABEL}`], { env });
    const boot = run('launchctl', ['bootstrap', domain, plistPath], { env });
    if (boot.status !== 0) {
      const load = run('launchctl', ['load', '-w', plistPath], { env });
      if (load.status !== 0) {
        messages.push(
          `bootstrap failed: ${(boot.stderr || load.stderr || boot.stdout).slice(0, 300)}`
        );
        return emptyInstallResult({
          ok: false,
          plistPath,
          domain,
          intervalSeconds,
          bootstrapped: false,
          webhookConfigured: true,
          messages,
        });
      }
      messages.push(`loaded ${ALERT_SWEEP_LAUNCHD_LABEL}`);
    } else {
      messages.push(`bootstrapped ${domain}/${ALERT_SWEEP_LAUNCHD_LABEL}`);
    }
    bootstrapped = true;
  }

  return emptyInstallResult({
    ok: true,
    plistPath,
    domain,
    intervalSeconds,
    bootstrapped,
    webhookConfigured: true,
    messages,
  });
}

export function formatAlertLaunchdInstallText(result: AlertLaunchdInstallResult): string {
  return [
    'holo backup:alert-sweep --install-schedule',
    `  label:     ${result.label}`,
    `  plist:     ${result.plistPath}`,
    `  domain:    ${result.domain}`,
    `  interval:  ${result.intervalSeconds}s (≤300s D04-05 cadence)`,
    `  loaded:    ${result.loaded || result.bootstrapped}`,
    `  webhook:   ${result.webhookConfigured ? 'configured (env wired)' : 'MISSING — not production-ready'}`,
    ...result.messages.map((m) => `  - ${m}`),
    `  overall:   ${result.ok ? 'OK' : 'FAILED'}`,
  ].join('\n');
}

export function readAlertSweepSchedule(options?: {
  launchAgentsDir?: string;
  env?: NodeJS.ProcessEnv;
}): { installed: boolean; plistPath: string; intervalSeconds: number | null; loaded: boolean } {
  const env = options?.env ?? process.env;
  const home = env.HOME ?? homedir();
  const dir = options?.launchAgentsDir ?? resolve(home, 'Library/LaunchAgents');
  const plistPath = resolve(dir, `${ALERT_SWEEP_LAUNCHD_LABEL}.plist`);
  if (!existsSync(plistPath)) {
    return { installed: false, plistPath, intervalSeconds: null, loaded: false };
  }
  const text = readFileSync(plistPath, 'utf8');
  const m = text.match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/);
  const uid = process.getuid?.() ?? 501;
  const print = run('launchctl', ['print', `gui/${uid}/${ALERT_SWEEP_LAUNCHD_LABEL}`], { env });
  return {
    installed: true,
    plistPath,
    intervalSeconds: m ? Number(m[1]) : null,
    loaded: print.status === 0,
  };
}

/** Map CLI --mode tokens onto InduceFailureMode. */
export function parseInduceMode(raw: string): InduceFailureMode {
  const m = raw.trim().toLowerCase().replace(/_/g, '-');
  if (m === 'kill' || m === 'kill-wal-behind' || m === 'wal-behind' || m === 'wal') {
    return 'kill_wal_behind';
  }
  if (m === 'credential-expired' || m === 'credential' || m === 'expired' || m === 'creds') {
    return 'credential_expired';
  }
  if (m === 'config-removed' || m === 'config' || m === 'removed' || m === 'overdue') {
    return 'config_removed';
  }
  throw new Error(
    `unknown induce mode: ${raw} (expected kill | credential-expired | config-removed)`
  );
}
