import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSql, type Sql } from '../../src/db/client';
import {
  assertHolocronNonprodDatabaseUrl,
  DEFAULT_HOLOCRON_NONPROD_DATABASE_URL,
} from '../../src/db/connection';
import { provisionNonprodNamespace, toNonprodUrl } from '../../src/db/nonprod';

export type JsonRecord = Record<string, unknown>;

export const PLATFORM_IT = process.env.PLATFORM_IT === '1';
export const BUN_BIN = process.env.BUN_BIN ?? 'bun';
export const RN = process.env.HOLO_KEY_RN ?? 'rn-test';
export const MCP = process.env.HOLO_KEY_MCP ?? 'mcp-test';
export const CONTROL = process.env.HOLO_KEY_CONTROL ?? 'ctl-test';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../../../..');
export const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
export const MISSION_RUNTIME_CHILD = resolve(HERE, 'mission-runtime-child.ts');
export const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/sprint-15-red');
export const ARTIFACTS_DIR = resolve(EVIDENCE_DIR, 'artifacts');
export const RAW_LOGS_DIR = resolve(EVIDENCE_DIR, 'raw');
export const GENERATED_DIR = resolve(EVIDENCE_DIR, 'generated');
export const FIXTURES_DIR = resolve(REPO_ROOT, 'services/platform/tests/fixtures/mission-engine');
export const PLATFORM_SRC_DIR = resolve(REPO_ROOT, 'services/platform/src');

const OWNER_URL =
  process.env.DATABASE_URL_OWNER ??
  process.env.DATABASE_URL ??
  'postgres://127.0.0.1:5432/holocron';
const DEFAULT_NONPROD_URL = process.env.DATABASE_URL?.includes('holocron_nonprod')
  ? process.env.DATABASE_URL
  : toNonprodUrl(OWNER_URL);

export const DATABASE_URL = assertHolocronNonprodDatabaseUrl(
  DEFAULT_NONPROD_URL || DEFAULT_HOLOCRON_NONPROD_DATABASE_URL,
  { context: 'sprint-15-red-tests' }
);

export const EXPECTED_MISSION_TABLES = [
  'mission_templates',
  'mission_template_versions',
  'mission_runs',
  'mission_stage_runs',
  'mission_checkpoints',
  'mission_commits',
  'mission_events',
  'mission_steering',
  'mission_verdicts',
] as const;

export const EXPECTED_RUN_COLUMNS = [
  'id',
  'template_key',
  'template_version',
  'idempotency_key',
  'owner_scope',
  'status',
  'checkpoint_stage_index',
  'lease_owner',
  'lease_token',
  'lease_expires_at',
  'attempt_count',
  'trace_id',
] as const;

export const EXPECTED_STAGE_RUN_COLUMNS = [
  'run_id',
  'stage_index',
  'stage_key',
  'status',
  'attempt',
  'checkpoint_key',
  'fence_token',
] as const;

export const EXPECTED_COMMIT_COLUMNS = [
  'run_id',
  'commit_name',
  'output_schema_ref',
  'output_schema_version',
  'typed_output_json',
] as const;

export const EXPECTED_TEMPLATE_VERSION_COLUMNS = [
  'template_key',
  'version',
  'dsl_version',
  'definition_hash',
  'compiler_version',
  'registry_snapshot_hash',
  'output_schema_ref',
  'output_schema_version',
] as const;

const SUITE_RUN_ID = createHash('sha256')
  .update(`${new Date().toISOString()}::${process.pid}`)
  .digest('hex')
  .slice(0, 12);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`unsafe SQL identifier: ${identifier}`);
  }
  return identifier;
}

export function ensureEvidenceDirs(): void {
  for (const dir of [EVIDENCE_DIR, ARTIFACTS_DIR, RAW_LOGS_DIR, GENERATED_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function scenarioId(label: string): string {
  return `${slugify(label)}-${SUITE_RUN_ID}`;
}

export function fixturePath(name: string): string {
  return resolve(FIXTURES_DIR, name);
}

export function writeArtifact(name: string, body: unknown): string {
  ensureEvidenceDirs();
  const path = resolve(ARTIFACTS_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

export function safeJsonParse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line) continue;
      if (line.startsWith('{') || line.startsWith('[')) {
        try {
          return JSON.parse(line);
        } catch {
          // keep scanning
        }
      }
    }
    return null;
  }
}

export function rowValue(row: JsonRecord | null | undefined, aliases: readonly string[]): unknown {
  if (!row) return undefined;
  for (const alias of aliases) {
    if (Object.hasOwn(row, alias)) return row[alias];
  }
  return undefined;
}

function toComparablePrimitive(value: unknown): unknown {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value == null) return value;
  return JSON.stringify(value);
}

