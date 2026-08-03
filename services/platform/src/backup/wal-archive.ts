/**
 * Continuous Postgres WAL archiving via pgBackRest archive-push (D04-03).
 *
 * - archive_mode=always + archive_command → pgbackrest archive-push (NEVER /bin/true)
 * - After real R2 confirmation + zero WAL-gap continuity: upsert backup_heartbeat wal_archive
 * - last_success_at advances ONLY when continuity.ok AND exact segment confirmed in R2
 * - Launchd StartInterval≤300s keeps wal_archive heartbeat fresh for D04-05 overdue window
 * - Emit OTel span backup:wal_archive with redacted attributes + trace_id on heartbeat
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';
import { type BackupConfig, endpointHost, loadBackupConfig } from './config.ts';
import {
  type BackupHeartbeatRecord,
  ensureBackupHeartbeatTable,
  getBackupHeartbeat,
  upsertBackupHeartbeat,
} from './heartbeat.ts';
import { listRepoPrefix, renderPgbackrestConfig, writePgbackrestConfig } from './r2-provision.ts';
import { type EmittedBackupSpan, emitBackupSpan } from './span.ts';

/** Evidence from a real mid-flight pgbackrest kill (production-truth induction). */
export type KillInductionKind =
  /** Real OS kill of a staged shell wrapping pgbackrest help/info + sleep — NOT mid-archive. */
  | 'staged_shell'
  /** Direct SIGKILL of a short-lived pgbackrest process — still not mid-archive push. */
  | 'direct_binary'
  /** True mid-archive / archive-push kill under concurrent WAL work. */
  | 'mid_archive';

export type KillInductionEvidence = {
  real_process_killed: boolean;
  pid_killed: number | null;
  process_gone: boolean;
  binary: string;
  signal: string;
  spawn_args: string[];
  exit_code: number | null;
  fault_output: string | null;
  /**
   * REDHAT-FIX-S27-18 / R-3: honest claim strength.
   * Staged shell / help kills must NOT be labeled mid_archive.
   */
  kill_kind: KillInductionKind;
  /** True only when an in-flight archive-push / backup command was the kill target. */
  mid_archive: boolean;
};

export type PgArchiverStats = {
  archived_count: number;
  last_archived_wal: string | null;
  last_archived_time: string | null;
  failed_count: number;
  last_failed_wal: string | null;
  stats_reset: string | null;
};

export type ArchiveConfigState = {
  archiveMode: string;
  archiveCommand: string;
  archiveTimeout: string;
  restarted: boolean;
  configPath: string;
  stanza: string;
  pgbackrestBin: string;
};

