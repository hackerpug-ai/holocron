/**
 * Run-scoped hermetic lifecycle for go/no-go integration + live lanes.
 *
 * Starts (or binds to) isolated Postgres / Convex / Zero, waits for readiness,
 * seeds reference agent/conversation + publication state, tracks child PIDs,
 * and verifies teardown before the gate report is written.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(HERE, '../../../..');

export const REFERENCE_CONVERSATION_ID = '00000000-0000-0000-0000-000000000020';
export const REFERENCE_CONVERSATION_TITLE = 'Sprint 20 reference conversation';

export type LifecycleChild = {
  name: string;
  pid: number;
  process?: ChildProcess;
  /** When true, kill process group (-pid) on teardown. */
  processGroup?: boolean;
};

export type LifecycleReadiness = {
  postgres: boolean;
  zero: boolean;
  convex: boolean;
  fleet: boolean;
  details: string[];
};

export type LifecycleSeedResult = {
  conversationId: string;
  runId: string;
  agentMessageId: string;
  userMessageId: string;
  requestId: string;
  message: string;
};

export type IsolatedLifecycleHandle = {
  env: NodeJS.ProcessEnv;
  root: string;
  evidenceDir: string;
  databaseUrl: string;
  ownerDatabaseUrl: string;
  pg1Path: string;
  zeroUrl: string;
  convexUrl: string;
  fleetUrl: string;
  children: LifecycleChild[];
  started: { postgres: boolean; zero: boolean; convex: boolean };
  waitReady: (timeoutMs?: number) => LifecycleReadiness;
  seedReferenceState: (options?: { message?: string; requestId?: string }) => LifecycleSeedResult;
  ensurePublication: () => void;
  restartZero: () => void;
  registerChild: (child: LifecycleChild) => void;
  stopAll: () => { stopped: string[]; stillAlive: string[] };
  verifyTeardown: () => { ok: boolean; orphans: string[]; messages: string[] };
};

function sleepSync(ms: number): void {
  spawnSync('sleep', [String(ms / 1000)], { timeout: ms + 2000 });
}

function freePort(): number {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('cannot allocate free TCP port');
  }
  const port = addr.port;
  server.close();
  return port;
}

function resolvePgBin(): string {
  const candidates = [
    '/opt/homebrew/opt/postgresql@18/bin',
    '/usr/local/opt/postgresql@18/bin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'initdb')) && existsSync(resolve(dir, 'pg_ctl'))) {
      return dir;
    }
  }
  throw new Error('postgresql@18 binaries (initdb/pg_ctl) not found');
}

function pidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  return spawnSync('kill', ['-0', String(pid)]).status === 0;
}

function killTree(pid: number, signal: 'TERM' | 'KILL' = 'TERM'): void {
  // Prefer process-group kill for detached zero workers.
  spawnSync('kill', [`-${signal}`, String(-pid)], { encoding: 'utf8' });
  spawnSync('kill', [`-${signal}`, String(pid)], { encoding: 'utf8' });
}

function runPsql(
  databaseUrl: string,
  sql: string,
  options?: { scalar?: boolean; env?: NodeJS.ProcessEnv }
): { status: number | null; stdout: string; stderr: string } {
  const url = new URL(databaseUrl);
  const env: NodeJS.ProcessEnv = {
    LANG: 'C',
    LC_ALL: 'C',
    PATH: process.env.PATH,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username || process.env.USER || 'postgres'),
    PGDATABASE: url.pathname.replace(/^\//, ''),
    ...(options?.env ?? {}),
  };
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const result = spawnSync(
    'psql',
    ['-X', ...(options?.scalar ? ['-At'] : []), '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', env, timeout: 60_000 }
  );
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function waitHttpOk(url: string, timeoutMs: number, path = '/'): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = spawnSync(
      'curl',
      ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '2', `${url}${path}`],
      { encoding: 'utf8' }
    );
    const code = (r.stdout ?? '').trim();
    if (r.status === 0 && code && code !== '000') return true;
    sleepSync(400);
  }
  return false;
}

function waitPostgres(databaseUrl: string, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = runPsql(databaseUrl, 'SELECT 1', { scalar: true });
    if (r.status === 0 && r.stdout.trim() === '1') return true;
    sleepSync(300);
  }
  return false;
}

