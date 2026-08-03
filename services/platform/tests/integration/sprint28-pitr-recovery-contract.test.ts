/**
 * REDHAT-FIX-C3 — PITR recovery / promotion / LSN contract (review C-3).
 *
 * Executable assertions for the corrected D05-02 contract:
 *   (1) pause path: real recovery catalogs + seeded sentinels (not invent last_applied_timestamp)
 *   (2) promote path: separate writable proof (pg_is_in_recovery=false + INSERT)
 *   (3) repeatable physical restores: equal system_identifier + matching row counts
 *   (4) contract docs: no last_applied_timestamp; no system_identifier inequality;
 *       no post-promote source-WAL catch-up requirement
 *
 * PLATFORM_IT=1 required for live restore. Static contract checks also run under PLATFORM_IT.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { loadBackupConfig } from '../../src/backup/config.ts';
import { LABEL_AFTER, LABEL_BEFORE, seedPitrSentinelWindow } from './helpers/pitr-sentinel-seed.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const RESTORE_TS = resolve(REPO_ROOT, 'services/platform/src/backup/restore.ts');
const D05_02 = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md'
);
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-C3');

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron_nonprod';
const RESTORED_DATABASE = new URL(DATABASE_URL).pathname.replace(/^\//, '') || 'postgres';

/** Optional override for an already-seeded WAL window target. */
const FORCED_PITR_TS = process.env.REDHAT_FIX_C3_PITR_TS?.trim() || null;
const FORCED_SENTINEL_NOTE = process.env.REDHAT_FIX_C3_SENTINEL_NOTE?.trim() || null;

type HoloRestoreRun = {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
  scratchDir: string;
  pgdataFileCount: number;
};

function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function writeEvidence(name: string, body: unknown): string {
  ensureEvidenceDir();
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function countFilesRecursive(root: string): number {
  if (!existsSync(root)) return 0;
  let count = 0;
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else count += 1;
    }
  };
  walk(root);
  return count;
}

function resolveSecretsPath(): string {
  const candidates = [
    process.env.HOLO_SECRETS_PATH,
    process.env.SECRETS_PATH,
    resolve(REPO_ROOT, 'services/platform/config/secrets.yaml'),
    '/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`no secrets.yaml found (checked ${candidates.join(', ')})`);
}

function runHoloRestore(options: {
  pitr: string;
  scratchDir: string;
  targetAction: 'pause' | 'promote';
  secretsPath: string;
  timeoutMs?: number;
}): HoloRestoreRun {
  mkdirSync(options.scratchDir, { recursive: true });
  expect(countFilesRecursive(options.scratchDir)).toBe(0);

  let cfgEnv: NodeJS.ProcessEnv = { ...process.env };
  try {
    const cfg = loadBackupConfig({ secretsPath: options.secretsPath });
    cfgEnv = {
      ...cfgEnv,
      R2_BUCKET_NAME: cfg.bucketName,
      R2_ENDPOINT: cfg.endpoint,
      R2_ACCOUNT_ID: cfg.accountId,
      R2_ACCESS_KEY_ID: cfg.accessKeyId,
      R2_SECRET_ACCESS_KEY: cfg.secretAccessKey,
      R2_PGBACKREST_PREFIX: cfg.pgbackrestPrefix,
      R2_REPO_CIPHER_PASS: cfg.repoCipherPass,
      PGBACKREST_STANZA: cfg.stanza,
      HOLO_SECRETS_PATH: options.secretsPath,
      DATABASE_URL,
    };
    if (cfg.sessionToken) cfgEnv.R2_SESSION_TOKEN = cfg.sessionToken;
  } catch {
    cfgEnv.HOLO_SECRETS_PATH = options.secretsPath;
    cfgEnv.DATABASE_URL = DATABASE_URL;
  }

  const result = spawnSync(
    BUN_BIN,
    [
      HOLO_CLI,
      'restore',
      '--pitr',
      options.pitr,
      '--scratch',
      options.scratchDir,
      '--target-action',
      options.targetAction,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: cfgEnv,
      timeout: options.timeoutMs ?? 600_000,
    }
  );

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    combined: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    scratchDir: options.scratchDir,
    pgdataFileCount: countFilesRecursive(options.scratchDir),
  };
}

