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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { getSecretValue, resolveRepoRoot } from '../config/secrets.ts';
import { createSql, type Sql } from '../db/client.ts';
import {
  type BackupHeartbeatRecord,
  ensureBackupHeartbeatTable,
  listBackupHeartbeats,
  upsertBackupHeartbeat,
} from './heartbeat.ts';

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
  const timeoutMs = resolveWebhookTimeoutMs(options?.timeoutMs);
  // Redact: payload never includes secrets (only job metadata + timestamps).
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
      throw new Error(
        `backup alert webhook POST failed: HTTP ${res.status} ${body.slice(0, 200)} url=${url}`
      );
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    // Normalize abort/timeout so sweep error accounting + tests see a clear failure.
    const name = err instanceof Error ? err.name : '';
    const msg = err instanceof Error ? err.message : String(err);
    if (name === 'AbortError' || /abort|timeout/i.test(msg)) {
      throw new Error(
        `backup alert webhook POST timed out after ${timeoutMs}ms (abort/timeout) url=${url}`,
        { cause: err instanceof Error ? err : undefined }
      );
    }
    throw err;
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
        webhookUrl,
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

    for (const job of bad) {
      const payload = buildPayload(job, nowIso);
      try {
        await postBackupAlert(payload, webhookUrl);
        posts.push(payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${job.job_name}: ${msg}`);
        // Re-throw after collecting so a partial sweep still fails closed.
        throw err;
      }
    }

    return {
      alerted: posts.length,
      posts,
      healthy,
      total,
      webhookUrl,
      overdueMs,
      errors,
    };
  } finally {
    if (owns) await client.end({ timeout: 5 });
  }
}

/**
 * Seed a healthy success heartbeat for the given job (anti-fake-healthy silence proof).
 * Bulk-refreshes every existing row to success+now in one statement so short CI
 * overdue thresholds (e.g. BACKUP_ALERT_OVERDUE_MS=1000) cannot false-positive
 * from sequential upsert latency, and clears induced annotations.
 */
export async function runHealthyBackupJob(
  jobId: string
): Promise<{ status: string; heartbeat: BackupHeartbeatRecord }> {
  // Clear durable + in-memory induced modes (silence requires zero failure annotations).
  inducedByJob.clear();
  saveInducedStore({});

  const sql = createSql();
  try {
    await ensureBackupHeartbeatTable(sql);
    // Single-statement refresh — all rows share the same now() so none drift past
    // a 1s CI overdue window between writes.
    await sql`
      UPDATE backup_heartbeat
      SET
        status = 'success',
        last_success_at = now(),
        updated_at = now()
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const heartbeat = await upsertBackupHeartbeat({
    jobName: jobId,
    status: 'success',
    lastSuccessAt: new Date(),
    lastWalSegment: jobId.startsWith('wal') ? '000000010000000000000001' : null,
    lastSnapshotId: jobId.includes('base') || jobId.includes('restic') ? 'healthy-snap' : null,
    objectCount: 1,
    traceId: `healthy-${Date.now().toString(16)}`,
  });
  return { status: 'success', heartbeat };
}

/**
 * Induce one of the three PRD silent-failure modes by poisoning the heartbeat
 * (and annotating failure_reason keywords the RED oracle matches).
 *
 * Modes stop "healthy" progress the same way real ops failures do:
 *  (a) kill / WAL behind → status=failed + stale last_success_at
 *  (b) credential expired → status=failed + credential keywords
 *  (c) config removed → overdue absence (stale last_success_at, not exit-only)
 */
export async function induceBackupFailure(
  mode: InduceFailureMode,
  jobId: string,
  options?: { overdueMs?: number }
): Promise<{ job_name: string; mode: InduceFailureMode; heartbeat: BackupHeartbeatRecord }> {
  const overdueMs = resolveOverdueMs(options?.overdueMs);
  // Make last_success_at older than threshold so overdue path also fires.
  const stale = new Date(Date.now() - overdueMs - 60_000);
  const detail = detailForMode(mode, jobId);
  rememberInduced(jobId, {
    mode,
    detail,
    inducedAt: new Date().toISOString(),
  });

  let status: 'failed' | 'success' = 'failed';
  // config_removed exercises pure overdue (heartbeat stops updating — not only job-exit).
  if (mode === 'config_removed') {
    status = 'success'; // last success was real; then config vanished → no further updates
  }

  const heartbeat = await upsertBackupHeartbeat({
    jobName: jobId,
    status,
    lastSuccessAt: stale,
    lastWalSegment: mode === 'kill_wal_behind' ? '00000001000000000000DEAD' : null,
    lastSnapshotId:
      mode === 'credential_expired'
        ? 'cred-expired-snap'
        : mode === 'config_removed'
          ? 'pre-removal-snap'
          : null,
    objectCount: 0,
    traceId: `induce-${mode}-${Date.now().toString(16)}`,
    forceClearSuccess: false,
  });

  return { job_name: jobId, mode, heartbeat };
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
  messages: string[];
};

/** Render absolute-path launchd plist for the alert sweep. */
export function renderAlertSweepPlist(options: {
  home: string;
  holoRoot: string;
  bunBin: string;
  databaseUrl: string;
  intervalSeconds: number;
}): string {
  const bunDir = dirname(options.bunBin);
  const logDir = resolve(options.home, 'Library/Logs/holocron');
  const interval = Math.min(
    Math.max(30, Math.trunc(options.intervalSeconds)),
    ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!--
  holocron-backup-alert-sweep — D04-05 backup overdue/failed alert dispatcher
  Runs: bun holo.ts backup:alert-sweep --json
  StartInterval=${interval}s (≤5m so alerts land inside the 15 min SLA).
  ALERT_WEBHOOK_URL resolves from env > secrets.yaml (never embedded in plist).
-->
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${ALERT_SWEEP_LAUNCHD_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${options.bunBin}</string>
		<string>${options.holoRoot}/services/platform/src/cli/holo.ts</string>
		<string>backup:alert-sweep</string>
		<string>--json</string>
	</array>
	<key>WorkingDirectory</key>
	<string>${options.holoRoot}</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>HOME</key>
		<string>${options.home}</string>
		<key>PATH</key>
		<string>${bunDir}:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
		<key>HOLO_ROOT</key>
		<string>${options.holoRoot}</string>
		<key>DATABASE_URL</key>
		<string>${options.databaseUrl}</string>
	</dict>
	<key>RunAtLoad</key>
	<false/>
	<key>StartInterval</key>
	<integer>${interval}</integer>
	<key>KeepAlive</key>
	<false/>
	<key>ProcessType</key>
	<string>Background</string>
	<key>StandardOutPath</key>
	<string>${logDir}/backup-alert-sweep.out.log</string>
	<key>StandardErrorPath</key>
	<string>${logDir}/backup-alert-sweep.err.log</string>
</dict>
</plist>
`;
}

/**
 * Install + optionally bootstrap the launchd alert-sweep schedule (≤5 min).
 * Also writes the portable template under deploy/launchd for version control.
 */
export function installAlertSweepLaunchd(options?: {
  env?: NodeJS.ProcessEnv;
  intervalSeconds?: number;
  holoRoot?: string;
  launchAgentsDir?: string;
  bootstrap?: boolean;
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

  const bunBin =
    env.BUN_BIN?.trim() ||
    run('which', ['bun'], { env }).stdout.trim() ||
    resolve(home, '.bun/bin/bun');
  const databaseUrl = env.DATABASE_URL?.trim() || 'postgres://127.0.0.1:5432/holocron';

  const body = renderAlertSweepPlist({
    home,
    holoRoot,
    bunBin,
    databaseUrl,
    intervalSeconds,
  });

  const templateDir = resolve(holoRoot, 'services/platform/deploy/launchd');
  mkdirSync(templateDir, { recursive: true });
  const templatePath = resolve(templateDir, `${ALERT_SWEEP_LAUNCHD_LABEL}.plist`);
  const portable = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!--
  holocron-backup-alert-sweep — D04-05 backup overdue/failed alert dispatcher
  Runs: bun holo.ts backup:alert-sweep --json
  StartInterval=${intervalSeconds}s (≤5m so alerts land inside the 15 min SLA).
  ALERT_WEBHOOK_URL from env > secrets.yaml — never embedded.
  Placeholders: @HOME@ @HOLO_ROOT@ @BUN_BIN@ @BUN_DIR@ @DATABASE_URL@
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

  mkdirSync(launchAgentsDir, { recursive: true });
  mkdirSync(resolve(home, 'Library/Logs/holocron'), { recursive: true });
  const plistPath = resolve(launchAgentsDir, `${ALERT_SWEEP_LAUNCHD_LABEL}.plist`);
  writeFileSync(plistPath, body, 'utf8');
  messages.push(`installed ${plistPath}`);

  const lint = run('/usr/bin/plutil', ['-lint', plistPath], { env });
  if (lint.status !== 0) {
    return {
      ok: false,
      label: ALERT_SWEEP_LAUNCHD_LABEL,
      plistPath,
      domain,
      intervalSeconds,
      bootstrapped: false,
      messages: [...messages, `plutil lint failed: ${lint.stderr || lint.stdout}`],
    };
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
        return {
          ok: false,
          label: ALERT_SWEEP_LAUNCHD_LABEL,
          plistPath,
          domain,
          intervalSeconds,
          bootstrapped: false,
          messages,
        };
      }
      messages.push(`loaded ${ALERT_SWEEP_LAUNCHD_LABEL}`);
    } else {
      messages.push(`bootstrapped ${domain}/${ALERT_SWEEP_LAUNCHD_LABEL}`);
    }
    bootstrapped = true;
  }

  return {
    ok: true,
    label: ALERT_SWEEP_LAUNCHD_LABEL,
    plistPath,
    domain,
    intervalSeconds,
    bootstrapped,
    messages,
  };
}

export function formatAlertLaunchdInstallText(result: AlertLaunchdInstallResult): string {
  return [
    'holo backup:alert-sweep --install-schedule',
    `  label:     ${result.label}`,
    `  plist:     ${result.plistPath}`,
    `  domain:    ${result.domain}`,
    `  interval:  ${result.intervalSeconds}s (≤300s D04-05 cadence)`,
    `  loaded:    ${result.bootstrapped}`,
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
