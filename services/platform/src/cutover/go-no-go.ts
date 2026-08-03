/**
 * D06-02 / CAP-CUT-01 / T-SYNC-008 — pre-cutover go/no-go harness suite.
 *
 * Spawns the eight named gates as real child processes, parses vitest
 * collectedTests from real output (never hardcoded), and emits a durable
 * go-no-go-report.json. overall.ok is the AND of every gate.pass; vitest
 * gates fail closed when collectedTests === 0 even if exit code is 0.
 *
 * Operator:
 *   bun services/platform/src/cli/holo.ts cutover:go-no-go [--json]
 *   bun services/platform/src/cli/holo.ts cutover:go-no-go --json --output .tmp/D06-02/go-no-go-report.json
 */

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import {
  loadSecretsFile,
  resolveRepoRoot,
  resolveSecretsPathFromEnv,
  upsertSecretsFile,
} from '../config/secrets.ts';

export const GO_NO_GO_GATE_NAMES = [
  'lint',
  'typecheck',
  'unit',
  'integration',
  'live',
  'lanes',
  'no-convex-client',
  'no-convex-env',
] as const;

export type GoNoGoGateName = (typeof GO_NO_GO_GATE_NAMES)[number];

export type GateKind = 'plain' | 'vitest';

/** Spec for one named gate — real argv + reportable command string. */
export type GateSpec = {
  name: GoNoGoGateName;
  /** Exact command string persisted in the report (operator-greppable). */
  command: string;
  /** argv[0] is the binary; remainder are args. Never shell-joined. */
  argv: readonly [string, ...string[]];
  kind: GateKind;
};

/**
 * The eight production gates. commands[0] MUST start with `pnpm biome check`
 * (AC-4 / TC-6 contract).
 */
export const DEFAULT_GATE_SPECS: readonly GateSpec[] = [
  {
    name: 'lint',
    command: 'pnpm biome check .',
    argv: ['pnpm', 'biome', 'check', '.'],
    kind: 'plain',
  },
  {
    // Platform project scope — root tsconfig excludes services/platform/**.
    // Dotfile fixtures (AC-2 `.tmp-gate-fixture.ts`) are invisible to `**/*.ts`
    // globs, so the gate shell also typechecks the fixture path when present.
    name: 'typecheck',
    command: 'pnpm tsgo --noEmit -p services/platform/tsconfig.json',
    argv: [
      'sh',
      '-c',
      [
        'status=0',
        'pnpm tsgo --noEmit -p services/platform/tsconfig.json || status=$?',
        'FIXTURE="services/platform/src/cutover/.tmp-gate-fixture.ts"',
        'if [ -f "$FIXTURE" ]; then',
        '  pnpm tsgo --noEmit --ignoreConfig --strict --pretty false "$FIXTURE" || status=1',
        'fi',
        'exit $status',
      ].join('\n'),
    ],
    kind: 'plain',
  },
  {
    name: 'unit',
    command: 'pnpm vitest run --project unit',
    argv: ['pnpm', 'vitest', 'run', '--project', 'unit'],
    kind: 'vitest',
  },
  {
    name: 'integration',
    command: 'pnpm vitest run --project integration --no-file-parallelism --maxWorkers=1',
    argv: [
      'pnpm',
      'vitest',
      'run',
      '--project',
      'integration',
      '--no-file-parallelism',
      '--maxWorkers=1',
    ],
    kind: 'vitest',
  },
  {
    name: 'live',
    command: 'pnpm vitest run --project live',
    argv: ['pnpm', 'vitest', 'run', '--project', 'live'],
    kind: 'vitest',
  },
  {
    name: 'lanes',
    command: 'pnpm test:lanes',
    argv: ['pnpm', 'test:lanes'],
    kind: 'plain',
  },
  {
    name: 'no-convex-client',
    command: 'bun services/platform/src/cli/holo.ts verify:no-convex-client',
    argv: ['bun', 'services/platform/src/cli/holo.ts', 'verify:no-convex-client'],
    kind: 'plain',
  },
  {
    name: 'no-convex-env',
    command: 'bun services/platform/src/cli/holo.ts verify-no-convex-env',
    argv: ['bun', 'services/platform/src/cli/holo.ts', 'verify-no-convex-env'],
    kind: 'plain',
  },
] as const;

export type GateResult = {
  name: GoNoGoGateName;
  command: string;
  exit_code: number;
  duration_ms: number;
  pass: boolean;
  /** Parsed from real vitest output for vitest gates; null for plain gates. */
  collectedTests: number | null;
  stdout_tail: string;
  stderr_tail: string;
};

