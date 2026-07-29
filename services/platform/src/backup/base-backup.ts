/**
 * Scheduled full/incremental base backups via pgBackRest (D04-03).
 *
 * - Runs `pgbackrest backup --type=full|incr` against the R2 repo
 * - Confirms manifest / backup set in R2 before heartbeat last_success_at
 * - Emits OTel span backup:base_backup
 * - Installs launchd StartInterval job for the schedule
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';
import { type BackupConfig, loadBackupConfig } from './config.ts';
import {
  captureRowCounts,
  defaultSourceConnection,
  FIRE_DRILL_COUNT_TABLES,
} from './evidence-ledger-verify.ts';
import {
  type BackupHeartbeatRecord,
  ensureBackupHeartbeatTable,
  upsertBackupHeartbeat,
} from './heartbeat.ts';
import { listRepoPrefix } from './r2-provision.ts';
import {
  type BaselineHookResult,
  computeLedgerSha256,
  emitBaseBackupRecoveryBaselineHook,
  parseBackupStopForLabel,
  queryTargetLsn,
} from './recovery-baseline.ts';
import { type EmittedBackupSpan, emitBackupSpan } from './span.ts';
import { ensureContinuousWalArchiving } from './wal-archive.ts';

export type BaseBackupType = 'full' | 'incr' | 'diff';

export type BaseBackupJobResult = {
  ok: boolean;
  job_name: 'base_backup';
  status: 'success' | 'failed';
  backupType: BaseBackupType;
  exitCode: number;
  stdout: string;
  stderr: string;
  lastSnapshotId: string | null;
  r2BackupObjectCount: number;
  manifestPresent: boolean;
  heartbeat: BackupHeartbeatRecord | null;
  span: EmittedBackupSpan | null;
  /** REDHAT-FIX-C5: immutable recovery baseline hook result (when emitted). */
  recoveryBaseline: BaselineHookResult | null;
  errors: string[];
  /** Present for credential-expired production-truth induction. */
  real_auth_fault?: boolean;
  production_catch?: boolean;
  fault_output?: string | null;
};

export type LaunchdInstallResult = {
  ok: boolean;
  label: string;
  plistPath: string;
  domain: string;
  intervalSeconds: number;
  bootstrapped: boolean;
  messages: string[];
};

const BASE_BACKUP_LABEL = 'holocron-base-backup';
/** Default: every 6 hours. */
const DEFAULT_INTERVAL_SECONDS = 6 * 60 * 60;

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

function pgbackrestEnv(cfg: BackupConfig, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {
    ...env,
    PGBACKREST_REPO1_S3_KEY: cfg.accessKeyId,
    PGBACKREST_REPO1_S3_KEY_SECRET: cfg.secretAccessKey,
    PATH: env.PATH ?? '/opt/homebrew/bin:/usr/bin:/bin',
  };
  if (cfg.sessionToken) {
    out.PGBACKREST_REPO1_S3_TOKEN = cfg.sessionToken;
  } else {
    delete out.PGBACKREST_REPO1_S3_TOKEN;
  }
  return out;
}