function findRestorePort(scratchDir: string): number | null {
  // restore.ts uses a high port; try status log / postmaster.pid / common range probe.
  const logFile = join(scratchDir, 'holo-restore-start.log');
  if (existsSync(logFile)) {
    const body = readFileSync(logFile, 'utf8');
    const m = body.match(/-p\s+(\d{4,5})/) || body.match(/port\s+(\d{4,5})/i);
    if (m?.[1]) return Number(m[1]);
  }
  const pidFile = join(scratchDir, 'postmaster.pid');
  if (existsSync(pidFile)) {
    const lines = readFileSync(pidFile, 'utf8').split('\n');
    // line 4 is port in modern PG postmaster.pid
    if (lines[3] && /^\d+$/.test(lines[3].trim())) return Number(lines[3].trim());
  }
  return null;
}

function psqlOnScratch(
  scratchDir: string,
  sql: string,
  port?: number | null
): { status: number | null; stdout: string; stderr: string } {
  const p = port ?? findRestorePort(scratchDir);
  // Prefer TCP — restore.ts uses a short /tmp unix socket dir (AF_UNIX path limits).
  const attempts: Array<{ args: string[]; host: string }> = [];
  if (p) {
    attempts.push({
      host: '127.0.0.1',
      args: [
        '-h',
        '127.0.0.1',
        '-p',
        String(p),
        '-d',
        RESTORED_DATABASE,
        '-v',
        'ON_ERROR_STOP=1',
        '-tAc',
        sql,
      ],
    });
    attempts.push({
      host: scratchDir,
      args: [
        '-h',
        scratchDir,
        '-p',
        String(p),
        '-d',
        RESTORED_DATABASE,
        '-v',
        'ON_ERROR_STOP=1',
        '-tAc',
        sql,
      ],
    });
  }
  attempts.push({
    host: scratchDir,
    args: ['-h', scratchDir, '-d', RESTORED_DATABASE, '-v', 'ON_ERROR_STOP=1', '-tAc', sql],
  });

  let last = { status: 1 as number | null, stdout: '', stderr: 'no attempt' };
  for (const attempt of attempts) {
    const result = spawnSync('psql', attempt.args, {
      encoding: 'utf8',
      env: { ...process.env, PGDATA: scratchDir, PGHOST: attempt.host },
      timeout: 15_000,
    });
    last = {
      status: result.status,
      stdout: (result.stdout ?? '').trim(),
      stderr: result.stderr ?? '',
    };
    if (result.status === 0) return last;
  }
  return last;
}

function readSystemIdentifier(pgdata: string): string | null {
  const res = spawnSync('pg_controldata', [pgdata], { encoding: 'utf8', timeout: 15_000 });
  if (res.status !== 0) return null;
  const m = (res.stdout ?? '').match(/Database system identifier:\s*(\d+)/i);
  return m?.[1] ?? null;
}

function tryStopPostgres(pgdata: string): void {
  if (!existsSync(pgdata)) return;
  spawnSync('pg_ctl', ['stop', '-D', pgdata, '-m', 'fast', '-w', '-t', '30'], {
    encoding: 'utf8',
    timeout: 45_000,
  });
}

/** Postgres boolean text may be t/f or true/false depending on cast path. */
function isPgTrue(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === 't' || v === 'true';
}

function isPgFalse(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === 'f' || v === 'false';
}

function d05_02Body(): string {
  expect(existsSync(D05_02), `D05-02 missing: ${D05_02}`).toBe(true);
  return readFileSync(D05_02, 'utf8');
}