export type GoNoGoReport = {
  /** Top-level alias of overall.ok (holo verify:* convention). */
  ok: boolean;
  overall: { ok: boolean };
  git_sha: string;
  generated_at: string;
  gates: GateResult[];
  report_path: string;
  /** Number of gates that failed (pass=false). */
  failed_count: number;
};

const TAIL_CHARS = 8_000;
const MAX_BUFFER = 64 * 1024 * 1024;

/** Keep head + tail so early and late compiler diagnostics both survive. */
function summarizeOutput(s: string, n = TAIL_CHARS): string {
  if (!s) return '';
  if (s.length <= n) return s;
  const half = Math.floor(n / 2);
  return `${s.slice(0, half)}\n\n...[${s.length - n} chars truncated]...\n\n${s.slice(-half)}`;
}

/**
 * Parse vitest summary `Tests  N passed (M)` / `Tests  N failed | M passed (T)` etc.
 * Returns the total collected count in parentheses, or 0 when the suite is empty /
 * unparseable (fail-closed for go/no-go).
 */
export function parseVitestCollectedTests(output: string): number {
  if (!output) return 0;

  // Primary: parenthesized total on a Tests summary line.
  // Examples:
  //   "      Tests  4 passed (4)"
  //   "      Tests  3 passed | 1 failed (4)"
  //   "      Tests  1 skipped (1)"
  const paren =
    /Tests\s+[^\n(]*\((\d+)\)/i.exec(output) ?? /Test Files\s+[^\n(]*\((\d+)\)/i.exec(output);
  if (paren) {
    const n = Number(paren[1]);
    return Number.isFinite(n) ? n : 0;
  }

  // "no tests" / empty suite
  if (/\bTests\s+no tests\b/i.test(output) || /\bno tests found\b/i.test(output)) {
    return 0;
  }

  // Fallback: sum discrete counters if present without parentheses.
  let total = 0;
  let found = false;
  for (const m of output.matchAll(/(\d+)\s+(passed|failed|skipped|todo|expected)\b/gi)) {
    // Only count lines that look like vitest summary (contain "Tests" nearby).
    found = true;
    total += Number(m[1]);
  }
  // Without a Tests context, refuse 0 (fail closed) — do not invent counts.
  if (found && /\bTests\b/i.test(output)) return total;
  return 0;
}

/** Resolve real git HEAD SHA via a real subprocess (never hardcoded). */
export function resolveGitSha(repoRoot: string): string {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (r.error || r.status !== 0) {
    return '';
  }
  return (r.stdout ?? '').trim();
}

export function defaultGoNoGoReportPath(cwd = process.cwd()): string {
  return resolve(cwd, 'go-no-go-report.json');
}

function runOneGate(spec: GateSpec, options: { cwd: string; env: NodeJS.ProcessEnv }): GateResult {
  const started = Date.now();
  const [bin, ...args] = spec.argv;
  const result = spawnSync(bin, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    // Fail-closed integration/live suites require their explicit real-service
    // switch. Keep it off the unit lane so live-only unit fixtures do not run
    // under the wrong project merely because go/no-go is the parent process.
    env:
      spec.name === 'integration' || spec.name === 'live'
        ? { ...options.env, PLATFORM_IT: '1' }
        : options.env,
    maxBuffer: MAX_BUFFER,
    // No timeout: full harness suites can run for many minutes.
  });
  const duration_ms = Math.max(1, Date.now() - started);
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const exit_code =
    result.error != null ? 127 : typeof result.status === 'number' ? result.status : 1;

  let collectedTests: number | null = null;
  let pass = exit_code === 0;

  if (spec.kind === 'vitest') {
    collectedTests = parseVitestCollectedTests(`${stdout}\n${stderr}`);
    // Fail closed: empty/degenerate suite is not green.
    pass = exit_code === 0 && collectedTests > 0;
  }

  return {
    name: spec.name,
    command: spec.command,
    exit_code,
    duration_ms,
    pass,
    collectedTests,
    stdout_tail: summarizeOutput(stdout),
    stderr_tail: summarizeOutput(stderr),
  };
}

const ISOLATED_DATABASE_URL_ENV = 'HOLO_GO_NO_GO_DATABASE_URL';
const ISOLATED_CONVEX_DEPLOYMENT_ENV = 'HOLO_GO_NO_GO_CONVEX_DEPLOYMENT';
const ISOLATED_CONVEX_URL_ENV = 'HOLO_GO_NO_GO_CONVEX_URL';
const ISOLATED_CONVEX_SITE_URL_ENV = 'HOLO_GO_NO_GO_CONVEX_SITE_URL';
const ISOLATED_FLEET_URL_ENV = 'HOLO_GO_NO_GO_FLEET_URL';
const ISOLATED_R2_PREFIX_ENV = 'HOLO_GO_NO_GO_R2_PGBACKREST_PREFIX';
const ISOLATED_PG1_PATH_ENV = 'HOLO_GO_NO_GO_PGBACKREST_PG1_PATH';

function requiredIsolationValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the isolated integration/live go/no-go lanes`);
  }
  return value;
}

function assertLoopbackUrl(raw: string, name: string): URL {
  const parsed = new URL(raw);
  if (!isLoopbackHostname(parsed.hostname)) {
    throw new Error(`${name} must target a loopback-only integration service`);
  }
  return parsed;
}

function loopbackOrigin(raw: string, name: string): string {
  const parsed = assertLoopbackUrl(raw, name);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be a loopback service origin without a path, query, or hash`);
  }
  return parsed.origin;
}

function canonicalHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLocaleLowerCase();
}

function isLoopbackHostname(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(canonicalHostname(hostname));
}

function databaseEndpoint(url: URL): string {
  const hostname = isLoopbackHostname(url.hostname) ? 'loopback' : canonicalHostname(url.hostname);
  return `${hostname}:${url.port || '5432'}`;
}

const ISOLATED_SOURCE_SECRET_KEYS = [
  'PGBACKREST_STANZA',
  'R2_ACCESS_KEY_ID',
  'R2_ACCOUNT_ID',
  'R2_BUCKET_NAME',
  'R2_CREDENTIAL_POLICY',
  'R2_ENDPOINT',
  'R2_REPO_CIPHER_PASS',
  'R2_RESTORE_ACCESS_KEY_ID',
  'R2_RESTORE_SECRET_ACCESS_KEY',
  'R2_RESTORE_SESSION_TOKEN',
  'R2_SECRET_ACCESS_KEY',
  'R2_SESSION_TOKEN',
  'RESTIC_PASSWORD',
] as const;

type IsolatedIntegrationEnv = {
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
};

type R2CredentialTuple = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
};

type PsqlResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function optionalR2CredentialTuple(
  env: NodeJS.ProcessEnv,
  names: readonly [string, string, string],
  label: string
): R2CredentialTuple | null {
  const [accessKeyId = '', secretAccessKey = '', sessionToken = ''] = names.map(
    (name) => env[name]?.trim() ?? ''
  );
  const values = [accessKeyId, secretAccessKey, sessionToken];
  if (values.every((value) => value.length === 0)) return null;
  if (values.some((value) => value.length === 0)) {
    throw new Error(`${label} must be a complete access key, secret key, and session token tuple`);
  }
  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
  };
}

function isolatedPsqlEnv(database: URL, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    LANG: baseEnv.LANG ?? 'C',
    LC_ALL: baseEnv.LC_ALL ?? 'C',
    PATH: baseEnv.PATH,
    PGDATABASE: database.pathname.replace(/^\//, ''),
    PGHOST: canonicalHostname(database.hostname),
    PGPORT: database.port || '5432',
    PGUSER: decodeURIComponent(database.username),
  };
  if (database.password) env.PGPASSWORD = decodeURIComponent(database.password);
  return env;
}