export function normalizeForDeterministicCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForDeterministicCompare(item));
  }
  if (value && typeof value === 'object') {
    const out: JsonRecord = {};
    for (const [key, child] of Object.entries(value as JsonRecord)) {
      if (
        /(^id$|_id$|Id$|^runId$|^traceId$|^createdAt$|^updatedAt$|_at$|At$|timestamp|deadline|expires)/i.test(
          key
        )
      ) {
        continue;
      }
      out[key] = normalizeForDeterministicCompare(child);
    }
    return out;
  }
  return value;
}

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export type HoloResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
  parsed: unknown;
  command: string[];
  artifactBase: string;
};

export type SpawnedHoloResult = HoloResult & {
  signal: NodeJS.Signals | null;
  wasKilled: boolean;
};

export type RunningHoloProcess = {
  pid: number | undefined;
  command: string[];
  artifactBase: string;
  kill: (signal?: NodeJS.Signals) => boolean;
  snapshot: () => { stdout: string; stderr: string; combined: string; parsed: unknown };
  exited: () => boolean;
  result: Promise<SpawnedHoloResult>;
};

export type MissionRuntimeRequest = {
  templateKey: string;
  goal: string;
  idempotencyKey: string;
  operator?: string;
};

export type MissionRuntimeRunRef = {
  runId: string;
};

function makeProcessEnv(overrides?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL,
    HOLO_KEY_RN: RN,
    HOLO_KEY_MCP: MCP,
    HOLO_KEY_CONTROL: CONTROL,
  };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
  return env;
}

export function runHolo(
  artifactBase: string,
  args: string[],
  options?: {
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
  }
): HoloResult {
  ensureEvidenceDirs();
  const env = makeProcessEnv(options?.env);
  const command = [BUN_BIN, HOLO_CLI, ...args];
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
    timeout: options?.timeoutMs ?? 90_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  writeFileSync(resolve(RAW_LOGS_DIR, `${artifactBase}.stdout.log`), stdout, 'utf8');
  writeFileSync(resolve(RAW_LOGS_DIR, `${artifactBase}.stderr.log`), stderr, 'utf8');
  const parsed = safeJsonParse(stdout);
  writeArtifact(`${artifactBase}.json`, {
    artifactBase,
    command,
    status: result.status,
    stdout,
    stderr,
    parsed,
    databaseUrl: DATABASE_URL,
  });
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
    parsed,
    command,
    artifactBase,
  };
}

