/**
 * Full CAP-BAK-01 fire drill (D05-04): Postgres PITR + restic blob restore + parity.
 *
 * Flow (strict order):
 *   1. Load immutable recovery baseline from R2 (SHA-256 oracle — REDHAT-FIX-C5)
 *      Optional live-mini pre-failure snapshot is diagnostic only when baseline present
 *   2. Restore Postgres via runPitrRestore into empty --scratch (never live mini PGDATA)
 *   3. Start restored cluster; compare row counts → POSTGRES_PARITY_PASS
 *   4. Compare ledger SHA-256 vs baseline.ledger_sha256 → LEDGER_CHECKSUM_MATCH
 *      (MD5 ledger_checksum retained as secondary diagnostic only)
 *   5. restic restore from R2 into empty --blob-dir; SHA-256 set / baseline
 *      blob_manifest_sha256 parity → BLOB_PARITY_PASS
 *   6. Emit unified parity-report.json with baseline_id + concrete counts/digests
 *   7. Exit 0 only if ALL three pass (fail-closed otherwise)
 *
 * NEVER stubs BLOB_PARITY_PASS when restic/R2 is unavailable — named error + non-zero exit.
 * NEVER uses MD5 as the sole ledger integrity oracle.
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
  baselineDomainRowTotal,
  compareRestoredToBaseline,
  computeBlobManifestSha256,
  computeLedgerSha256,
  isBaselineParityMeaningful,
  listRecoveryBaselines,
  loadRecoveryBaselineFromR2,
  normalizeSha256Digest,
  type RecoveryBaseline,
  verifyResticSnapshotInRepo,
} from './recovery-baseline.ts';
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
  /**
   * REDHAT-FIX-S28R2-C1: provisioned fresh-target host name (attestation only;
   * CLI/script bind scratch+blob to volume mountpoints before calling runFireDrill).
   */
  freshTarget?: string;
  /** Optional attestation payload from --fresh-target volume resolve. */
  freshTargetAttestation?: Record<string, unknown>;
  /** Content-addressed recovery baseline id (R2). */
  baselineId?: string;
  /** Explicit R2 object key for recovery-baseline.json. */
  baselineKey?: string;
  /** pgBackRest backup label for by-backup baseline lookup. */
  pgbackrestBackupLabel?: string;
  /** restic snapshot id for by-backup baseline lookup / preferred restore. */
  resticSnapshotId?: string;
  /**
   * When true (default), refuse ok without a verified R2 recovery baseline.
   * Live mini pre-failure alone is never the sole oracle (REDHAT-FIX-C5).
   */
  requireRecoveryBaseline?: boolean;
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

type LoadedBaseline = {
  baseline: RecoveryBaseline;
  key: string | null;
};

export type FireDrillBaselineCandidate = {
  baseline: RecoveryBaseline;
  key: string;
  /** Parsed target_timestamp ms. */
  ts: number;
};

/**
 * Select the best recovery baseline among R2 discovery candidates.
 *
 * Prefer parity-meaningful baselines (non-zero domain row_counts + restic id)
 * over zero-count / junk entries even when junk is newer. Among meaningful
 * survivors, rank by target_timestamp desc then domain row totals as tiebreaker.
 * When requireMeaningful is true (discovery default), return null if only
 * zero-count junk remains — fail closed rather than loading expected counts of 0
 * that poison POSTGRES_PARITY_PASS.
 */
export function selectBestFireDrillBaseline(
  candidates: FireDrillBaselineCandidate[],
  options?: {
    targetTimestamp?: string;
    /** When true (default for discovery), refuse zero-count-only sets. */
    requireMeaningful?: boolean;
  }
): FireDrillBaselineCandidate | null {
  if (!candidates.length) return null;
  const requireMeaningful = options?.requireMeaningful !== false;

  const meaningful = candidates.filter((c) => isBaselineParityMeaningful(c.baseline));
  const pool = meaningful.length > 0 ? meaningful : requireMeaningful ? [] : candidates;
  if (pool.length === 0) return null;

  // Among meaningful survivors: prefer latest target_timestamp, then higher domain row totals.
  const ranked = [...pool].sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    const ta = baselineDomainRowTotal(a.baseline.row_counts);
    const tb = baselineDomainRowTotal(b.baseline.row_counts);
    return tb - ta;
  });
  return ranked[0] ?? null;
}

