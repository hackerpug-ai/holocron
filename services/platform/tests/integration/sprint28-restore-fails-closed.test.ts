/**
 * Sprint 28 / D05-01 — RED integration oracle for CAP-BAK-01 PITR restore fail-closed.
 *
 * Proves T-PLAT-022 / UC-PLAT-06: `holo restore --pitr <timestamp>` NEVER reports
 * success against an empty or corrupted backup chain, and a healthy seeded repo is
 * the negative control that keeps the suite from being trivially satisfiable by
 * `exit 1` forever.
 *
 * Cases (real boundaries only — no R2 / pgBackRest / restore mocks):
 *   (1) empty R2 repo / missing base backup → non-zero + named error + PGDATA files = 0
 *   (2) corrupted manifest → non-zero + names corruption + no promoted DB
 *   (3) healthy seeded repo → exit 0 + SELECT 1 + pitr_test rows >= 1 (negative control)
 *   (4) failed restores write ZERO fake-success heartbeat / parity rows
 *
 * GREENFIELD RED: `holo restore` / restore.ts do not exist yet (D05-02 owns them).
 * This suite MUST FAIL under PLATFORM_IT=1 today and only pass after D05-02/D04 land.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import type { BackupConfig } from '../../src/backup/config.ts';
import { loadBackupConfig } from '../../src/backup/config.ts';
import { listRepoPrefix } from '../../src/backup/r2-provision.ts';
import {
  cleanupPgbackrestSeedWorkDir,
  seedRealPgbackrestHealthyChain,
} from './helpers/pgbackrest-seed.ts';

const itLive = PLATFORM_IT ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const RESTORE_MODULE = resolve(REPO_ROOT, 'services/platform/src/backup/restore.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/D05-01');
const EVIDENCE_DIR_C2 = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-C2');

/** PITR target timestamp used across empty/corrupt restore invocations. */
const PITR_TIMESTAMP = process.env.D05_PITR_TIMESTAMP ?? '2024-01-01T00:00:00Z';

/**
 * Source DB for heartbeat oracle + pitr_test seed. Prefer secrets holocron DB
 * (where backup_heartbeat / live cluster data live) over holocron_nonprod.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron';

const RUN_ID = `d05-01-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type RestoreResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
  args: string[];
  scratchDir: string;
  pgdataFileCount: number;
  envPrefix: string;
};

type FixtureHandles = {
  secretsPath: string;
  cfg: BackupConfig;
  emptyPrefix: string;
  corruptPrefix: string;
  healthyPrefix: string;
  /** Test-scoped root for this run (`pgbackrest-d05-01-red/<runId>`). */
  testScopedRoot: string;
  scratchRoot: string;
  /** Objects uploaded under corruptPrefix for cleanup. */
  corruptKeys: string[];
  /** Object keys under healthyPrefix (informational; cleanup is recursive). */
  healthyKeys: string[];
  /** Real pgBackRest stanza used for the healthy seed (not production `main`). */
  healthyStanza: string;
  /** Backup label from `pgbackrest info` after real seed. */
  healthyBackupLabel: string;
  /** PITR timestamp within the real healthy chain WAL window. */
  healthyPitrTimestamp: string;
  /** Seeder workdir (conf with cipher) — cleaned in afterAll. */
  healthySeedWorkDir: string;
  healthyObjectCount: number;
};

let fixtures: FixtureHandles | undefined;

function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(EVIDENCE_DIR_C2, { recursive: true });
}

function writeEvidence(name: string, body: unknown, dir: string = EVIDENCE_DIR): string {
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function resolveSecretsPath(): string {
  const candidates = [
    process.env.HOLO_SECRETS_PATH,
    process.env.SECRETS_PATH,
    resolve(REPO_ROOT, 'services/platform/config/secrets.yaml'),
    // Worktrees often omit gitignored secrets — fall back to primary checkout.
    '/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `no secrets.yaml found for R2 fixtures (checked ${candidates.join(', ')}); set HOLO_SECRETS_PATH`
  );
}

function awsEnvFor(cfg: BackupConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: cfg.accessKeyId,
    AWS_SECRET_ACCESS_KEY: cfg.secretAccessKey,
    AWS_DEFAULT_REGION: 'auto',
    AWS_EC2_METADATA_DISABLED: 'true',
  };
  if (cfg.sessionToken) env.AWS_SESSION_TOKEN = cfg.sessionToken;
  else delete env.AWS_SESSION_TOKEN;
  return env;
}