function startPostgresCluster(options: { root: string; repoRoot: string }): {
  databaseUrl: string;
  ownerDatabaseUrl: string;
  pg1Path: string;
  port: number;
  pid: number;
} {
  const pgBin = resolvePgBin();
  const dataDir = resolve(options.root, 'pgdata');
  const logPath = resolve(options.root, 'postgres.log');
  mkdirSync(dataDir, { recursive: true });
  const init = spawnSync(
    resolve(pgBin, 'initdb'),
    ['-D', dataDir, '--auth-local=trust', '--auth-host=trust', '-U', 'postgres'],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${pgBin}:${process.env.PATH ?? ''}` },
    }
  );
  if (init.status !== 0) {
    throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  }
  const port = freePort();
  const conf = `
listen_addresses = '127.0.0.1'
port = ${port}
wal_level = logical
max_connections = 250
max_replication_slots = 10
max_wal_senders = 10
archive_timeout = 60
shared_preload_libraries = ''
`;
  writeFileSync(resolve(dataDir, 'postgresql.auto.conf'), conf, 'utf8');
  const start = spawnSync(
    resolve(pgBin, 'pg_ctl'),
    ['-D', dataDir, '-l', logPath, '-w', '-t', '30', 'start'],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${pgBin}:${process.env.PATH ?? ''}` },
    }
  );
  if (start.status !== 0) {
    throw new Error(`pg_ctl start failed: ${start.stderr || start.stdout}`);
  }
  const status = spawnSync(resolve(pgBin, 'pg_ctl'), ['-D', dataDir, 'status'], {
    encoding: 'utf8',
  });
  const pidMatch = /PID:\s*(\d+)/.exec(status.stdout ?? '');
  const pid = pidMatch ? Number(pidMatch[1]) : 0;
  if (!pid) throw new Error(`cannot resolve postgres PID from: ${status.stdout}`);

  const adminUrl = `postgres://postgres@127.0.0.1:${port}/postgres`;
  const createDb = runPsql(adminUrl, 'CREATE DATABASE holocron_nonprod');
  if (createDb.status !== 0 && !/already exists/i.test(createDb.stderr + createDb.stdout)) {
    throw new Error(`CREATE DATABASE holocron_nonprod failed: ${createDb.stderr}`);
  }
  // Enable vector if available (best-effort — migrate will fail closed if missing).
  runPsql(
    `postgres://postgres@127.0.0.1:${port}/holocron_nonprod`,
    'CREATE EXTENSION IF NOT EXISTS vector'
  );

  const databaseUrl = `postgres://postgres@127.0.0.1:${port}/holocron_nonprod`;
  // Apply platform migrations via holo when available.
  const holo = resolve(options.repoRoot, 'packages/platform/src/cli/holo.ts');
  if (existsSync(holo)) {
    const mig = spawnSync('bun', [holo, 'db:migrate', '--json'], {
      cwd: options.repoRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: databaseUrl, HOLO_DANGEROUS_ALLOW_PROD_DB: '0' },
      timeout: 180_000,
    });
    if (mig.status !== 0) {
      throw new Error(`db:migrate failed: ${mig.stderr || mig.stdout}`);
    }
  }

  return {
    databaseUrl,
    ownerDatabaseUrl: databaseUrl,
    pg1Path: dataDir,
    port,
    pid,
  };
}

function startZeroCache(options: {
  repoRoot: string;
  databaseUrl: string;
  port: number;
  adminPassword: string;
  logPath: string;
  /** Unique SQLite replica path so hermetic runs do not inherit a litestream-backed zero.db. */
  replicaFile: string;
}): { pid: number; process: ChildProcess; url: string } {
  const script = resolve(options.repoRoot, 'scripts/run-zero-cache.sh');
  if (!existsSync(script)) {
    throw new Error(`run-zero-cache.sh missing at ${script}`);
  }
  const logFd = openSync(options.logPath, 'a');
  // Drop litestream keys entirely (empty string still trips Zero 1.8 restore paths).
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    'ZERO_LITESTREAM_EXECUTABLE',
    'ZERO_LITESTREAM_BACKUP_URL',
    'ZERO_LITESTREAM_CONFIG',
  ]) {
    delete env[key];
  }
  const child = spawn('/bin/bash', [script], {
    cwd: options.repoRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...env,
      DATABASE_URL: options.databaseUrl,
      ZERO_UPSTREAM_DB: options.databaseUrl,
      ZERO_ADMIN_PASSWORD: options.adminPassword,
      ZERO_PORT: String(options.port),
      ZERO_PUBLICATION: 'zero_pub',
      // Hermetic fresh replica — never reuse repo-root/tmp zero.db litestream state.
      ZERO_REPLICA_FILE: options.replicaFile,
    },
  });
  child.unref();
  if (!child.pid) throw new Error('failed to spawn zero-cache');
  return {
    pid: child.pid,
    process: child,
    url: `http://127.0.0.1:${options.port}`,
  };
}

