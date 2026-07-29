/**
 * Full CAP-BAK-01 fire drill (D05-04): Postgres PITR + restic blob restore + parity.
 *
 * Flow (strict order):
 *   1. Capture pre-failure snapshot (row counts + ledger checksum + local blob hash set)
 *   2. Restore Postgres via runPitrRestore into empty --scratch (never live mini PGDATA)
 *   3. Start restored cluster; compare row counts → POSTGRES_PARITY_PASS
 *   4. Compare ledger checksum → LEDGER_CHECKSUM_MATCH
 *   5. restic restore from R2 into empty --blob-dir; SHA-256 set parity → BLOB_PARITY_PASS
 *   6. Emit unified parity-report.json with concrete counts/digests
 *   7. Exit 0 only if ALL three pass (fail-closed otherwise)
 *
 * NEVER stubs BLOB_PARITY_PASS when restic/R2 is unavailable — named error + non-zero exit.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultBlobRoot } from '../blob/store.ts';
import { resolveRepoRoot } from '../config/secrets.ts';
import {
  captureRowCounts,
  compareRowCountsExact,
  computeLedgerChecksum,
  defaultSourceConnection,
  FIRE_DRILL_COUNT_TABLES,
  type PsqlConnection,
} from './evidence-ledger-verify.ts';
import {
  compareHashSets,
  hashDirectoryTree,
  hashLocalBlobStore,
  type ParityCompareResult,
} from './parity-check.ts';
import {
  buildParityReport,
  defaultParityReportPath,
  type FireDrillParityReport,
  formatParityReportText,
  writeParityReport,
} from './parity-report.ts';
import {
  findRestoredBlobRoot,
  loadResticMirrorConfig,
  type ResticMirrorConfig,
  resticEnv,
} from './restic-mirror.ts';
import { type PitrRestoreResult, runPitrRestore } from './restore.ts';

export type FireDrillOptions = {
  /** ISO-8601 PITR target (pre-failure timestamp). */
  targetTimestamp: string;
  /** Empty scratch PGDATA (never live mini path). */
  scratch: string;
  /** Empty blob restore directory (never live mini blob mount). */
  blobDir: string;
  /** Where to write parity-report.json. */
  reportPath?: string;
  /** Live source DB for pre-failure snapshot (default DATABASE_URL / local holocron). */
  sourceDatabaseUrl?: string;
  /** Local blob root used as pre-failure SHA-256 manifest (default HOLO_BLOB_ROOT). */
  sourceBlobRoot?: string;
  env?: NodeJS.ProcessEnv;
  /** Keep restored Postgres running after drill (default false — stop + leave PGDATA). */
  keepPostgresRunning?: boolean;
  /** Port for restored Postgres (default 56111). */
  restorePort?: number;
  /** Database name inside restored cluster (default holocron). */
  restoreDatabase?: string;
  /** Skip stopping postgres on success (for debugging). */
  skipCleanup?: boolean;
  /** Override pgBackRest restore timeout (default 20 minutes). */
  pitrTimeoutMs?: number;
};

export type FireDrillResult = {
  ok: boolean;
  exitCode: number;
  report: FireDrillParityReport;
  reportPath: string;
  pitr: PitrRestoreResult | null;
  errors: string[];
};

const FORBIDDEN_PGDATA = [
  '/opt/homebrew/var/postgresql@18',
  '/usr/local/var/postgres',
  '/usr/local/var/postgresql@18',
  '/var/lib/postgresql/data',
];

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

