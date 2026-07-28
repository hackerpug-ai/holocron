/**
 * Continuous Postgres WAL archiving via pgBackRest archive-push (D04-03).
 *
 * - archive_mode=always + archive_command → pgbackrest archive-push (NEVER /bin/true)
 * - After real R2 confirmation: upsert backup_heartbeat wal_archive
 * - Emit OTel span backup:wal_archive with redacted attributes + trace_id on heartbeat
 */
import { spawnSync } from 'node:child_process';
import { type BackupConfig, endpointHost, loadBackupConfig } from './config.ts';
import {
  type BackupHeartbeatRecord,
  ensureBackupHeartbeatTable,
  getBackupHeartbeat,
  upsertBackupHeartbeat,
} from './heartbeat.ts';
import { listRepoPrefix, renderPgbackrestConfig, writePgbackrestConfig } from './r2-provision.ts';
import { type EmittedBackupSpan, emitBackupSpan } from './span.ts';

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

function psqlScalar(sql: string, env: NodeJS.ProcessEnv): string {
  const r = run('psql', ['-d', 'holocron', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { env });
  if (r.status !== 0) {
    throw new Error(`psql failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

function psqlExec(sql: string, env: NodeJS.ProcessEnv): void {
  const r = run('psql', ['-d', 'holocron', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env });
  if (r.status !== 0) {
    throw new Error(`psql exec failed: ${r.stderr || r.stdout}`);
  }
}

/** Parse a 24-char WAL filename into a comparable integer timeline+log+seg. */
export function walFilenameToOrder(name: string): bigint | null {
  const m = name.match(/^([0-9A-F]{8})([0-9A-F]{8})([0-9A-F]{8})$/i);
  if (!m) return null;
  return BigInt(`0x${m[1]}${m[2]}${m[3]}`);
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

  // Keep conf current so Postgres archive_command (no ambient AWS env) works.
  const conf = renderPgbackrestConfig({
    stanza: cfg.stanza,
    pg1Path: cfg.pg1Path,
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
    const bounce = run(
      'launchctl',
      ['kickstart', '-k', `gui/${process.getuid?.() ?? 501}/holocron-postgres`],
      { env, timeoutMs: 60_000 }
    );
    if (bounce.status !== 0) {
      const pgctl = run(
        '/opt/homebrew/opt/postgresql@18/bin/pg_ctl',
        ['-D', cfg.pg1Path, 'restart', '-m', 'fast'],
        { env, timeoutMs: 60_000 }
      );
      if (pgctl.status !== 0) {
        throw new Error(
          `postgres restart for archive_mode=always failed: ${(bounce.stderr || pgctl.stderr).slice(0, 400)}`
        );
      }
    }
    restarted = true;
    for (let i = 0; i < 40; i++) {
      const ready = run('psql', ['-d', 'holocron', '-tAc', 'SELECT 1'], { env });
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
 */
export async function runWalArchiveJob(options?: {
  env?: NodeJS.ProcessEnv;
  config?: BackupConfig;
  rows?: number;
  skipConfigure?: boolean;
}): Promise<WalArchiveJobResult> {
  const env = options?.env ?? process.env;
  const errors: string[] = [];
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

  let confirmed = false;
  if (lastWalSegment) {
    const conf = confirmWalSegmentInR2(lastWalSegment, cfg, env);
    confirmed = conf.confirmed;
    if (!confirmed) {
      // Fall back: object count increased under archive prefix after the burst.
      confirmed =
        r2After.count > r2Before.count && r2After.segments.length > r2Before.segments.length;
    }
  }

  const success =
    confirmed &&
    !!lastWalSegment &&
    failedDelta === 0 &&
    archiveMode === 'always' &&
    archiveCommand.includes('archive-push') &&
    !/\/bin\/true/i.test(archiveCommand);

  if (!confirmed) errors.push('R2 did not confirm WAL segment after archive-push');
  if (failedDelta > 0) errors.push(`pg_stat_archiver.failed_count grew by ${failedDelta}`);
  if (!continuity.ok) errors.push(`WAL continuity gaps: ${continuity.gaps.join(', ')}`);

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

    // ONLY after R2 confirmation
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
    `  archiver:        ${result.before.archived_count} → ${result.after.archived_count} (failed ${result.before.failed_count} → ${result.after.failed_count})`,
    `  r2_wal_objects:  ${result.r2WalObjectCountBefore} → ${result.r2WalObjectCountAfter}`,
    `  continuity:      ${result.continuityOk ? 'ok' : `GAPS ${result.gapSegments.join(',')}`}`,
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