function awsS3(
  cfg: BackupConfig,
  args: string[],
  timeoutMs = 120_000
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('aws', [...args, '--endpoint-url', cfg.endpoint], {
    encoding: 'utf8',
    env: awsEnvFor(cfg),
    timeout: timeoutMs,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Count regular files under a directory tree (0 if missing). */
function countFilesRecursive(root: string): number {
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

/**
 * Seed test-scoped R2 fixtures (never mocked):
 *  - emptyPrefix: unique path with 0 objects
 *  - corruptPrefix: deliberately corrupted base-backup-shaped objects (fail-closed control)
 *  - healthyPrefix: REAL pgBackRest stanza-create + full backup + WAL archive
 *    (REDHAT-FIX-C1 — no synthetic text manifests / HEALTHY-WAL-PLACEHOLDER)
 *
 * Healthy fixture is NEVER the production/standing prefix (`pgbackrest`).
 */
function seedFixtures(
  cfg: BackupConfig
): Pick<
  FixtureHandles,
  | 'emptyPrefix'
  | 'corruptPrefix'
  | 'healthyPrefix'
  | 'testScopedRoot'
  | 'corruptKeys'
  | 'healthyKeys'
  | 'healthyStanza'
  | 'healthyBackupLabel'
  | 'healthyPitrTimestamp'
  | 'healthySeedWorkDir'
  | 'healthyObjectCount'
> {
  const testScopedRoot = `pgbackrest-d05-01-red/${RUN_ID}`;
  const emptyPrefix = `${testScopedRoot}/empty`;
  const corruptPrefix = `${testScopedRoot}/corrupt`;
  const healthyPrefix = `${testScopedRoot}/healthy`;

  // Product contract: healthy must be test-scoped, never bare production prefix.
  expect(
    healthyPrefix.startsWith('pgbackrest-d05-01-red/') && healthyPrefix.endsWith('/healthy'),
    `healthyPrefix must be test-scoped under pgbackrest-d05-01-red/<runId>/healthy; got ${healthyPrefix}`
  ).toBe(true);
  expect(
    healthyPrefix === 'pgbackrest' || healthyPrefix === (cfg.pgbackrestPrefix || 'pgbackrest'),
    `healthyPrefix must NOT reuse production/standing prefix (got ${healthyPrefix})`
  ).toBe(false);

  // empty: unique prefix → 0 objects by construction; assert list count
  const emptyList = listRepoPrefix({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    endpoint: cfg.endpoint,
    bucketName: cfg.bucketName,
    prefix: emptyPrefix,
  });
  expect(
    emptyList.count,
    `empty R2 repo fixture must have 0 objects at s3://${cfg.bucketName}/${emptyPrefix}/`
  ).toBe(0);

  // corrupt: upload a base-backup-shaped tree with a poison manifest checksum
  // (still synthetic — intentional negative control; production restore must reject).
  const corruptKeys: string[] = [];
  const poisonDir = mkdtempSync(join(tmpdir(), 'd05-01-corrupt-'));
  try {
    const manifestPath = join(poisonDir, 'backup.manifest');
    const historyPath = join(poisonDir, 'backup.info');
    writeFileSync(
      manifestPath,
      [
        '# CORRUPTED pgBackRest-style manifest (D05-01 RED fixture)',
        'backup-id=d05-01-corrupt',
        'manifest-checksum=0000000000000000000000000000000000000000000000000000000000000000',
        'payload=CORRUPT_WAL_SEGMENT_TRUNCATED',
        '',
      ].join('\n'),
      'utf8'
    );
    writeFileSync(
      historyPath,
      [
        'backrest-format=5',
        'backup-timestamp-start=0',
        'backup-timestamp-stop=0',
        'backup-type=full',
        'manifest-checksum-mismatch=true',
        'backup-label=d05-01-corrupt-intentionally',
        '',
      ].join('\n'),
      'utf8'
    );

    const uploads: Array<{ local: string; key: string }> = [
      {
        local: manifestPath,
        key: `${corruptPrefix}/backup/main/d05-01-corrupt/backup.manifest`,
      },
      {
        local: historyPath,
        key: `${corruptPrefix}/backup/main/backup.info`,
      },
      {
        local: historyPath,
        key: `${corruptPrefix}/archive/main/18-1/0000000100000000/000000010000000000000001-deadbeefdeadbeefdeadbeefdeadbeefdeadbeef.gz`,
      },
    ];

    for (const u of uploads) {
      const put = awsS3(cfg, ['s3', 'cp', u.local, `s3://${cfg.bucketName}/${u.key}`]);
      expect(
        put.status,
        `failed to seed corrupted object s3://${cfg.bucketName}/${u.key}: ${put.stderr || put.stdout}`
      ).toBe(0);
      corruptKeys.push(u.key);
    }
  } finally {
    rmSync(poisonDir, { recursive: true, force: true });
  }

  const corruptList = listRepoPrefix({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    endpoint: cfg.endpoint,
    bucketName: cfg.bucketName,
    prefix: corruptPrefix,
  });
  expect(
    corruptList.count,
    'corrupted_manifest_repo must contain base-backup-shaped + WAL objects'
  ).toBeGreaterThanOrEqual(1);

  // healthy: REAL pgBackRest backup + WAL into test-scoped prefix (REDHAT-FIX-C1).
  const productionConfigPath = existsSync(cfg.pgbackrestConfigPath)
    ? cfg.pgbackrestConfigPath
    : '/Users/inference1/Projects/holocron/services/platform/config/pgbackrest/pgbackrest.conf';
  expect(
    existsSync(productionConfigPath),
    `production pgBackRest conf required for dual-archive seed: ${productionConfigPath}`
  ).toBe(true);

  const healthySeed = seedRealPgbackrestHealthyChain({
    cfg,
    prefix: healthyPrefix,
    databaseUrl: DATABASE_URL,
    productionConfigPath,
    runId: RUN_ID,
  });

  writeEvidence('healthy-real-pgbackrest-seed.json', healthySeed);
  writeEvidence(
    'healthy-real-pgbackrest-seed.json',
    healthySeed,
    resolve(REPO_ROOT, '.tmp/REDHAT-FIX-C1')
  );

  if (!healthySeed.ok) {
    throw new Error(
      `REDHAT-FIX-C1 real pgBackRest healthy seed failed: ${healthySeed.error}\nsteps=${JSON.stringify(healthySeed.steps, null, 2)}`
    );
  }

  expect(
    healthySeed.backupLabel.length,
    `pgbackrest info backup label must be >= 8 chars; got ${healthySeed.backupLabel}`
  ).toBeGreaterThanOrEqual(8);
  expect(
    healthySeed.objectCount,
    `healthy real chain must list >= 1 R2 objects under ${healthyPrefix}`
  ).toBeGreaterThanOrEqual(1);
  expect(
    healthySeed.pitrTestRows,
    `pitr_test seed must have >= 1 rows before backup; got ${healthySeed.pitrTestRows}`
  ).toBeGreaterThanOrEqual(1);

  // Document object keys for evidence (recursive cleanup covers the prefix).
  const healthyList = listRepoPrefix({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    endpoint: cfg.endpoint,
    bucketName: cfg.bucketName,
    prefix: healthyPrefix,
  });
  const healthyKeys = healthyList.raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 50);

  writeEvidence('fixtures-seeded.json', {
    runId: RUN_ID,
    bucket: cfg.bucketName,
    testScopedRoot,
    emptyPrefix,
    emptyObjectCount: emptyList.count,
    corruptPrefix,
    corruptObjectCount: corruptList.count,
    corruptKeys,
    healthyPrefix,
    healthyObjectCount: healthySeed.objectCount,
    healthyKeys,
    healthyStanza: healthySeed.stanza,
    healthyBackupLabel: healthySeed.backupLabel,
    healthyPitrTimestamp: healthySeed.pitrTimestamp,
    pitr_test_seed: {
      table: 'pitr_test',
      min_rows: 1,
      seed_label: healthySeed.seedLabel,
      seed_batch: healthySeed.seedBatch,
      intent:
        'Healthy fixture is a REAL pgBackRest full backup into a test-scoped R2 prefix (NOT production pgbackrest). pitr_test is inserted into source Postgres before backup so restore can prove COUNT(*) >= 1.',
    },
    seed_method: 'public_api',
    seed_tool: 'pgbackrest',
    note: 'REDHAT-FIX-C1: real pgBackRest chain — no synthetic HEALTHY-WAL-PLACEHOLDER / text manifests',
  });

  return {
    emptyPrefix,
    corruptPrefix,
    healthyPrefix,
    testScopedRoot,
    corruptKeys,
    healthyKeys,
    healthyStanza: healthySeed.stanza,
    healthyBackupLabel: healthySeed.backupLabel,
    healthyPitrTimestamp: healthySeed.pitrTimestamp,
    healthySeedWorkDir: healthySeed.workDir,
    healthyObjectCount: healthySeed.objectCount,
  };
}

function cleanupTestScopedFixtures(cfg: BackupConfig, testScopedRoot: string): void {
  const rm = awsS3(
    cfg,
    ['s3', 'rm', `s3://${cfg.bucketName}/${testScopedRoot}/`, '--recursive'],
    180_000
  );
  writeEvidence('fixtures-cleanup.json', {
    prefix: testScopedRoot,
    status: rm.status,
    stderr: (rm.stderr || '').slice(0, 500),
  });
}

/**
 * Invoke REAL `holo restore --pitr <timestamp>` via spawnSync.
 * Never mocks restore / R2 / pgBackRest.
 */
function runHoloRestore(options: {
  pitr: string;
  scratchDir: string;
  repoPrefix: string;
  cfg: BackupConfig;
  secretsPath: string;
  /** Override stanza (healthy real seed uses a test-scoped stanza). */
  stanza?: string;
  extraArgs?: string[];
  timeoutMs?: number;
}): RestoreResult {
  mkdirSync(options.scratchDir, { recursive: true });
  // Strict empty PGDATA before restore (D05-02 contract)
  const preCount = countFilesRecursive(options.scratchDir);
  expect(preCount, `scratch PGDATA must start empty: ${options.scratchDir}`).toBe(0);

  // Real operator command under test (D05-02 implements; live CLI + live R2 + live pgBackRest only).
  const holoCliPath = HOLO_CLI;
  const stanza = options.stanza ?? options.cfg.stanza;
  const args = [
    'restore',
    '--pitr',
    options.pitr,
    '--scratch',
    options.scratchDir,
    '--target-action',
    'promote',
    ...(options.extraArgs ?? []),
  ];

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Point restore at the test-scoped R2 prefix for this case
    R2_PGBACKREST_PREFIX: options.repoPrefix,
    R2_BUCKET_NAME: options.cfg.bucketName,
    R2_ENDPOINT: options.cfg.endpoint,
    R2_ACCOUNT_ID: options.cfg.accountId,
    R2_ACCESS_KEY_ID: options.cfg.accessKeyId,
    R2_SECRET_ACCESS_KEY: options.cfg.secretAccessKey,
    R2_REPO_CIPHER_PASS: options.cfg.repoCipherPass,
    PGBACKREST_STANZA: stanza,
    PGBACKREST_PG1_PATH: options.scratchDir,
    HOLO_SECRETS_PATH: options.secretsPath,
    DATABASE_URL,
  };
  if (options.cfg.sessionToken) {
    env.R2_SESSION_TOKEN = options.cfg.sessionToken;
  }

  // Evidence gate: spawnSync(...holo...restore...) — real CLI via bun + holo.ts
  const result = spawnSync(
    BUN_BIN,
    [
      holoCliPath,
      'restore',
      '--pitr',
      options.pitr,
      '--scratch',
      options.scratchDir,
      '--target-action',
      'promote',
      ...(options.extraArgs ?? []),
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env,
      // Restore can take a while once implemented; RED missing-command is fast.
      timeout: options.timeoutMs ?? 180_000,
    }
  );

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const pgdataFileCount = countFilesRecursive(options.scratchDir);

  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
    args,
    scratchDir: options.scratchDir,
    pgdataFileCount,
    envPrefix: options.repoPrefix,
  };
}

/** Classify holo restore failure as CLI parser vs restore-path (REDHAT-FIX-C2 AC-3). */
function classifyRestoreFailure(
  combined: string,
  status: number | null
): 'parser' | 'restore_path' {
  const text = combined.toLowerCase();
  // Unknown-flag / usage-only parser failures must not sole-green AC-4 restore-path claims.
  if (
    /unknown flag:\s*--pitr/.test(text) ||
    (/unknown (flag|option|command)/.test(text) &&
      !/no base backup|backup chain|manifest checksum|wal segment corrupted|integrity check failed/.test(
        text
      ))
  ) {
    return 'parser';
  }
  if (
    /no base backup available|backup chain missing|manifest checksum mismatch|wal segment corrupted|backup chain integrity check failed|restore failed|pgbackrest/.test(
      text
    )
  ) {
    return 'restore_path';
  }
  // Non-zero without clear restore-path wording — still not proven restore-path if only usage/parse.
  if (status !== 0 && /usage:|error: unknown|not a command|unexpected argument/.test(text)) {
    return 'parser';
  }
  return status !== 0 ? 'restore_path' : 'restore_path';
}

function pgCtlStatus(pgdata: string): { status: number | null; combined: string } {
  const result = spawnSync('pg_ctl', ['status', '-D', pgdata], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  return {
    status: result.status,
    combined: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  };
}

function psqlOnScratch(
  scratchDir: string,
  sql: string,
  database = 'postgres'
): { status: number | null; stdout: string; stderr: string } {
  // Prefer TCP port written by holo restore (macOS socket paths under long scratch
  // dirs exceed sockaddr_un 103 bytes — restore uses /tmp/holo-restore-<port>).
  // pitr_test lives in holocron (seeder DATABASE_URL); SELECT 1 uses postgres.
  const databases = database === 'postgres' ? ['postgres'] : [database, 'postgres'];
  const attempts: Array<string[]> = [];
  try {
    const portPath = join(scratchDir, 'holo-restore.port');
    if (existsSync(portPath)) {
      const port = readFileSync(portPath, 'utf8').trim();
      if (/^\d+$/.test(port)) {
        for (const db of databases) {
          attempts.push([
            '-h',
            '127.0.0.1',
            '-p',
            port,
            '-d',
            db,
            '-v',
            'ON_ERROR_STOP=1',
            '-tAc',
            sql,
          ]);
        }
      }
    }
    const sockPath = join(scratchDir, 'holo-restore.socket_dir');
    if (existsSync(sockPath)) {
      const sockDir = readFileSync(sockPath, 'utf8').trim();
      if (sockDir.length > 0) {
        for (const db of databases) {
          attempts.push(['-h', sockDir, '-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', sql]);
        }
      }
    }
  } catch {
    /* fall through to legacy attempts */
  }
  for (const db of databases) {
    attempts.push(
      ['-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', sql],
      ['-h', scratchDir, '-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', sql]
    );
  }
  let last = { status: 1 as number | null, stdout: '', stderr: 'no attempt' };
  for (const args of attempts) {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PGDATA: scratchDir,
      PGHOST: scratchDir,
    };
    const result = spawnSync('psql', args, {
      encoding: 'utf8',
      env,
      timeout: 15_000,
    });
    last = {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
    if (result.status === 0) return last;
  }
  return last;
}

/**
 * Real-DB probe via psql (public_api) — avoids worktree dynamic-import resolution
 * issues while still observing backup_heartbeat / parity tables directly.
 */
function psqlDb(sqlText: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tAc', sqlText], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: result.stderr ?? '',
  };
}

/**
 * Fail-closed heartbeat oracle (REDHAT-FIX-C2).
 *
 * NEVER invents {successRows:0,...} when DATABASE_URL is unreachable, backup_heartbeat
 * is missing, or COUNT queries fail. Throws with a named reason instead.
 */
function countFakeSuccessHeartbeats(): {
  successRows: number;
  okRows: number;
  restoreParityRows: number;
  db_probe_ok: true;
  table_present: true;
  success_count_query_status: number;
  ok_count_query_status: number;
  raw: unknown;
} {
  // Connectivity probe — fail closed with named reason (never soft-zero).
  const ping = psqlDb('SELECT 1');
  if (ping.status !== 0 || ping.stdout !== '1') {
    throw new Error(
      `database unreachable: psql SELECT 1 failed (status=${ping.status}, stderr=${(ping.stderr || '').slice(0, 300)})`
    );
  }

  const tableExists = psqlDb(`SELECT to_regclass('public.backup_heartbeat') IS NOT NULL`);
  if (tableExists.status !== 0) {
    throw new Error(
      `heartbeat query failed: to_regclass probe status=${tableExists.status} stderr=${(tableExists.stderr || '').slice(0, 300)}`
    );
  }
  if (tableExists.stdout !== 't') {
    throw new Error(
      `backup_heartbeat missing: to_regclass('public.backup_heartbeat') is not true (stdout=${JSON.stringify(tableExists.stdout)})`
    );
  }

  // Any success/OK heartbeat claiming a restore/pitr job is a fake-success on failure paths.
  const success = psqlDb(`
    SELECT COUNT(*)::text
    FROM backup_heartbeat
    WHERE lower(coalesce(status, '')) IN ('success', 'ok')
      AND (
        job_name ILIKE '%restore%'
        OR job_name ILIKE '%pitr%'
        OR job_name ILIKE 'd05-01%'
        OR coalesce(last_snapshot_id, '') ILIKE '%restore%'
      )
  `);
  if (success.status !== 0 || !/^\d+$/.test(success.stdout)) {
    throw new Error(
      `heartbeat query failed: success COUNT status=${success.status} stdout=${JSON.stringify(success.stdout)} stderr=${(success.stderr || '').slice(0, 300)}`
    );
  }

  const recentOk = psqlDb(`
    SELECT COUNT(*)::text
    FROM backup_heartbeat
    WHERE status IN ('success', 'OK')
      AND updated_at > now() - interval '30 minutes'
      AND (
        job_name ILIKE '%restore%'
        OR job_name ILIKE '%pitr%'
      )
  `);
  if (recentOk.status !== 0 || !/^\d+$/.test(recentOk.stdout)) {
    throw new Error(
      `heartbeat query failed: ok COUNT status=${recentOk.status} stdout=${JSON.stringify(recentOk.stdout)} stderr=${(recentOk.stderr || '').slice(0, 300)}`
    );
  }

  // Parity tracking optional until D05-04 — count explicit restore-success claims only.
  // If parity name listing fails, fail closed (do not invent zero).
  let restoreParityRows = 0;
  const parityNames = psqlDb(`
    SELECT coalesce(string_agg(relname, ','), '')
    FROM pg_class
    WHERE relkind = 'r'
      AND relnamespace = 'public'::regnamespace
      AND (
        relname ILIKE '%parity%'
        OR relname ILIKE '%restore%track%'
        OR relname = 'backup_parity'
      )
  `);
  if (parityNames.status !== 0) {
    throw new Error(
      `heartbeat query failed: parity table listing status=${parityNames.status} stderr=${(parityNames.stderr || '').slice(0, 300)}`
    );
  }
  const names =
    parityNames.stdout.length > 0
      ? parityNames.stdout.split(',').filter((n) => /^[a-z_][a-z0-9_]*$/i.test(n))
      : [];
  for (const name of names) {
    const claim = psqlDb(`
      SELECT COUNT(*)::text
      FROM "${name}" AS t
      WHERE position('restore' in lower(t::text)) > 0
        AND (
          position('success' in lower(t::text)) > 0
          OR position('completed' in lower(t::text)) > 0
        )
    `);
    if (claim.status !== 0 || !/^\d+$/.test(claim.stdout)) {
      throw new Error(
        `heartbeat query failed: parity COUNT on ${name} status=${claim.status} stdout=${JSON.stringify(claim.stdout)}`
      );
    }
    restoreParityRows += Number(claim.stdout);
  }

  return {
    successRows: Number(success.stdout),
    okRows: Number(recentOk.stdout),
    restoreParityRows,
    db_probe_ok: true,
    table_present: true,
    success_count_query_status: 0,
    ok_count_query_status: 0,
    raw: { success, recentOk, parityNames: names, ping },
  };
}

describe.sequential('Sprint 28 D05-01 RED — restore fails closed on empty/corrupted backup chain', () => {
  beforeAll(() => {
    ensureEvidenceDir();
    expect(PLATFORM_IT, 'PLATFORM_IT=1 required for live restore fail-closed integration').toBe(
      true
    );
    expect(existsSync(HOLO_CLI), `holo CLI missing: ${HOLO_CLI}`).toBe(true);

    const secretsPath = resolveSecretsPath();
    const cfg = loadBackupConfig({ secretsPath });
    const scratchRoot = mkdtempSync(join(tmpdir(), 'd05-01-restore-scratch-'));
    const seeded = seedFixtures(cfg);
    fixtures = {
      secretsPath,
      cfg,
      scratchRoot,
      ...seeded,
    };

    writeEvidence('red-suite-boot.json', {
      runId: RUN_ID,
      holoCli: HOLO_CLI,
      restoreModuleExists: existsSync(RESTORE_MODULE),
      secretsPath,
      bucket: cfg.bucketName,
      stanza: cfg.stanza,
      healthyStanza: seeded.healthyStanza,
      healthyBackupLabel: seeded.healthyBackupLabel,
      healthyPitrTimestamp: seeded.healthyPitrTimestamp,
      healthyObjectCount: seeded.healthyObjectCount,
      scratchRoot,
      note: 'Healthy fixture is a REAL pgBackRest chain (REDHAT-FIX-C1). Suite stays RED until D05-02 restore lands against that chain.',
    });
  }, 900_000);

  afterAll(() => {
    if (!fixtures) return;
    try {
      cleanupTestScopedFixtures(fixtures.cfg, fixtures.testScopedRoot);
    } catch (err) {
      writeEvidence('fixtures-cleanup-error.json', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    cleanupPgbackrestSeedWorkDir(fixtures.healthySeedWorkDir);
    try {
      rmSync(fixtures.scratchRoot, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  itLive(
    'empty R2 repo / missing base backup → non-zero + named error + PGDATA file count = 0',
    () => {
      if (!fixtures) throw new Error('fixtures not seeded');
      const scratchDir = join(fixtures.scratchRoot, 'empty-pgdata');
      mkdirSync(scratchDir, { recursive: true });

      const restore = runHoloRestore({
        pitr: PITR_TIMESTAMP,
        scratchDir,
        repoPrefix: fixtures.emptyPrefix,
        cfg: fixtures.cfg,
        secretsPath: fixtures.secretsPath,
      });

      writeEvidence('ac1-empty-r2-repo.json', {
        must_observe: [
          'exit code != 0',
          '"no base backup available" OR "backup chain missing" in stderr',
          'PGDATA file count = 0',
        ],
        status: restore.status,
        pgdataFileCount: restore.pgdataFileCount,
        args: restore.args,
        envPrefix: restore.envPrefix,
        combined: restore.combined.slice(0, 4000),
      });

      // AC-1: fail-closed
      expect(
        restore.status,
        `empty repo restore must exit non-zero; got ${restore.status}: ${restore.combined}`
      ).not.toBe(0);
      expect(restore.status, 'empty repo restore must not exit null').not.toBeNull();

      const errText = restore.combined.toLowerCase();
      expect(
        /no base backup available|backup chain missing/.test(errText),
        `empty repo must name missing base backup (got: ${restore.combined.slice(0, 800)})`
      ).toBe(true);

      expect(
        restore.pgdataFileCount,
        `PGDATA must remain empty after failed empty-repo restore; file count=${restore.pgdataFileCount}`
      ).toBe(0);
    },
    200_000
  );

  itLive(
    'corrupted manifest → non-zero + names corruption + no promoted DB',
    () => {
      if (!fixtures) throw new Error('fixtures not seeded');
      const scratchDir = join(fixtures.scratchRoot, 'corrupt-pgdata');
      mkdirSync(scratchDir, { recursive: true });

      const restore = runHoloRestore({
        pitr: PITR_TIMESTAMP,
        scratchDir,
        repoPrefix: fixtures.corruptPrefix,
        cfg: fixtures.cfg,
        secretsPath: fixtures.secretsPath,
      });

      const ctl = pgCtlStatus(scratchDir);
      const noPromotedDb =
        restore.pgdataFileCount === 0 || ctl.status === null || (ctl.status ?? 1) !== 0;

      writeEvidence('ac2-corrupted-manifest.json', {
        must_observe: [
          'exit code != 0',
          'manifest checksum mismatch OR WAL segment corrupted OR backup chain integrity check failed',
          'PGDATA file count = 0 OR pg_ctl status non-zero',
        ],
        status: restore.status,
        pgdataFileCount: restore.pgdataFileCount,
        pgCtlStatus: ctl.status,
        pgCtlCombined: ctl.combined.slice(0, 1000),
        noPromotedDb,
        args: restore.args,
        envPrefix: restore.envPrefix,
        combined: restore.combined.slice(0, 4000),
      });

      expect(
        restore.status,
        `corrupted chain restore must exit non-zero; got ${restore.status}: ${restore.combined}`
      ).not.toBe(0);

      const errText = restore.combined.toLowerCase();
      expect(
        /manifest checksum mismatch|wal segment corrupted|backup chain integrity check failed/.test(
          errText
        ),
        `corrupted chain must name the corruption (got: ${restore.combined.slice(0, 800)})`
      ).toBe(true);

      expect(noPromotedDb, 'must_not_observe: queryable promoted DB after corrupted restore').toBe(
        true
      );
    },
    200_000
  );

  itLive(
    'healthy seeded repo → restore would succeed (exit 0, SELECT 1, pitr_test rows >= 1)',
    () => {
      if (!fixtures) throw new Error('fixtures not seeded');
      const scratchDir = join(fixtures.scratchRoot, 'healthy-pgdata');
      mkdirSync(scratchDir, { recursive: true });

      // Product guard: healthy prefix must stay test-scoped (never bare production).
      expect(
        fixtures.healthyPrefix.startsWith('pgbackrest-d05-01-red/') &&
          fixtures.healthyPrefix.includes('/healthy'),
        `healthyPrefix must be test-scoped under pgbackrest-d05-01-red/.../healthy; got ${fixtures.healthyPrefix}`
      ).toBe(true);
      expect(
        fixtures.healthyPrefix === 'pgbackrest',
        'healthyPrefix must not equal bare production prefix pgbackrest'
      ).toBe(false);
      expect(
        fixtures.healthyBackupLabel.length,
        'healthy fixture must have real pgBackRest backup label from seeder'
      ).toBeGreaterThanOrEqual(8);
      expect(
        fixtures.healthyObjectCount,
        'healthy fixture must have real R2 objects from pgbackrest backup'
      ).toBeGreaterThanOrEqual(1);

      // Negative control: proves suite cannot pass on a blanket always-fail stub.
      // Only passes when production restore recovers the REAL pgBackRest chain.
      const restore = runHoloRestore({
        pitr: fixtures.healthyPitrTimestamp,
        scratchDir,
        repoPrefix: fixtures.healthyPrefix,
        cfg: fixtures.cfg,
        secretsPath: fixtures.secretsPath,
        stanza: fixtures.healthyStanza,
        timeoutMs: 300_000,
      });

      const select1 = restore.status === 0 ? psqlOnScratch(scratchDir, 'SELECT 1') : null;
      // pitr_test is seeded into the holocron DB (DATABASE_URL), not the postgres maintenance DB.
      const pitrCount =
        restore.status === 0
          ? psqlOnScratch(scratchDir, 'SELECT COUNT(*) FROM pitr_test', 'holocron')
          : null;
      const pitrRows =
        pitrCount && pitrCount.status === 0 ? Number(String(pitrCount.stdout).trim()) : 0;

      writeEvidence('ac3-healthy-seeded-repo.json', {
        must_observe: ['exit code 0', "psql -c 'SELECT 1' exit 0", 'pitr_test row count >= 1'],
        status: restore.status,
        pgdataFileCount: restore.pgdataFileCount,
        select1,
        pitrCount,
        pitrRows,
        healthyPrefix: fixtures.healthyPrefix,
        healthyStanza: fixtures.healthyStanza,
        healthyBackupLabel: fixtures.healthyBackupLabel,
        healthyPitrTimestamp: fixtures.healthyPitrTimestamp,
        healthyObjectCount: fixtures.healthyObjectCount,
        testScopedRoot: fixtures.testScopedRoot,
        healthyKeys: fixtures.healthyKeys,
        pitr_test_seed_intent:
          'REAL pgBackRest full backup after INSERT into pitr_test; GREEN only when D05-02 restore recovers that chain (never synthetic objects)',
        args: restore.args,
        combined: restore.combined.slice(0, 4000),
        note: 'Negative control against blanket always-fail implementations; honest RED until D05-02 lands PITR against real chain',
      });

      expect(
        restore.status,
        `healthy seeded repo restore must exit 0 against real pgBackRest chain; got ${restore.status}: ${restore.combined}`
      ).toBe(0);

      expect(select1, 'psql SELECT 1 must run after healthy restore').toBeTruthy();
      expect(
        select1?.status,
        `psql SELECT 1 must exit 0 on restored DB; got ${select1?.status}: ${select1?.stderr}`
      ).toBe(0);

      expect(
        pitrRows,
        `pitr_test row count must be >= 1 (concrete non-degenerate); got ${pitrRows}`
      ).toBeGreaterThanOrEqual(1);
    },
    360_000
  );

  itLive(
    'no fake-success row on failed restores (empty + corrupted)',
    () => {
      if (!fixtures) throw new Error('fixtures not seeded');

      const emptyScratch = join(fixtures.scratchRoot, 'fake-success-empty');
      const corruptScratch = join(fixtures.scratchRoot, 'fake-success-corrupt');
      mkdirSync(emptyScratch, { recursive: true });
      mkdirSync(corruptScratch, { recursive: true });

      const emptyRestore = runHoloRestore({
        pitr: PITR_TIMESTAMP,
        scratchDir: emptyScratch,
        repoPrefix: fixtures.emptyPrefix,
        cfg: fixtures.cfg,
        secretsPath: fixtures.secretsPath,
      });
      const corruptRestore = runHoloRestore({
        pitr: PITR_TIMESTAMP,
        scratchDir: corruptScratch,
        repoPrefix: fixtures.corruptPrefix,
        cfg: fixtures.cfg,
        secretsPath: fixtures.secretsPath,
      });

      expect(emptyRestore.status, 'empty failed restore must be non-zero').not.toBe(0);
      expect(corruptRestore.status, 'corrupt failed restore must be non-zero').not.toBe(0);

      const emptyFailureClass = classifyRestoreFailure(emptyRestore.combined, emptyRestore.status);
      const corruptFailureClass = classifyRestoreFailure(
        corruptRestore.combined,
        corruptRestore.status
      );

      // Fail-closed DB probe — throws on unreachable DB / missing backup_heartbeat.
      const heartbeats = countFakeSuccessHeartbeats();

      const evidence = {
        must_observe: [
          'exit code != 0 for both failed restores',
          "ZERO backup_heartbeat rows with status 'success'/'OK' for restore jobs (after real query_ok)",
          'ZERO parity tracking restore-completed rows',
          'db_probe_ok=true before zero asserts',
        ],
        emptyStatus: emptyRestore.status,
        corruptStatus: corruptRestore.status,
        emptyRestore: {
          status: emptyRestore.status,
          failure_class: emptyFailureClass,
          combined: emptyRestore.combined.slice(0, 1500),
        },
        corruptRestore: {
          status: corruptRestore.status,
          failure_class: corruptFailureClass,
          combined: corruptRestore.combined.slice(0, 1500),
        },
        db_probe_ok: heartbeats.db_probe_ok,
        table_present: heartbeats.table_present,
        success_count_query_status: heartbeats.success_count_query_status,
        successRows: heartbeats.successRows,
        okRows: heartbeats.okRows,
        restoreParityRows: heartbeats.restoreParityRows,
        heartbeats,
        restore_path_proven:
          emptyFailureClass === 'restore_path' || corruptFailureClass === 'restore_path',
        note:
          emptyFailureClass === 'parser' && corruptFailureClass === 'parser'
            ? 'Both failures are parser-class (e.g. unknown flag: --pitr) — AC-4 restore-path no-fake-success is NOT proven until D05-02 lands'
            : 'At least one failure classified as restore_path',
      };

      writeEvidence('ac4-no-fake-success-row.json', evidence);
      writeEvidence('ac4-no-fake-success-row.json', evidence, EVIDENCE_DIR_C2);
      writeEvidence(
        'red-output.txt',
        [
          `empty_failure_class=${emptyFailureClass}`,
          `corrupt_failure_class=${corruptFailureClass}`,
          `db_probe_ok=${heartbeats.db_probe_ok}`,
          `successRows=${heartbeats.successRows}`,
          `okRows=${heartbeats.okRows}`,
          `restoreParityRows=${heartbeats.restoreParityRows}`,
          `empty_combined=${emptyRestore.combined.slice(0, 500)}`,
          `corrupt_combined=${corruptRestore.combined.slice(0, 500)}`,
        ].join('\n'),
        EVIDENCE_DIR_C2
      );

      // Gate: zero-row claims require successful real query first (never fabricated zeroes).
      expect(heartbeats.db_probe_ok, 'db_probe_ok must be true before zero asserts').toBe(true);
      expect(heartbeats.table_present, 'backup_heartbeat must be present').toBe(true);
      expect(heartbeats.success_count_query_status, 'success COUNT must have status 0').toBe(0);

      expect(
        heartbeats.successRows,
        `must_not_observe: fake-success backup_heartbeat rows after failed restore (got ${heartbeats.successRows})`
      ).toBe(0);
      expect(
        heartbeats.okRows,
        `must_not_observe: OK heartbeat rows for restore after failure (got ${heartbeats.okRows})`
      ).toBe(0);
      expect(
        heartbeats.restoreParityRows,
        `must_not_observe: parity restore-completed claims after failure (got ${heartbeats.restoreParityRows})`
      ).toBe(0);

      // Parser-only (unknown flag: --pitr) must NOT sole-green AC-4 restore-path contract.
      expect(
        emptyFailureClass === 'restore_path' || corruptFailureClass === 'restore_path',
        `AC-4 restore-path no-fake-success not proven: empty=${emptyFailureClass} corrupt=${corruptFailureClass} (honest RED while only parser/unknown-flag failures are observed; D05-02 owns restore-path)`
      ).toBe(true);
    },
    300_000
  );
});