function isForbiddenPath(path: string, env: NodeJS.ProcessEnv): boolean {
  const abs = resolve(path);
  const candidates = [
    ...FORBIDDEN_PGDATA,
    env.HOLO_LIVE_PGDATA?.trim(),
    env.HOLO_STANDING_PG1_PATH?.trim(),
    env.PGBACKREST_PG1_PATH?.trim(),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  // PGBACKREST_PG1_PATH may be overridden to scratch during restore tests — only
  // treat it as forbidden when it is a known standing path, not when it equals scratch.
  return (
    FORBIDDEN_PGDATA.some((c) => resolve(c) === abs) ||
    candidates
      .filter((c) => FORBIDDEN_PGDATA.includes(c) || c === env.HOLO_LIVE_PGDATA?.trim())
      .some((c) => resolve(c) === abs)
  );
}

function isEmptyDir(dir: string): boolean {
  if (!existsSync(dir)) return true;
  try {
    return readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}

function wipeDirContents(dir: string): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    rmSync(join(dir, name), { recursive: true, force: true });
  }
}

function tryStopPostgres(pgdata: string, env: NodeJS.ProcessEnv): void {
  if (!existsSync(pgdata)) return;
  run('pg_ctl', ['stop', '-D', pgdata, '-m', 'fast', '-w', '-t', '30'], {
    env: { ...env, PGDATA: pgdata },
    timeoutMs: 45_000,
  });
}

/**
 * Remove stale pgBackRest restore lock files when no pgbackrest restore process is alive.
 * Never kills other operators' active restores — only unblocks orphaned locks.
 */
function clearStalePgbackrestRestoreLocks(env: NodeJS.ProcessEnv): void {
  const ps = run('ps', ['aux'], { env, timeoutMs: 10_000 });
  const liveRestore = /pgbackrest.*\brestore\b/i.test(ps.stdout);
  if (liveRestore) return;
  const lockDirs = ['/tmp/pgbackrest', '/var/tmp/pgbackrest'];
  for (const dir of lockDirs) {
    if (!existsSync(dir)) continue;
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/restore.*\.lock$/i.test(name) && !/-restore-\d+\.lock$/i.test(name)) continue;
      try {
        rmSync(join(dir, name), { force: true });
      } catch {
        // best-effort
      }
    }
  }
}

/**
 * Unix socket dir for restored postmaster.
 * NEVER use long worktree PGDATA paths — macOS sockaddr_un limit is 103 bytes and
 * paths like .../.kb-run-sprint/worktrees/D05-04/.tmp/... exceed it (FATAL no sockets).
 */