function runIsolatedPsql(
  database: URL,
  baseEnv: NodeJS.ProcessEnv,
  sql: string,
  scalar = false
): PsqlResult {
  const result = spawnSync(
    'psql',
    ['-X', ...(scalar ? ['-At'] : []), '-v', 'ON_ERROR_STOP=1', '-c', sql],
    {
      encoding: 'utf8',
      env: isolatedPsqlEnv(database, baseEnv),
      timeout: 30_000,
    }
  );
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function readableArchiveCommand(database: URL, baseEnv: NodeJS.ProcessEnv): string | null {
  const result = runIsolatedPsql(database, baseEnv, 'SHOW archive_command', true);
  return result.status === 0 ? result.stdout.trim() : null;
}

function reusableArchiveCommand(command: string | null): string | null {
  if (!command || command.includes('holocron-go-no-go-')) return null;
  return command;
}

/**
 * PostgreSQL owns archive_command independently from the child process that
 * created the referenced config. Detach the command before deleting that
 * credential-bearing temporary config, otherwise the archiver loops forever
 * against a dangling path and contaminates the next isolated gate run.
 */
function cleanupIsolatedArchiveCommand(options: {
  database: URL;
  baseEnv: NodeJS.ProcessEnv;
  pgbackrestConfig: string;
  previousArchiveCommand: string | null;
}): void {
  if (!existsSync(options.pgbackrestConfig)) return;

  const current = runIsolatedPsql(options.database, options.baseEnv, 'SHOW archive_command', true);
  if (current.status !== 0) {
    throw new Error('cannot inspect isolated PostgreSQL archive_command during gate cleanup');
  }
  if (!current.stdout.trim().includes(options.pgbackrestConfig)) return;

  const previous = reusableArchiveCommand(options.previousArchiveCommand);
  const mutationSql = previous
    ? `ALTER SYSTEM SET archive_command = '${previous.replace(/'/g, "''")}'`
    : 'ALTER SYSTEM RESET archive_command';
  const mutation = runIsolatedPsql(options.database, options.baseEnv, mutationSql);
  if (mutation.status !== 0) {
    throw new Error('cannot restore isolated PostgreSQL archive_command during gate cleanup');
  }
  const reload = runIsolatedPsql(options.database, options.baseEnv, 'SELECT pg_reload_conf()');
  if (reload.status !== 0) {
    throw new Error('cannot reload isolated PostgreSQL archive_command during gate cleanup');
  }
  const verified = runIsolatedPsql(options.database, options.baseEnv, 'SHOW archive_command', true);
  if (verified.status !== 0 || verified.stdout.trim().includes(options.pgbackrestConfig)) {
    throw new Error('isolated PostgreSQL still references temporary pgBackRest config');
  }
}

/**
 * Build the integration lane's documented real-service environment without
 * exposing or mutating the operator's durable cutover control-plane file.
 */
function createIsolatedIntegrationEnv(
  repoRoot: string,
  baseEnv: NodeJS.ProcessEnv
): IsolatedIntegrationEnv {
  const sourcePath = resolveSecretsPathFromEnv(baseEnv, repoRoot);
  const sourceSecrets = loadSecretsFile(sourcePath);
  const databaseUrl = requiredIsolationValue(baseEnv, ISOLATED_DATABASE_URL_ENV);
  const database = assertLoopbackUrl(databaseUrl, ISOLATED_DATABASE_URL_ENV);
  if (database.protocol !== 'postgres:' && database.protocol !== 'postgresql:') {
    throw new Error(`${ISOLATED_DATABASE_URL_ENV} must use postgres:// or postgresql://`);
  }
  if (database.pathname.replace(/^\//, '') !== 'holocron_nonprod') {
    throw new Error(`${ISOLATED_DATABASE_URL_ENV} must target the holocron_nonprod database`);
  }
  if (!database.port || database.port === '5432') {
    throw new Error(`${ISOLATED_DATABASE_URL_ENV} must use an explicit non-default Postgres port`);
  }
  const operatorDatabaseRaw = baseEnv.DATABASE_URL ?? sourceSecrets.DATABASE_URL;
  if (operatorDatabaseRaw) {
    const operatorDatabase = new URL(operatorDatabaseRaw);
    if (databaseEndpoint(database) === databaseEndpoint(operatorDatabase)) {
      throw new Error(
        `${ISOLATED_DATABASE_URL_ENV} must not reuse the operator database server endpoint`
      );
    }
  }

  const convexDeployment = requiredIsolationValue(baseEnv, ISOLATED_CONVEX_DEPLOYMENT_ENV);
  if (!convexDeployment.startsWith('local:')) {
    throw new Error(`${ISOLATED_CONVEX_DEPLOYMENT_ENV} must name a local Convex deployment`);
  }
  const convexUrl = loopbackOrigin(
    requiredIsolationValue(baseEnv, ISOLATED_CONVEX_URL_ENV),
    ISOLATED_CONVEX_URL_ENV
  );
  const convexSiteUrl = loopbackOrigin(
    requiredIsolationValue(baseEnv, ISOLATED_CONVEX_SITE_URL_ENV),
    ISOLATED_CONVEX_SITE_URL_ENV
  );
  const fleetUrl = assertLoopbackUrl(
    requiredIsolationValue(baseEnv, ISOLATED_FLEET_URL_ENV),
    ISOLATED_FLEET_URL_ENV
  ).toString();

  const r2Prefix = requiredIsolationValue(baseEnv, ISOLATED_R2_PREFIX_ENV).replace(
    /^\/+|\/+$/g,
    ''
  );
  if (!r2Prefix.startsWith('integration/')) {
    throw new Error(`${ISOLATED_R2_PREFIX_ENV} must start with integration/`);
  }
  const operatorR2Prefix = (
    baseEnv.R2_PGBACKREST_PREFIX ?? sourceSecrets.R2_PGBACKREST_PREFIX
  )?.replace(/^\/+|\/+$/g, '');
  if (operatorR2Prefix && r2Prefix === operatorR2Prefix) {
    throw new Error(`${ISOLATED_R2_PREFIX_ENV} must differ from the operator backup prefix`);
  }

  const requestedPg1Path = resolve(requiredIsolationValue(baseEnv, ISOLATED_PG1_PATH_ENV));
  if (!existsSync(requestedPg1Path)) {
    throw new Error(`${ISOLATED_PG1_PATH_ENV} does not exist`);
  }
  // Keep the operator-supplied spelling for pgBackRest: on macOS PostgreSQL
  // can report /tmp while realpath resolves it to /private/tmp, and pgBackRest
  // correctly rejects that textual cluster-path mismatch. Use the canonical
  // path only for the security boundary comparison below.
  const pg1Path = requestedPg1Path;
  const canonicalPg1Path = realpathSync(requestedPg1Path);
  const operatorPg1Path =
    baseEnv.PGBACKREST_PG1_PATH ?? baseEnv.PGDATA ?? sourceSecrets.PGBACKREST_PG1_PATH;
  if (operatorPg1Path) {
    const resolvedOperatorPath = resolve(operatorPg1Path);
    const canonicalOperatorPath = existsSync(resolvedOperatorPath)
      ? realpathSync(resolvedOperatorPath)
      : resolvedOperatorPath;
    if (canonicalPg1Path === canonicalOperatorPath) {
      throw new Error(`${ISOLATED_PG1_PATH_ENV} must differ from the operator Postgres data path`);
    }
  }

  const tempRoot = mkdtempSync(resolve(tmpdir(), 'holocron-go-no-go-'));
  const secretsPath = resolve(tempRoot, 'secrets.yaml');
  const pgbackrestConfig = resolve(tempRoot, 'pgbackrest.conf');
  const resticConfig = resolve(tempRoot, 'restic-mirror.conf');
  const resticCache = resolve(tempRoot, 'restic-cache');
  const blobRoot = resolve(tempRoot, 'blobs');
  mkdirSync(resticCache, { recursive: true });
  mkdirSync(blobRoot, { recursive: true });
  const resticPrefix = `${r2Prefix}/restic`;
  const r2Endpoint = baseEnv.R2_ENDPOINT ?? sourceSecrets.R2_ENDPOINT;
  const r2BucketName = baseEnv.R2_BUCKET_NAME ?? sourceSecrets.R2_BUCKET_NAME;
  if (!r2Endpoint || !r2BucketName) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw new Error('isolated integration backup config requires R2_ENDPOINT and R2_BUCKET_NAME');
  }
  const resticHost = r2Endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const resticRepository = `s3:https://${resticHost}/${r2BucketName}/${resticPrefix}`;
  const localKeySuffix = randomUUID();
  const localKeys = {
    FLEET_KEY: 'sk-none',
    HOLO_KEY_CONTROL: `control-go-no-go-${localKeySuffix}`,
    HOLO_KEY_MCP: `mcp-go-no-go-${localKeySuffix}`,
    HOLO_KEY_RN: `rn-go-no-go-${localKeySuffix}`,
    MASTRA_API_KEY: `mastra-go-no-go-${localKeySuffix}`,
  };
  const previousArchiveCommand = readableArchiveCommand(database, baseEnv);
  try {
    const isolatedSourceSecrets: Record<string, string> = {};
    for (const key of ISOLATED_SOURCE_SECRET_KEYS) {
      const value = baseEnv[key] ?? sourceSecrets[key];
      if (value) isolatedSourceSecrets[key] = value;
    }
    const integrationWriter = optionalR2CredentialTuple(
      baseEnv,
      [
        'R2_INTEGRATION_ACCESS_KEY_ID',
        'R2_INTEGRATION_SECRET_ACCESS_KEY',
        'R2_INTEGRATION_SESSION_TOKEN',
      ],
      'isolated integration R2 writer'
    );
    const integrationRestore = optionalR2CredentialTuple(
      baseEnv,
      [
        'R2_INTEGRATION_RESTORE_ACCESS_KEY_ID',
        'R2_INTEGRATION_RESTORE_SECRET_ACCESS_KEY',
        'R2_INTEGRATION_RESTORE_SESSION_TOKEN',
      ],
      'isolated integration R2 restore reader'
    );
    if (integrationWriter) {
      isolatedSourceSecrets.R2_ACCESS_KEY_ID = integrationWriter.accessKeyId;
      isolatedSourceSecrets.R2_SECRET_ACCESS_KEY = integrationWriter.secretAccessKey;
      isolatedSourceSecrets.R2_SESSION_TOKEN = integrationWriter.sessionToken;
    }
    if (integrationRestore) {
      isolatedSourceSecrets.R2_RESTORE_ACCESS_KEY_ID = integrationRestore.accessKeyId;
      isolatedSourceSecrets.R2_RESTORE_SECRET_ACCESS_KEY = integrationRestore.secretAccessKey;
      isolatedSourceSecrets.R2_RESTORE_SESSION_TOKEN = integrationRestore.sessionToken;
    }
    upsertSecretsFile(secretsPath, {
      ...isolatedSourceSecrets,
      DATABASE_URL: databaseUrl,
      FLEET_URL: fleetUrl,
      HOLO_BLOB_ROOT: blobRoot,
      HOLO_MIGRATION_READ_ONLY: '0',
      HOLO_CUTOVER_SCHEDULES_DISABLED: '0',
      PLATFORM_URL: 'http://127.0.0.1:4111',
      PGBACKREST_CONFIG: pgbackrestConfig,
      PGBACKREST_PG1_PATH: pg1Path,
      R2_PGBACKREST_PREFIX: r2Prefix,
      R2_BUCKET_NAME: r2BucketName,
      R2_ENDPOINT: r2Endpoint,
      R2_RESTORE_OBJECT_PREFIX: r2Prefix,
      R2_RESTIC_PREFIX: resticPrefix,
      RESTIC_REPOSITORY: resticRepository,
      ...localKeys,
    });

    const isolatedEnv: NodeJS.ProcessEnv = { ...baseEnv };
    // Remove credentials that could retarget the lane at an operator service or
    // expose broad backup administration through the child ambient environment.
    // This remains a real-provider PLATFORM_IT lane, but all backup runtime and
    // temporary prefix-scoped credentials cross the child boundary only through
    // the generated 0600 isolated secrets file.
    for (const key of [
      'BACKUP_R2_ACCESS_KEY_ID',
      'BACKUP_R2_SECRET_ACCESS_API_TOKEN',
      'BACKUP_R2_SECRET_ACCESS_KEY',
      'EXPO_PUBLIC_RN_API_KEY',
      'EXPO_TOKEN',
      'FLEET_KEY',
      'HOLO_KEY_CONTROL',
      'HOLO_KEY_MCP',
      'HOLO_KEY_RN',
      'MASTRA_API_KEY',
      'MINT_R2_PREFIX_RESTORE',
      'AWS_ACCESS_KEY_ID',
      'AWS_CONFIG_FILE',
      'AWS_DEFAULT_PROFILE',
      'AWS_PROFILE',
      'AWS_ROLE_ARN',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SHARED_CREDENTIALS_FILE',
      'AWS_SESSION_TOKEN',
      'AWS_WEB_IDENTITY_TOKEN_FILE',
      'CLOUDFLARE_API_TOKEN',
      'CONVEX_DEPLOY_KEY',
      'CONVEX_SELF_HOSTED_ADMIN_KEY',
      'CONVEX_SELF_HOSTED_URL',
      'DEPLOY_TARGET',
      'EXPO_PUBLIC_PLATFORM_URL',
      'HOLO_DANGEROUS_ALLOW_PROD_DB',
      'HOLO_DEPLOY_TARGET',
      'HOLO_PRODUCTION_BASE_URL',
      'HOLO_RESTIC_CONFIG_PATH',
      'HOLO_RELEASE_PATH',
      'HOLO_VERIFY_BASE_URL',
      'PLATFORM_URL',
      'R2_S3_ID',
      'R2_S3_KEY_ID',
      'R2_S3_SECRET',
      'R2_S3_TOKEN',
      'R2_ACCESS_KEY_ID',
      'R2_PARENT_ACCESS_KEY_ID',
      'R2_PARENT_SECRET_ACCESS_KEY',
      'R2_PARENT_SESSION_TOKEN',
      'R2_FIRE_DRILL_DATA_ACCESS_KEY_ID',
      'R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY',
      'R2_FIRE_DRILL_DATA_SESSION_TOKEN',
      'R2_INTEGRATION_ACCESS_KEY_ID',
      'R2_INTEGRATION_SECRET_ACCESS_KEY',
      'R2_INTEGRATION_SESSION_TOKEN',
      'R2_INTEGRATION_RESTORE_ACCESS_KEY_ID',
      'R2_INTEGRATION_RESTORE_SECRET_ACCESS_KEY',
      'R2_INTEGRATION_RESTORE_SESSION_TOKEN',
      'R2_PGBACKREST_PREFIX',
      'R2_REPO_CIPHER_PASS',
      'R2_RESTORE_OBJECT_PREFIX',
      'R2_SCOPE_PROBE_IN_KEY',
      'R2_SCOPE_PROBE_OUT_KEY',
      'R2_SECRET_ACCESS_KEY',
      'R2_SESSION_TOKEN',
      'RESTIC_PASSWORD',
      'RESTIC_REPOSITORY',
      'TAILSCALE_AUTH_KEY',
    ]) {
      delete isolatedEnv[key];
    }

    Object.assign(isolatedEnv, {
      CONVEX_DEPLOYMENT: convexDeployment,
      CONVEX_URL: convexUrl,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_OWNER: databaseUrl,
      EXPO_PUBLIC_CONVEX_SITE_URL: convexSiteUrl,
      EXPO_PUBLIC_CONVEX_URL: convexUrl,
      FLEET_URL: fleetUrl,
      HOLO_BLOB_ROOT: blobRoot,
      HOLO_CUTOVER_SCHEDULES_DISABLED: '0',
      HOLO_DANGEROUS_ALLOW_PROD_DB: '0',
      HOLO_GO_NO_GO_ISOLATED: '1',
      HOLO_MIGRATION_READ_ONLY: '0',
      HOLO_RESTIC_CONFIG_PATH: resticConfig,
      HOLO_SECRETS_PATH: secretsPath,
      PGBACKREST_CONFIG: pgbackrestConfig,
      PGBACKREST_PG1_PATH: pg1Path,
      PGDATA: pg1Path,
      PGDATABASE: database.pathname.replace(/^\//, ''),
      PGHOST: canonicalHostname(database.hostname),
      PGPORT: database.port || '5432',
      PGUSER: decodeURIComponent(database.username),
      R2_RESTIC_PREFIX: resticPrefix,
      RESTIC_REPOSITORY: resticRepository,
      RESTIC_CACHE_DIR: resticCache,
      VITE_CONVEX_HTTP_URL: convexUrl,
      VITE_CONVEX_SITE_URL: convexSiteUrl,
      ...localKeys,
    });
    if (database.password) {
      isolatedEnv.PGPASSWORD = decodeURIComponent(database.password);
    } else {
      delete isolatedEnv.PGPASSWORD;
    }

    return {
      env: isolatedEnv,
      cleanup: () => {
        cleanupIsolatedArchiveCommand({
          database,
          baseEnv,
          pgbackrestConfig,
          previousArchiveCommand,
        });
        rmSync(tempRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export type RunGoNoGoOptions = {
  repoRoot?: string;
  /** Working directory for subprocesses (default: repoRoot). */
  cwd?: string;
  reportPath?: string;
  /** Override gate list (tests may inject short real subprocesses). */
  gates?: readonly GateSpec[];
  env?: NodeJS.ProcessEnv;
  /** Skip writing the durable report (tests only). */
  skipWrite?: boolean;
};

/**
 * Optional test-only filter: comma-separated gate names in HOLO_GO_NO_GO_ONLY.
 * Production human-gate step 1 NEVER sets this — DEFAULT_GATE_SPECS stay unbound.
 * Integration tests may set it so the real CLI path is finite (avoids nested full
 * vitest project recursion when already inside the integration lane).
 */
export function resolveGateSpecs(
  gates: readonly GateSpec[] | undefined,
  env: NodeJS.ProcessEnv
): readonly GateSpec[] {
  const base = gates ?? DEFAULT_GATE_SPECS;
  const only = (env.HOLO_GO_NO_GO_ONLY ?? '').trim();
  if (!only) return base;
  const wanted = new Set(
    only
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const filtered = base.filter((g) => wanted.has(g.name));
  if (filtered.length === 0) {
    throw new Error(
      `HOLO_GO_NO_GO_ONLY=${only} matched zero gates; known: ${GO_NO_GO_GATE_NAMES.join(',')}`
    );
  }
  return filtered;
}

/**
 * Sequential real-subprocess gate runner. Produces one unified report.
 * overall.ok = AND(every gate.pass).
 */
export function runGoNoGo(options: RunGoNoGoOptions = {}): GoNoGoReport {
  const repoRoot = options.repoRoot ?? resolveRepoRoot();
  const cwd = options.cwd ?? repoRoot;
  const env = { ...process.env, ...(options.env ?? {}) };
  const specs = resolveGateSpecs(options.gates, env);
  const reportPath = resolve(options.reportPath ?? defaultGoNoGoReportPath(cwd));

  const gates: GateResult[] = [];
  const needsIntegrationEnv = specs.some(
    (spec) => spec.name === 'integration' || spec.name === 'live'
  );
  const isolated = needsIntegrationEnv ? createIsolatedIntegrationEnv(repoRoot, env) : null;
  try {
    for (const spec of specs) {
      const gateEnv =
        spec.name === 'integration' || spec.name === 'live' ? (isolated?.env ?? env) : env;
      gates.push(runOneGate(spec, { cwd, env: gateEnv }));
    }
  } finally {
    isolated?.cleanup();
  }

  const overallOk = gates.length > 0 && gates.every((g) => g.pass);
  const report: GoNoGoReport = {
    ok: overallOk,
    overall: { ok: overallOk },
    git_sha: resolveGitSha(repoRoot),
    generated_at: new Date().toISOString(),
    gates,
    report_path: reportPath,
    failed_count: gates.filter((g) => !g.pass).length,
  };

  if (!options.skipWrite) {
    const dir = dirname(reportPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return report;
}

/**
 * Human-gate / C-01 success oracle for a go-no-go report.
 *
 * Pass requires ALL of:
 *   - gates.length === 8
 *   - overall.ok === true
 *   - failed_count === 0
 *   - every vitest lane (unit/integration/live) has collectedTests > 0
 *
 * Length alone is never sufficient (red-hat C-01 false pass).
 */
export type GoNoGoOracleResult = {
  ok: boolean;
  reasons: string[];
};

export function evaluateGoNoGoOracle(
  report: Pick<GoNoGoReport, 'overall' | 'failed_count' | 'gates' | 'ok'>
): GoNoGoOracleResult {
  const reasons: string[] = [];
  const gateCount = report.gates?.length ?? 0;
  if (gateCount !== 8) {
    reasons.push(`gates.length=${gateCount} (require 8)`);
  }
  if (report.overall?.ok !== true) {
    reasons.push(`overall.ok=${String(report.overall?.ok)} (require true)`);
  }
  if (report.ok !== true) {
    reasons.push(`ok=${String(report.ok)} (require true)`);
  }
  if (report.failed_count !== 0) {
    reasons.push(`failed_count=${report.failed_count} (require 0)`);
  }
  const vitestNames = new Set(['unit', 'integration', 'live']);
  for (const g of report.gates ?? []) {
    if (!vitestNames.has(g.name)) continue;
    const n = g.collectedTests;
    if (n == null || n <= 0) {
      reasons.push(`${g.name}.collectedTests=${String(n)} (require >0)`);
    }
  }
  // Also require the three vitest gates are present when length is 8.
  for (const name of vitestNames) {
    if (!(report.gates ?? []).some((g) => g.name === name)) {
      reasons.push(`missing vitest gate: ${name}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * jq predicate matching gate-plan step 1 post-CLI assertion (C-01).
 * Keep in sync with gate-plan.json step 1 literal_cmd.
 */
export const GO_NO_GO_STEP1_JQ_ORACLE =
  '.overall.ok == true and .failed_count == 0 and (.gates|length) == 8 and ([.gates[] | select(.name=="unit" or .name=="integration" or .name=="live") | .collectedTests // 0] | min) > 0';

/** Human-readable text matching holo verify:* `status: OK|FAIL` convention. */
export function formatGoNoGoText(report: GoNoGoReport): string {
  const lines: string[] = [
    'holo cutover:go-no-go — pre-cutover harness suite (T-SYNC-008)',
    `  git_sha:      ${report.git_sha || '(unknown)'}`,
    `  generated_at: ${report.generated_at}`,
    `  report_path:  ${report.report_path}`,
    `  gates:        ${report.gates.length}`,
    `  failed:       ${report.failed_count}`,
  ];
  for (const g of report.gates) {
    const flag = g.pass ? 'PASS' : 'FAIL';
    const tests = g.collectedTests != null ? ` collectedTests=${g.collectedTests}` : '';
    lines.push(`  ${g.name}: ${flag} exit=${g.exit_code} duration_ms=${g.duration_ms}${tests}`);
    lines.push(`    command: ${g.command}`);
  }
  lines.push(report.overall.ok ? '  status: OK' : '  status: FAIL');
  return lines.join('\n');
}
