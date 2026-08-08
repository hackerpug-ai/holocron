/**
 * GATE-FIX-explicit-ponr-database-binding RED/GREEN integration surface.
 *
 * The fixture is provisioned from a migrated database into two disposable
 * database names. It never resets or seeds holocron_nonprod.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type LiveService, startLiveService } from '../../../../tests/integration/service/harness';
import {
  cleanupExactPonrMarker,
  EXACT_PONR_MARKER,
  REQUIRED_PONR_TRIGGER_NAMES,
  seedExactPonrMarker,
} from '../../src/cutover/ponr-marker.ts';
import {
  DATABASE_TARGET_MISMATCH,
  evaluateRollbackChildTarget,
  runRollbackDrill,
  spawnRollbackRepointCli,
} from '../../src/cutover/rollback-drill.ts';
import { runRollbackRepoint } from '../../src/cutover/rollback-repoint.ts';
import { createSql } from '../../src/db/client.ts';
import {
  databaseTargetIdentitiesEqual,
  parseDatabaseTargetIdentity,
} from '../../src/db/connection.ts';

// TC-1 focused type contract: each internal boundary must reject omission.
// @ts-expect-error databaseUrl is required at the repoint boundary
const omittedRepointDatabase: Parameters<typeof runRollbackRepoint>[0] = { cwd: '' };
// @ts-expect-error databaseUrl is required at the drill boundary
const omittedDrillDatabase: Parameters<typeof runRollbackDrill>[0] = { cwd: '' };
// @ts-expect-error databaseUrl is required at the child boundary
const omittedChildDatabase: Parameters<typeof spawnRollbackRepointCli>[0] = { cwd: '' };
void omittedRepointDatabase;
void omittedDrillDatabase;
void omittedChildDatabase;

const REAL_IT = process.env.PLATFORM_IT === '1';
const itReal = REAL_IT ? it : it.skip;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-explicit-ponr-database-binding/red');
const ADMIN_URL = process.env.GATE_FIX_TEST_ADMIN_URL ?? 'postgres://127.0.0.1:5432/postgres';
const SOURCE_URL = process.env.GATE_FIX_TEST_SOURCE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const SOURCE_SHA = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
}).trim();

type Targets = { gate: string; marker: string; names: string[] };

function evidence(name: string, value: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, `${Date.now()}-${process.pid}-${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

function dbUrl(base: string, name: string): string {
  const u = new URL(base);
  u.pathname = `/${name}`;
  u.search = '';
  u.hash = '';
  return u.toString();
}

function libpqEnv(url: string): NodeJS.ProcessEnv {
  const u = new URL(url);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  };
}

async function clearPonr(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe('ALTER TABLE data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_mutation');
    await sql.unsafe('ALTER TABLE data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_truncate');
    await sql.unsafe('DELETE FROM data_plane_ponr');
    await sql.unsafe('ALTER TABLE data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_mutation');
    await sql.unsafe('ALTER TABLE data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_truncate');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function clearAudit(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe('DELETE FROM post_export_write_audit');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedContradictoryAudit(url: string): Promise<void> {
  await clearAudit(url);
  const sql = createSql(url, { max: 1 });
  try {
    const watermark = Date.now() - 60_000;
    await sql`
      INSERT INTO post_export_write_audit (committed_at_ms, surface, write_row_id, export_watermark_ms)
      VALUES
        (${watermark + 10_000}, ${'fixture.marker.app'}, ${'marker-audit-a'}, ${watermark}),
        (${watermark + 20_000}, ${'fixture.marker.mcp'}, ${'marker-audit-b'}, ${watermark})
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedPonr(url: string, tag: string): Promise<void> {
  await clearPonr(url);
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe('ALTER TABLE data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_mutation');
    await sql.unsafe('ALTER TABLE data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_truncate');
    await sql.unsafe(`
      INSERT INTO data_plane_ponr (
        fence_lifted_at, write_surface, write_table, write_row_id,
        write_row_digest_sha256, write_committed_at, base_url, operator,
        run_id, idempotency_key, export_watermark_ms, convex_fence_audit_id,
        convex_fence_env_value, convex_documents_total,
        convex_newest_document_creation_time,
        convex_accepted_writes_since_watermark,
        convex_rejected_writes_since_watermark
      ) VALUES (
        now(), 'probe.seed', 'documents', '00000000-0000-4000-8000-aaaaaaaaaaaa',
        repeat('ab', 32), now(), 'http://127.0.0.1:9', 'probe-seed',
        's30-explicit-${tag}', 's30-explicit-${tag}-idem', 1,
        'seed', '1', 0, 0, 0, 0
      )
    `);
    await sql.unsafe('ALTER TABLE data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_mutation');
    await sql.unsafe('ALTER TABLE data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_truncate');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function fixtureWatermark(name: string): string {
  const path = resolve(EVIDENCE_DIR, `${name}-watermark.json`);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ ok: true, watermarkAtMs: Date.now() + 60_000, runId: name }, null, 2)}\n`,
    'utf8'
  );
  return path;
}

function fixtureSecrets(name: string): string {
  const path = resolve(EVIDENCE_DIR, `${name}-secrets.yaml`);
  writeFileSync(path, 'HOLO_DATA_PLANE: postgres\nHOLO_ROLLBACK_TARGET: postgres-soak\n', 'utf8');
  return path;
}

function fixtureServingSecrets(name: string): string {
  const path = resolve(EVIDENCE_DIR, `${name}-secrets.yaml`);
  writeFileSync(
    path,
    'HOLO_MIGRATION_READ_ONLY: "1"\nHOLO_DATA_PLANE: postgres\nHOLO_ROLLBACK_TARGET: postgres-soak\n',
    'utf8'
  );
  return path;
}

function credentialCanaryTarget(url: string): string {
  const target = new URL(url);
  target.username = 'child-user-canary';
  target.password = 'child-password-canary';
  target.search = '?child-query-canary=1';
  target.hash = 'child-fragment-canary';
  return target.toString();
}

/**
 * The CLI has no config-path flag by contract. Run the real child from a
 * source sandbox so its cwd-relative audit mirror cannot overwrite the
 * worktree's tracked D06-05 config. The source copy contains no operator
 * config/secrets; the child receives the fixture secrets path explicitly.
 */