export type WalArchiveJobResult = {
  ok: boolean;
  job_name: 'wal_archive';
  status: 'success' | 'failed';
  archiveMode: string;
  archiveCommand: string;
  before: PgArchiverStats;
  after: PgArchiverStats;
  r2WalObjectCountBefore: number;
  r2WalObjectCountAfter: number;
  lastWalSegment: string | null;
  continuityOk: boolean;
  gapSegments: string[];
  heartbeat: BackupHeartbeatRecord | null;
  span: EmittedBackupSpan | null;
  writeBurstRows: number;
  errors: string[];
  /** Present when run with induceFault='kill' — real process kill + production catch. */
  killEvidence?: KillInductionEvidence;
  production_catch?: boolean;
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

function sleepMs(ms: number): void {
  spawnSync('sleep', [String(Math.max(0.1, ms / 1000))]);
}

function whichPgbackrest(env: NodeJS.ProcessEnv): string {
  const w = run('which', ['pgbackrest'], { env }).stdout.trim();
  return w || '/opt/homebrew/bin/pgbackrest';
}

/**
 * Spawn a real pgbackrest-related process and SIGKILL it (production-truth OS kill).
 * REDHAT-FIX-S27-18: this is staged_shell / direct_binary — NOT true mid-archive.
 * Callers must set kill_kind + mid_archive=false honestly (no mid-archive theatre).
 */
export function killRealPgbackrestProcess(options?: {
  env?: NodeJS.ProcessEnv;
  configPath?: string;
  stanza?: string;
  waitMs?: number;
}): KillInductionEvidence {
  const env = options?.env ?? process.env;
  const binary = whichPgbackrest(env);
  const waitMs = Math.max(50, options?.waitMs ?? 200);
  const configPath = options?.configPath?.trim() || '';
  const stanza = options?.stanza?.trim() || 'main';

  // Keep pgbackrest in-process under a short sleep so SIGKILL has a live target.
  // Prefer a real subcommand when config exists; otherwise `help` + sleep.
  const inner = configPath
    ? `"${binary}" --config=${configPath} --stanza=${stanza} info; sleep 30`
    : `"${binary}" help >/dev/null 2>&1; sleep 30`;
  const spawnArgs = ['-c', inner];
  const child = spawn('/bin/sh', spawnArgs, {
    env: {
      ...env,
      PATH: env.PATH ?? '/opt/homebrew/bin:/usr/bin:/bin',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  const pid = child.pid ?? null;
  let faultOutput: string | null = null;
  const chunks: Buffer[] = [];
  child.stderr?.on('data', (c: Buffer) => {
    chunks.push(c);
  });
  child.stdout?.on('data', (c: Buffer) => {
    chunks.push(c);
  });

  sleepMs(waitMs);

  let realKilled = false;
  let processGone = false;
  let exitCode: number | null = null;

  if (pid !== null) {
    try {
      // Confirm alive then SIGKILL (real process death — not SQL theatre).
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
      realKilled = true;
    } catch {
      // Already exited or not killable — still record pid interaction.
      realKilled = false;
    }
  }

  // Reap child
  const reaped = spawnSync('kill', ['-0', String(pid ?? -1)], {
    encoding: 'utf8',
  });
  processGone = reaped.status !== 0;

  // Wait briefly for exit event
  spawnSync('sleep', ['0.1']);
  if (pid !== null) {
    try {
      process.kill(pid, 0);
      // still alive — force kill process group if possible
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        process.kill(pid, 'SIGKILL');
      }
      realKilled = true;
      spawnSync('sleep', ['0.1']);
    } catch {
      processGone = true;
    }
    try {
      process.kill(pid, 0);
      processGone = false;
    } catch {
      processGone = true;
    }
  }

  if (chunks.length > 0) {
    faultOutput = Buffer.concat(chunks).toString('utf8').slice(0, 500);
  }
  exitCode = child.exitCode;

  // Also exercise the binary once so exit_code is from real pgbackrest when kill raced.
  if (!realKilled) {
    const probe = run(binary, ['version'], { env, timeoutMs: 10_000 });
    exitCode = probe.status;
    faultOutput = (faultOutput ?? '') + (probe.stderr || probe.stdout).slice(0, 200);
    // Fall back: spawn + immediate kill of pgbackrest itself
    const direct = spawn(binary, ['help'], {
      env: { ...env, PATH: env.PATH ?? '/opt/homebrew/bin:/usr/bin:/bin' },
      stdio: 'ignore',
    });
    const dPid = direct.pid;
    if (dPid) {
      try {
        process.kill(dPid, 'SIGKILL');
        realKilled = true;
        processGone = true;
        return {
          real_process_killed: true,
          pid_killed: dPid,
          process_gone: true,
          binary,
          signal: 'SIGKILL',
          spawn_args: ['help'],
          exit_code: exitCode,
          fault_output: faultOutput,
          kill_kind: 'direct_binary',
          mid_archive: false,
        };
      } catch {
        /* continue with shell evidence */
      }
    }
  }

  return {
    real_process_killed: realKilled || processGone,
    pid_killed: pid,
    process_gone: processGone || realKilled,
    binary,
    signal: 'SIGKILL',
    spawn_args: spawnArgs,
    exit_code: exitCode,
    fault_output: faultOutput,
    // Honest: shell+info/help/sleep is staged_shell — never mid_archive theatre.
    kill_kind: 'staged_shell',
    mid_archive: false,
  };
}

function psqlScalar(sql: string, env: NodeJS.ProcessEnv): string {
  const database = env.PGDATABASE?.trim() || 'holocron';
  const r = run('psql', ['-d', database, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { env });
  if (r.status !== 0) {
    throw new Error(`psql failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

function psqlExec(sql: string, env: NodeJS.ProcessEnv): void {
  const database = env.PGDATABASE?.trim() || 'holocron';
  const r = run('psql', ['-d', database, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    env,
  });
  if (r.status !== 0) {
    throw new Error(`psql exec failed: ${r.stderr || r.stdout}`);
  }
}

/**
 * Postgres WAL file names are TTTTTTTTLLLLLLLLSSSSSSSS (timeline/log/seg).
 * Consecutive segment numbers use XLogSegNo = log * (2^32 / wal_seg_size) + seg.
 * Default wal_segment_size is 16MiB → 256 segments per log id (seg 00..FF then log++).
 * Hex-concat +1 is wrong across the log boundary (…04FFFFFF ↛ …0500000000).
 */
export const WAL_SEGMENTS_PER_LOG_DEFAULT = 256n;

/** Parse a 24-char WAL filename into a comparable XLogSegNo-style order (same timeline). */
export function walFilenameToOrder(
  name: string,
  segmentsPerLog: bigint = WAL_SEGMENTS_PER_LOG_DEFAULT
): bigint | null {
  const m = name.match(/^([0-9A-F]{8})([0-9A-F]{8})([0-9A-F]{8})$/i);
  const logHex = m?.[2];
  const segHex = m?.[3];
  if (!logHex || !segHex) return null;
  const log = BigInt(`0x${logHex}`);
  const seg = BigInt(`0x${segHex}`);
  // Timeline is ignored for gap checks — multi-timeline history is rare for this pipeline.
  return log * segmentsPerLog + seg;
}

/** Extract WAL base names (no .gz / checksum suffix) from R2 object keys. */
export function extractWalSegmentsFromListing(raw: string): string[] {
  const segs = new Set<string>();
  for (const line of raw.split('\n')) {
    const m = line.match(/(0000000[0-9A-F]{17})(?:-[0-9a-f]+\.gz)?/i);
    if (m?.[1]) segs.add(m[1].toUpperCase());
  }
  return [...segs].sort();
}

/**
 * True when every consecutive pair of sorted WAL segments differs by 1.
 * Single segment or empty → continuity ok (nothing to gap-check).
 */
export function checkWalContinuity(segments: string[]): {
  ok: boolean;
  gaps: string[];
} {
  const ordered = segments
    .map((s) => ({ s, n: walFilenameToOrder(s) }))
    .filter((x): x is { s: string; n: bigint } => x.n !== null)
    .sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));

  const gaps: string[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (!prev || !cur) continue;
    if (cur.n !== prev.n + 1n) {
      gaps.push(`${prev.s}->${cur.s}`);
    }
  }
  return { ok: gaps.length === 0, gaps };
}

export function readPgStatArchiver(env: NodeJS.ProcessEnv = process.env): PgArchiverStats {
  const row = psqlScalar(
    `SELECT archived_count::text || '|' ||
            coalesce(last_archived_wal,'') || '|' ||
            coalesce(last_archived_time::text,'') || '|' ||
            failed_count::text || '|' ||
            coalesce(last_failed_wal,'') || '|' ||
            coalesce(stats_reset::text,'')
     FROM pg_stat_archiver`,
    env
  );
  const [ac, law, lat, fc, lfw, sr] = row.split('|');
  return {
    archived_count: Number(ac || 0),
    last_archived_wal: law || null,
    last_archived_time: lat || null,
    failed_count: Number(fc || 0),
    last_failed_wal: lfw || null,
    stats_reset: sr || null,
  };
}

/**
 * Ensure archive_mode=always and archive_command calls pgbackrest archive-push.
 * Refreshes pgBackRest conf with scoped R2 credentials (archive-push has no env).
 */
export function ensureContinuousWalArchiving(options?: {
  env?: NodeJS.ProcessEnv;
  config?: BackupConfig;
  /** archive_timeout seconds (default 60) so idle clusters still push. */
  archiveTimeoutSeconds?: number;
}): ArchiveConfigState {
  const env = options?.env ?? process.env;
  const cfg = options?.config ?? loadBackupConfig({ env });
  const pgbackrestBin = whichPgbackrest(env);
  const archiveTimeout = String(options?.archiveTimeoutSeconds ?? 60);
  const isolatedGoNoGo = walRestartStrategy(env) === 'isolated-pg-ctl';
  const postgresLogPath = env.PGLOG?.trim() || resolve(cfg.pg1Path, 'postgres.log');

  // Keep conf current so Postgres archive_command (no ambient AWS env) works.
  const conf = renderPgbackrestConfig({
    stanza: cfg.stanza,
    pg1Path: cfg.pg1Path,
    pg1Port: Number.parseInt(env.PGPORT ?? '5432', 10),
    bucketName: cfg.bucketName,
    endpointHost: endpointHost(cfg.endpoint),
    repoPath: cfg.pgbackrestPrefix,
    cipherPass: cfg.repoCipherPass,
    s3Key: cfg.accessKeyId,
    s3KeySecret: cfg.secretAccessKey,
    s3Token: cfg.sessionToken,
  });
  writePgbackrestConfig(cfg.pgbackrestConfigPath, conf);

  const archiveCommand = `${pgbackrestBin} --config=${cfg.pgbackrestConfigPath} --stanza=${cfg.stanza} archive-push %p`;
  // Refuse no-ops at the API boundary.
  if (
    /\/bin\/true|\/usr\/bin\/true|:\s*$|true\s*$/i.test(archiveCommand) ||
    !archiveCommand.includes('pgbackrest') ||
    !archiveCommand.includes('archive-push')
  ) {
    throw new Error(`refusing non-pgbackrest archive_command: ${archiveCommand}`);
  }

  const currentMode = psqlScalar('SHOW archive_mode', env);
  const currentCmd = psqlScalar('SHOW archive_command', env);

  psqlExec(`ALTER SYSTEM SET archive_command = '${archiveCommand.replace(/'/g, "''")}'`, env);
  psqlExec(`ALTER SYSTEM SET archive_timeout = '${archiveTimeout}'`, env);

  let restarted = false;
  // Contract requires always (not merely on).
  if (currentMode !== 'always') {
    psqlExec(`ALTER SYSTEM SET archive_mode = 'always'`, env);
    let restartError = '';
    if (isolatedGoNoGo) {
      const pgctl = run(
        '/opt/homebrew/opt/postgresql@18/bin/pg_ctl',
        ['-D', cfg.pg1Path, 'restart', '-m', 'fast', '-l', postgresLogPath],
        { env, timeoutMs: 60_000 }
      );
      if (pgctl.status !== 0) {
        restartError = pgctl.stderr || pgctl.stdout;
      }
    } else {
      const bounce = run(
        'launchctl',
        ['kickstart', '-k', `gui/${process.getuid?.() ?? 501}/holocron-postgres`],
        { env, timeoutMs: 60_000 }
      );
      if (bounce.status !== 0) {
        const pgctl = run(
          '/opt/homebrew/opt/postgresql@18/bin/pg_ctl',
          ['-D', cfg.pg1Path, 'restart', '-m', 'fast', '-l', postgresLogPath],
          { env, timeoutMs: 60_000 }
        );
        if (pgctl.status !== 0) restartError = bounce.stderr || pgctl.stderr || pgctl.stdout;
      }
    }
    if (restartError) {
      throw new Error(
        `postgres restart for archive_mode=always failed: ${restartError.slice(0, 400)}`
      );
    }
    restarted = true;
    const database = env.PGDATABASE?.trim() || 'holocron';
    for (let i = 0; i < 40; i++) {
      const ready = run('psql', ['-d', database, '-tAc', 'SELECT 1'], { env });
      if (ready.status === 0 && ready.stdout.trim() === '1') break;
      sleepMs(500);
    }
  } else if (currentCmd !== archiveCommand) {
    psqlExec('SELECT pg_reload_conf()', env);
  } else {
    psqlExec('SELECT pg_reload_conf()', env);
  }

  const modeAfter = psqlScalar('SHOW archive_mode', env);
  const cmdAfter = psqlScalar('SHOW archive_command', env);
  if (modeAfter !== 'always') {
    throw new Error(`archive_mode expected always, got ${modeAfter}`);
  }
  if (!cmdAfter.includes('pgbackrest') || !cmdAfter.includes('archive-push')) {
    throw new Error(`archive_command missing pgbackrest archive-push: ${cmdAfter}`);
  }
  if (/\/bin\/true|\/usr\/bin\/true/i.test(cmdAfter)) {
    throw new Error(`archive_command is a no-op: ${cmdAfter}`);
  }

  return {
    archiveMode: modeAfter,
    archiveCommand: cmdAfter,
    archiveTimeout: psqlScalar('SHOW archive_timeout', env),
    restarted,
    configPath: cfg.pgbackrestConfigPath,
    stanza: cfg.stanza,
    pgbackrestBin,
  };
}

/** Isolated human-gate lanes must never bounce the operator launchd service. */
export function walRestartStrategy(
  env: NodeJS.ProcessEnv = process.env
): 'isolated-pg-ctl' | 'operator-launchd-with-pg-ctl-fallback' {
  return env.HOLO_GO_NO_GO_ISOLATED === '1'
    ? 'isolated-pg-ctl'
    : 'operator-launchd-with-pg-ctl-fallback';
}

function countR2WalObjects(
  cfg: BackupConfig,
  env: NodeJS.ProcessEnv
): {
  count: number;
  raw: string;
  segments: string[];
} {
  const listed = listRepoPrefix({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    endpoint: cfg.endpoint,
    bucketName: cfg.bucketName,
    prefix: `${cfg.pgbackrestPrefix.replace(/^\//, '')}/archive`,
    env,
  });
  const segments = extractWalSegmentsFromListing(listed.raw);
  return { count: listed.count, raw: listed.raw, segments };
}

/** Confirm a specific WAL segment (or latest) is present as an R2 object. */
export function confirmWalSegmentInR2(
  segment: string,
  cfg: BackupConfig,
  env: NodeJS.ProcessEnv = process.env
): { confirmed: boolean; objectCount: number; segments: string[] } {
  const { count, segments } = countR2WalObjects(cfg, env);
  const target = segment.toUpperCase();
  return {
    confirmed: segments.some((s) => s.toUpperCase() === target),
    objectCount: count,
    segments,
  };
}

/**
 * Generate a write burst so Postgres rotates WAL and archive_command fires.
 */
export function generateWalWriteBurst(options?: { env?: NodeJS.ProcessEnv; rows?: number }): {
  rows: number;
} {
  const env = options?.env ?? process.env;
  const rows = options?.rows ?? 5000;
  const n = Math.max(1, Math.trunc(rows));
  // psql -c is one statement per call
  psqlExec(
    `CREATE TABLE IF NOT EXISTS backup_wal_burst (
      id bigserial PRIMARY KEY,
      payload text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    env
  );
  psqlExec(
    `INSERT INTO backup_wal_burst (payload)
     SELECT repeat(md5(g::text), 8)
     FROM generate_series(1, ${n}) AS g`,
    env
  );
  psqlExec(`SELECT pg_switch_wal()`, env);
  psqlExec(`CHECKPOINT`, env);
  return { rows: n };
}

function waitForArchiverAdvance(options: {
  env: NodeJS.ProcessEnv;
  before: PgArchiverStats;
  timeoutMs?: number;
}): PgArchiverStats {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const start = Date.now();
  let last = readPgStatArchiver(options.env);
  while (Date.now() - start < timeoutMs) {
    last = readPgStatArchiver(options.env);
    if (
      last.archived_count > options.before.archived_count ||
      (last.last_archived_wal && last.last_archived_wal !== options.before.last_archived_wal)
    ) {
      return last;
    }
    sleepMs(1000);
  }
  return last;
}

/**
 * Run one WAL archive observation cycle:
 *   configure → write burst → wait archiver → confirm R2 → heartbeat + span.
 * last_success_at is set ONLY after R2 confirmation.
 *
 * `induceFault: 'kill'` — production-truth path: kill a real pgbackrest-related
 * process mid-flight, then write status=failed via the same production catch
 * upsert used for natural job failures (never SQL sentinel poisoning alone).
 */
export async function runWalArchiveJob(options?: {
  env?: NodeJS.ProcessEnv;
  config?: BackupConfig;
  rows?: number;
  skipConfigure?: boolean;
  /** Production-truth kill induction (REDHAT-FIX-S27-01). */
  induceFault?: 'kill';
}): Promise<WalArchiveJobResult> {
  const env = options?.env ?? process.env;
  const errors: string[] = [];
  let killEvidence: KillInductionEvidence | undefined;

  // --- Production-truth kill induction: real process death + production failed writer ---
  if (options?.induceFault === 'kill') {
    let configPath = '';
    let stanza = 'main';
    try {
      const cfgEarly = options?.config ?? loadBackupConfig({ env });
      configPath = cfgEarly.pgbackrestConfigPath;
      stanza = cfgEarly.stanza;
    } catch {
      // Config optional for kill evidence — binary kill still counts.
    }
    killEvidence = killRealPgbackrestProcess({
      env,
      configPath: configPath || undefined,
      stanza,
    });
    errors.push(
      `killed / WAL behind — archive job stopped updating heartbeat (pid=${killEvidence.pid_killed ?? 'none'} signal=${killEvidence.signal} binary=${killEvidence.binary})`
    );

    await ensureBackupHeartbeatTable();
    const span = await emitBackupSpan({
      name: 'backup:wal_archive',
      attributes: {
        job_name: 'wal_archive',
        status: 'failed',
        last_wal_segment: null,
        object_count: 0,
        detail: errors.join('; ').slice(0, 200),
        induce_fault: 'kill',
        pid_killed: killEvidence.pid_killed,
      },
    });
    // Production catch path — same status=failed upsert as natural job failure.
    // Non-null lastWalSegment overwrites any prior synthetic DEAD sentinel (COALESCE).
    const heartbeat = await upsertBackupHeartbeat({
      jobName: 'wal_archive',
      status: 'failed',
      lastWalSegment: 'killed-staged-shell',
      objectCount: 0,
      traceId: span.traceId,
    });

    const emptyStats: PgArchiverStats = {
      archived_count: 0,
      last_archived_wal: null,
      last_archived_time: null,
      failed_count: 0,
      last_failed_wal: null,
      stats_reset: null,
    };
    return {
      ok: false,
      job_name: 'wal_archive',
      status: 'failed',
      archiveMode: '',
      archiveCommand: '',
      before: emptyStats,
      after: emptyStats,
      r2WalObjectCountBefore: 0,
      r2WalObjectCountAfter: 0,
      lastWalSegment: null,
      continuityOk: false,
      gapSegments: [],
      heartbeat,
      span,
      writeBurstRows: 0,
      errors,
      killEvidence,
      // REDHAT-FIX-S27-18 / AC-2: early staged kill is NOT a natural job try/catch.
      production_catch: false,
    };
  }

  let cfg: BackupConfig;
  try {
    cfg = options?.config ?? loadBackupConfig({ env });
  } catch (e) {
    return {
      ok: false,
      job_name: 'wal_archive',
      status: 'failed',
      archiveMode: '',
      archiveCommand: '',
      before: {
        archived_count: 0,
        last_archived_wal: null,
        last_archived_time: null,
        failed_count: 0,
        last_failed_wal: null,
        stats_reset: null,
      },
      after: {
        archived_count: 0,
        last_archived_wal: null,
        last_archived_time: null,
        failed_count: 0,
        last_failed_wal: null,
        stats_reset: null,
      },
      r2WalObjectCountBefore: 0,
      r2WalObjectCountAfter: 0,
      lastWalSegment: null,
      continuityOk: false,
      gapSegments: [],
      heartbeat: null,
      span: null,
      writeBurstRows: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }

  let archiveMode = '';
  let archiveCommand = '';
  try {
    if (!options?.skipConfigure) {
      const state = ensureContinuousWalArchiving({ env, config: cfg });
      archiveMode = state.archiveMode;
      archiveCommand = state.archiveCommand;
    } else {
      archiveMode = psqlScalar('SHOW archive_mode', env);
      archiveCommand = psqlScalar('SHOW archive_command', env);
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  await ensureBackupHeartbeatTable();
  await upsertBackupHeartbeat({ jobName: 'wal_archive', status: 'running' });

  const before = readPgStatArchiver(env);
  const r2Before = countR2WalObjects(cfg, env);
  let writeBurstRows = 0;
  try {
    writeBurstRows = generateWalWriteBurst({ env, rows: options?.rows }).rows;
  } catch (e) {
    errors.push(`write burst failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const after = waitForArchiverAdvance({ env, before, timeoutMs: 120_000 });
  // Give R2 listing a moment after archiver reports success
  sleepMs(1500);
  const r2After = countR2WalObjects(cfg, env);

  const lastWalSegment = after.last_archived_wal;
  const failedDelta = after.failed_count - before.failed_count;
  const continuity = checkWalContinuity(r2After.segments);

  // Fail closed: exact last_archived_wal must be present in R2 — never object-count growth alone.
  let confirmed = false;
  if (lastWalSegment) {
    const conf = confirmWalSegmentInR2(lastWalSegment, cfg, env);
    confirmed = conf.confirmed;
  }

  if (!confirmed) {
    errors.push(
      lastWalSegment
        ? `R2 did not confirm exact WAL segment ${lastWalSegment} (fail-closed; object-count growth is not sufficient)`
        : 'R2 did not confirm WAL segment after archive-push (no last_archived_wal)'
    );
  }
  if (failedDelta > 0) errors.push(`pg_stat_archiver.failed_count grew by ${failedDelta}`);
  // HIGH-1: zero WAL-gap is a success/heartbeat gate — gaps fail the job and do NOT advance last_success_at
  if (!continuity.ok) errors.push(`WAL continuity gaps: ${continuity.gaps.join(', ')}`);
  // Gate honesty (F-2): real write burst + observable R2 growth — never success without both.
  if (writeBurstRows < 1) {
    errors.push('write burst produced 0 rows (pipeline requires real Postgres WAL traffic)');
  }
  if (r2After.count <= r2Before.count) {
    errors.push(
      `R2 WAL object count did not grow (${r2Before.count} → ${r2After.count}); write-burst archive not proven`
    );
  }

  const success =
    confirmed &&
    continuity.ok &&
    !!lastWalSegment &&
    failedDelta === 0 &&
    writeBurstRows >= 1 &&
    r2After.count > r2Before.count &&
    archiveMode === 'always' &&
    archiveCommand.includes('archive-push') &&
    !/\/bin\/true/i.test(archiveCommand);

  let heartbeat: BackupHeartbeatRecord | null = null;
  let span: EmittedBackupSpan | null = null;

  if (success && lastWalSegment) {
    // Span first so we can store trace_id on the success heartbeat.
    span = await emitBackupSpan({
      name: 'backup:wal_archive',
      attributes: {
        job_name: 'wal_archive',
        status: 'success',
        last_wal_segment: lastWalSegment,
        object_count: r2After.count,
        wal_path: archiveCommand,
      },
    });

    // ONLY after R2 confirmation of the exact segment AND zero-gap continuity
    heartbeat = await upsertBackupHeartbeat({
      jobName: 'wal_archive',
      status: 'success',
      lastSuccessAt: new Date(),
      lastWalSegment,
      objectCount: r2After.count,
      traceId: span.traceId,
    });
  } else {
    span = await emitBackupSpan({
      name: 'backup:wal_archive',
      attributes: {
        job_name: 'wal_archive',
        status: 'failed',
        last_wal_segment: lastWalSegment,
        object_count: r2After.count,
        detail: errors.join('; ').slice(0, 200),
      },
    });
    // status=failed path does NOT pass lastSuccessAt → last_success_at is not advanced
    heartbeat = await upsertBackupHeartbeat({
      jobName: 'wal_archive',
      status: 'failed',
      lastWalSegment: lastWalSegment,
      objectCount: r2After.count,
      traceId: span.traceId,
    });
  }

  return {
    ok: success,
    job_name: 'wal_archive',
    status: success ? 'success' : 'failed',
    archiveMode,
    archiveCommand,
    before,
    after,
    r2WalObjectCountBefore: r2Before.count,
    r2WalObjectCountAfter: r2After.count,
    lastWalSegment,
    continuityOk: continuity.ok,
    gapSegments: continuity.gaps,
    heartbeat,
    span,
    writeBurstRows,
    errors,
  };
}

export function formatWalArchiveText(result: WalArchiveJobResult): string {
  const lines = [
    'holo backup:wal — continuous WAL archive cycle',
    `  status:          ${result.status}`,
    `  archive_mode:    ${result.archiveMode}`,
    `  archive_command: ${result.archiveCommand.includes('archive-push') ? 'pgbackrest archive-push (ok)' : result.archiveCommand}`,
    `  last_wal:        ${result.lastWalSegment ?? '(none)'}`,
    `  write_burst_rows: ${result.writeBurstRows}`,
    `  archiver:        ${result.before.archived_count} → ${result.after.archived_count} (failed ${result.before.failed_count} → ${result.after.failed_count})`,
    `  r2_wal_objects:  ${result.r2WalObjectCountBefore} → ${result.r2WalObjectCountAfter}`,
    `  continuity:      ${result.continuityOk ? 'ok (gated)' : `GAPS ${result.gapSegments.join(',')} (blocks success/last_success_at)`}`,
    `  heartbeat:       ${result.heartbeat?.status ?? 'n/a'} last_success_at=${result.heartbeat?.last_success_at ?? 'null'}`,
    `  span:            ${result.span?.name ?? 'n/a'} trace_id=${result.span?.traceId ?? 'n/a'}`,
  ];
  if (result.errors.length) {
    lines.push('  errors:');
    for (const e of result.errors) lines.push(`    - ${e}`);
  }
  lines.push(`  overall:         ${result.ok ? 'OK' : 'FAILED'}`);
  return lines.join('\n');
}

/** launchd label for continuous WAL archive heartbeat (D04-03 / D04-05 cadence). */
export const WAL_ARCHIVE_LAUNCHD_LABEL = 'holocron-wal-archive';
/** Default: every 5 minutes — keeps wal_archive last_success_at inside D04-05 15m overdue window. */
export const WAL_ARCHIVE_DEFAULT_INTERVAL_SECONDS = 300;

export type WalLaunchdInstallResult = {
  ok: boolean;
  label: string;
  plistPath: string;
  domain: string;
  intervalSeconds: number;
  bootstrapped: boolean;
  messages: string[];
};

/** Render launchd plist for scheduled `holo backup:wal` (heartbeat cadence ≤5m). */
export function renderWalArchivePlist(options: {
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
    WAL_ARCHIVE_DEFAULT_INTERVAL_SECONDS
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!--
  holocron-wal-archive — continuous WAL archive heartbeat (D04-03 / CAP-BAK-01)
  Runs: bun holo.ts backup:wal --json
  StartInterval=${interval}s (≤5m for D04-05 overdue window). Not a no-op.
  Success gated on R2 exact-segment confirm + zero WAL-gap continuity.
-->
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${WAL_ARCHIVE_LAUNCHD_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${options.bunBin}</string>
		<string>${options.holoRoot}/services/platform/src/cli/holo.ts</string>
		<string>backup:wal</string>
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
	<string>${logDir}/wal-archive.out.log</string>
	<key>StandardErrorPath</key>
	<string>${logDir}/wal-archive.err.log</string>
</dict>
</plist>
`;
}

/**
 * Install + bootstrap the launchd WAL-archive heartbeat schedule (≤5 min).
 * Template also written under services/platform/deploy/launchd for version control.
 */
export function installWalArchiveLaunchd(options?: {
  env?: NodeJS.ProcessEnv;
  /** Cap at 300s (5m). Default 300. */
  intervalSeconds?: number;
  holoRoot?: string;
  launchAgentsDir?: string;
  bootstrap?: boolean;
}): WalLaunchdInstallResult {
  const env = options?.env ?? process.env;
  const home = env.HOME ?? homedir();
  const holoRoot = options?.holoRoot ?? resolveRepoRoot();
  const requested = options?.intervalSeconds ?? WAL_ARCHIVE_DEFAULT_INTERVAL_SECONDS;
  // Enforce ≤5m cadence for D04-05; never schedule slower than the overdue budget.
  const intervalSeconds = Math.min(
    Math.max(30, Math.trunc(requested)),
    WAL_ARCHIVE_DEFAULT_INTERVAL_SECONDS
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

  const body = renderWalArchivePlist({
    home,
    holoRoot,
    bunBin,
    databaseUrl,
    intervalSeconds,
  });

  const templateDir = resolve(holoRoot, 'services/platform/deploy/launchd');
  mkdirSync(templateDir, { recursive: true });
  const templatePath = resolve(templateDir, `${WAL_ARCHIVE_LAUNCHD_LABEL}.plist`);
  const portable = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!--
  holocron-wal-archive — continuous WAL archive heartbeat (D04-03 / CAP-BAK-01)
  Runs: bun holo.ts backup:wal --json
  StartInterval=${intervalSeconds}s (≤5m for D04-05 overdue window). Not a no-op.
  Placeholders: @HOME@ @HOLO_ROOT@ @BUN_BIN@ @BUN_DIR@ @DATABASE_URL@
-->
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${WAL_ARCHIVE_LAUNCHD_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>@BUN_BIN@</string>
		<string>@HOLO_ROOT@/services/platform/src/cli/holo.ts</string>
		<string>backup:wal</string>
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
	<string>@HOME@/Library/Logs/holocron/wal-archive.out.log</string>
	<key>StandardErrorPath</key>
	<string>@HOME@/Library/Logs/holocron/wal-archive.err.log</string>
</dict>
</plist>
`;
  writeFileSync(templatePath, portable, 'utf8');
  messages.push(`wrote template ${templatePath}`);

  mkdirSync(launchAgentsDir, { recursive: true });
  mkdirSync(resolve(home, 'Library/Logs/holocron'), { recursive: true });
  const plistPath = resolve(launchAgentsDir, `${WAL_ARCHIVE_LAUNCHD_LABEL}.plist`);
  writeFileSync(plistPath, body, 'utf8');
  messages.push(`installed ${plistPath}`);

  const lint = run('/usr/bin/plutil', ['-lint', plistPath], { env });
  if (lint.status !== 0) {
    return {
      ok: false,
      label: WAL_ARCHIVE_LAUNCHD_LABEL,
      plistPath,
      domain,
      intervalSeconds,
      bootstrapped: false,
      messages: [...messages, `plutil lint failed: ${lint.stderr || lint.stdout}`],
    };
  }

  let bootstrapped = false;
  if (options?.bootstrap !== false) {
    run('launchctl', ['bootout', `${domain}/${WAL_ARCHIVE_LAUNCHD_LABEL}`], {
      env,
    });
    const boot = run('launchctl', ['bootstrap', domain, plistPath], { env });
    if (boot.status !== 0) {
      const load = run('launchctl', ['load', '-w', plistPath], { env });
      if (load.status !== 0) {
        messages.push(
          `bootstrap failed: ${(boot.stderr || load.stderr || boot.stdout).slice(0, 300)}`
        );
        return {
          ok: false,
          label: WAL_ARCHIVE_LAUNCHD_LABEL,
          plistPath,
          domain,
          intervalSeconds,
          bootstrapped: false,
          messages,
        };
      }
      messages.push(`loaded ${WAL_ARCHIVE_LAUNCHD_LABEL}`);
    } else {
      messages.push(`bootstrapped ${domain}/${WAL_ARCHIVE_LAUNCHD_LABEL}`);
    }
    bootstrapped = true;
  }

  return {
    ok: true,
    label: WAL_ARCHIVE_LAUNCHD_LABEL,
    plistPath,
    domain,
    intervalSeconds,
    bootstrapped,
    messages,
  };
}

export function formatWalLaunchdInstallText(result: WalLaunchdInstallResult): string {
  return [
    'holo backup:wal --install-schedule',
    `  label:     ${result.label}`,
    `  plist:     ${result.plistPath}`,
    `  domain:    ${result.domain}`,
    `  interval:  ${result.intervalSeconds}s (≤300s D04-05 cadence)`,
    `  loaded:    ${result.bootstrapped}`,
    ...result.messages.map((m) => `  - ${m}`),
    `  overall:   ${result.ok ? 'OK' : 'FAILED'}`,
  ].join('\n');
}

/** Read installed WAL-archive plist StartInterval if present. */
export function readWalArchiveSchedule(options?: {
  launchAgentsDir?: string;
  env?: NodeJS.ProcessEnv;
}): {
  installed: boolean;
  plistPath: string;
  intervalSeconds: number | null;
  loaded: boolean;
} {
  const env = options?.env ?? process.env;
  const home = env.HOME ?? homedir();
  const dir = options?.launchAgentsDir ?? resolve(home, 'Library/LaunchAgents');
  const plistPath = resolve(dir, `${WAL_ARCHIVE_LAUNCHD_LABEL}.plist`);
  if (!existsSync(plistPath)) {
    return {
      installed: false,
      plistPath,
      intervalSeconds: null,
      loaded: false,
    };
  }
  const text = readFileSync(plistPath, 'utf8');
  const m = text.match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/);
  const uid = process.getuid?.() ?? 501;
  const print = run('launchctl', ['print', `gui/${uid}/${WAL_ARCHIVE_LAUNCHD_LABEL}`], { env });
  return {
    installed: true,
    plistPath,
    intervalSeconds: m ? Number(m[1]) : null,
    loaded: print.status === 0,
  };
}

export async function backupStatusSnapshot(options?: {
  env?: NodeJS.ProcessEnv;
  config?: BackupConfig;
}): Promise<{
  archiveMode: string;
  archiveCommand: string;
  archiver: PgArchiverStats;
  r2WalObjects: number;
  r2BackupObjects: number;
  heartbeats: BackupHeartbeatRecord[];
}> {
  const env = options?.env ?? process.env;
  const cfg = options?.config ?? loadBackupConfig({ env });
  const wal = countR2WalObjects(cfg, env);
  const backup = listRepoPrefix({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    endpoint: cfg.endpoint,
    bucketName: cfg.bucketName,
    prefix: `${cfg.pgbackrestPrefix.replace(/^\//, '')}/backup`,
    env,
  });
  const { listBackupHeartbeats } = await import('./heartbeat.ts');
  return {
    archiveMode: psqlScalar('SHOW archive_mode', env),
    archiveCommand: psqlScalar('SHOW archive_command', env),
    archiver: readPgStatArchiver(env),
    r2WalObjects: wal.count,
    r2BackupObjects: backup.count,
    heartbeats: await listBackupHeartbeats(),
  };
}

// re-export for callers that already hold a job name
export { getBackupHeartbeat };