let secretsPath = '';
let scratchRoot = '';
let seededTt: string | null = null;
/** Fixed suite-wide PITR target (stable across pause/promote/repeatable). */
let suitePitrTarget = '';
/** Scope sentinel assertions to this run; historical rows must not affect the cut. */
let suiteSeedNote = '';
/** True when seedPitrSentinelWindow succeeded on the live primary this suite run. */
let seedOk = false;
/** Source cluster archive command restored after this suite's real backup cycle. */
let originalArchiveCommand: string | null = null;

function psqlPrimary(sql: string): string {
  const result = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], {
    encoding: 'utf8',
    env: process.env,
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(`PITR primary SQL failed: ${result.stderr || result.stdout}`);
  }
  return (result.stdout ?? '').trim();
}

/**
 * Prefer forced/env target. Optionally use the suite seed window when
 * REDHAT_FIX_C3_USE_SEED_TT=1 (requires WAL already archived past T1).
 * Default: a restorable recent cut (15m ago) fixed once in beforeAll.
 */
function resolvePitrTarget(): string {
  if (suitePitrTarget) return suitePitrTarget;
  if (FORCED_PITR_TS) return FORCED_PITR_TS;
  if (process.env.REDHAT_FIX_C3_USE_SEED_TT === '1' && seededTt) return seededTt;
  return new Date(Date.now() - 15 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

describe.sequential('REDHAT-FIX-C3 — PITR recovery/promotion/LSN contract', () => {
  beforeAll(() => {
    ensureEvidenceDir();
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for PITR recovery contract IT').toBe(true);
    expect(existsSync(HOLO_CLI), `holo CLI missing: ${HOLO_CLI}`).toBe(true);
    expect(existsSync(RESTORE_TS), `restore.ts missing: ${RESTORE_TS}`).toBe(true);
    secretsPath = resolveSecretsPath();
    scratchRoot = mkdtempSync(join(tmpdir(), 'redhat-fix-c3-pitr-'));
    originalArchiveCommand = psqlPrimary('SHOW archive_command');

    const database = new URL(DATABASE_URL);
    const backupEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOLO_SECRETS_PATH: secretsPath,
      DATABASE_URL,
      DATABASE_URL_OWNER: DATABASE_URL,
      PGHOST: database.hostname,
      PGPORT: database.port || '5432',
      PGDATABASE: database.pathname.replace(/^\//, ''),
      PGUSER: decodeURIComponent(database.username),
    };
    if (database.password) backupEnv.PGPASSWORD = decodeURIComponent(database.password);
    else delete backupEnv.PGPASSWORD;

    // The official isolated lane uses a fresh exact R2 prefix. Establish a
    // real base backup before T0 so the seeded TT lies inside a restorable WAL
    // window; stanza metadata + WAL alone cannot satisfy PITR.
    const base = spawnSync(BUN_BIN, [HOLO_CLI, 'backup:base', '--type', 'full', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: backupEnv,
      timeout: 180_000,
    });
    writeEvidence('seed-base-backup.json', {
      status: base.status,
      stdout: (base.stdout ?? '').slice(0, 4000),
      stderr: (base.stderr ?? '').slice(0, 2000),
    });
    expect(
      base.status,
      `PITR base backup must succeed before sentinel T0: ${(base.stdout ?? '').slice(-1500)} ${(base.stderr ?? '').slice(-500)}`
    ).toBe(0);

    // One seed attempt for the suite (sentinel window scaffolding).
    // REDHAT-FIX-S28R2-H4: seed must establish sentinels or fail setup (no soft-skip).
    if (FORCED_PITR_TS) {
      if (!FORCED_SENTINEL_NOTE) {
        throw new Error(
          'REDHAT_FIX_C3_PITR_TS requires REDHAT_FIX_C3_SENTINEL_NOTE so sentinel assertions remain run-scoped'
        );
      }
      seededTt = FORCED_PITR_TS;
      seedOk = true;
      suitePitrTarget = FORCED_PITR_TS;
      suiteSeedNote = FORCED_SENTINEL_NOTE;
    } else {
      suiteSeedNote = `c3-suite-${Date.now()}`;
      const seed = seedPitrSentinelWindow({
        databaseUrl: DATABASE_URL,
        note: suiteSeedNote,
        gapMs: 3000,
      });
      writeEvidence('seed-suite.json', seed);
      seedOk = seed.ok;
      if (!seed.ok) {
        throw new Error(
          `PITR sentinel seed failed closed — cannot run recovery contract without before/after rows: ${seed.errors.join('; ') || seed.stderr || 'unknown'}`
        );
      }
      seededTt = seed.tt;
      spawnSync('sleep', ['2'], { encoding: 'utf8' });
      const wal = spawnSync(BUN_BIN, [HOLO_CLI, 'backup:wal', '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: backupEnv,
        timeout: 180_000,
      });
      writeEvidence('seed-wal-archive.json', {
        status: wal.status,
        stdout: (wal.stdout ?? '').slice(0, 2000),
        stderr: (wal.stderr ?? '').slice(0, 2000),
      });
      expect(
        wal.status,
        `PITR sentinel WAL archive must succeed before selecting seeded target: ${(wal.stdout ?? '').slice(-1500)} ${(wal.stderr ?? '').slice(-500)}`
      ).toBe(0);
      // Prefer the seeded cut so before-target is visible and after-target is not.
      // Override only when REDHAT_FIX_C3_USE_SEED_TT=0 (explicit opt-out).
      suitePitrTarget =
        process.env.REDHAT_FIX_C3_USE_SEED_TT === '0'
          ? new Date(Date.now() - 15 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
          : (seededTt as string);
    }

    writeEvidence('suite-boot.json', {
      secretsPath,
      scratchRoot,
      databaseUrlHost: DATABASE_URL.replace(/:[^:@/]+@/, ':***@'),
      forcedPitrTs: FORCED_PITR_TS,
      seededTt,
      seedOk,
      suiteSeedNote,
      suitePitrTarget,
      d05_02: D05_02,
    });
  }, 240_000);

  afterAll(() => {
    if (scratchRoot && existsSync(scratchRoot)) {
      try {
        for (const ent of readdirSync(scratchRoot, { withFileTypes: true })) {
          if (ent.isDirectory()) tryStopPostgres(join(scratchRoot, ent.name));
        }
      } catch {
        // best-effort
      }
      try {
        rmSync(scratchRoot, { recursive: true, force: true });
      } catch {
        // leave for debug
      }
    }
    if (originalArchiveCommand !== null) {
      const escaped = originalArchiveCommand.replaceAll("'", "''");
      psqlPrimary(`ALTER SYSTEM SET archive_command TO '${escaped}'`);
      psqlPrimary('SELECT pg_reload_conf()');
    }
  });

  // ── AC-4 / TC-1..TC-3 static contract honesty ────────────────────────────

  itLive('contract: D05-02 has zero last_applied invented field references', () => {
    const body = d05_02Body();
    // Gate: invented field name must not appear in the operator contract.
    expect(body.includes('last_applied_timestamp')).toBe(false);
    writeEvidence(
      'tc1-no-invented-recovery-fields.txt',
      'OK — zero invented field names in D05-02'
    );
  });

  itLive('contract: D05-02 does not require system_identifier inequality', () => {
    const body = d05_02Body();
    // Broken contract used "system_identifier ... !=" / "DISTINCT" inequality requirement.
    expect(/system_identifier[^\n]*!=/.test(body)).toBe(false);
    expect(/system_identifier[^\n]*DISTINCT/i.test(body)).toBe(false);
    expect(/system_identifier values are EQUAL/i.test(body)).toBe(true);
    writeEvidence('tc2-system-identifier-equal.txt', 'OK — equality required, inequality absent');
  });

  itLive('contract: pause vs promote are separate ACs with pg_is_in_recovery', () => {
    const body = d05_02Body();
    expect(body.includes('target-action=pause')).toBe(true);
    expect(body.includes('target-action=promote')).toBe(true);
    expect(body.includes('pg_is_in_recovery')).toBe(true);
    expect(body.includes('pg_last_wal_replay_lsn')).toBe(true);
    // Promote must not require post-promote source-WAL catch-up as standby.
    expect(/promoted clone to re-point and apply later source primary WAL/i.test(body)).toBe(true);
    expect(/MUST NOT require the promoted clone/i.test(body)).toBe(true);
    writeEvidence('tc3-pause-vs-promote.txt', 'OK — separate pause/promote ACs documented');
  });

  itLive('contract: restore.ts never references invented last_applied_timestamp', () => {
    const src = readFileSync(RESTORE_TS, 'utf8');
    // Mentions in comments as "never" are ok; executable/SQL usage is not.
    // Avoid SELECT[\s\S]*last_applied_timestamp — false-positives across the whole file.
    expect(src.includes('pg_stat_recovery.last_applied_timestamp')).toBe(true); // documented prohibition
    const nonComment = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*|\*\/)/.test(l))
      .join('\n');
    expect(nonComment.includes('last_applied_timestamp')).toBe(false);
    expect(src.includes('pg_last_wal_replay_lsn')).toBe(true);
    expect(src.includes('pg_last_xact_replay_timestamp')).toBe(true);
    expect(src.includes('pg_is_in_recovery')).toBe(true);
    writeEvidence('restore-ts-catalogs.txt', 'OK — real recovery catalogs only');
  });

  itLive('contract: invalid-timestamp fail-closed wording retained', () => {
    const body = d05_02Body();
    expect(body.includes('outside available WAL') || body.includes('not in retention window')).toBe(
      true
    );
    writeEvidence('tc4-invalid-timestamp-wording.txt', 'OK — fail-closed named errors present');
  });

  itLive('contract: H4 suite has no sentinel pending soft-pass', () => {
    const self = readFileSync(resolve(HERE, 'sprint28-pitr-recovery-contract.test.ts'), 'utf8');
    // Construct forbidden phrases so this source-oracle does not match its own
    // assertions and fail every clean checkout vacuously.
    expect(self).not.toMatch(new RegExp(['sentinels', 'pending'].join('-')));
    expect(self).not.toMatch(new RegExp(['sentinel table not in restored', 'cut yet'].join(' ')));
    expect(self).toMatch(/before-target sentinels must be/);
    expect(self).toMatch(/seed failed closed|seed must establish|PITR sentinel seed failed/i);
    writeEvidence('h4-no-soft-pass.txt', 'OK — mandatory sentinel cut; seed fail-closed');
  });

  // ── Live restore proofs (against real R2 + pgBackRest) ───────────────────

  itLive(
    'pause: recovery proof uses real catalogs + sentinel cut (AC-1)',
    async () => {
      // Prefer a restorable recent cut for recovery-catalog proof. When the seed
      // window is fully archived into R2, seededTt provides exact before/after cut.
      const pitr = resolvePitrTarget();
      const scratchDir = join(scratchRoot, 'pause-scratch');
      const run = runHoloRestore({
        pitr,
        scratchDir,
        targetAction: 'pause',
        secretsPath,
      });
      writeEvidence('ac1-pause-restore.json', {
        pitr,
        seedOk,
        status: run.status,
        stdout: run.stdout.slice(0, 4000),
        stderr: run.stderr.slice(0, 4000),
        pgdataFileCount: run.pgdataFileCount,
      });

      expect(
        run.status,
        `pause restore must exit 0; got ${run.status}: ${run.combined.slice(0, 800)}`
      ).toBe(0);

      const inRecovery = psqlOnScratch(scratchDir, 'SELECT pg_is_in_recovery()::text');
      expect(inRecovery.status).toBe(0);
      expect(isPgTrue(inRecovery.stdout), 'pause path must remain in recovery').toBe(true);

      const lsn = psqlOnScratch(scratchDir, 'SELECT pg_last_wal_replay_lsn()::text');
      expect(lsn.status).toBe(0);
      expect(lsn.stdout.length, 'pg_last_wal_replay_lsn() must be non-null').toBeGreaterThan(0);
      expect(lsn.stdout.toLowerCase()).not.toBe('null');

      // REDHAT-FIX-S28R2-H4: mandatory sentinel cut — no pending soft-pass.
      const tableExists = psqlOnScratch(
        scratchDir,
        `SELECT to_regclass('public.pitr_sentinel') IS NOT NULL`
      );
      writeEvidence('ac1-pause-probes.json', { inRecovery, lsn, tableExists, seedOk });
      expect(
        tableExists.status === 0 && isPgTrue(tableExists.stdout),
        `pitr_sentinel must exist after successful pause restore (seedOk=${seedOk}); got ${tableExists.stdout} / ${tableExists.stderr}`
      ).toBe(true);

      const before = psqlOnScratch(
        scratchDir,
        `SELECT COUNT(*)::text FROM pitr_sentinel WHERE label='${LABEL_BEFORE}' AND note='${suiteSeedNote.replace(/'/g, "''")}'`
      );
      const after = psqlOnScratch(
        scratchDir,
        `SELECT COUNT(*)::text FROM pitr_sentinel WHERE label='${LABEL_AFTER}' AND note='${suiteSeedNote.replace(/'/g, "''")}'`
      );
      writeEvidence('ac1-pause-sentinels.json', { before, after });
      expect(before.status).toBe(0);
      expect(
        Number(before.stdout),
        `before-target sentinels must be ≥1 after pause restore; got ${before.stdout}`
      ).toBeGreaterThanOrEqual(1);
      expect(after.status).toBe(0);
      expect(
        Number(after.stdout),
        `after-target sentinels must be 0 after pause restore; got ${after.stdout}`
      ).toBe(0);

      // Explicitly forbid invented field usage in this suite's assertions path.
      expect(run.combined.includes('last_applied_timestamp')).toBe(false);

      tryStopPostgres(scratchDir);
    },
    700_000
  );

  itLive(
    'promote: writable DB proof separate from recovery catalogs (AC-2)',
    async () => {
      const pitr = resolvePitrTarget();
      const scratchDir = join(scratchRoot, 'promote-scratch');
      const run = runHoloRestore({
        pitr,
        scratchDir,
        targetAction: 'promote',
        secretsPath,
      });
      writeEvidence('ac2-promote-restore.json', {
        pitr,
        status: run.status,
        stdout: run.stdout.slice(0, 4000),
        stderr: run.stderr.slice(0, 4000),
        pgdataFileCount: run.pgdataFileCount,
      });

      expect(
        run.status,
        `promote restore must exit 0; got ${run.status}: ${run.combined.slice(0, 800)}`
      ).toBe(0);

      const inRecovery = psqlOnScratch(scratchDir, 'SELECT pg_is_in_recovery()::text');
      expect(inRecovery.status).toBe(0);
      expect(isPgFalse(inRecovery.stdout), 'promote path must leave recovery').toBe(true);

      const insert = psqlOnScratch(
        scratchDir,
        `CREATE TABLE IF NOT EXISTS c3_promote_probe(id int); INSERT INTO c3_promote_probe(id) VALUES (1); SELECT 'INSERT 0 1'`
      );
      expect(insert.status, `INSERT must succeed after promote: ${insert.stderr}`).toBe(0);
      expect(insert.stdout).toContain('INSERT 0 1');

      // REDHAT-FIX-S28R2-H4: mandatory sentinel cut on promote path (no soft-pass).
      const tableExists = psqlOnScratch(
        scratchDir,
        `SELECT to_regclass('public.pitr_sentinel') IS NOT NULL`
      );
      expect(
        tableExists.status === 0 && isPgTrue(tableExists.stdout),
        `pitr_sentinel must exist after successful promote restore; got ${tableExists.stdout}`
      ).toBe(true);
      const before = psqlOnScratch(
        scratchDir,
        `SELECT COUNT(*)::text FROM pitr_sentinel WHERE label='${LABEL_BEFORE}' AND note='${suiteSeedNote.replace(/'/g, "''")}'`
      );
      const after = psqlOnScratch(
        scratchDir,
        `SELECT COUNT(*)::text FROM pitr_sentinel WHERE label='${LABEL_AFTER}' AND note='${suiteSeedNote.replace(/'/g, "''")}'`
      );
      writeEvidence('ac2-promote-sentinels.json', { before, after });
      expect(Number(before.stdout)).toBeGreaterThanOrEqual(1);
      expect(Number(after.stdout)).toBe(0);

      // Must not require pg_stat_recovery replay proof after promote.
      expect(run.combined.toLowerCase().includes('last_applied_timestamp')).toBe(false);

      tryStopPostgres(scratchDir);
    },
    700_000
  );

  itLive(
    'repeatable: dual physical restores share system_identifier (AC-3)',
    async () => {
      const pitr = resolvePitrTarget();
      const first = join(scratchRoot, 'restore-first');
      const second = join(scratchRoot, 'restore-second');

      const run1 = runHoloRestore({
        pitr,
        scratchDir: first,
        targetAction: 'promote',
        secretsPath,
      });
      const run2 = runHoloRestore({
        pitr,
        scratchDir: second,
        targetAction: 'promote',
        secretsPath,
      });

      writeEvidence('ac3-dual-restore.json', {
        pitr,
        run1: { status: run1.status, files: run1.pgdataFileCount },
        run2: { status: run2.status, files: run2.pgdataFileCount },
      });

      expect(run1.status, `first restore exit: ${run1.combined.slice(0, 500)}`).toBe(0);
      expect(run2.status, `second restore exit: ${run2.combined.slice(0, 500)}`).toBe(0);

      const id1 = readSystemIdentifier(first);
      const id2 = readSystemIdentifier(second);
      writeEvidence('ac3-system-identifiers.json', { id1, id2 });
      expect(id1, 'system_identifier first').toBeTruthy();
      expect(id2, 'system_identifier second').toBeTruthy();
      // Physical restore preserves system_identifier — equality is correct.
      expect(id1).toBe(id2);

      const countSql = `SELECT COALESCE(
        (SELECT COUNT(*)::text FROM pitr_sentinel),
        (SELECT COUNT(*)::text FROM beliefs),
        '0'
      )`;
      // Prefer pitr_sentinel when present; fall back to beliefs.
      const c1Sent = psqlOnScratch(
        first,
        `SELECT CASE WHEN to_regclass('public.pitr_sentinel') IS NOT NULL
          THEN (SELECT COUNT(*)::text FROM pitr_sentinel)
          WHEN to_regclass('public.beliefs') IS NOT NULL
          THEN (SELECT COUNT(*)::text FROM beliefs)
          ELSE '0' END`
      );
      const c2Sent = psqlOnScratch(
        second,
        `SELECT CASE WHEN to_regclass('public.pitr_sentinel') IS NOT NULL
          THEN (SELECT COUNT(*)::text FROM pitr_sentinel)
          WHEN to_regclass('public.beliefs') IS NOT NULL
          THEN (SELECT COUNT(*)::text FROM beliefs)
          ELSE '0' END`
      );
      writeEvidence('ac3-row-counts.json', { c1Sent, c2Sent, countSql });
      expect(c1Sent.status).toBe(0);
      expect(c2Sent.status).toBe(0);
      expect(c1Sent.stdout).toBe(c2Sent.stdout);

      tryStopPostgres(first);
      tryStopPostgres(second);
    },
    900_000
  );
});