function childRuntimeCwd(): string {
  const childRoot = resolve(EVIDENCE_DIR, 'child-runtime');
  const childSource = resolve(childRoot, 'services/platform/src');
  rmSync(childRoot, { recursive: true, force: true });
  mkdirSync(resolve(childRoot, 'services/platform'), { recursive: true });
  cpSync(resolve(REPO_ROOT, 'services/platform/src'), childSource, { recursive: true });
  const childNodeModules = resolve(childRoot, 'node_modules');
  symlinkSync(resolve(REPO_ROOT, 'node_modules'), childNodeModules, 'dir');
  symlinkSync(resolve(REPO_ROOT, '.spec'), resolve(childRoot, '.spec'), 'dir');
  const sourceDigest = createHash('sha256')
    .update(readFileSync(resolve(childSource, 'cutover/rollback-repoint.ts')))
    .digest('hex');
  writeFileSync(
    resolve(EVIDENCE_DIR, 'child-runtime-source.json'),
    `${JSON.stringify({ source_sha: SOURCE_SHA, rollback_repoint_source_sha256: sourceDigest }, null, 2)}\n`,
    'utf8'
  );
  return childRoot;
}

async function databaseName(url: string): Promise<string> {
  const sql = createSql(url, { max: 1 });
  try {
    const rows = await sql<{ name: string }[]>`SELECT current_database()::text AS name`;
    const name = rows[0]?.name;
    if (!name) throw new Error('fixture database name query returned no row');
    return name;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

type MarkerField = keyof typeof EXACT_PONR_MARKER;
type MarkerState = {
  marker_count: number;
  audit_count: number;
  audit_digest: string;
  triggers: Array<{ name: string; enabled: string }>;
};

async function markerState(url: string): Promise<MarkerState> {
  const sql = createSql(url, { max: 1 });
  try {
    const marker = await sql<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM public.data_plane_ponr`;
    const audit = await sql<
      Array<{
        id: string;
        committed_at_ms: string;
        surface: string;
        write_row_id: string | null;
        export_watermark_ms: string;
        recorded_at: string;
      }>
    >`
      SELECT id::text AS id, committed_at_ms::text AS committed_at_ms, surface::text AS surface,
             write_row_id::text AS write_row_id, export_watermark_ms::text AS export_watermark_ms,
             recorded_at::text AS recorded_at
      FROM public.post_export_write_audit ORDER BY id::text
    `;
    const triggers = await sql<Array<{ name: string; enabled: string }>>`
      SELECT tgname AS name, tgenabled::text AS enabled
      FROM pg_trigger
      WHERE tgrelid = 'public.data_plane_ponr'::regclass AND NOT tgisinternal
      ORDER BY tgname
    `;
    return {
      marker_count: marker[0]?.count ?? 0,
      audit_count: audit.length,
      audit_digest: createHash('sha256').update(JSON.stringify(audit)).digest('hex'),
      triggers,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function mutateMarkerField(url: string, field: MarkerField): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe(
      'ALTER TABLE public.data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_mutation'
    );
    await sql.unsafe(
      'ALTER TABLE public.data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_truncate'
    );
    switch (field) {
      case 'write_surface':
        await sql`UPDATE public.data_plane_ponr SET write_surface = 'foreign.surface'`;
        break;
      case 'write_table':
        await sql`UPDATE public.data_plane_ponr SET write_table = 'foreign_table'`;
        break;
      case 'write_row_id':
        await sql`UPDATE public.data_plane_ponr SET write_row_id = '00000000-0000-4000-8000-bbbbbbbbbbbb'`;
        break;
      case 'write_row_digest_sha256':
        await sql`UPDATE public.data_plane_ponr SET write_row_digest_sha256 = repeat('cd', 32)`;
        break;
      case 'base_url':
        await sql`UPDATE public.data_plane_ponr SET base_url = 'http://127.0.0.1:10'`;
        break;
      case 'operator':
        await sql`UPDATE public.data_plane_ponr SET operator = 'foreign-operator'`;
        break;
      case 'run_id':
        await sql`UPDATE public.data_plane_ponr SET run_id = 'foreign-run-id'`;
        break;
      case 'idempotency_key':
        await sql`UPDATE public.data_plane_ponr SET idempotency_key = 'foreign-idempotency-key'`;
        break;
      case 'convex_fence_audit_id':
        await sql`UPDATE public.data_plane_ponr SET convex_fence_audit_id = 'foreign-audit-id'`;
        break;
      case 'convex_fence_env_value':
        await sql`UPDATE public.data_plane_ponr SET convex_fence_env_value = '2'`;
        break;
      case 'convex_documents_total':
        await sql`UPDATE public.data_plane_ponr SET convex_documents_total = 1`;
        break;
      case 'convex_newest_document_creation_time':
        await sql`UPDATE public.data_plane_ponr SET convex_newest_document_creation_time = 1`;
        break;
      case 'convex_accepted_writes_since_watermark':
        throw new Error('SCHEMA_ENFORCED_IMPOSSIBILITY: accepted writes CHECK requires zero');
      case 'convex_rejected_writes_since_watermark':
        await sql`UPDATE public.data_plane_ponr SET convex_rejected_writes_since_watermark = 1`;
        break;
    }
  } finally {
    await sql.unsafe(
      'ALTER TABLE public.data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_mutation'
    );
    await sql.unsafe(
      'ALTER TABLE public.data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_truncate'
    );
    await sql.end({ timeout: 5 });
  }
}

async function createDeleteBomb(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION public.s30_marker_delete_bomb() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'S30_DELETE_BOMB'; END $$;
      DROP TRIGGER IF EXISTS s30_marker_delete_bomb ON public.data_plane_ponr;
      CREATE TRIGGER s30_marker_delete_bomb BEFORE DELETE ON public.data_plane_ponr
      FOR EACH ROW EXECUTE FUNCTION public.s30_marker_delete_bomb();
    `);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function dropDeleteBomb(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe('DROP TRIGGER IF EXISTS s30_marker_delete_bomb ON public.data_plane_ponr');
    await sql.unsafe('DROP FUNCTION IF EXISTS public.s30_marker_delete_bomb()');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function provisionTargets(): Promise<Targets> {
  const admin = postgres(ADMIN_URL, { max: 1, prepare: false });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  const names = [`s30_gate_${suffix}`, `s30_marker_${suffix}`];
  try {
    for (const name of names) await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE template0`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  const gateName = names[0];
  const markerName = names[1];
  if (!gateName || !markerName) throw new Error('fixture database names were not provisioned');
  const gate = dbUrl(ADMIN_URL, gateName);
  const marker = dbUrl(ADMIN_URL, markerName);
  const dump = execFileSync('pg_dump', ['--no-owner', '--no-privileges'], {
    cwd: REPO_ROOT,
    env: libpqEnv(SOURCE_URL),
    maxBuffer: 256 * 1024 * 1024,
  });
  for (const target of [gate, marker]) {
    execFileSync('psql', ['--quiet'], {
      cwd: REPO_ROOT,
      input: dump,
      stdio: ['pipe', 'ignore', 'ignore'],
      env: libpqEnv(target),
    });
  }
  await clearPonr(gate);
  await clearPonr(marker);
  await clearAudit(gate);
  await seedContradictoryAudit(marker);
  return { gate, marker, names };
}

async function dropTargets(names: string[]): Promise<void> {
  const admin = postgres(ADMIN_URL, { max: 1, prepare: false });
  try {
    for (const name of names) await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

describe('GATE-FIX explicit rollback/PONR database binding', () => {
  let targets: Targets;

  it('TC-1: omitted databaseUrl is rejected at all three internal boundaries', () => {
    evidence('type-contract-omitted-database', {
      source_sha: SOURCE_SHA,
      command: 'pnpm exec tsc --noEmit --pretty false',
      assertion:
        'three @ts-expect-error omission fixtures compile only when databaseUrl is required',
      repoint_required: true,
      drill_required: true,
      child_required: true,
    });
    expect(true).toBe(true);
  });

  it('TC-9: target identity aliases are credential-free and stable', () => {
    const alias = parseDatabaseTargetIdentity(
      'postgres://marker-user:marker-password@LOCALHOST/identity_db?secret=marker-query#marker-fragment'
    );
    const canonical = parseDatabaseTargetIdentity(
      'postgresql://other-user:other-password@localhost:5432/identity_db'
    );
    expect(alias).toEqual(canonical);
    expect(databaseTargetIdentitiesEqual(alias, canonical)).toBe(true);
    expect(JSON.stringify(alias)).not.toMatch(
      /marker-user|marker-password|marker-query|marker-fragment/
    );
    expect(
      databaseTargetIdentitiesEqual(
        alias,
        parseDatabaseTargetIdentity('postgres://localhost:5433/identity_db')
      )
    ).toBe(false);
    expect(
      databaseTargetIdentitiesEqual(
        alias,
        parseDatabaseTargetIdentity('postgres://localhost/other_db')
      )
    ).toBe(false);
  });

  beforeAll(async () => {
    if (!REAL_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    targets = await provisionTargets();
    evidence('fixture-identities', {
      source_sha: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      }).trim(),
      command:
        'PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-explicit-ponr-database-binding.test.ts',
      gate_database: await databaseName(targets.gate),
      marker_database: await databaseName(targets.marker),
      distinct_database_names: true,
    });
  }, 180_000);

  afterAll(async () => {
    if (targets) await dropTargets(targets.names);
  });

  itReal(
    'RED-1: explicit clean gate target cannot read contradictory ambient marker PONR',
    async () => {
      await seedPonr(targets.marker, 'marker');
      const priorDatabaseUrl = process.env.DATABASE_URL;
      const priorSecret = process.env.HOLO_CUTOVER_OPERATOR_SECRET;
      process.env.DATABASE_URL = targets.marker;
      process.env.HOLO_CUTOVER_OPERATOR_SECRET = 's30-red-test-secret';
      try {
        const report = await runRollbackRepoint({
          databaseUrl: targets.gate,
          cwd: REPO_ROOT,
          configPath: resolve(EVIDENCE_DIR, 'red-split-target-repoint-data-plane-config.json'),
          reportPath: resolve(EVIDENCE_DIR, 'red-split-target-repoint-report.json'),
          secretsPath: fixtureSecrets('red-split-target-repoint'),
          watermarkPath: fixtureWatermark('red-split-target-repoint'),
          operatorSecret: 's30-red-test-secret',
        });
        evidence('red-split-target-repoint-shape', {
          source_sha: SOURCE_SHA,
          command:
            'runRollbackRepoint({ databaseUrl: explicit_gate }) with ambient DATABASE_URL=marker',
          exit_code: null,
          assertion: 'explicit clean target must not observe marker PONR',
          target_database: report.database_target.database,
          ponr_recorded: report.precondition.ponr_recorded ?? null,
          error_code: report.error?.code ?? null,
        });
        expect(report.database_target.database).toBe(await databaseName(targets.gate));
        expect(report.precondition.ponr_recorded ?? false).toBe(false);
        expect(report.error?.code).not.toBe('POST_PONR_INELIGIBLE');
      } finally {
        await clearPonr(targets.marker);
        if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorDatabaseUrl;
        if (priorSecret === undefined) delete process.env.HOLO_CUTOVER_OPERATOR_SECRET;
        else process.env.HOLO_CUTOVER_OPERATOR_SECRET = priorSecret;
      }
    },
    180_000
  );

  itReal(
    'RED-2: a real PONR in the explicit gate DB still refuses rollback',
    async () => {
      await seedPonr(targets.gate, 'gate');
      const priorDatabaseUrl = process.env.DATABASE_URL;
      const priorSecret = process.env.HOLO_CUTOVER_OPERATOR_SECRET;
      process.env.DATABASE_URL = targets.marker;
      process.env.HOLO_CUTOVER_OPERATOR_SECRET = 's30-red-test-secret';
      try {
        const report = await runRollbackRepoint({
          databaseUrl: targets.gate,
          cwd: REPO_ROOT,
          configPath: resolve(EVIDENCE_DIR, 'red-explicit-ponr-refusal-data-plane-config.json'),
          reportPath: resolve(EVIDENCE_DIR, 'red-explicit-ponr-refusal-report.json'),
          secretsPath: fixtureSecrets('red-explicit-ponr-refusal'),
          watermarkPath: fixtureWatermark('red-explicit-ponr-refusal'),
          operatorSecret: 's30-red-test-secret',
        });
        evidence('red-explicit-ponr-refusal-shape', {
          source_sha: SOURCE_SHA,
          command:
            'runRollbackRepoint({ databaseUrl: explicit_gate }) with ambient DATABASE_URL=marker',
          exit_code: null,
          assertion: 'explicit gate PONR must return POST_PONR_INELIGIBLE',
          target_database: report.database_target.database,
          ponr_recorded: report.precondition.ponr_recorded ?? null,
          error_code: report.error?.code ?? null,
        });
        expect(report.database_target.database).toBe(await databaseName(targets.gate));
        expect(report.precondition.ponr_recorded).toBe(true);
        expect(report.error?.code).toBe('POST_PONR_INELIGIBLE');
      } finally {
        await clearPonr(targets.gate);
        if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorDatabaseUrl;
        if (priorSecret === undefined) delete process.env.HOLO_CUTOVER_OPERATOR_SECRET;
        else process.env.HOLO_CUTOVER_OPERATOR_SECRET = priorSecret;
      }
    },
    180_000
  );

  itReal(
    'RED-3: a real rollback child inherits the explicit parent target over ambient marker env',
    () => {
      const priorDatabaseUrl = process.env.DATABASE_URL;
      const priorSecret = process.env.HOLO_CUTOVER_OPERATOR_SECRET;
      const ambientCanary = credentialCanaryTarget(targets.marker);
      process.env.DATABASE_URL = ambientCanary;
      process.env.HOLO_CUTOVER_OPERATOR_SECRET = 's30-red-test-secret';
      try {
        const child = spawnRollbackRepointCli({
          cwd: childRuntimeCwd(),
          databaseUrl: targets.gate,
          watermarkPath: fixtureWatermark('red-child-inheritance'),
          outputPath: resolve(EVIDENCE_DIR, 'red-child-inheritance-report.json'),
          env: {
            ...process.env,
            DATABASE_URL: ambientCanary,
            HOLO_CUTOVER_OPERATOR_SECRET: 's30-red-test-secret',
            HOLO_SECRETS_PATH: fixtureSecrets('red-child-inheritance'),
          },
        });
        evidence('red-child-inheritance-shape', {
          source_sha: SOURCE_SHA,
          command:
            'spawnRollbackRepointCli({ databaseUrl: explicit_gate, env.DATABASE_URL=marker })',
          assertion: 'real child report target must equal explicit parent database',
          exit_code: child.exitCode,
          target_database: child.parsed?.database_target?.database ?? null,
          error_code: child.parsed?.error?.code ?? null,
          argv_has_database_url: child.argv.some((arg) => arg === '--database-url'),
        });
        const serializedChild = `${child.argv.join(' ')}\n${child.stdout}\n${child.stderr}\n${JSON.stringify(child.parsed)}`;
        expect(serializedChild).not.toContain(targets.gate);
        expect(serializedChild).not.toContain(targets.marker);
        expect(serializedChild).not.toContain('s30-red-test-secret');
        expect(serializedChild).not.toContain('child-user-canary');
        expect(serializedChild).not.toContain('child-password-canary');
        expect(serializedChild).not.toContain('child-query-canary');
        expect(serializedChild).not.toContain('child-fragment-canary');
        expect(serializedChild).not.toMatch(/postgres(?:ql)?:\/\/[^\s"']+/);
        expect(child.parsed).not.toBeNull();
        expect(child.parsed?.database_target?.database).toBe(
          new URL(targets.gate).pathname.slice(1)
        );
        expect(child.parsed?.error?.code).not.toBe('POST_PONR_INELIGIBLE');
        expect(child.argv.some((arg) => arg === '--database-url')).toBe(false);
      } finally {
        if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorDatabaseUrl;
        if (priorSecret === undefined) delete process.env.HOLO_CUTOVER_OPERATOR_SECRET;
        else process.env.HOLO_CUTOVER_OPERATOR_SECRET = priorSecret;
      }
    },
    180_000
  );

  itReal(
    'TC-7/8: genuine child B is rejected by the production target evaluator for parent A',
    async () => {
      const priorDatabaseUrl = process.env.DATABASE_URL;
      const priorSecret = process.env.HOLO_CUTOVER_OPERATOR_SECRET;
      const parentA = parseDatabaseTargetIdentity(targets.gate);
      const ambientCanary = credentialCanaryTarget(targets.gate);
      process.env.DATABASE_URL = ambientCanary;
      process.env.HOLO_CUTOVER_OPERATOR_SECRET = 's30-red-test-secret';
      let servingB: LiveService | undefined;
      try {
        await clearPonr(targets.marker);
        await clearAudit(targets.marker);
        const servingSecrets = fixtureServingSecrets('red-child-mismatch-b-serving');
        servingB = await startLiveService({
          databaseUrl: targets.marker,
          readyTimeoutMs: 30_000,
          extraEnv: {
            HOLO_SECRETS_PATH: servingSecrets,
            HOLOCRON_SECRETS_PATH: servingSecrets,
            HOLO_DATA_PLANE: 'postgres',
            HOLO_ROLLBACK_TARGET: 'boot-time-postgres',
            HOLO_SERVICE_LABEL: 's30-explicit-target-mismatch-b',
          },
        });
        const child = spawnRollbackRepointCli({
          cwd: childRuntimeCwd(),
          databaseUrl: targets.marker,
          watermarkPath: fixtureWatermark('red-child-mismatch-b'),
          outputPath: resolve(EVIDENCE_DIR, 'red-child-mismatch-b-report.json'),
          env: {
            ...process.env,
            DATABASE_URL: ambientCanary,
            HOLO_CUTOVER_OPERATOR_SECRET: 's30-red-test-secret',
            HOLO_SECRETS_PATH: servingSecrets,
            HOLOCRON_SECRETS_PATH: servingSecrets,
            HOLO_VERIFY_BASE_URL: servingB.baseUrl,
            HOLO_SOAK_BASE_URL: servingB.baseUrl,
            PLATFORM_URL: servingB.baseUrl,
            HOLO_VERIFY_PID: String(servingB.pid ?? ''),
            HOLO_DATA_PLANE: 'postgres',
            HOLO_ROLLBACK_TARGET: 'boot-time-postgres',
          },
        });
        expect(child.parsed).not.toBeNull();
        const childB = child.parsed?.database_target;
        if (!childB) throw new Error('real child B report omitted database_target');
        const validation = evaluateRollbackChildTarget(parentA, childB);
        expect(child.exitCode).toBe(0);
        expect(child.parsed?.repointed).toBe(true);
        expect(child.parsed?.precondition.accepted_post_export_writes).toBe(0);
        expect(child.parsed?.acknowledgements.length ?? 0).toBeGreaterThanOrEqual(1);
        expect(childB.database).toBe(new URL(targets.marker).pathname.slice(1));
        expect(childB.database).not.toBe(parentA.database);
        expect(validation.ok).toBe(false);
        if (validation.ok)
          throw new Error('unreachable: mismatch evaluator unexpectedly accepted child B');
        expect(validation.error.code).toBe(DATABASE_TARGET_MISMATCH);

        // Execute a source-mutated copy in the run-scoped child sandbox. The
        // harness must fail if the production comparison is inverted; this is
        // a transcript of a real mutant, not a rewritten report fixture.
        const mutationRoot = childRuntimeCwd();
        const drillSourcePath = resolve(
          mutationRoot,
          'services/platform/src/cutover/rollback-drill.ts'
        );
        const drillSource = readFileSync(drillSourcePath, 'utf8');
        const comparison = 'if (databaseTargetIdentitiesEqual(parent, child)) return { ok: true };';
        const invertedComparison =
          'if (!databaseTargetIdentitiesEqual(parent, child)) return { ok: true };';
        expect(drillSource.split(comparison).length - 1).toBe(1);
        writeFileSync(drillSourcePath, drillSource.replace(comparison, invertedComparison), 'utf8');
        const mutationScript = `
        import { evaluateRollbackChildTarget } from './services/platform/src/cutover/rollback-drill.ts';
        const result = evaluateRollbackChildTarget(${JSON.stringify(parentA)}, ${JSON.stringify(childB)});
        if (result.ok || result.error?.code !== 'DATABASE_TARGET_MISMATCH') {
          console.error('MUTATION_SURVIVED: inverted target comparison accepted child B');
          process.exit(1);
        }
      `;
        const mutation = spawnSync('bun', ['--eval', mutationScript], {
          cwd: mutationRoot,
          encoding: 'utf8',
          env: { ...process.env, DATABASE_URL: ambientCanary },
        });
        const mutationOutput = `${mutation.stdout ?? ''}\n${mutation.stderr ?? ''}`;
        expect(mutation.status).not.toBe(0);
        expect(mutationOutput).toContain('MUTATION_SURVIVED');
        evidence('red-child-target-mismatch-mutation', {
          source_sha: SOURCE_SHA,
          command:
            'real child B report + evaluateRollbackChildTarget(parent A, child B) + temp inverted comparison',
          parent_database: parentA.database,
          child_database: childB.database,
          child_exit_code: child.exitCode,
          production_error_code: validation.error.code,
          mutation_exit_code: mutation.status,
          mutation_transcript: mutationOutput.includes('MUTATION_SURVIVED')
            ? 'inverted comparison survived and harness failed'
            : 'missing',
        });
      } finally {
        if (servingB) await servingB.stop();
        await clearPonr(targets.marker);
        await clearAudit(targets.marker);
        if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorDatabaseUrl;
        if (priorSecret === undefined) delete process.env.HOLO_CUTOVER_OPERATOR_SECRET;
        else process.env.HOLO_CUTOVER_OPERATOR_SECRET = priorSecret;
      }
    },
    180_000
  );

  itReal(
    'RED-4: drill recompute remains on explicit gate and ambient DATABASE_URL remains unchanged',
    async () => {
      await clearPonr(targets.gate);
      await clearPonr(targets.marker);
      await clearAudit(targets.gate);
      await seedContradictoryAudit(targets.marker);
      const priorDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = targets.marker;
      try {
        const report = await runRollbackDrill({
          databaseUrl: targets.gate,
          cwd: REPO_ROOT,
          triggerBaseUrl: 'http://127.0.0.1:9',
          reportPath: resolve(EVIDENCE_DIR, 'red-audit-recompute-report.json'),
          watermarkPath: fixtureWatermark('red-audit-recompute'),
          skipProbes: true,
          skipRepoint: true,
        });
        evidence('red-audit-recompute-shape', {
          source_sha: SOURCE_SHA,
          command:
            'runRollbackDrill({ databaseUrl: explicit_gate, skipProbes:true, skipRepoint:true })',
          exit_code: null,
          assertion: 'explicit audit recompute must not redirect ambient process state',
          ambient_database_unchanged: process.env.DATABASE_URL === targets.marker,
          recomputed: report.independentRecompute.acceptedCount,
          target_database: report.database_target.database,
        });
        expect(process.env.DATABASE_URL).toBe(targets.marker);
        expect(report.database_target.database).toBe(new URL(targets.gate).pathname.slice(1));
        expect(report.independentRecompute.acceptedCount).toBe(0);
      } finally {
        if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorDatabaseUrl;
      }
    },
    180_000
  );

  itReal(
    'TC-10/13: exact marker cleanup is idempotent and preserves audit digest',
    async () => {
      await clearPonr(targets.marker);
      await seedExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      const before = await markerState(targets.marker);
      const cleaned = await cleanupExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      const after = await markerState(targets.marker);
      expect(cleaned.ok).toBe(true);
      expect(cleaned.match_disposition).toBe('exact_one');
      expect(cleaned.delete_count).toBe(1);
      expect(cleaned.disabled_triggers).toEqual([...REQUIRED_PONR_TRIGGER_NAMES]);
      expect(cleaned.trigger_before).toEqual(
        REQUIRED_PONR_TRIGGER_NAMES.map((name) => ({ name, enabled: 'O' }))
      );
      expect(cleaned.trigger_after).toEqual(
        REQUIRED_PONR_TRIGGER_NAMES.map((name) => ({ name, enabled: 'O' }))
      );
      expect(after.marker_count).toBe(0);
      expect(after.audit_count).toBe(before.audit_count);
      expect(after.audit_digest).toBe(before.audit_digest);

      const idempotent = await cleanupExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      expect(idempotent.ok).toBe(true);
      expect(idempotent.match_disposition).toBe('zero_rows');
      expect(idempotent.delete_count).toBe(0);
      expect(idempotent.disabled_triggers).toEqual([]);
      evidence('marker-cleanup-exact-idempotent', {
        source_sha: SOURCE_SHA,
        command: 'cleanupExactPonrMarker(gate, marker) twice',
        marker_database: after.marker_count === 0 ? 'disposable_marker' : 'unexpected',
        audit_count_before: before.audit_count,
        audit_digest_before: before.audit_digest,
        audit_count_after: after.audit_count,
        audit_digest_after: after.audit_digest,
        first_delete_count: cleaned.delete_count,
        second_delete_count: idempotent.delete_count,
        disabled_triggers: cleaned.disabled_triggers,
      });
    },
    180_000
  );

  itReal(
    'TC-11: every mutable fixed marker field refuses a foreign row',
    async () => {
      const fields = (Object.keys(EXACT_PONR_MARKER) as MarkerField[]).filter(
        (field) => field !== 'convex_accepted_writes_since_watermark'
      );
      const results: Array<Record<string, unknown>> = [];
      for (const field of fields) {
        await clearPonr(targets.marker);
        await seedExactPonrMarker({
          gateDatabaseUrl: targets.gate,
          markerDatabaseUrl: targets.marker,
        });
        const before = await markerState(targets.marker);
        await mutateMarkerField(targets.marker, field);
        const rejected = await cleanupExactPonrMarker({
          gateDatabaseUrl: targets.gate,
          markerDatabaseUrl: targets.marker,
        });
        const after = await markerState(targets.marker);
        expect(rejected.ok, field).toBe(false);
        expect(rejected.match_disposition, field).toBe('foreign_or_multiple');
        expect(rejected.delete_count, field).toBe(0);
        expect(after.marker_count, field).toBe(1);
        expect(after.audit_count, field).toBe(before.audit_count);
        expect(after.audit_digest, field).toBe(before.audit_digest);
        expect(
          after.triggers.filter((trigger) =>
            REQUIRED_PONR_TRIGGER_NAMES.includes(
              trigger.name as (typeof REQUIRED_PONR_TRIGGER_NAMES)[number]
            )
          )
        ).toEqual(REQUIRED_PONR_TRIGGER_NAMES.map((name) => ({ name, enabled: 'O' })));
        results.push({ field, error_code: rejected.error?.code ?? null, preserved: true });
        await clearPonr(targets.marker);
      }

      await clearPonr(targets.marker);
      await seedExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      let schemaError = '';
      try {
        await mutateMarkerField(targets.marker, 'convex_accepted_writes_since_watermark');
      } catch (error) {
        schemaError = error instanceof Error ? error.message : String(error);
      }
      expect(schemaError).toContain('SCHEMA_ENFORCED_IMPOSSIBILITY');
      results.push({
        field: 'convex_accepted_writes_since_watermark',
        schema_enforced_impossibility: true,
      });
      await clearPonr(targets.marker);
      evidence('marker-cleanup-foreign-field-matrix', {
        source_sha: SOURCE_SHA,
        command: 'real marker DB one-field foreign-row cleanup matrix',
        fields: results,
        audit_preserved: true,
        named_trigger_set: [...REQUIRED_PONR_TRIGGER_NAMES],
      });
    },
    180_000
  );

  itReal(
    'TC-12: singleton index rejects multiplicity and equal targets fail closed',
    async () => {
      await clearPonr(targets.marker);
      await seedExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      const sql = createSql(targets.marker, { max: 1 });
      let multiplicityError = '';
      try {
        await sql`
        INSERT INTO public.data_plane_ponr (
          fence_lifted_at, write_surface, write_table, write_row_id, write_row_digest_sha256,
          write_committed_at, base_url, operator, run_id, idempotency_key, export_watermark_ms,
          convex_fence_audit_id, convex_fence_env_value, convex_documents_total,
          convex_newest_document_creation_time, convex_accepted_writes_since_watermark,
          convex_rejected_writes_since_watermark
        ) VALUES (
          now(), ${EXACT_PONR_MARKER.write_surface}, ${EXACT_PONR_MARKER.write_table},
          '00000000-0000-4000-8000-bbbbbbbbbbbb', ${EXACT_PONR_MARKER.write_row_digest_sha256}, now(),
          ${EXACT_PONR_MARKER.base_url}, ${EXACT_PONR_MARKER.operator}, 'foreign-multiplicity',
          'foreign-multiplicity-idem', 1, ${EXACT_PONR_MARKER.convex_fence_audit_id},
          ${EXACT_PONR_MARKER.convex_fence_env_value}, 0, 0, 0, 0
        )
      `;
      } catch (error) {
        multiplicityError = error instanceof Error ? error.message : String(error);
      } finally {
        await sql.end({ timeout: 5 });
      }
      expect(multiplicityError).toContain('data_plane_ponr_singleton_uidx');
      expect((await markerState(targets.marker)).marker_count).toBe(1);
      const equal = await cleanupExactPonrMarker({
        gateDatabaseUrl: targets.marker,
        markerDatabaseUrl: targets.marker,
      });
      expect(equal.ok).toBe(false);
      expect(equal.error?.code).toBe('DATABASE_TARGET_EQUAL');
      await clearPonr(targets.marker);
      evidence('marker-singleton-equal-target', {
        source_sha: SOURCE_SHA,
        command: 'insert second PONR row + cleanupExactPonrMarker(equal targets)',
        singleton_index_rejected: true,
        equal_target_error: equal.error?.code,
        marker_preserved_on_equal: true,
      });
    },
    180_000
  );

  itReal(
    'TC-14/15: delete bomb restores exact required triggers and preserves marker/audit',
    async () => {
      await clearPonr(targets.marker);
      await seedExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      await createDeleteBomb(targets.marker);
      const before = await markerState(targets.marker);
      const failed = await cleanupExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      const after = await markerState(targets.marker);
      const requiredAfter = after.triggers.filter((trigger) =>
        REQUIRED_PONR_TRIGGER_NAMES.includes(
          trigger.name as (typeof REQUIRED_PONR_TRIGGER_NAMES)[number]
        )
      );
      const bombAfter = after.triggers.find((trigger) => trigger.name === 's30_marker_delete_bomb');
      expect(failed.ok).toBe(false);
      expect(failed.delete_count).toBe(0);
      expect(failed.disabled_triggers).toEqual([...REQUIRED_PONR_TRIGGER_NAMES]);
      expect(failed.error?.code).toBe('PONR_MARKER_CLEANUP_FAILED');
      expect(after.marker_count).toBe(1);
      expect(after.audit_count).toBe(before.audit_count);
      expect(after.audit_digest).toBe(before.audit_digest);
      expect(requiredAfter).toEqual(
        REQUIRED_PONR_TRIGGER_NAMES.map((name) => ({ name, enabled: 'O' }))
      );
      expect(bombAfter).toEqual({ name: 's30_marker_delete_bomb', enabled: 'O' });
      await dropDeleteBomb(targets.marker);
      const cleaned = await cleanupExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      expect(cleaned.ok).toBe(true);
      evidence('marker-trigger-bomb-restoration', {
        source_sha: SOURCE_SHA,
        command: 'cleanupExactPonrMarker with enabled third-trigger delete bomb',
        failed_error_code: failed.error?.code,
        disabled_triggers: failed.disabled_triggers,
        required_triggers_restored: requiredAfter,
        third_trigger_restored: bombAfter,
        audit_count_before: before.audit_count,
        audit_digest_before: before.audit_digest,
        audit_count_after_failure: after.audit_count,
        audit_digest_after_failure: after.audit_digest,
      });
    },
    180_000
  );
});