export function startHoloProcess(
  artifactBase: string,
  args: string[],
  options?: {
    env?: Record<string, string | undefined>;
  }
): RunningHoloProcess {
  ensureEvidenceDirs();
  const env = makeProcessEnv(options?.env);
  const command = [BUN_BIN, HOLO_CLI, ...args];
  const child = spawn(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let settled = false;

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const result = new Promise<SpawnedHoloResult>((resolveResult, reject) => {
    child.once('error', reject);
    child.once('exit', (status, signal) => {
      settled = true;
      writeFileSync(resolve(RAW_LOGS_DIR, `${artifactBase}.stdout.log`), stdout, 'utf8');
      writeFileSync(resolve(RAW_LOGS_DIR, `${artifactBase}.stderr.log`), stderr, 'utf8');
      const parsed = safeJsonParse(stdout);
      writeArtifact(`${artifactBase}.json`, {
        artifactBase,
        command,
        pid: child.pid,
        status,
        signal,
        stdout,
        stderr,
        parsed,
        databaseUrl: DATABASE_URL,
      });
      resolveResult({
        status,
        stdout,
        stderr,
        combined: `${stdout}\n${stderr}`,
        parsed,
        command,
        artifactBase,
        signal,
        wasKilled: signal != null,
      });
    });
  });

  return {
    pid: child.pid,
    command,
    artifactBase,
    kill: (signal: NodeJS.Signals = 'SIGKILL') => child.kill(signal),
    snapshot: () => ({
      stdout,
      stderr,
      combined: `${stdout}\n${stderr}`,
      parsed: safeJsonParse(stdout),
    }),
    exited: () => settled,
    result,
  };
}

function runMissionRuntimeCommand(
  artifactBase: string,
  runtimeCommand: 'run' | 'resume' | 'status',
  request: MissionRuntimeRequest | MissionRuntimeRunRef,
  options?: {
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
  }
): HoloResult {
  ensureEvidenceDirs();
  const env = makeProcessEnv(options?.env);
  const payload = JSON.stringify(request);
  const command = [BUN_BIN, MISSION_RUNTIME_CHILD, runtimeCommand, payload];
  const result = spawnSync(BUN_BIN, [MISSION_RUNTIME_CHILD, runtimeCommand, payload], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
    timeout: options?.timeoutMs ?? 90_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  writeFileSync(resolve(RAW_LOGS_DIR, `${artifactBase}.stdout.log`), stdout, 'utf8');
  writeFileSync(resolve(RAW_LOGS_DIR, `${artifactBase}.stderr.log`), stderr, 'utf8');
  const parsed = safeJsonParse(stdout);
  writeArtifact(`${artifactBase}.json`, {
    artifactBase,
    command,
    status: result.status,
    stdout,
    stderr,
    parsed,
    databaseUrl: DATABASE_URL,
  });
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
    parsed,
    command,
    artifactBase,
  };
}

export function runMissionRuntime(
  artifactBase: string,
  request: MissionRuntimeRequest,
  options?: {
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
  }
): HoloResult {
  return runMissionRuntimeCommand(artifactBase, 'run', request, options);
}

export function runMissionRuntimeResume(
  artifactBase: string,
  runId: string,
  options?: {
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
  }
): HoloResult {
  return runMissionRuntimeCommand(artifactBase, 'resume', { runId }, options);
}

export function runMissionRuntimeStatus(
  artifactBase: string,
  runId: string,
  options?: {
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
  }
): HoloResult {
  return runMissionRuntimeCommand(artifactBase, 'status', { runId }, options);
}

export function startMissionRuntimeProcess(
  artifactBase: string,
  request: MissionRuntimeRequest,
  options?: {
    env?: Record<string, string | undefined>;
  }
): RunningHoloProcess {
  ensureEvidenceDirs();
  const env = makeProcessEnv(options?.env);
  const command = [BUN_BIN, MISSION_RUNTIME_CHILD, 'run', JSON.stringify(request)];
  const child = spawn(BUN_BIN, [MISSION_RUNTIME_CHILD, 'run', JSON.stringify(request)], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let settled = false;

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const result = new Promise<SpawnedHoloResult>((resolveResult, reject) => {
    child.once('error', reject);
    child.once('exit', (status, signal) => {
      settled = true;
      writeFileSync(resolve(RAW_LOGS_DIR, `${artifactBase}.stdout.log`), stdout, 'utf8');
      writeFileSync(resolve(RAW_LOGS_DIR, `${artifactBase}.stderr.log`), stderr, 'utf8');
      const parsed = safeJsonParse(stdout);
      writeArtifact(`${artifactBase}.json`, {
        artifactBase,
        command,
        pid: child.pid,
        status,
        signal,
        stdout,
        stderr,
        parsed,
        databaseUrl: DATABASE_URL,
      });
      resolveResult({
        status,
        stdout,
        stderr,
        combined: `${stdout}\n${stderr}`,
        parsed,
        command,
        artifactBase,
        signal,
        wasKilled: signal != null,
      });
    });
  });

  return {
    pid: child.pid,
    command,
    artifactBase,
    kill: (signal: NodeJS.Signals = 'SIGKILL') => child.kill(signal),
    snapshot: () => ({
      stdout,
      stderr,
      combined: `${stdout}\n${stderr}`,
      parsed: safeJsonParse(stdout),
    }),
    exited: () => settled,
    result,
  };
}

export async function spawnHoloProcess(
  artifactBase: string,
  args: string[],
  options?: {
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
    killAfterMs?: number;
    signal?: NodeJS.Signals;
  }
): Promise<SpawnedHoloResult> {
  const running = startHoloProcess(artifactBase, args, options);
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const signalToSend = options?.signal ?? 'SIGKILL';

  let timeout: NodeJS.Timeout | undefined;
  let killTimer: NodeJS.Timeout | undefined;
  try {
    timeout = setTimeout(() => {
      running.kill('SIGKILL');
    }, timeoutMs);
    if (options?.killAfterMs != null) {
      killTimer = setTimeout(() => {
        running.kill(signalToSend);
      }, options.killAfterMs);
    }
    return await running.result;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (killTimer) clearTimeout(killTimer);
  }
}

export async function ensureRedTestEnvironment(): Promise<void> {
  ensureEvidenceDirs();
  if (!PLATFORM_IT) {
    throw new Error(
      'PLATFORM_IT=1 required for Sprint 15 RED integration suite — refusing skip-to-green'
    );
  }
  process.env.DATABASE_URL = DATABASE_URL;
  process.env.HOLO_KEY_RN = RN;
  process.env.HOLO_KEY_MCP = MCP;
  process.env.HOLO_KEY_CONTROL = CONTROL;

  const provision = await provisionNonprodNamespace({ ownerUrl: OWNER_URL });
  writeArtifact('suite-provision-nonprod.json', provision);
  if (!provision.ok) {
    throw new Error(`failed to provision holocron_nonprod: ${provision.errors.join('; ')}`);
  }

  const sql = createSql(DATABASE_URL);
  try {
    const db = await sql<{ db: string }[]>`SELECT current_database() AS db`;
    writeArtifact('suite-db-context.json', {
      databaseUrl: DATABASE_URL,
      currentDatabase: db[0]?.db ?? null,
      suiteRunId: SUITE_RUN_ID,
      fixturesDir: existsSync(FIXTURES_DIR) ? FIXTURES_DIR : null,
    });
    if (db[0]?.db !== 'holocron_nonprod') {
      throw new Error(
        `Sprint 15 RED suite must target holocron_nonprod (got ${db[0]?.db ?? '(unknown)'})`
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  writeRedHandoffManifest();
  writeArtifact('mission-crash-hook-inventory.json', scanMissionCrashHooks());
}

export async function withSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = createSql(DATABASE_URL);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type MissionSchemaSnapshot = {
  database: string;
  tables: Record<string, { exists: boolean; columns: string[] }>;
};

export async function snapshotMissionSchema(sql: Sql): Promise<MissionSchemaSnapshot> {
  const dbRows = await sql<{ db: string }[]>`SELECT current_database() AS db`;
  const tables: Record<string, { exists: boolean; columns: string[] }> = {};

  for (const table of EXPECTED_MISSION_TABLES) {
    const exists = await tableExists(sql, table);
    tables[table] = {
      exists,
      columns: exists ? await getTableColumns(sql, table) : [],
    };
  }

  return {
    database: dbRows[0]?.db ?? '(unknown)',
    tables,
  };
}

export async function tableExists(sql: Sql, table: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

export async function getTableColumns(sql: Sql, table: string): Promise<string[]> {
  if (!(await tableExists(sql, table))) return [];
  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
  return rows.map((row) => row.column_name);
}

export async function countRowsIfExists(sql: Sql, table: string): Promise<number | null> {
  const safeTable = sanitizeIdentifier(table);
  if (!(await tableExists(sql, safeTable))) return null;
  const rows = await sql.unsafe(`SELECT count(*)::text AS count FROM "${safeTable}"`);
  return Number((rows as Array<{ count?: string }>)[0]?.count ?? 0);
}

export async function missionRunCount(sql: Sql): Promise<number | null> {
  return countRowsIfExists(sql, 'mission_runs');
}

export async function truncateMissionTables(): Promise<string[]> {
  return withSql(async (sql) => {
    const existing: string[] = [];
    for (const table of EXPECTED_MISSION_TABLES) {
      if (await tableExists(sql, table)) existing.push(table);
    }
    if (existing.length > 0) {
      const list = existing.map((table) => `"${sanitizeIdentifier(table)}"`).join(', ');
      await sql.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
    writeArtifact('suite-truncated-mission-tables.json', { existing, suiteRunId: SUITE_RUN_ID });
    return existing;
  });
}

export function missingColumns(actual: string[], expected: readonly string[]): string[] {
  const present = new Set(actual);
  return expected.filter((column) => !present.has(column));
}

function preferredOrder(columns: string[], candidates: readonly string[], fallback = '1'): string {
  for (const column of candidates) {
    if (columns.includes(column)) return `"${sanitizeIdentifier(column)}"`;
  }
  return fallback;
}

export async function selectJsonRowsIfExists(
  sql: Sql,
  table: string,
  whereSql = 'TRUE',
  params: unknown[] = [],
  orderBy?: string
): Promise<JsonRecord[]> {
  const safeTable = sanitizeIdentifier(table);
  if (!(await tableExists(sql, safeTable))) return [];
  const columns = await getTableColumns(sql, safeTable);
  const defaultOrder = preferredOrder(columns, [
    'stage_index',
    'attempt',
    'event_index',
    'sequence',
    'created_at',
    'id',
  ]);
  const rows = (await sql.unsafe(
    `SELECT to_jsonb(t) AS row FROM "${safeTable}" t WHERE ${whereSql} ORDER BY ${orderBy ?? defaultOrder}`,
    params as never[]
  )) as Array<{ row: JsonRecord | null }>;
  return rows.map((row) => asRecord(row.row));
}

export async function selectMissionTemplatesByKey(
  sql: Sql,
  templateKey: string
): Promise<JsonRecord[]> {
  return selectJsonRowsIfExists(sql, 'mission_templates', 'template_key = $1', [templateKey], '1');
}

export async function selectMissionTemplateVersions(
  sql: Sql,
  templateKey: string,
  version?: string
): Promise<JsonRecord[]> {
  if (version) {
    return selectJsonRowsIfExists(
      sql,
      'mission_template_versions',
      'template_key = $1 AND version = $2',
      [templateKey, version],
      '1'
    );
  }
  return selectJsonRowsIfExists(
    sql,
    'mission_template_versions',
    'template_key = $1',
    [templateKey],
    '1'
  );
}

export async function selectMissionRunsByTemplateKey(
  sql: Sql,
  templateKey: string
): Promise<JsonRecord[]> {
  return selectJsonRowsIfExists(sql, 'mission_runs', 'template_key = $1', [templateKey], '1');
}

export async function selectMissionRunsByIdempotencyKey(
  sql: Sql,
  idempotencyKey: string
): Promise<JsonRecord[]> {
  return selectJsonRowsIfExists(sql, 'mission_runs', 'idempotency_key = $1', [idempotencyKey], '1');
}

export async function selectMissionRunById(sql: Sql, runId: string): Promise<JsonRecord | null> {
  const rows = await selectJsonRowsIfExists(sql, 'mission_runs', 'id = $1', [runId], '1');
  return rows[0] ?? null;
}

export async function selectMissionStageRuns(sql: Sql, runId: string): Promise<JsonRecord[]> {
  const columns = await getTableColumns(sql, 'mission_stage_runs');
  const orderBy = preferredOrder(columns, ['stage_index', 'attempt', 'created_at', 'id']);
  return selectJsonRowsIfExists(sql, 'mission_stage_runs', 'run_id = $1', [runId], orderBy);
}

export async function selectMissionCommits(sql: Sql, runId: string): Promise<JsonRecord[]> {
  const columns = await getTableColumns(sql, 'mission_commits');
  const orderBy = preferredOrder(columns, ['created_at', 'id']);
  return selectJsonRowsIfExists(sql, 'mission_commits', 'run_id = $1', [runId], orderBy);
}

export async function selectMissionEvents(sql: Sql, runId: string): Promise<JsonRecord[]> {
  const columns = await getTableColumns(sql, 'mission_events');
  const orderBy = preferredOrder(columns, ['event_index', 'sequence', 'created_at', 'id']);
  return selectJsonRowsIfExists(sql, 'mission_events', 'run_id = $1', [runId], orderBy);
}

export async function selectMissionSteering(sql: Sql, runId: string): Promise<JsonRecord[]> {
  return selectJsonRowsIfExists(sql, 'mission_steering', 'run_id = $1', [runId], '1');
}

export async function selectMissionVerdicts(sql: Sql, runId: string): Promise<JsonRecord[]> {
  return selectJsonRowsIfExists(sql, 'mission_verdicts', 'run_id = $1', [runId], '1');
}

export async function selectInferenceTelemetry(sql: Sql, runId: string): Promise<JsonRecord[]> {
  return selectJsonRowsIfExists(sql, 'inference_telemetry', 'run_id = $1', [runId], '1');
}

export async function terminalEventCount(sql: Sql, runId: string | null): Promise<number | null> {
  if (!runId) return null;
  const rows = await selectJsonRowsIfExists(
    sql,
    'mission_events',
    "run_id = $1 AND event_type IN ('completed', 'failed', 'budget_exceeded', 'blocked')",
    [runId],
    '1'
  );
  return rows.length;
}

export async function committedStageDuplicates(
  sql: Sql,
  runId: string | null
): Promise<number | null> {
  if (!runId) return null;
  const table = 'mission_stage_runs';
  if (!(await tableExists(sql, table))) return null;
  const required = ['run_id', 'stage_index', 'status'];
  if (missingColumns(await getTableColumns(sql, table), required).length > 0) return null;
  const rows = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM (
      SELECT stage_index
      FROM mission_stage_runs
      WHERE run_id = ${runId} AND status = 'committed'
      GROUP BY stage_index
      HAVING count(*) > 1
    ) dupes
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function waitForValue<T>(
  label: string,
  load: () => Promise<T>,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    accept?: (value: T) => boolean;
    abortIf?: () => boolean;
  }
): Promise<T | null> {
  const timeoutMs = options?.timeoutMs ?? 8_000;
  const intervalMs = options?.intervalMs ?? 100;
  const accept = options?.accept ?? ((value: T) => Boolean(value));
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | null = null;

  while (Date.now() <= deadline) {
    if (options?.abortIf?.()) {
      return lastValue;
    }
    const value = await load();
    lastValue = value;
    if (accept(value)) {
      return value;
    }
    await sleep(intervalMs);
  }

  writeArtifact(`wait-timeout-${slugify(label)}.json`, {
    label,
    timeoutMs,
    intervalMs,
    lastValue,
  });
  return lastValue;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function readJsonFile(path: string): JsonRecord {
  return asRecord(JSON.parse(readFileSync(path, 'utf8')));
}

export type PreparedTemplateFixture = {
  path: string;
  templateKey: string;
  version: string;
  body: JsonRecord;
  sourceFixture: string;
  sha256: string;
};

export function prepareTemplateFixture(
  sourceFixture: string,
  scenarioLabel: string,
  options?: {
    templateKey?: string;
    version?: string;
    mutate?: (body: JsonRecord) => void;
  }
): PreparedTemplateFixture {
  ensureEvidenceDirs();
  const sourcePath = fixturePath(sourceFixture);
  const body = structuredClone(readJsonFile(sourcePath));
  const fallbackTemplateKey = `${String(body.templateKey ?? 'test.template')}.${slugify(scenarioLabel)}.${SUITE_RUN_ID}`;
  body.templateKey = options?.templateKey ?? fallbackTemplateKey;
  if (options?.version) body.version = options.version;
  options?.mutate?.(body);
  const path = resolve(GENERATED_DIR, `${slugify(scenarioLabel)}.template.json`);
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  const fixture = {
    path,
    templateKey: String(body.templateKey ?? ''),
    version: String(body.version ?? ''),
    body,
    sourceFixture,
    sha256: sha256Json(body),
  };
  writeArtifact(`${slugify(scenarioLabel)}.template-artifact.json`, fixture);
  return fixture;
}

export type PreparedManifestFixture = {
  path: string;
  body: JsonRecord;
  sha256: string;
  sourceFixture: string;
};

export function prepareManifestFixture(
  sourceFixture: string,
  scenarioLabel: string,
  mutate?: (body: JsonRecord) => void
): PreparedManifestFixture {
  ensureEvidenceDirs();
  const sourcePath = fixturePath(sourceFixture);
  const body = structuredClone(readJsonFile(sourcePath));
  mutate?.(body);
  const path = resolve(GENERATED_DIR, `${slugify(scenarioLabel)}.manifest.json`);
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  const manifest = {
    path,
    body,
    sha256: sha256Json(body),
    sourceFixture,
  };
  writeArtifact(`${slugify(scenarioLabel)}.manifest-artifact.json`, manifest);
  return manifest;
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, acc);
      continue;
    }
    if (entry.isFile()) acc.push(fullPath);
  }
  return acc;
}

export function scanMissionCrashHooks(): {
  hookFiles: string[];
  boundaryFiles: Record<string, string[]>;
  hasHookEnv: boolean;
  hasAllNamedBoundaries: boolean;
} {
  const files = walkFiles(PLATFORM_SRC_DIR).filter((file) => /\.(ts|tsx|js|mjs|sql)$/.test(file));
  const boundaryFiles: Record<string, string[]> = {
    before_commit_insert: [],
    after_commit_insert_before_run_update: [],
    after_run_update_before_terminal_event: [],
  };
  const hookFiles: string[] = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (text.includes('HOLO_TEST_CRASH_AT')) {
      hookFiles.push(file.replace(`${REPO_ROOT}/`, ''));
    }
    for (const boundary of Object.keys(boundaryFiles)) {
      if (text.includes(boundary)) {
        boundaryFiles[boundary]?.push(file.replace(`${REPO_ROOT}/`, ''));
      }
    }
  }

  return {
    hookFiles,
    boundaryFiles,
    hasHookEnv: hookFiles.length > 0,
    hasAllNamedBoundaries: Object.values(boundaryFiles).every((hits) => hits.length > 0),
  };
}

const RED_HANDOFF_SCENARIOS = [
  {
    scenario: 'template-register-provenance',
    requirements: [
      'mission-1/AC-1',
      'mission-1/AC-3',
      'mission-1/TC-1',
      'mission-1/TC-2',
      'mission-1/TC-3',
    ],
    futureGreenAssertions: [
      'template:register persists one immutable template/version row for the scoped template_key/version',
      'persisted version row pins definition_hash/compiler_version/registry_snapshot_hash/output schema provenance',
      'mission tables/indexed schema come from migrations, not runtime DDL',
    ],
  },
  {
    scenario: 'template-duplicate-idempotent-and-conflict',
    requirements: ['mission-1/AC-1', 'mission-1/TC-2'],
    futureGreenAssertions: [
      'duplicate same template_key+version is idempotent and does not create an extra version row',
      'same template_key+version with differing content fails closed and the surviving row keeps the first successful definition_hash/compiler/registry/provenance/definition bytes',
    ],
  },
  {
    scenario: 'compiler-negative-unknown-stage',
    requirements: ['mission-1/AC-2', 'mission-1/TC-1', 'mission-1/TC-2'],
    futureGreenAssertions: [
      'unknown stage kind fails before any scoped template/version/run row is created',
    ],
  },
  {
    scenario: 'compiler-negative-unknown-schema',
    requirements: ['mission-1/AC-2', 'mission-1/TC-2'],
    futureGreenAssertions: [
      'unknown schema ref/version fails before any scoped template/version/run row is created',
    ],
  },
  {
    scenario: 'compiler-negative-executable-payload',
    requirements: ['mission-1/AC-2', 'mission-1/TC-2', 'mission-1/TC-3'],
    futureGreenAssertions: [
      'inline executable/Zod/raw-SQL payloads fail closed with zero scoped writes',
    ],
  },
  {
    scenario: 'fleet-negative-missing-role',
    requirements: ['mission-1/AC-2', 'mission-4/AC-3', 'mission-5/AC-2', 'mission-5/TC-2'],
    futureGreenAssertions: [
      'missing role manifest fails before any scoped template/version/run row',
    ],
  },
  {
    scenario: 'fleet-negative-dead-endpoint',
    requirements: ['mission-1/AC-2', 'mission-4/AC-3', 'mission-5/AC-2', 'mission-5/TC-2'],
    futureGreenAssertions: ['dead fleet endpoint fails closed before any scoped writes'],
  },
  {
    scenario: 'fleet-negative-cloud-fallback-refused',
    requirements: ['mission-1/AC-2', 'mission-4/AC-3', 'mission-5/AC-2', 'mission-5/TC-2'],
    futureGreenAssertions: ['cloud fallback is rejected and no scoped mission row is created'],
  },
  {
    scenario: 'sigkill-checkpoint-resume',
    requirements: ['mission-2/AC-1', 'mission-2/AC-3', 'mission-2/TC-2'],
    futureGreenAssertions: [
      'child is SIGKILLed only after a DB-observed committed checkpoint exists',
      'resume starts from the first uncommitted stage and produces no duplicate committed stage rows',
    ],
  },
  {
    scenario: 'lease-contention-expired-recovery',
    requirements: ['mission-2/AC-2', 'mission-2/TC-3'],
    futureGreenAssertions: [
      'two real processes contend for one run and only one lease token can advance/commit',
      'expired lease recovery increments attempt_count and terminal completion clears lease owner/token/expiry',
    ],
  },
  {
    scenario: 'pinned-resume-provenance',
    requirements: ['mission-2/AC-3', 'mission-2/TC-4', 'mission-3/AC-4'],
    futureGreenAssertions: [
      'resume uses stored template hash/compiler/registry/executor/schema/fleet/model provenance rather than latest active definitions',
    ],
  },
  {
    scenario: 'commit-crash-boundaries',
    requirements: ['mission-3/AC-1', 'mission-3/TC-2'],
    futureGreenAssertions: [
      'each named HOLO_TEST_CRASH_AT boundary is source-backed, emits a boundary-identifying marker, is SIGKILLed only after proof of that boundary, leaves zero scoped partial commit/event rows, and replay succeeds exactly once',
    ],
  },
  {
    scenario: 'replay-exactly-once-and-conflict',
    requirements: ['mission-3/AC-2', 'mission-3/AC-4', 'mission-3/TC-3'],
    futureGreenAssertions: [
      'same template_key+idempotency_key converges on one run and one commit with replay=true',
      'no duplicate stage rows/events/telemetry are persisted and conflicting inputs fail closed',
    ],
  },
  {
    scenario: 'budget-exceeded-terminal-evidence',
    requirements: ['mission-3/AC-3', 'mission-3/AC-4', 'mission-3/TC-4'],
    futureGreenAssertions: [
      'budget_exceeded persists run-scoped usage, a terminal commit, a terminal event, and stable provenance',
    ],
  },
  {
    scenario: 'cli-contracts',
    requirements: ['mission-4/AC-1', 'mission-4/TC-1', 'mission-4/TC-2'],
    futureGreenAssertions: [
      'template:register/run/status/resume JSON contracts expose persisted runId/status/provenance/output/replay values',
    ],
  },
  {
    scenario: 'deterministic-fresh-output',
    requirements: ['mission-4/AC-3', 'mission-4/TC-4'],
    futureGreenAssertions: [
      'two fresh non-replay runs produce identical typed output and provenance after stripping IDs/timestamps',
    ],
  },
  {
    scenario: 'http-create-status-auth',
    requirements: ['mission-4/AC-2', 'mission-4/TC-3', 'mission-5/AC-2', 'mission-5/TC-2'],
    futureGreenAssertions: [
      '401/403 create/status calls produce zero scoped writes, unauthorized/wrong-scope status reads leave run row/events/output byte-identical, and a valid RN request persists one real run',
    ],
  },
  {
    scenario: 'http-steer-verdict-auth-ordering',
    requirements: ['mission-4/AC-2', 'mission-4/TC-3', 'mission-5/AC-2', 'mission-5/TC-4'],
    futureGreenAssertions: [
      'steer/verdict use a real created run, 401/403 produce zero scoped writes, and run-scoped mission_events preserve steer-before-verdict ordering',
    ],
  },
] as const;

export function writeRedHandoffManifest(): string {
  return writeArtifact('s15-red-handoff-manifest.json', {
    suiteRunId: SUITE_RUN_ID,
    worktree: REPO_ROOT,
    scenarios: RED_HANDOFF_SCENARIOS,
  });
}

export async function callAppJson(
  app: { request: (input: string, init?: RequestInit) => Response | Promise<Response> },
  artifactBase: string,
  method: string,
  path: string,
  options?: {
    key?: string;
    body?: unknown;
  }
): Promise<{ status: number; text: string; json: unknown }> {
  ensureEvidenceDirs();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (options?.key) headers.Authorization = `Bearer ${options.key}`;

  const res = await app.request(path, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(options?.body ?? {}),
  });
  const text = await res.text();
  const json = safeJsonParse(text);
  writeArtifact(`${artifactBase}.json`, {
    method,
    path,
    status: res.status,
    requestBody: options?.body ?? null,
    responseText: text,
    responseJson: json,
  });
  writeFileSync(resolve(RAW_LOGS_DIR, `${artifactBase}.response.log`), text, 'utf8');
  return { status: res.status, text, json };
}

export function makeCreateBody(templateKey: string, goal: string, idempotencyKey: string) {
  return {
    templateKey,
    goal,
    idempotencyKey,
    args: {
      goal,
      operator: 'mission-5-red',
    },
  };
}

export function detectProvenanceSnapshot(record: JsonRecord | null | undefined): JsonRecord {
  if (!record) return {};
  const provenance = rowValue(record, ['provenance']);
  if (provenance && typeof provenance === 'object') return asRecord(provenance);

  const snapshot: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      /(dsl_version|dslVersion|definition_hash|definitionHash|compiler_version|compilerVersion|registry_snapshot_hash|registrySnapshotHash|output_schema_ref|outputSchemaRef|output_schema_version|outputSchemaVersion|fleet_manifest_version|fleetManifestVersion|model_revision|modelRevision|model_revisions|modelRevisions|executor_ref|executorRef|schema_ref|schemaRef|template_version|templateVersion)/.test(
        key
      )
    ) {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

export function sameComparableValue(
  left: JsonRecord | null | undefined,
  right: JsonRecord | null | undefined,
  aliases: readonly string[]
): boolean {
  return (
    toComparablePrimitive(rowValue(left, aliases)) ===
    toComparablePrimitive(rowValue(right, aliases))
  );
}