function restoreSocketDir(port: number): string {
  const dir = join('/tmp', `holo-fd-${port}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function startRestoredPostgres(
  pgdata: string,
  port: number,
  env: NodeJS.ProcessEnv
): { ok: boolean; log: string; socketDir: string } {
  // Ensure no stale postmaster from a prior drill.
  tryStopPostgres(pgdata, env);
  const logFile = join(pgdata, 'holo-fire-drill-start.log');
  const socketDir = restoreSocketDir(port);
  const started = run(
    'pg_ctl',
    [
      'start',
      '-D',
      pgdata,
      '-l',
      logFile,
      // Short -k path required; also listen on localhost for TCP probes.
      '-o',
      `-p ${port} -k ${socketDir} -h 127.0.0.1`,
      '-w',
      '-t',
      '120',
    ],
    { env: { ...env, PGDATA: pgdata }, timeoutMs: 150_000 }
  );
  // Brief settle for promote completion.
  run('sleep', ['3'], { env, timeoutMs: 10_000 });
  const status = run('pg_ctl', ['status', '-D', pgdata], {
    env: { ...env, PGDATA: pgdata },
    timeoutMs: 15_000,
  });
  let logTail = '';
  if (existsSync(logFile)) {
    try {
      logTail = readFileSync(logFile, 'utf8').slice(-2000);
    } catch {
      logTail = '';
    }
  }
  const log = `${started.stdout}\n${started.stderr}\n${status.stdout}\n${status.stderr}\n${logTail}`;
  return { ok: started.status === 0 && status.status === 0, log, socketDir };
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
    const last = parsed[parsed.length - 1];
    return { snapshotId: last?.id ?? last?.short_id ?? null, count: parsed.length };
  } catch {
    return { snapshotId: null, count: 0 };
  }
}

/**
 * Restore latest restic blob snapshot from R2 into blobDir and compare SHA-256 sets
 * against the pre-failure local manifest.
 */
function restoreBlobsAndParity(options: {
  blobDir: string;
  preFailureHashes: ReturnType<typeof hashLocalBlobStore>;
  env: NodeJS.ProcessEnv;
  sourceBlobRoot: string;
}): {
  ok: boolean;
  parity: ParityCompareResult | null;
  matched_objects: number;
  restored_blob_objects: number;
  snapshotId: string | null;
  repository: string | null;
  errors: string[];
} {
  const errors: string[] = [];
  let cfg: ResticMirrorConfig;
  try {
    cfg = loadResticMirrorConfig({
      blobRoot: options.sourceBlobRoot,
      env: options.env,
    });
  } catch (e) {
    return {
      ok: false,
      parity: null,
      matched_objects: 0,
      restored_blob_objects: 0,
      snapshotId: null,
      repository: null,
      errors: [
        `restic blob mirror not available — refuse BLOB_PARITY_PASS: ${
          e instanceof Error ? e.message : String(e)
        }`,
      ],
    };
  }

  // restic binary must exist.
  const which = run('which', ['restic'], { env: options.env, timeoutMs: 5_000 });
  const resticBin =
    cfg.resticBin ||
    (which.status === 0 && which.stdout.trim()) ||
    (existsSync('/opt/homebrew/bin/restic') ? '/opt/homebrew/bin/restic' : null);
  if (!resticBin) {
    return {
      ok: false,
      parity: null,
      matched_objects: 0,
      restored_blob_objects: 0,
      snapshotId: null,
      repository: cfg.repository,
      errors: [
        'restic binary not found — refuse BLOB_PARITY_PASS (no stub success without restic restore)',
      ],
    };
  }

  if (!cfg.resticPassword || cfg.resticPassword.length < 8) {
    return {
      ok: false,
      parity: null,
      matched_objects: 0,
      restored_blob_objects: 0,
      snapshotId: null,
      repository: cfg.repository,
      errors: [
        'RESTIC_PASSWORD missing/short — refuse BLOB_PARITY_PASS (restic blob mirror not available in env)',
      ],
    };
  }

  const renv = resticEnv(cfg, options.env);

  const snaps = run(resticBin, ['snapshots', '--json'], {
    env: renv,
    timeoutMs: 120_000,
  });
  if (snaps.status !== 0) {
    return {
      ok: false,
      parity: null,
      matched_objects: 0,
      restored_blob_objects: 0,
      snapshotId: null,
      repository: cfg.repository,
      errors: [
        `restic snapshots failed — refuse BLOB_PARITY_PASS: ${(snaps.stderr || snaps.stdout).slice(0, 500)}`,
      ],
    };
  }
  const { snapshotId, count } = parseLatestSnapshotId(snaps.stdout);
  if (!snapshotId || count === 0) {
    return {
      ok: false,
      parity: null,
      matched_objects: 0,
      restored_blob_objects: 0,
      snapshotId: null,
      repository: cfg.repository,
      errors: [
        'restic repository has zero snapshots — refuse BLOB_PARITY_PASS (blob mirror not available)',
      ],
    };
  }

  mkdirSync(options.blobDir, { recursive: true });
  if (!isEmptyDir(options.blobDir)) {
    // Strict: blob restore target must be empty (never reuse live mini blobs).
    return {
      ok: false,
      parity: null,
      matched_objects: 0,
      restored_blob_objects: 0,
      snapshotId,
      repository: cfg.repository,
      errors: [
        `blob-dir must be empty before restic restore (strict): ${options.blobDir} is not empty`,
      ],
    };
  }

  const restore = run(resticBin, ['restore', snapshotId, '--target', options.blobDir], {
    env: renv,
    timeoutMs: 600_000,
  });
  if (restore.status !== 0) {
    return {
      ok: false,
      parity: null,
      matched_objects: 0,
      restored_blob_objects: 0,
      snapshotId,
      repository: cfg.repository,
      errors: [
        `restic restore failed (exit ${restore.status}) — refuse BLOB_PARITY_PASS: ${(restore.stderr || restore.stdout).slice(0, 600)}`,
      ],
    };
  }

  const restoredRoot = findRestoredBlobRoot(options.blobDir, options.sourceBlobRoot);
  const restoredHashes = hashDirectoryTree(restoredRoot);
  const parity = compareHashSets(options.preFailureHashes, restoredHashes);
  const matched_objects = parity.ok
    ? parity.localCount
    : Math.max(0, parity.localCount - parity.missingRemote.length);

  if (restoredHashes.fileCount === 0) {
    errors.push(
      'restic restore produced zero objects — refuse BLOB_PARITY_PASS (matched_objects=0)'
    );
  }
  if (!parity.ok) {
    errors.push(
      `blob SHA-256 parity FAILED: local=${parity.localCount} restored=${parity.remoteCount} ` +
        `missing_restored=${parity.missingRemote.length} extra_restored=${parity.extraRemote.length} ` +
        `sample_missing=${parity.missingRemote.slice(0, 3).join(',') || '-'} ` +
        `sample_extra=${parity.extraRemote.slice(0, 3).join(',') || '-'}`
    );
  }
  if (options.preFailureHashes.hashes.length === 0) {
    errors.push('pre-failure blob manifest empty — refuse BLOB_PARITY_PASS (no source digests)');
  }

  const ok = errors.length === 0 && parity.ok && matched_objects > 0;
  return {
    ok,
    parity,
    matched_objects: ok ? matched_objects : parity.ok ? matched_objects : 0,
    restored_blob_objects: restoredHashes.hashes.length,
    snapshotId,
    repository: cfg.repository.replace(/\/\/([^@/]+)@/, '//***@'),
    errors,
  };
}

/**
 * Run the full fire-drill restore + parity verification.
 */
export async function runFireDrill(options: FireDrillOptions): Promise<FireDrillResult> {
  const started = Date.now();
  const env = options.env ?? process.env;
  const errors: string[] = [];
  const scratch = resolve(options.scratch);
  const blobDir = resolve(options.blobDir);
  const reportPath = resolve(options.reportPath ?? defaultParityReportPath());
  const restorePort = options.restorePort ?? 56111;
  const restoreDatabase = options.restoreDatabase ?? 'holocron';
  const sourceBlobRoot = resolve(
    options.sourceBlobRoot ?? env.HOLO_BLOB_ROOT?.trim() ?? defaultBlobRoot(resolveRepoRoot())
  );

  // ── Guard: never use live mini mounts ──────────────────────────────────
  if (isForbiddenPath(scratch, env)) {
    errors.push(
      'refusing fire-drill into live mini PGDATA — pass a distinct empty --scratch directory'
    );
  }
  if (env.HOLO_LIVE_BLOB_ROOT?.trim() && resolve(env.HOLO_LIVE_BLOB_ROOT.trim()) === blobDir) {
    errors.push(
      'refusing fire-drill into live mini blob storage — pass a distinct empty --blob-dir'
    );
  }
  // Also refuse if blobDir resolves to the standing source blob root.
  if (resolve(sourceBlobRoot) === blobDir) {
    errors.push(
      'refusing fire-drill --blob-dir equal to source blob root — restore into a distinct empty directory'
    );
  }

  if (errors.length > 0) {
    const report = buildParityReport({
      capturedAt: new Date().toISOString(),
      targetTimestamp: options.targetTimestamp,
      actualStopTimestamp: null,
      scratchPgdata: scratch,
      blobDir,
      sourceDatabase: { host: '', port: 0, database: '' },
      POSTGRES_PARITY_PASS: false,
      pre_failure_row_counts: {},
      restored_row_counts: {},
      row_counts: {},
      row_count_mismatches: [],
      LEDGER_CHECKSUM_MATCH: false,
      ledger_checksum: '',
      pre_failure_ledger_checksum: '',
      ledger_per_table: {},
      sample_tx_windows: [],
      BLOB_PARITY_PASS: false,
      matched_objects: 0,
      pre_failure_blob_objects: 0,
      restored_blob_objects: 0,
      blob_parity: null,
      restic_snapshot_id: null,
      restic_repository: null,
      errors,
      durationMs: Date.now() - started,
      ok: false,
      exitCode: 1,
    });
    writeParityReport(reportPath, report);
    return { ok: false, exitCode: 1, report, reportPath, pitr: null, errors };
  }

  // ── 1) Pre-failure snapshot (BEFORE restore) ───────────────────────────
  let sourceConn: PsqlConnection;
  if (options.sourceDatabaseUrl) {
    const { connectionFromDatabaseUrl } = await import('./evidence-ledger-verify.ts');
    sourceConn = connectionFromDatabaseUrl(options.sourceDatabaseUrl, env);
  } else {
    sourceConn = defaultSourceConnection(env);
  }

  const preCounts = captureRowCounts(sourceConn, FIRE_DRILL_COUNT_TABLES);
  const preLedger = computeLedgerChecksum(sourceConn);
  if (Object.keys(preCounts.row_counts).length === 0) {
    errors.push(
      'pre-failure snapshot captured zero domain tables — refuse fire-drill (empty baseline)'
    );
  }
  if (!preLedger.ledger_checksum || preLedger.ledger_checksum.length !== 32) {
    errors.push('pre-failure ledger checksum empty — refuse fire-drill');
  }

  // Persist pre-failure snapshot artifact for audit (before any restore mutates targets).
  const preFailurePath = join(dirnameSafe(reportPath), 'pre-failure-snapshot.json');
  writeFileSync(
    preFailurePath,
    `${JSON.stringify(
      {
        capturedAt: preCounts.capturedAt,
        row_counts: preCounts.row_counts,
        ledger_checksum: preLedger.ledger_checksum,
        ledger_per_table: preLedger.per_table,
        sample_tx_windows: preLedger.sample_tx_windows,
        source: preCounts.connection,
        sourceBlobRoot,
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );

  // Pre-failure blob manifest (SHA-256 set of local content-addressed store).
  const preBlobHashes = hashLocalBlobStore(sourceBlobRoot);
  if (preBlobHashes.hashes.length === 0) {
    // Not yet fatal for postgres path — blob step will fail closed honestly.
    errors.push(
      `pre-failure blob store empty at ${sourceBlobRoot} — BLOB_PARITY_PASS will fail closed`
    );
  }

  // ── 2) Postgres PITR into empty scratch ────────────────────────────────
  if (!isEmptyDir(scratch)) {
    // Operator must pass empty scratch; do not auto-wipe (could be wrong path).
    const report = failReport({
      started,
      options,
      scratch,
      blobDir,
      sourceConn,
      preCounts,
      preLedger,
      preBlobHashes,
      errors: [
        ...errors,
        `scratch PGDATA must be empty before fire-drill restore (strict): ${scratch}`,
      ],
      reportPath,
    });
    return report;
  }
  mkdirSync(scratch, { recursive: true });

  // Clear *stale* pgBackRest restore locks only when no live restore process holds them.
  // Concurrent/orphan locks cause exit 50 ("unable to acquire lock") which mapPgbackrestFailure
  // mislabels as integrity/WAL-range errors.
  clearStalePgbackrestRestoreLocks(env);

  // skipStart: we start on a known port for parity queries.
  let pitr: PitrRestoreResult | null = null;
  try {
    pitr = await runPitrRestore({
      pitr: options.targetTimestamp,
      scratch,
      targetAction: 'promote',
      env,
      skipStart: true,
      statusPath: join(dirnameSafe(reportPath), 'pitr-restore-status.json'),
      // Large base backups over R2 routinely exceed 5–10 minutes.
      timeoutMs: options.pitrTimeoutMs ?? 1_200_000,
    });
  } catch (e) {
    errors.push(`runPitrRestore threw: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!pitr?.ok) {
    const named = pitr?.namedErrors?.length
      ? pitr.namedErrors
      : (pitr?.errors ?? ['pgBackRest PITR restore failed']);
    errors.push(...named);
    const report = failReport({
      started,
      options,
      scratch,
      blobDir,
      sourceConn,
      preCounts,
      preLedger,
      preBlobHashes,
      errors,
      pitr,
      reportPath,
    });
    return report;
  }

  // ── 3) Start restored Postgres + row-count parity ──────────────────────
  const startedPg = startRestoredPostgres(scratch, restorePort, env);
  if (!startedPg.ok) {
    errors.push(
      `restored Postgres failed to start on port ${restorePort}: ${startedPg.log.slice(0, 600)}`
    );
    tryStopPostgres(scratch, env);
    const report = failReport({
      started,
      options,
      scratch,
      blobDir,
      sourceConn,
      preCounts,
      preLedger,
      preBlobHashes,
      errors,
      pitr,
      reportPath,
    });
    return report;
  }

  // Prefer short unix socket dir, then TCP 127.0.0.1 (never long worktree PGDATA as -h).
  let restoredConn: PsqlConnection = {
    host: startedPg.socketDir,
    port: restorePort,
    database: restoreDatabase,
    env,
  };
  // Probe connectivity / discover actual DB name.
  const probe = run(
    'psql',
    [
      '-h',
      startedPg.socketDir,
      '-p',
      String(restorePort),
      '-d',
      restoreDatabase,
      '-tAc',
      'SELECT 1',
    ],
    { env, timeoutMs: 15_000 }
  );
  if (probe.status !== 0) {
    const probe2 = run(
      'psql',
      ['-h', '127.0.0.1', '-p', String(restorePort), '-d', restoreDatabase, '-tAc', 'SELECT 1'],
      { env, timeoutMs: 15_000 }
    );
    if (probe2.status === 0) {
      restoredConn = {
        host: '127.0.0.1',
        port: restorePort,
        database: restoreDatabase,
        env,
      };
    } else {
      // Try postgres DB then list.
      const probePg = run(
        'psql',
        [
          '-h',
          startedPg.socketDir,
          '-p',
          String(restorePort),
          '-d',
          'postgres',
          '-tAc',
          'SELECT 1',
        ],
        { env, timeoutMs: 15_000 }
      );
      if (probePg.status === 0) {
        restoredConn = {
          host: startedPg.socketDir,
          port: restorePort,
          database: 'postgres',
          env,
        };
        // Prefer holocron if it exists.
        const dbs = run(
          'psql',
          [
            '-h',
            startedPg.socketDir,
            '-p',
            String(restorePort),
            '-d',
            'postgres',
            '-tAc',
            "SELECT datname FROM pg_database WHERE datname = 'holocron'",
          ],
          { env, timeoutMs: 15_000 }
        );
        if (dbs.status === 0 && dbs.stdout.trim() === 'holocron') {
          restoredConn.database = 'holocron';
        }
      } else {
        const probeTcpPg = run(
          'psql',
          ['-h', '127.0.0.1', '-p', String(restorePort), '-d', 'postgres', '-tAc', 'SELECT 1'],
          { env, timeoutMs: 15_000 }
        );
        if (probeTcpPg.status === 0) {
          restoredConn = {
            host: '127.0.0.1',
            port: restorePort,
            database: 'postgres',
            env,
          };
          const dbs = run(
            'psql',
            [
              '-h',
              '127.0.0.1',
              '-p',
              String(restorePort),
              '-d',
              'postgres',
              '-tAc',
              "SELECT datname FROM pg_database WHERE datname = 'holocron'",
            ],
            { env, timeoutMs: 15_000 }
          );
          if (dbs.status === 0 && dbs.stdout.trim() === 'holocron') {
            restoredConn.database = 'holocron';
          }
        } else {
          errors.push(
            `restored Postgres not queryable: ${(probe.stderr || probe.stdout || probe2.stderr || probeTcpPg.stderr).slice(0, 400)}`
          );
        }
      }
    }
  }

  let restoredCounts = { row_counts: {} as Record<string, number> };
  let restoredLedger = {
    ledger_checksum: '',
    per_table: {} as Record<string, string>,
    sample_tx_windows: [] as ReturnType<typeof computeLedgerChecksum>['sample_tx_windows'],
    ok: false,
  };
  let postgresParity = false;
  let ledgerMatch = false;
  let rowMismatches: Array<{
    table: string;
    expected: number | null;
    actual: number | null;
  }> = [];

  if (errors.filter((e) => e.includes('not queryable')).length === 0) {
    restoredCounts = captureRowCounts(restoredConn, FIRE_DRILL_COUNT_TABLES);
    const cmp = compareRowCountsExact(preCounts.row_counts, restoredCounts.row_counts);
    rowMismatches = cmp.mismatches;
    postgresParity = cmp.ok;
    if (!postgresParity) {
      errors.push(
        `POSTGRES_PARITY_PASS=false: row count mismatches: ${JSON.stringify(cmp.mismatches)}`
      );
    }

    restoredLedger = computeLedgerChecksum(restoredConn);
    ledgerMatch =
      restoredLedger.ok &&
      restoredLedger.ledger_checksum === preLedger.ledger_checksum &&
      preLedger.ledger_checksum.length === 32;
    if (!ledgerMatch) {
      errors.push(
        `LEDGER_CHECKSUM_MATCH=false: expected=${preLedger.ledger_checksum} actual=${restoredLedger.ledger_checksum}`
      );
    }
  }

  // ── 4) Blob restic restore + SHA-256 parity ────────────────────────────
  // Blob target must be empty and distinct from source.
  mkdirSync(blobDir, { recursive: true });
  if (!isEmptyDir(blobDir)) {
    // Allow re-run only if operator wiped; refuse non-empty.
    errors.push(`blob-dir not empty before restore: ${blobDir}`);
  }

  let blobOk = false;
  let blobParity: ParityCompareResult | null = null;
  let matched_objects = 0;
  let restored_blob_objects = 0;
  let restic_snapshot_id: string | null = null;
  let restic_repository: string | null = null;

  if (isEmptyDir(blobDir) && preBlobHashes.hashes.length > 0) {
    const blob = restoreBlobsAndParity({
      blobDir,
      preFailureHashes: preBlobHashes,
      env,
      sourceBlobRoot,
    });
    blobOk = blob.ok;
    blobParity = blob.parity;
    matched_objects = blob.matched_objects;
    restored_blob_objects = blob.restored_blob_objects;
    restic_snapshot_id = blob.snapshotId;
    restic_repository = blob.repository;
    errors.push(...blob.errors);
  } else if (preBlobHashes.hashes.length === 0) {
    errors.push('BLOB_PARITY_PASS=false: empty pre-failure blob manifest (no objects to verify)');
  }

  // ── 5) Emit unified report ─────────────────────────────────────────────
  // Filter "soft" pre-warnings that are already represented by pass flags
  // when overall still fails — keep all errors for honesty.
  const finalErrors = [...new Set(errors)];
  const allPass = postgresParity && ledgerMatch && blobOk && matched_objects > 0;

  const report = buildParityReport({
    capturedAt: new Date().toISOString(),
    targetTimestamp: options.targetTimestamp,
    actualStopTimestamp: pitr.actualStopTimestamp,
    scratchPgdata: scratch,
    blobDir,
    sourceDatabase: preCounts.connection,
    POSTGRES_PARITY_PASS: postgresParity,
    pre_failure_row_counts: preCounts.row_counts,
    restored_row_counts: restoredCounts.row_counts,
    row_counts: restoredCounts.row_counts,
    row_count_mismatches: rowMismatches,
    LEDGER_CHECKSUM_MATCH: ledgerMatch,
    ledger_checksum: restoredLedger.ledger_checksum,
    pre_failure_ledger_checksum: preLedger.ledger_checksum,
    ledger_per_table: restoredLedger.per_table,
    sample_tx_windows: restoredLedger.sample_tx_windows,
    BLOB_PARITY_PASS: blobOk,
    matched_objects,
    pre_failure_blob_objects: preBlobHashes.hashes.length,
    restored_blob_objects,
    blob_parity: blobParity,
    restic_snapshot_id,
    restic_repository,
    errors: allPass ? [] : finalErrors,
    durationMs: Date.now() - started,
    ok: allPass,
    exitCode: allPass ? 0 : 1,
  });

  writeParityReport(reportPath, report);

  // Cleanup: stop restored postmaster unless requested otherwise.
  if (!options.keepPostgresRunning && !options.skipCleanup) {
    tryStopPostgres(scratch, env);
  }

  return {
    ok: allPass,
    exitCode: allPass ? 0 : 1,
    report,
    reportPath,
    pitr,
    errors: report.errors,
  };
}

function dirnameSafe(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i > 0 ? path.slice(0, i) : '.';
}

function failReport(args: {
  started: number;
  options: FireDrillOptions;
  scratch: string;
  blobDir: string;
  sourceConn: PsqlConnection;
  preCounts: ReturnType<typeof captureRowCounts>;
  preLedger: ReturnType<typeof computeLedgerChecksum>;
  preBlobHashes: ReturnType<typeof hashLocalBlobStore>;
  errors: string[];
  pitr?: PitrRestoreResult | null;
  reportPath: string;
}): FireDrillResult {
  const report = buildParityReport({
    capturedAt: new Date().toISOString(),
    targetTimestamp: args.options.targetTimestamp,
    actualStopTimestamp: args.pitr?.actualStopTimestamp ?? null,
    scratchPgdata: args.scratch,
    blobDir: args.blobDir,
    sourceDatabase: args.preCounts.connection,
    POSTGRES_PARITY_PASS: false,
    pre_failure_row_counts: args.preCounts.row_counts,
    restored_row_counts: {},
    row_counts: {},
    row_count_mismatches: [],
    LEDGER_CHECKSUM_MATCH: false,
    ledger_checksum: '',
    pre_failure_ledger_checksum: args.preLedger.ledger_checksum,
    ledger_per_table: args.preLedger.per_table,
    sample_tx_windows: args.preLedger.sample_tx_windows,
    BLOB_PARITY_PASS: false,
    matched_objects: 0,
    pre_failure_blob_objects: args.preBlobHashes.hashes.length,
    restored_blob_objects: 0,
    blob_parity: null,
    restic_snapshot_id: null,
    restic_repository: null,
    errors: args.errors,
    durationMs: Date.now() - args.started,
    ok: false,
    exitCode: 1,
  });
  writeParityReport(args.reportPath, report);
  return {
    ok: false,
    exitCode: 1,
    report,
    reportPath: args.reportPath,
    pitr: args.pitr ?? null,
    errors: args.errors,
  };
}

export type { FireDrillParityReport };
export { formatParityReportText, writeParityReport };

/** Optional: wipe a path only when it is under /tmp or .tmp (safety). */
export function safeWipeScratch(path: string): boolean {
  const abs = resolve(path);
  if (!abs.includes('/tmp/') && !abs.includes('/.tmp/') && !abs.startsWith('/tmp')) {
    return false;
  }
  if (isForbiddenPath(abs, process.env)) return false;
  if (!existsSync(abs)) return true;
  try {
    const st = statSync(abs);
    if (!st.isDirectory()) return false;
    wipeDirContents(abs);
    return true;
  } catch {
    return false;
  }
}