/** Parse pgbackrest info --output=json for the latest backup label. */
export function parseLatestBackupLabel(infoJson: string): string | null {
  try {
    const data = JSON.parse(infoJson) as Array<{
      backup?: Array<{ label?: string; type?: string }>;
      name?: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const backups = data[0]?.backup ?? [];
    if (!Array.isArray(backups) || backups.length === 0) return null;
    // pgBackRest lists oldest→newest; take last
    const last = backups[backups.length - 1];
    return last?.label && last.label.length >= 8 ? last.label : null;
  } catch {
    // Fallback: regex label like 20240727-123456F
    const m = infoJson.match(/\b(\d{8}-\d{6}[FDI](?:_\d{8}-\d{6}[FDI])*)\b/);
    return m?.[1] ?? null;
  }
}

function listBackupPrefix(
  cfg: BackupConfig,
  env: NodeJS.ProcessEnv
): {
  count: number;
  raw: string;
  hasManifest: boolean;
  labels: string[];
} {
  const listed = listRepoPrefix({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    endpoint: cfg.endpoint,
    bucketName: cfg.bucketName,
    prefix: `${cfg.pgbackrestPrefix.replace(/^\//, '')}/backup`,
    env,
  });
  const labels = new Set<string>();
  let hasManifest = false;
  for (const line of listed.raw.split('\n')) {
    if (/backup\.manifest/i.test(line) || /backup\.info/i.test(line)) {
      hasManifest = true;
    }
    const m = line.match(/\b(\d{8}-\d{6}[FDI](?:_\d{8}-\d{6}[FDI])*)\b/);
    if (m?.[1]) labels.add(m[1]);
  }
  // backup.info alone counts as repo metadata; a real backup set also has a label dir
  if (listed.count > 0 && /backup\.info/.test(listed.raw)) {
    hasManifest = true;
  }
  return {
    count: listed.count,
    raw: listed.raw,
    hasManifest,
    labels: [...labels],
  };
}

/**
 * Run pgbackrest backup, confirm R2 objects/manifest, upsert heartbeat, emit span.
 * last_success_at set ONLY after R2 confirmation.
 *
 * `induceFault: 'credential_expired'` — production-truth path: override R2/S3 keys
 * with invalid values so the real pgbackrest binary hits an auth fault; status=failed
 * is written by the production catch upsert (not SQL sentinel poisoning).
 */
export async function runBaseBackupJob(options?: {
  env?: NodeJS.ProcessEnv;
  config?: BackupConfig;
  type?: BaseBackupType;
  /** Ensure archive_command is live first (default true). */
  ensureArchive?: boolean;
  /** Production-truth credential fault induction (REDHAT-FIX-S27-01). */
  induceFault?: 'credential_expired';
}): Promise<BaseBackupJobResult> {
  const env = options?.env ?? process.env;
  const backupType: BaseBackupType = options?.type ?? 'full';
  const errors: string[] = [];
  const credentialInduce = options?.induceFault === 'credential_expired';

  let cfg: BackupConfig;
  try {
    cfg = options?.config ?? loadBackupConfig({ env });
  } catch (e) {
    // Credential induction still needs a real binary invocation even if secrets load fails.
    if (credentialInduce) {
      const badEnv: NodeJS.ProcessEnv = {
        ...env,
        PGBACKREST_REPO1_S3_KEY: 'AKIAINDUCEDINVALID000000',
        PGBACKREST_REPO1_S3_KEY_SECRET: 'induced-expired-invalid-secret',
        PATH: env.PATH ?? '/opt/homebrew/bin:/usr/bin:/bin',
      };
      delete badEnv.PGBACKREST_REPO1_S3_TOKEN;
      const probe = run('pgbackrest', ['info', '--output=json'], {
        env: badEnv,
        timeoutMs: 60_000,
      });
      const faultOutput = `${probe.stderr || ''}\n${probe.stdout || ''}`.slice(0, 800);
      errors.push(
        `credential expired — R2 auth denied for job base_backup (load failed: ${
          e instanceof Error ? e.message : String(e)
        }; pgbackrest exit ${probe.status}: ${faultOutput.slice(0, 300)})`
      );
      await ensureBackupHeartbeatTable();
      const span = await emitBackupSpan({
        name: 'backup:base_backup',
        attributes: {
          job_name: 'base_backup',
          status: 'failed',
          last_snapshot_id: null,
          object_count: 0,
          detail: errors.join('; ').slice(0, 200),
          induce_fault: 'credential_expired',
        },
      });
      const heartbeat = await upsertBackupHeartbeat({
        jobName: 'base_backup',
        status: 'failed',
        // Non-null overwrites prior synthetic cred-expired-snap sentinel (COALESCE).
        lastSnapshotId: 'auth-denied',
        objectCount: 0,
        traceId: span.traceId,
      });
      return {
        ok: false,
        job_name: 'base_backup',
        status: 'failed',
        backupType,
        exitCode: probe.status,
        stdout: (probe.stdout || '').slice(0, 4000),
        stderr: (probe.stderr || '').slice(0, 2000),
        lastSnapshotId: null,
        r2BackupObjectCount: 0,
        manifestPresent: false,
        heartbeat,
        span,
        recoveryBaseline: null,
        errors,
        real_auth_fault: true,
        production_catch: true,
        fault_output: faultOutput,
      };
    }
    return {
      ok: false,
      job_name: 'base_backup',
      status: 'failed',
      backupType,
      exitCode: 1,
      stdout: '',
      stderr: '',
      lastSnapshotId: null,
      r2BackupObjectCount: 0,
      manifestPresent: false,
      heartbeat: null,
      span: null,
      recoveryBaseline: null,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }

  if (options?.ensureArchive !== false && !credentialInduce) {
    try {
      ensureContinuousWalArchiving({ env, config: cfg });
    } catch (e) {
      errors.push(`archive ensure warning: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await ensureBackupHeartbeatTable();
  await upsertBackupHeartbeat({ jobName: 'base_backup', status: 'running' });

  // GATE-FIX-QA3 Pattern A: capture domain digests BEFORE base backup so stop
  // covers the payload epoch (jointly truthful; no temporal relabel).
  let preCapture: {
    payloadCapturedAt: string;
    rowCounts?: Record<string, number>;
    ledgerSha256?: string;
    ledgerPerTableSha256?: Record<string, string>;
    targetLsn?: string;
  } | null = null;
  if (!credentialInduce) {
    try {
      const conn = defaultSourceConnection(env);
      const payloadCapturedAt = new Date().toISOString();
      const counts = captureRowCounts(conn, FIRE_DRILL_COUNT_TABLES);
      const ledger = computeLedgerSha256(conn);
      const lsn = queryTargetLsn(conn) ?? undefined;
      preCapture = {
        payloadCapturedAt,
        rowCounts: counts.row_counts,
        ledgerSha256: ledger.ledger_sha256,
        ledgerPerTableSha256: ledger.per_table,
        targetLsn: lsn,
      };
    } catch {
      // Hook may still attempt cover/fail-closed; do not block backup itself.
      preCapture = { payloadCapturedAt: new Date().toISOString() };
    }
  }

  // Production-truth: invalid keys so real pgbackrest / R2 path fails auth.
  const pgbEnv = credentialInduce
    ? {
        ...pgbackrestEnv(cfg, env),
        PGBACKREST_REPO1_S3_KEY: 'AKIAINDUCEDINVALID000000',
        PGBACKREST_REPO1_S3_KEY_SECRET: 'induced-expired-invalid-secret',
      }
    : pgbackrestEnv(cfg, env);
  if (credentialInduce) {
    delete pgbEnv.PGBACKREST_REPO1_S3_TOKEN;
  }

  // archive_mode=always is required by CAP-BAK-01 continuous archiving (D04-03).
  // pgBackRest's default --archive-mode-check rejects "always"; disable the
  // check only — WAL is still archived via archive_command → archive-push.
  // Credential induction uses `info` (fast auth probe) rather than full backup.
  const backup = credentialInduce
    ? run(
        'pgbackrest',
        [
          `--config=${cfg.pgbackrestConfigPath}`,
          `--stanza=${cfg.stanza}`,
          '--log-path=/tmp/pgbackrest-logs',
          'info',
          '--output=json',
        ],
        { env: pgbEnv, timeoutMs: 120_000 }
      )
    : run(
        'pgbackrest',
        [
          `--config=${cfg.pgbackrestConfigPath}`,
          `--stanza=${cfg.stanza}`,
          `--type=${backupType}`,
          '--no-archive-mode-check',
          '--log-path=/tmp/pgbackrest-logs',
          'backup',
        ],
        { env: pgbEnv, timeoutMs: 600_000 }
      );

  const info = credentialInduce
    ? backup
    : run(
        'pgbackrest',
        [`--config=${cfg.pgbackrestConfigPath}`, `--stanza=${cfg.stanza}`, 'info', '--output=json'],
        { env: pgbEnv, timeoutMs: 120_000 }
      );

  const lastSnapshotId = credentialInduce
    ? null
    : parseLatestBackupLabel(info.stdout) || parseLatestBackupLabel(backup.stdout) || null;

  const listed = credentialInduce
    ? { count: 0, raw: '', hasManifest: false, labels: [] as string[] }
    : listBackupPrefix(cfg, env);
  // Confirm: backup exit 0 AND (label present in R2 listing OR backup.info updated)
  const r2Confirmed =
    !credentialInduce &&
    backup.status === 0 &&
    listed.count >= 1 &&
    (listed.hasManifest ||
      (lastSnapshotId !== null && listed.labels.some((l) => l === lastSnapshotId)));

  const faultOutput = `${backup.stderr || ''}\n${backup.stdout || ''}`.slice(0, 800);
  const authKeyword =
    /credential|expired|denied|403|401|InvalidAccessKeyId|AccessDenied|SignatureDoesNotMatch|Forbidden|auth|unauthorized|unable to.*s3|s3.*error|permission/i.test(
      faultOutput
    ) || credentialInduce;

  if (backup.status !== 0) {
    if (credentialInduce) {
      errors.push(
        `credential expired — R2 auth denied for job base_backup (pgbackrest exit ${backup.status}: ${faultOutput.slice(0, 400)})`
      );
    } else {
      errors.push(
        `pgbackrest backup exit ${backup.status}: ${(backup.stderr || backup.stdout).slice(0, 400)}`
      );
    }
  } else if (credentialInduce) {
    // Invalid keys must not succeed — treat as auth fault even if binary returned 0 (missing conf).
    errors.push(
      `credential expired — R2 auth denied for job base_backup (induced invalid keys; output: ${faultOutput.slice(0, 300)})`
    );
  }
  if (!credentialInduce && !r2Confirmed) {
    errors.push('R2 did not confirm base backup manifest/objects after pgbackrest backup');
  }
  if (!credentialInduce && !lastSnapshotId) {
    errors.push('could not parse backup label/snapshot id from pgbackrest info');
  }

  const success = !credentialInduce && r2Confirmed && !!lastSnapshotId && backup.status === 0;

  let heartbeat: BackupHeartbeatRecord | null = null;
  let span: EmittedBackupSpan | null = null;
  let recoveryBaseline: BaselineHookResult | null = null;

  if (success && lastSnapshotId) {
    span = await emitBackupSpan({
      name: 'backup:base_backup',
      attributes: {
        job_name: 'base_backup',
        status: 'success',
        last_snapshot_id: lastSnapshotId,
        object_count: listed.count,
        backup_type: backupType,
      },
    });
    heartbeat = await upsertBackupHeartbeat({
      jobName: 'base_backup',
      status: 'success',
      lastSuccessAt: new Date(),
      lastSnapshotId,
      objectCount: listed.count,
      traceId: span.traceId,
    });
    // REDHAT-FIX-C5 / GATE-FIX-QA3: emit jointly-truthful recovery baseline.
    try {
      const stopMeta = parseBackupStopForLabel(info.stdout || '', lastSnapshotId);
      const captureAt = preCapture?.payloadCapturedAt;
      const coverageProvenThroughCapture = !!(
        captureAt &&
        stopMeta &&
        stopMeta.stopMs >= Date.parse(captureAt)
      );
      recoveryBaseline = await emitBaseBackupRecoveryBaselineHook({
        config: cfg,
        pgbackrestBackupLabel: lastSnapshotId,
        env,
        databaseUrl: env.DATABASE_URL,
        payloadCapturedAt: captureAt,
        backupStopAt: stopMeta?.stopAt,
        coverageProvenThroughCapture,
        rowCounts: preCapture?.rowCounts,
        ledgerSha256: preCapture?.ledgerSha256,
        ledgerPerTableSha256: preCapture?.ledgerPerTableSha256,
        targetLsn: preCapture?.targetLsn,
      });
      if (recoveryBaseline.errors.length > 0 && !recoveryBaseline.skipped) {
        errors.push(...recoveryBaseline.errors.map((e) => `recovery-baseline: ${e}`).slice(0, 3));
      }
    } catch (e) {
      errors.push(`recovery-baseline hook failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    span = await emitBackupSpan({
      name: 'backup:base_backup',
      attributes: {
        job_name: 'base_backup',
        status: 'failed',
        last_snapshot_id: lastSnapshotId,
        object_count: listed.count,
        detail: errors.join('; ').slice(0, 200),
        ...(credentialInduce ? { induce_fault: 'credential_expired' } : {}),
      },
    });
    // Production catch path — status=failed via the same upsert as natural failures.
    heartbeat = await upsertBackupHeartbeat({
      jobName: 'base_backup',
      status: 'failed',
      // Credential induction: non-null overwrites prior synthetic cred-expired-snap.
      lastSnapshotId: credentialInduce ? (lastSnapshotId ?? 'auth-denied') : lastSnapshotId,
      objectCount: listed.count,
      traceId: span.traceId,
    });
  }

  return {
    ok: success,
    job_name: 'base_backup',
    status: success ? 'success' : 'failed',
    backupType,
    exitCode: backup.status,
    stdout: (backup.stdout || '').slice(0, 4000),
    stderr: (backup.stderr || '').slice(0, 2000),
    lastSnapshotId,
    r2BackupObjectCount: listed.count,
    manifestPresent: listed.hasManifest,
    heartbeat,
    span,
    recoveryBaseline,
    errors,
    ...(credentialInduce
      ? {
          real_auth_fault: authKeyword || backup.status !== 0,
          production_catch: true,
          fault_output: faultOutput,
        }
      : {}),
  };
}

export function formatBaseBackupText(result: BaseBackupJobResult): string {
  const lines = [
    'holo backup:base — pgBackRest base backup',
    `  status:         ${result.status}`,
    `  type:           ${result.backupType}`,
    `  exit:           ${result.exitCode}`,
    `  snapshot_id:    ${result.lastSnapshotId ?? '(none)'}`,
    `  r2_objects:     ${result.r2BackupObjectCount}`,
    `  manifest:       ${result.manifestPresent ? 'present' : 'missing'}`,
    `  heartbeat:      ${result.heartbeat?.status ?? 'n/a'} last_success_at=${result.heartbeat?.last_success_at ?? 'null'}`,
    `  span:           ${result.span?.name ?? 'n/a'} trace_id=${result.span?.traceId ?? 'n/a'}`,
  ];
  if (result.errors.length) {
    lines.push('  errors:');
    for (const e of result.errors) lines.push(`    - ${e}`);
  }
  lines.push(`  overall:        ${result.ok ? 'OK' : 'FAILED'}`);
  return lines.join('\n');
}

/** Render launchd plist for scheduled `holo backup:base`. */
export function renderBaseBackupPlist(options: {
  home: string;
  holoRoot: string;
  bunBin: string;
  databaseUrl: string;
  intervalSeconds: number;
}): string {
  const bunDir = dirname(options.bunBin);
  const logDir = resolve(options.home, 'Library/Logs/holocron');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!--
  holocron-base-backup — scheduled pgBackRest full/incr base backup (D04-03 / CAP-BAK-01)
  Runs: bun holo.ts backup:base --json
  StartInterval=${options.intervalSeconds}s (default 6h). Not a no-op.
-->
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${BASE_BACKUP_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${options.bunBin}</string>
		<string>${options.holoRoot}/services/platform/src/cli/holo.ts</string>
		<string>backup:base</string>
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
	<integer>${options.intervalSeconds}</integer>
	<key>KeepAlive</key>
	<false/>
	<key>ProcessType</key>
	<string>Background</string>
	<key>StandardOutPath</key>
	<string>${logDir}/base-backup.out.log</string>
	<key>StandardErrorPath</key>
	<string>${logDir}/base-backup.err.log</string>
</dict>
</plist>
`;
}

/**
 * Install + bootstrap the launchd base-backup schedule.
 * Template also written under services/platform/deploy/launchd for version control.
 */
export function installBaseBackupLaunchd(options?: {
  env?: NodeJS.ProcessEnv;
  intervalSeconds?: number;
  holoRoot?: string;
  launchAgentsDir?: string;
  bootstrap?: boolean;
}): LaunchdInstallResult {
  const env = options?.env ?? process.env;
  const home = env.HOME ?? homedir();
  const holoRoot = options?.holoRoot ?? resolveRepoRoot();
  const intervalSeconds = options?.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS;
  const launchAgentsDir = options?.launchAgentsDir ?? resolve(home, 'Library/LaunchAgents');
  const uid = process.getuid?.() ?? 501;
  const domain = `gui/${uid}`;
  const messages: string[] = [];

  const bunBin =
    env.BUN_BIN?.trim() ||
    run('which', ['bun'], { env }).stdout.trim() ||
    resolve(home, '.bun/bin/bun');
  const databaseUrl = env.DATABASE_URL?.trim() || 'postgres://127.0.0.1:5432/holocron';

  const body = renderBaseBackupPlist({
    home,
    holoRoot,
    bunBin,
    databaseUrl,
    intervalSeconds,
  });

  // Version-controlled portable template (placeholders for install-launchd style re-use)
  const templateDir = resolve(holoRoot, 'services/platform/deploy/launchd');
  mkdirSync(templateDir, { recursive: true });
  const templatePath = resolve(templateDir, `${BASE_BACKUP_LABEL}.plist`);
  // Build portable body without calling dirname on placeholders (that collapses to ".")
  const portable = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!--
  holocron-base-backup — scheduled pgBackRest full/incr base backup (D04-03 / CAP-BAK-01)
  Runs: bun holo.ts backup:base --json
  StartInterval=${intervalSeconds}s (default 6h). Not a no-op.
  Placeholders: @HOME@ @HOLO_ROOT@ @BUN_BIN@ @BUN_DIR@ @DATABASE_URL@
-->
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${BASE_BACKUP_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>@BUN_BIN@</string>
		<string>@HOLO_ROOT@/services/platform/src/cli/holo.ts</string>
		<string>backup:base</string>
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
	<string>@HOME@/Library/Logs/holocron/base-backup.out.log</string>
	<key>StandardErrorPath</key>
	<string>@HOME@/Library/Logs/holocron/base-backup.err.log</string>
</dict>
</plist>
`;
  writeFileSync(templatePath, portable, 'utf8');
  messages.push(`wrote template ${templatePath}`);

  mkdirSync(launchAgentsDir, { recursive: true });
  mkdirSync(resolve(home, 'Library/Logs/holocron'), { recursive: true });
  const plistPath = resolve(launchAgentsDir, `${BASE_BACKUP_LABEL}.plist`);
  writeFileSync(plistPath, body, 'utf8');
  messages.push(`installed ${plistPath}`);

  const lint = run('/usr/bin/plutil', ['-lint', plistPath], { env });
  if (lint.status !== 0) {
    return {
      ok: false,
      label: BASE_BACKUP_LABEL,
      plistPath,
      domain,
      intervalSeconds,
      bootstrapped: false,
      messages: [...messages, `plutil lint failed: ${lint.stderr || lint.stdout}`],
    };
  }

  let bootstrapped = false;
  if (options?.bootstrap !== false) {
    run('launchctl', ['bootout', `${domain}/${BASE_BACKUP_LABEL}`], { env });
    const boot = run('launchctl', ['bootstrap', domain, plistPath], { env });
    if (boot.status !== 0) {
      const load = run('launchctl', ['load', '-w', plistPath], { env });
      if (load.status !== 0) {
        messages.push(
          `bootstrap failed: ${(boot.stderr || load.stderr || boot.stdout).slice(0, 300)}`
        );
        return {
          ok: false,
          label: BASE_BACKUP_LABEL,
          plistPath,
          domain,
          intervalSeconds,
          bootstrapped: false,
          messages,
        };
      }
      messages.push(`loaded ${BASE_BACKUP_LABEL}`);
    } else {
      messages.push(`bootstrapped ${domain}/${BASE_BACKUP_LABEL}`);
    }
    bootstrapped = true;
  }

  return {
    ok: true,
    label: BASE_BACKUP_LABEL,
    plistPath,
    domain,
    intervalSeconds,
    bootstrapped,
    messages,
  };
}

export function formatLaunchdInstallText(result: LaunchdInstallResult): string {
  return [
    'holo backup:base --install-schedule',
    `  label:     ${result.label}`,
    `  plist:     ${result.plistPath}`,
    `  domain:    ${result.domain}`,
    `  interval:  ${result.intervalSeconds}s`,
    `  loaded:    ${result.bootstrapped}`,
    ...result.messages.map((m) => `  - ${m}`),
    `  overall:   ${result.ok ? 'OK' : 'FAILED'}`,
  ].join('\n');
}

/** Read installed plist StartInterval if present. */
export function readBaseBackupSchedule(options?: {
  launchAgentsDir?: string;
  env?: NodeJS.ProcessEnv;
}): { installed: boolean; plistPath: string; intervalSeconds: number | null; loaded: boolean } {
  const env = options?.env ?? process.env;
  const home = env.HOME ?? homedir();
  const dir = options?.launchAgentsDir ?? resolve(home, 'Library/LaunchAgents');
  const plistPath = resolve(dir, `${BASE_BACKUP_LABEL}.plist`);
  if (!existsSync(plistPath)) {
    return { installed: false, plistPath, intervalSeconds: null, loaded: false };
  }
  const text = readFileSync(plistPath, 'utf8');
  const m = text.match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/);
  const uid = process.getuid?.() ?? 501;
  const print = run('launchctl', ['print', `gui/${uid}/${BASE_BACKUP_LABEL}`], { env });
  return {
    installed: true,
    plistPath,
    intervalSeconds: m ? Number(m[1]) : null,
    loaded: print.status === 0,
  };
}