function zeroWorkerPids(port: number): number[] {
  const r = spawnSync('pgrep', ['-f', `zero-cache.*--port ${port}`], { encoding: 'utf8' });
  if (r.status !== 0) return [];
  return (r.stdout ?? '')
    .split('\n')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Seed the Sprint 20 reference conversation + a completed chat_run/agent pair
 * that capstone-verdict.sh can bind to via reference-request.json fields.
 */
export function seedReferenceAgentState(options: {
  databaseUrl: string;
  conversationId?: string;
  title?: string;
  message?: string;
  requestId?: string;
}): LifecycleSeedResult {
  const conversationId = options.conversationId ?? REFERENCE_CONVERSATION_ID;
  const title = options.title ?? REFERENCE_CONVERSATION_TITLE;
  const message =
    options.message ??
    `Sprint 20 reference-flow ping ${new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, 'Z')}-${process.pid}`;
  const requestId = options.requestId ?? `s20-reference-${message}`;
  const runId = randomUUID();
  const userMessageId = randomUUID();
  const agentMessageId = randomUUID();
  const agentContent =
    'Hermetic go/no-go reference agent reply — durable Postgres + Zero substrate proof.';

  const ensureRun = runPsql(
    options.databaseUrl,
    `
INSERT INTO conversations (id, title, created_at, updated_at)
VALUES ('${conversationId}'::uuid, '${title.replace(/'/g, "''")}', now(), now())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = now();
`
  );
  if (ensureRun.status !== 0) {
    throw new Error(`seed conversation failed: ${ensureRun.stderr}`);
  }

  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  // Resolve existing run id if request already present.
  const existing = runPsql(
    options.databaseUrl,
    `SELECT id::text FROM chat_runs WHERE owner_scope='rn' AND request_id='${requestId.replace(/'/g, "''")}' LIMIT 1`,
    { scalar: true }
  );
  let resolvedRunId = uuidRe.exec(existing.stdout)?.[0] ?? '';
  if (!resolvedRunId) {
    const ins = runPsql(
      options.databaseUrl,
      `INSERT INTO chat_runs (
        id, owner_scope, request_id, conversation_id, user_message_id, durable_message_id,
        role, status, message, final_text, completed_at, updated_at
      ) VALUES (
        '${runId}'::uuid, 'rn', '${requestId.replace(/'/g, "''")}', '${conversationId}',
        '${userMessageId}'::uuid, '${agentMessageId}'::uuid,
        'user', 'completed', '${message.replace(/'/g, "''")}',
        '${agentContent.replace(/'/g, "''")}', now(), now()
      ) RETURNING id::text`,
      { scalar: true }
    );
    if (ins.status !== 0) throw new Error(`seed chat_run failed: ${ins.stderr}`);
    resolvedRunId = uuidRe.exec(ins.stdout)?.[0] ?? runId;
  } else {
    runPsql(
      options.databaseUrl,
      `UPDATE chat_runs SET status='completed', message='${message.replace(/'/g, "''")}',
       final_text='${agentContent.replace(/'/g, "''")}', completed_at=now(), updated_at=now()
       WHERE id='${resolvedRunId}'::uuid`
    );
  }

  runPsql(
    options.databaseUrl,
    `DELETE FROM chat_messages WHERE conversation_id='${conversationId}' AND session_id='${resolvedRunId}'`
  );
  const msgIns = runPsql(
    options.databaseUrl,
    `
INSERT INTO chat_messages (id, conversation_id, role, content, message_type, session_id, created_at)
VALUES
  ('${userMessageId}'::uuid, '${conversationId}', 'user', '${message.replace(/'/g, "''")}', 'text', '${resolvedRunId}', now()),
  ('${agentMessageId}'::uuid, '${conversationId}', 'agent', '${agentContent.replace(/'/g, "''")}', 'text', '${resolvedRunId}', now() + interval '1 millisecond');
`
  );
  if (msgIns.status !== 0) throw new Error(`seed chat_messages failed: ${msgIns.stderr}`);

  // degraded_mode control row required by production lane guards.
  runPsql(
    options.databaseUrl,
    `INSERT INTO degraded_mode (id, degraded_state, resume_state, mission_mode, extraction_state)
     VALUES ('global', 'normal', 'normal', 'full', 'running')
     ON CONFLICT (id) DO UPDATE SET
       degraded_state='normal', resume_state='normal', message=NULL, role=NULL,
       endpoint=NULL, degradation_action=NULL, mission_mode='full',
       extraction_state='running', updated_at=now()`
  );

  return {
    conversationId,
    runId: resolvedRunId,
    agentMessageId,
    userMessageId,
    requestId,
    message,
  };
}

export function ensureZeroPublication(databaseUrl: string): void {
  const check = runPsql(
    databaseUrl,
    `SELECT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='zero_pub')`,
    { scalar: true }
  );
  if (check.status === 0 && check.stdout.trim() === 't') return;
  // Migration 0002 should create it; recreate minimally if absent.
  const create = runPsql(
    databaseUrl,
    `CREATE PUBLICATION zero_pub FOR TABLE conversations, chat_messages, file_objects`
  );
  if (create.status !== 0 && !/already exists/i.test(create.stderr + create.stdout)) {
    throw new Error(`ensure zero_pub failed: ${create.stderr}`);
  }
}

/**
 * Create a run-scoped hermetic lifecycle.
 *
 * When HOLO_GO_NO_GO_* targets are provided, binds to them and still performs
 * ready-wait, seed, child tracking, and teardown verification.
 * When HOLO_GO_NO_GO_AUTOSTART=1 (or targets are absent and autostart is defaulted),
 * starts isolated Postgres + Zero under a unique temp root.
 */
export function createIsolatedLifecycle(options: {
  repoRoot?: string;
  baseEnv?: NodeJS.ProcessEnv;
  autostart?: boolean;
}): IsolatedLifecycleHandle {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const baseEnv = { ...process.env, ...(options.baseEnv ?? {}) };
  const root = mkdtempSync(resolve(tmpdir(), 'holocron-s29-lifecycle-'));
  const evidenceDir = resolve(root, 'evidence');
  mkdirSync(evidenceDir, { recursive: true });
  const children: LifecycleChild[] = [];
  const started = { postgres: false, zero: false, convex: false };

  let databaseUrl = baseEnv.HOLO_GO_NO_GO_DATABASE_URL?.trim() || '';
  let ownerDatabaseUrl = baseEnv.HOLO_GO_NO_GO_DATABASE_URL_OWNER?.trim() || databaseUrl;
  let pg1Path = baseEnv.HOLO_GO_NO_GO_PGBACKREST_PG1_PATH?.trim() || '';
  let zeroUrl = baseEnv.ZERO_CACHE_URL?.trim() || 'http://127.0.0.1:4848';
  const convexUrl =
    baseEnv.HOLO_GO_NO_GO_CONVEX_URL?.trim() ||
    baseEnv.EXPO_PUBLIC_CONVEX_URL?.trim() ||
    'http://127.0.0.1:3210';
  const fleetUrl =
    baseEnv.HOLO_GO_NO_GO_FLEET_URL?.trim() ||
    baseEnv.FLEET_URL?.trim() ||
    'http://127.0.0.1:4545/v1';

  const wantAutostart =
    options.autostart === true ||
    baseEnv.HOLO_GO_NO_GO_AUTOSTART === '1' ||
    (!databaseUrl && baseEnv.HOLO_GO_NO_GO_AUTOSTART !== '0');

  if (wantAutostart && !databaseUrl) {
    const pg = startPostgresCluster({ root, repoRoot });
    databaseUrl = pg.databaseUrl;
    ownerDatabaseUrl = pg.ownerDatabaseUrl;
    pg1Path = pg.pg1Path;
    children.push({ name: 'postgres', pid: pg.pid, processGroup: true });
    started.postgres = true;
  }

  if (!databaseUrl) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(
      'HOLO_GO_NO_GO_DATABASE_URL is required (or set HOLO_GO_NO_GO_AUTOSTART=1 to boot isolated Postgres)'
    );
  }
  if (!pg1Path) {
    // Non-autostart path still needs a distinct pg1 path for archive_command cleanup.
    pg1Path = resolve(root, 'pg1-placeholder');
    mkdirSync(pg1Path, { recursive: true });
  }
  if (!ownerDatabaseUrl) ownerDatabaseUrl = databaseUrl;

  const zeroAdmin =
    baseEnv.ZERO_ADMIN_PASSWORD?.trim() || `s29-lifecycle-${randomUUID().slice(0, 8)}`;
  const zeroPort = Number(baseEnv.ZERO_PORT || new URL(zeroUrl).port || 4848);
  const zeroHealthy = waitHttpOk(zeroUrl, 1500);
  if (!zeroHealthy && (wantAutostart || baseEnv.HOLO_GO_NO_GO_START_ZERO === '1')) {
    const replicaFile = resolve(root, `zero-replica-${zeroPort}.db`);
    const z = startZeroCache({
      repoRoot,
      databaseUrl,
      port: zeroPort,
      adminPassword: zeroAdmin,
      logPath: resolve(root, 'zero-cache.log'),
      replicaFile,
    });
    children.push({ name: 'zero-cache', pid: z.pid, process: z.process, processGroup: true });
    started.zero = true;
    zeroUrl = z.url;
    // Zero 1.8 needs several seconds to open the replica + publications.
    if (!waitHttpOk(zeroUrl, 45_000)) {
      throw new Error(
        `HOLO_GO_NO_GO_START_ZERO=1 but zero-cache failed to become ready at ${zeroUrl} (see ${resolve(root, 'zero-cache.log')})`
      );
    }
  }

  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_OWNER: ownerDatabaseUrl,
    HOLO_GO_NO_GO_DATABASE_URL: databaseUrl,
    HOLO_GO_NO_GO_DATABASE_URL_OWNER: ownerDatabaseUrl,
    HOLO_GO_NO_GO_PGBACKREST_PG1_PATH: pg1Path,
    HOLO_GO_NO_GO_CONVEX_URL: convexUrl,
    HOLO_GO_NO_GO_CONVEX_SITE_URL:
      baseEnv.HOLO_GO_NO_GO_CONVEX_SITE_URL?.trim() ||
      baseEnv.EXPO_PUBLIC_CONVEX_SITE_URL?.trim() ||
      'http://127.0.0.1:3211',
    HOLO_GO_NO_GO_CONVEX_DEPLOYMENT:
      baseEnv.HOLO_GO_NO_GO_CONVEX_DEPLOYMENT?.trim() || 'local:s29-lifecycle',
    HOLO_GO_NO_GO_FLEET_URL: fleetUrl,
    HOLO_GO_NO_GO_ISOLATED: '1',
    ZERO_CACHE_URL: zeroUrl,
    ZERO_ADMIN_PASSWORD: zeroAdmin,
    ZERO_PORT: String(zeroPort),
    FLEET_URL: fleetUrl,
    EXPO_PUBLIC_CONVEX_URL: convexUrl,
    CONVEX_URL: convexUrl,
    HOLO_LIFECYCLE_ROOT: root,
    HOLO_LIFECYCLE_EVIDENCE_DIR: evidenceDir,
    E2E_ARTIFACT_DIR: baseEnv.E2E_ARTIFACT_DIR?.trim() || evidenceDir,
  };

  const handle: IsolatedLifecycleHandle = {
    env,
    root,
    evidenceDir,
    databaseUrl,
    ownerDatabaseUrl,
    pg1Path,
    zeroUrl,
    convexUrl,
    fleetUrl,
    children,
    started,
    waitReady(timeoutMs = 60_000) {
      const details: string[] = [];
      const postgres = waitPostgres(databaseUrl, timeoutMs);
      details.push(postgres ? 'postgres:ready' : 'postgres:timeout');
      const zero = waitHttpOk(zeroUrl, Math.min(timeoutMs, 45_000));
      details.push(zero ? `zero:ready@${zeroUrl}` : `zero:timeout@${zeroUrl}`);
      const convex = waitHttpOk(convexUrl, Math.min(timeoutMs, 10_000));
      details.push(convex ? `convex:ready@${convexUrl}` : `convex:not-ready@${convexUrl}`);
      // Fleet is best-effort (tests that need it will fail closed themselves).
      const fleetOrigin = fleetUrl.replace(/\/v1\/?$/, '');
      const fleet = waitHttpOk(fleetOrigin, Math.min(timeoutMs, 5_000), '/health');
      details.push(fleet ? 'fleet:ready' : 'fleet:not-ready');
      if (!postgres) {
        throw new Error(`lifecycle waitReady failed: ${details.join('; ')}`);
      }
      return { postgres, zero, convex, fleet, details };
    },
    seedReferenceState(seedOpts) {
      ensureZeroPublication(databaseUrl);
      return seedReferenceAgentState({
        databaseUrl,
        message: seedOpts?.message,
        requestId: seedOpts?.requestId,
      });
    },
    ensurePublication() {
      ensureZeroPublication(databaseUrl);
    },
    restartZero() {
      for (const pid of zeroWorkerPids(zeroPort)) {
        killTree(pid, 'TERM');
      }
      sleepSync(500);
      for (const pid of zeroWorkerPids(zeroPort)) {
        killTree(pid, 'KILL');
      }
      const z = startZeroCache({
        repoRoot,
        databaseUrl,
        port: zeroPort,
        adminPassword: zeroAdmin,
        logPath: resolve(root, 'zero-cache-restart.log'),
        replicaFile: resolve(root, `zero-replica-restart-${zeroPort}.db`),
      });
      children.push({
        name: 'zero-cache-restart',
        pid: z.pid,
        process: z.process,
        processGroup: true,
      });
      started.zero = true;
      if (!waitHttpOk(zeroUrl, 45_000)) {
        throw new Error(`zero-cache failed to become ready after restart at ${zeroUrl}`);
      }
    },
    registerChild(child) {
      children.push(child);
    },
    stopAll() {
      const stopped: string[] = [];
      const stillAlive: string[] = [];
      // Stop in reverse order (zero before postgres).
      for (const child of [...children].reverse()) {
        if (!pidAlive(child.pid)) {
          stopped.push(`${child.name}:${child.pid}:already-dead`);
          continue;
        }
        killTree(child.pid, 'TERM');
        sleepSync(400);
        if (pidAlive(child.pid)) {
          killTree(child.pid, 'KILL');
          sleepSync(200);
        }
        if (pidAlive(child.pid)) stillAlive.push(`${child.name}:${child.pid}`);
        else stopped.push(`${child.name}:${child.pid}`);
      }
      // Sweep zero workers on our port (orphans from prior runs / nested spawns).
      if (started.zero || baseEnv.HOLO_GO_NO_GO_KILL_ZERO_ORPHANS === '1') {
        for (const pid of zeroWorkerPids(zeroPort)) {
          killTree(pid, 'TERM');
          sleepSync(200);
          if (pidAlive(pid)) killTree(pid, 'KILL');
          if (pidAlive(pid)) stillAlive.push(`zero-orphan:${pid}`);
          else stopped.push(`zero-orphan:${pid}`);
        }
      }
      return { stopped, stillAlive };
    },
    verifyTeardown() {
      const messages: string[] = [];
      const orphans: string[] = [];
      for (const child of children) {
        if (pidAlive(child.pid)) {
          orphans.push(`${child.name}:${child.pid}`);
        }
      }
      if (started.zero) {
        for (const pid of zeroWorkerPids(zeroPort)) {
          orphans.push(`zero-worker:${pid}`);
        }
      }
      if (started.postgres) {
        const stillUp = waitPostgres(databaseUrl, 500);
        if (stillUp) orphans.push('postgres:still-accepting');
      }
      const ok = orphans.length === 0;
      messages.push(
        ok
          ? 'teardown verified: no tracked children or zero orphans remain'
          : `teardown incomplete: ${orphans.join(', ')}`
      );
      // Always remove the run-scoped temp root after verification.
      try {
        rmSync(root, { recursive: true, force: true });
        messages.push(`removed lifecycle root ${root}`);
      } catch (err) {
        messages.push(`lifecycle root cleanup failed: ${String(err)}`);
      }
      return { ok, orphans, messages };
    },
  };

  return handle;
}