/**
 * Resolve the immutable R2 recovery baseline for this fire-drill.
 * Prefers explicit id/key/label bindings, then discovers by target timestamp
 * while rejecting zero-count / non-restorable junk when a valid candidate exists.
 */
function resolveFireDrillBaseline(
  options: FireDrillOptions,
  env: NodeJS.ProcessEnv
): { loaded: LoadedBaseline | null; errors: string[] } {
  const errors: string[] = [];
  const baselineId =
    options.baselineId?.trim() ||
    env.HOLO_RECOVERY_BASELINE_ID?.trim() ||
    env.RECOVERY_BASELINE_ID?.trim() ||
    '';
  const baselineKey =
    options.baselineKey?.trim() ||
    env.HOLO_RECOVERY_BASELINE_KEY?.trim() ||
    env.RECOVERY_BASELINE_KEY?.trim() ||
    '';
  const label =
    options.pgbackrestBackupLabel?.trim() ||
    env.HOLO_PGBACKREST_BACKUP_LABEL?.trim() ||
    env.PGBACKREST_BACKUP_LABEL?.trim() ||
    '';
  const restic =
    options.resticSnapshotId?.trim() ||
    env.HOLO_RESTIC_SNAPSHOT_ID?.trim() ||
    env.RESTIC_SNAPSHOT_ID?.trim() ||
    '';

  const tryLoad = (load: {
    baselineId?: string;
    key?: string;
    pgbackrestBackupLabel?: string;
    resticSnapshotId?: string;
  }): LoadedBaseline | null => {
    const res = loadRecoveryBaselineFromR2({ ...load, env });
    if (res.ok && res.baseline) {
      return { baseline: res.baseline, key: res.key };
    }
    if (res.errors.length) errors.push(...res.errors);
    return null;
  };

  if (baselineKey) {
    const hit = tryLoad({ key: baselineKey });
    if (hit) return { loaded: hit, errors: [] };
  }
  if (baselineId) {
    const hit = tryLoad({ baselineId });
    if (hit) return { loaded: hit, errors: [] };
  }
  if (label.length >= 8 && restic.length >= 8) {
    const hit = tryLoad({ pgbackrestBackupLabel: label, resticSnapshotId: restic });
    if (hit) return { loaded: hit, errors: [] };
  }

  // Discover by target timestamp: list R2 recovery-baselines, load content-addressed
  // objects, pick the best parity-meaningful baseline with target_timestamp <= drill target.
  // REDHAT-FIX-S28R2-H2: live-verify restic for each candidate; skip ghosts; fail closed.
  try {
    const listed = listRecoveryBaselines({ env });
    const targetMs = Date.parse(options.targetTimestamp);
    const contentKeys = listed.keys.filter((k) => /\/sha256\/[0-9a-f]{64}\//i.test(k));
    const candidates: FireDrillBaselineCandidate[] = [];
    for (const key of contentKeys.slice(0, 64)) {
      const res = loadRecoveryBaselineFromR2({ key, env });
      if (!res.ok || !res.baseline) continue;
      const ts = Date.parse(res.baseline.target_timestamp);
      if (Number.isNaN(ts)) continue;
      if (!Number.isNaN(targetMs) && ts > targetMs + 60_000) continue; // allow 60s skew
      candidates.push({ baseline: res.baseline, key: res.key ?? key, ts });
    }
    if (candidates.length > 0) {
      const verified: FireDrillBaselineCandidate[] = [];
      const ghostErrors: string[] = [];
      for (const c of candidates) {
        const snapId = (c.baseline.restic_snapshot_id ?? '').trim();
        if (snapId.length < 8) {
          ghostErrors.push(`skip ghost baseline ${c.key}: restic_snapshot_id too short`);
          continue;
        }
        const resticCheck = verifyResticSnapshotInRepo({
          resticSnapshotId: snapId,
          env,
        });
        if (!resticCheck.ok) {
          ghostErrors.push(
            `skip ghost/unlistable restic baseline ${c.key} id=${snapId}: ${resticCheck.error ?? 'not found'}`
          );
          continue;
        }
        verified.push(c);
      }
      if (ghostErrors.length) {
        errors.push(...ghostErrors.slice(0, 8));
      }
      if (verified.length === 0) {
        errors.push(
          `no restic-verified recovery baseline among ${candidates.length} candidates (all ghosts/unlistable) — fail closed`
        );
        return { loaded: null, errors: [...new Set(errors)] };
      }
      const best = selectBestFireDrillBaseline(verified, {
        targetTimestamp: options.targetTimestamp,
        requireMeaningful: true,
      });
      if (best) {
        return { loaded: { baseline: best.baseline, key: best.key }, errors: [] };
      }
      errors.push(
        `no parity-meaningful recovery baseline among ${verified.length} restic-verified candidates (zero-count/junk only) — refuse baseline-bound parity`
      );
      return { loaded: null, errors: [...new Set(errors)] };
    }
    if (listed.keys.length === 0) {
      errors.push(
        'no recovery-baseline objects under R2 recovery-baselines/ — refuse baseline-bound parity'
      );
    } else if (!Number.isNaN(targetMs)) {
      errors.push(
        `no recovery baseline with target_timestamp <= ${options.targetTimestamp} among ${listed.keys.length} R2 keys`
      );
    }
  } catch (e) {
    errors.push(
      `recovery baseline discovery failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return { loaded: null, errors: [...new Set(errors)] };
}

function emptyBaselineFields(): Pick<
  FireDrillParityReport,
  | 'baseline_loaded'
  | 'baseline_id'
  | 'baseline_sha256'
  | 'baseline_key'
  | 'pgbackrest_backup_label'
  | 'ledger_sha256'
  | 'pre_failure_ledger_sha256'
  | 'blob_manifest_sha256'
  | 'baseline_blob_manifest_sha256'
> {
  return {
    baseline_loaded: false,
    baseline_id: null,
    baseline_sha256: null,
    baseline_key: null,
    pgbackrest_backup_label: null,
    ledger_sha256: null,
    pre_failure_ledger_sha256: null,
    blob_manifest_sha256: null,
    baseline_blob_manifest_sha256: null,
  };
}

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
 * Restore restic blob snapshot from R2 into blobDir and compare SHA-256 sets /
 * baseline blob_manifest_sha256 against expected digests.
 */
function restoreBlobsAndParity(options: {
  blobDir: string;
  preFailureHashes: ReturnType<typeof hashLocalBlobStore>;
  env: NodeJS.ProcessEnv;
  sourceBlobRoot: string;
  /** Prefer baseline-bound restic snapshot when set. */
  preferredSnapshotId?: string | null;
  /** Expected baseline blob manifest (SHA-256); when set, is primary oracle. */
  expectedBlobManifestSha256?: string | null;
}): {
  ok: boolean;
  parity: ParityCompareResult | null;
  matched_objects: number;
  restored_blob_objects: number;
  snapshotId: string | null;
  repository: string | null;
  blob_manifest_sha256: string | null;
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
      blob_manifest_sha256: null,
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
      blob_manifest_sha256: null,
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
      blob_manifest_sha256: null,
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
      blob_manifest_sha256: null,
      errors: [
        `restic snapshots failed — refuse BLOB_PARITY_PASS: ${(snaps.stderr || snaps.stdout).slice(0, 500)}`,
      ],
    };
  }
  const latest = parseLatestSnapshotId(snaps.stdout);
  const preferred = options.preferredSnapshotId?.trim() || '';
  const snapshotId = preferred.length >= 8 ? preferred : latest.snapshotId;
  if (!snapshotId || latest.count === 0) {
    return {
      ok: false,
      parity: null,
      matched_objects: 0,
      restored_blob_objects: 0,
      snapshotId: null,
      repository: cfg.repository,
      blob_manifest_sha256: null,
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
      blob_manifest_sha256: null,
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
      blob_manifest_sha256: null,
      errors: [
        `restic restore failed (exit ${restore.status}) — refuse BLOB_PARITY_PASS: ${(restore.stderr || restore.stdout).slice(0, 600)}`,
      ],
    };
  }

  const restoredRoot = findRestoredBlobRoot(options.blobDir, options.sourceBlobRoot);
  const restoredHashes = hashDirectoryTree(restoredRoot);
  const blob_manifest_sha256 = computeBlobManifestSha256(restoredRoot);
  const expectedManifest = normalizeSha256Digest(options.expectedBlobManifestSha256 ?? null);
  const hasBaselineManifest = expectedManifest !== null;
  const hasLocalPreFailure = options.preFailureHashes.hashes.length > 0;

  let parity: ParityCompareResult | null = null;
  let matched_objects = 0;
  let setOk = false;

  if (hasLocalPreFailure) {
    parity = compareHashSets(options.preFailureHashes, restoredHashes);
    matched_objects = parity.ok
      ? parity.localCount
      : Math.max(0, parity.localCount - parity.missingRemote.length);
    setOk = parity.ok && matched_objects > 0;
    if (!parity.ok) {
      errors.push(
        `blob SHA-256 set parity FAILED: local=${parity.localCount} restored=${parity.remoteCount} ` +
          `missing_restored=${parity.missingRemote.length} extra_restored=${parity.extraRemote.length} ` +
          `sample_missing=${parity.missingRemote.slice(0, 3).join(',') || '-'} ` +
          `sample_extra=${parity.extraRemote.slice(0, 3).join(',') || '-'}`
      );
    }
  }

  let manifestOk = false;
  if (hasBaselineManifest) {
    manifestOk = normalizeSha256Digest(blob_manifest_sha256) === expectedManifest;
    if (!manifestOk) {
      errors.push(
        `blob_manifest_sha256 mismatch vs baseline: expected=${expectedManifest} actual=${blob_manifest_sha256}`
      );
    } else if (!hasLocalPreFailure) {
      // Baseline-only path: matched_objects from restored tree size.
      matched_objects = restoredHashes.hashes.length;
    }
  }

  if (restoredHashes.fileCount === 0) {
    errors.push(
      'restic restore produced zero objects — refuse BLOB_PARITY_PASS (matched_objects=0)'
    );
  }
  if (!hasLocalPreFailure && !hasBaselineManifest) {
    errors.push(
      'blob oracle missing — need pre-failure local hashes or baseline.blob_manifest_sha256'
    );
  }

  // Prefer baseline manifest when present; otherwise set parity against local pre-failure.
  const oracleOk = hasBaselineManifest ? manifestOk : setOk;
  // Soft: local set-parity noise is secondary when baseline manifest matches.
  const hardErrors = errors.filter((e) => {
    if (hasBaselineManifest && e.includes('set parity FAILED')) return false;
    return true;
  });
  const finalOk =
    hardErrors.length === 0 && oracleOk && matched_objects > 0 && restoredHashes.fileCount > 0;

  return {
    ok: finalOk,
    parity,
    matched_objects: finalOk || (hasBaselineManifest && manifestOk) || setOk ? matched_objects : 0,
    restored_blob_objects: restoredHashes.hashes.length,
    snapshotId,
    repository: cfg.repository.replace(/\/\/([^@/]+)@/, '//***@'),
    blob_manifest_sha256,
    errors: finalOk ? [] : hardErrors.length ? hardErrors : errors,
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
      ...emptyBaselineFields(),
      errors,
      durationMs: Date.now() - started,
      ok: false,
      exitCode: 1,
    });
    writeParityReport(reportPath, report);
    return { ok: false, exitCode: 1, report, reportPath, pitr: null, errors };
  }

  // ── 1a) Load immutable R2 recovery baseline (SHA-256 oracle) ───────────
  // GATE-FIX-S28R3-QA3 / C-2: fresh-target never queries live mini; baseline required.
  const isFreshTarget = Boolean(options.freshTarget && String(options.freshTarget).trim());
  const requireBaseline = isFreshTarget ? true : options.requireRecoveryBaseline !== false;
  const baselineResolve = resolveFireDrillBaseline(options, env);
  const loadedBaseline = baselineResolve.loaded;
  if (!loadedBaseline && requireBaseline) {
    errors.push(
      ...(baselineResolve.errors.length
        ? baselineResolve.errors
        : [
            isFreshTarget
              ? 'fresh-target fire-drill requires verified R2 recovery baseline — refuse live source fallback (GATE-FIX-S28R3-QA3/C-2)'
              : 'recovery baseline missing/unverified from R2 — refuse fire-drill parity (REDHAT-FIX-C5)',
          ])
    );
  } else if (!loadedBaseline && baselineResolve.errors.length) {
    // Soft: still attempt live pre-failure path only when explicitly not required.
    errors.push(...baselineResolve.errors.map((e) => `baseline warn: ${e}`));
  }

  // ── 1b) Optional live pre-failure snapshot (diagnostic; not sole oracle) ─
  // freshTarget: skip defaultSourceConnection / live captureRowCounts entirely.
  let sourceConn: PsqlConnection;
  let preCounts = {
    capturedAt: new Date().toISOString(),
    row_counts: {} as Record<string, number>,
    connection: { host: 'fresh-target-no-live-source', port: 0, database: 'n/a' },
  };
  let preLedger = {
    ledger_checksum: '',
    per_table: {} as Record<string, string>,
    sample_tx_windows: [] as ReturnType<typeof computeLedgerChecksum>['sample_tx_windows'],
    ok: false,
  };
  let preLedgerSha256: string | null = null;
  let livePreFailureOk = false;

  if (isFreshTarget) {
    // Synthetic connection metadata only — never dial DATABASE_URL / PG*.
    sourceConn = {
      host: 'fresh-target-no-live-source',
      port: 0,
      database: 'n/a',
    };
    preCounts = {
      capturedAt: new Date().toISOString(),
      row_counts: loadedBaseline ? { ...loadedBaseline.baseline.row_counts } : {},
      connection: {
        host: sourceConn.host,
        port: sourceConn.port,
        database: sourceConn.database,
      },
    };
    if (!loadedBaseline) {
      errors.push(
        'fresh-target mode: no live source snapshot attempted; recovery baseline required and missing — refuse fire-drill'
      );
    }
  } else {
    if (options.sourceDatabaseUrl) {
      const { connectionFromDatabaseUrl } = await import('./evidence-ledger-verify.ts');
      sourceConn = connectionFromDatabaseUrl(options.sourceDatabaseUrl, env);
    } else {
      sourceConn = defaultSourceConnection(env);
    }

    preCounts = {
      capturedAt: new Date().toISOString(),
      row_counts: {} as Record<string, number>,
      connection: { host: sourceConn.host, port: sourceConn.port, database: sourceConn.database },
    };
    try {
      preCounts = captureRowCounts(sourceConn, FIRE_DRILL_COUNT_TABLES);
      preLedger = computeLedgerChecksum(sourceConn);
      const sha = computeLedgerSha256(sourceConn);
      preLedgerSha256 = normalizeSha256Digest(sha.ledger_sha256);
      livePreFailureOk =
        Object.keys(preCounts.row_counts).length > 0 &&
        (preLedgerSha256 !== null ||
          (typeof preLedger.ledger_checksum === 'string' && preLedger.ledger_checksum.length === 32));
    } catch (e) {
      if (!loadedBaseline) {
        errors.push(
          `pre-failure live snapshot failed and no R2 baseline: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }
  }

  // Expected counts/digests: R2 baseline preferred over live mini.
  const expectedRowCounts = loadedBaseline
    ? loadedBaseline.baseline.row_counts
    : preCounts.row_counts;
  const expectedLedgerSha256 = loadedBaseline
    ? normalizeSha256Digest(loadedBaseline.baseline.ledger_sha256)
    : preLedgerSha256;
  const expectedBlobManifest = loadedBaseline
    ? normalizeSha256Digest(loadedBaseline.baseline.blob_manifest_sha256)
    : null;

  if (!loadedBaseline) {
    if (Object.keys(expectedRowCounts).length === 0) {
      errors.push(
        'pre-failure snapshot captured zero domain tables and no R2 baseline — refuse fire-drill'
      );
    }
    if (
      !expectedLedgerSha256 &&
      (!preLedger.ledger_checksum || preLedger.ledger_checksum.length !== 32)
    ) {
      errors.push(
        'pre-failure ledger digest empty (no SHA-256, no MD5 diagnostic) and no R2 baseline — refuse fire-drill'
      );
    }
    if (!expectedLedgerSha256 && preLedger.ledger_checksum.length === 32) {
      errors.push(
        'MD5-only pre-failure ledger without R2 recovery baseline — refuse sole-oracle MD5 (REDHAT-FIX-C5)'
      );
    }
  }

  // Persist pre-failure / baseline oracle artifact for audit (before any restore mutates targets).
  const preFailurePath = join(dirnameSafe(reportPath), 'pre-failure-snapshot.json');
  writeFileSync(
    preFailurePath,
    `${JSON.stringify(
      {
        capturedAt: preCounts.capturedAt,
        row_counts: expectedRowCounts,
        live_row_counts: preCounts.row_counts,
        ledger_checksum: preLedger.ledger_checksum,
        ledger_sha256: expectedLedgerSha256,
        live_ledger_sha256: preLedgerSha256,
        ledger_per_table: preLedger.per_table,
        sample_tx_windows: preLedger.sample_tx_windows,
        source: preCounts.connection,
        sourceBlobRoot,
        livePreFailureOk,
        baseline_loaded: Boolean(loadedBaseline),
        baseline_id: loadedBaseline?.baseline.baseline_id ?? null,
        baseline_key: loadedBaseline?.key ?? null,
        pgbackrest_backup_label: loadedBaseline?.baseline.pgbackrest_backup_label ?? null,
        restic_snapshot_id: loadedBaseline?.baseline.restic_snapshot_id ?? null,
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );

  // Pre-failure blob manifest (SHA-256 set of local content-addressed store) — optional when baseline binds blob_manifest.
  const preBlobHashes = hashLocalBlobStore(sourceBlobRoot);
  if (preBlobHashes.hashes.length === 0 && !expectedBlobManifest) {
    // Not yet fatal for postgres path — blob step will fail closed honestly.
    errors.push(
      `pre-failure blob store empty at ${sourceBlobRoot} and no baseline.blob_manifest_sha256 — BLOB_PARITY_PASS will fail closed`
    );
  }

  // Fail-closed before expensive PITR when baseline is required but missing.
  if (requireBaseline && !loadedBaseline) {
    const report = failReport({
      started,
      options,
      scratch,
      blobDir,
      sourceConn,
      preCounts,
      preLedger,
      preLedgerSha256: expectedLedgerSha256,
      expectedRowCounts,
      preBlobHashes,
      loadedBaseline,
      errors,
      reportPath,
    });
    return report;
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
      preLedgerSha256: expectedLedgerSha256,
      expectedRowCounts,
      preBlobHashes,
      loadedBaseline,
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
      preLedgerSha256: expectedLedgerSha256,
      expectedRowCounts,
      preBlobHashes,
      loadedBaseline,
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
      preLedgerSha256: expectedLedgerSha256,
      expectedRowCounts,
      preBlobHashes,
      loadedBaseline,
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
  let restoredLedgerSha256: string | null = null;
  let postgresParity = false;
  let ledgerMatch = false;
  let rowMismatches: Array<{
    table: string;
    expected: number | null;
    actual: number | null;
  }> = [];

  if (errors.filter((e) => e.includes('not queryable')).length === 0) {
    restoredCounts = captureRowCounts(restoredConn, FIRE_DRILL_COUNT_TABLES);
    const restoredSha = computeLedgerSha256(restoredConn);
    restoredLedgerSha256 = normalizeSha256Digest(restoredSha.ledger_sha256);
    restoredLedger = computeLedgerChecksum(restoredConn);

    if (loadedBaseline) {
      // Sole integrity oracle: R2 recovery baseline (SHA-256) — never live mini alone.
      const cmp = compareRestoredToBaseline({
        baseline: loadedBaseline.baseline,
        actualRowCounts: restoredCounts.row_counts,
        actualLedgerSha256: restoredLedgerSha256 ?? restoredSha.ledger_sha256,
        // blob compared after restic restore
        actualBlobManifestSha256: null,
      });
      postgresParity = cmp.POSTGRES_PARITY_PASS;
      ledgerMatch = cmp.LEDGER_CHECKSUM_MATCH;
      rowMismatches = Object.keys({
        ...loadedBaseline.baseline.row_counts,
        ...restoredCounts.row_counts,
      })
        .filter((t) => loadedBaseline.baseline.row_counts[t] !== restoredCounts.row_counts[t])
        .map((t) => ({
          table: t,
          expected: loadedBaseline.baseline.row_counts[t] ?? null,
          actual: restoredCounts.row_counts[t] ?? null,
        }));
      if (!postgresParity || !ledgerMatch) {
        errors.push(...cmp.errors);
      }
    } else {
      const cmp = compareRowCountsExact(expectedRowCounts, restoredCounts.row_counts);
      rowMismatches = cmp.mismatches;
      postgresParity = cmp.ok;
      if (!postgresParity) {
        errors.push(
          `POSTGRES_PARITY_PASS=false: row count mismatches: ${JSON.stringify(cmp.mismatches)}`
        );
      }
      ledgerMatch =
        restoredLedgerSha256 !== null &&
        expectedLedgerSha256 !== null &&
        restoredLedgerSha256 === expectedLedgerSha256;
      if (!ledgerMatch) {
        errors.push(
          `LEDGER_CHECKSUM_MATCH=false: expected_sha256=${expectedLedgerSha256 ?? '(none)'} actual_sha256=${restoredLedgerSha256 ?? '(none)'} md5_diag expected=${preLedger.ledger_checksum} actual=${restoredLedger.ledger_checksum}`
        );
      }
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
  let blob_manifest_sha256: string | null = null;

  const canRestoreBlobs =
    isEmptyDir(blobDir) && (preBlobHashes.hashes.length > 0 || Boolean(expectedBlobManifest));
  if (canRestoreBlobs) {
    const blob = restoreBlobsAndParity({
      blobDir,
      preFailureHashes: preBlobHashes,
      env,
      sourceBlobRoot,
      preferredSnapshotId:
        options.resticSnapshotId ?? loadedBaseline?.baseline.restic_snapshot_id ?? null,
      expectedBlobManifestSha256: expectedBlobManifest,
    });
    blobOk = blob.ok;
    blobParity = blob.parity;
    matched_objects = blob.matched_objects;
    restored_blob_objects = blob.restored_blob_objects;
    restic_snapshot_id = blob.snapshotId;
    restic_repository = blob.repository;
    blob_manifest_sha256 = blob.blob_manifest_sha256;
    errors.push(...blob.errors);

    // When baseline present, re-check blob_manifest via compareRestoredToBaseline.
    if (loadedBaseline && blob_manifest_sha256) {
      const full = compareRestoredToBaseline({
        baseline: loadedBaseline.baseline,
        actualRowCounts: restoredCounts.row_counts,
        actualLedgerSha256: restoredLedgerSha256 ?? '',
        actualBlobManifestSha256: blob_manifest_sha256,
      });
      if (full.BLOB_MANIFEST_MATCH === false) {
        blobOk = false;
        errors.push(...full.errors.filter((e) => e.includes('blob_manifest')));
      } else if (
        full.BLOB_MANIFEST_MATCH === true &&
        full.POSTGRES_PARITY_PASS &&
        full.LEDGER_CHECKSUM_MATCH
      ) {
        // Align flags with full baseline compare when all axes match.
        postgresParity = full.POSTGRES_PARITY_PASS;
        ledgerMatch = full.LEDGER_CHECKSUM_MATCH;
      }
    }
  } else if (preBlobHashes.hashes.length === 0 && !expectedBlobManifest) {
    errors.push(
      'BLOB_PARITY_PASS=false: empty pre-failure blob manifest and no baseline.blob_manifest_sha256'
    );
  }

  // ── 5) Emit unified report ─────────────────────────────────────────────
  const finalErrors = [...new Set(errors)];
  // Refuse ok without verified R2 baseline when required (default).
  if (requireBaseline && !loadedBaseline) {
    finalErrors.push(
      'recovery baseline not loaded — refuse ok (MD5/live-mini alone is never sole oracle)'
    );
  }
  const allPass =
    postgresParity &&
    ledgerMatch &&
    blobOk &&
    matched_objects > 0 &&
    (!requireBaseline || Boolean(loadedBaseline)) &&
    Boolean(restoredLedgerSha256 || (loadedBaseline && ledgerMatch));

  const baselineFields = loadedBaseline
    ? {
        baseline_loaded: true as const,
        baseline_id: loadedBaseline.baseline.baseline_id,
        baseline_sha256: loadedBaseline.baseline.baseline_id,
        baseline_key: loadedBaseline.key,
        pgbackrest_backup_label: loadedBaseline.baseline.pgbackrest_backup_label,
        ledger_sha256: restoredLedgerSha256,
        pre_failure_ledger_sha256: expectedLedgerSha256,
        blob_manifest_sha256,
        baseline_blob_manifest_sha256: expectedBlobManifest,
      }
    : {
        ...emptyBaselineFields(),
        ledger_sha256: restoredLedgerSha256,
        pre_failure_ledger_sha256: expectedLedgerSha256,
        blob_manifest_sha256,
      };

  const report = buildParityReport({
    capturedAt: new Date().toISOString(),
    targetTimestamp: options.targetTimestamp,
    actualStopTimestamp: pitr.actualStopTimestamp,
    scratchPgdata: scratch,
    blobDir,
    sourceDatabase: preCounts.connection,
    POSTGRES_PARITY_PASS: postgresParity,
    pre_failure_row_counts: expectedRowCounts,
    restored_row_counts: restoredCounts.row_counts,
    row_counts: restoredCounts.row_counts,
    row_count_mismatches: rowMismatches,
    LEDGER_CHECKSUM_MATCH: ledgerMatch,
    // Prefer SHA-256 in ledger_checksum when available; keep MD5 as diagnostic secondary.
    ledger_checksum: restoredLedgerSha256 ?? restoredLedger.ledger_checksum,
    pre_failure_ledger_checksum: expectedLedgerSha256 ?? preLedger.ledger_checksum,
    ledger_per_table: restoredLedger.per_table,
    sample_tx_windows: restoredLedger.sample_tx_windows,
    BLOB_PARITY_PASS: blobOk,
    matched_objects,
    pre_failure_blob_objects: preBlobHashes.hashes.length,
    restored_blob_objects,
    blob_parity: blobParity,
    restic_snapshot_id: restic_snapshot_id ?? loadedBaseline?.baseline.restic_snapshot_id ?? null,
    restic_repository,
    ...baselineFields,
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
  preCounts: {
    capturedAt?: string;
    row_counts: Record<string, number>;
    connection: { host: string; port: number; database: string };
  };
  preLedger: {
    ledger_checksum: string;
    per_table: Record<string, string>;
    sample_tx_windows: ReturnType<typeof computeLedgerChecksum>['sample_tx_windows'];
  };
  preLedgerSha256: string | null;
  expectedRowCounts: Record<string, number>;
  preBlobHashes: ReturnType<typeof hashLocalBlobStore>;
  loadedBaseline: LoadedBaseline | null;
  errors: string[];
  pitr?: PitrRestoreResult | null;
  reportPath: string;
}): FireDrillResult {
  const b = args.loadedBaseline;
  const report = buildParityReport({
    capturedAt: new Date().toISOString(),
    targetTimestamp: args.options.targetTimestamp,
    actualStopTimestamp: args.pitr?.actualStopTimestamp ?? null,
    scratchPgdata: args.scratch,
    blobDir: args.blobDir,
    sourceDatabase: args.preCounts.connection,
    POSTGRES_PARITY_PASS: false,
    pre_failure_row_counts: args.expectedRowCounts,
    restored_row_counts: {},
    row_counts: {},
    row_count_mismatches: [],
    LEDGER_CHECKSUM_MATCH: false,
    ledger_checksum: '',
    pre_failure_ledger_checksum: args.preLedgerSha256 ?? args.preLedger.ledger_checksum,
    ledger_per_table: args.preLedger.per_table,
    sample_tx_windows: args.preLedger.sample_tx_windows,
    BLOB_PARITY_PASS: false,
    matched_objects: 0,
    pre_failure_blob_objects: args.preBlobHashes.hashes.length,
    restored_blob_objects: 0,
    blob_parity: null,
    restic_snapshot_id: b?.baseline.restic_snapshot_id ?? null,
    restic_repository: null,
    baseline_loaded: Boolean(b),
    baseline_id: b?.baseline.baseline_id ?? null,
    baseline_sha256: b?.baseline.baseline_id ?? null,
    baseline_key: b?.key ?? null,
    pgbackrest_backup_label: b?.baseline.pgbackrest_backup_label ?? null,
    ledger_sha256: null,
    pre_failure_ledger_sha256: args.preLedgerSha256,
    blob_manifest_sha256: null,
    baseline_blob_manifest_sha256: b
      ? normalizeSha256Digest(b.baseline.blob_manifest_sha256)
      : null,
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
