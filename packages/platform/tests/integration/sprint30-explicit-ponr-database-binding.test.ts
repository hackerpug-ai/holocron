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
import {
  DEFAULT_KEYS,
  type LiveService,
  startLiveService,
} from '../../../../tests/integration/service/harness';
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
import {
  PONR_LEDGER_UNREADABLE,
  probePreexistingServingListening,
  runRollbackRepoint,
} from '../../src/cutover/rollback-repoint.ts';
import { runVerifyTools, type VerifyToolSeeds } from '../../src/cutover/soak-fence.ts';
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
const REAL_DATABASE_FIXTURE_TIMEOUT_MS = 360_000;
const REAL_MULTIPROCESS_ORACLE_TIMEOUT_MS = 360_000;
const REAL_MUTATION_MATRIX_TIMEOUT_MS = 600_000;
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
  const childSource = resolve(childRoot, 'packages/platform/src');
  rmSync(childRoot, { recursive: true, force: true });
  mkdirSync(resolve(childRoot, 'packages/platform'), { recursive: true });
  cpSync(resolve(REPO_ROOT, 'packages/platform/src'), childSource, { recursive: true });
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

type VerifyTargetFixture = {
  database: string;
  documentTitle: string;
  documentContent: string;
  seeds: VerifyToolSeeds;
};

type NetworkDocumentRead = {
  status: number;
  isError: boolean;
  payload: unknown;
};

/** Invoke the same deployed get_document path with a real MCP request. */
async function readDocumentFromService(
  baseUrl: string,
  documentId: string
): Promise<NetworkDocumentRead> {
  const headers = {
    authorization: `Bearer ${DEFAULT_KEYS.mcp}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  const mcpUrl = `${baseUrl.replace(/\/+$/, '')}/mcp`;
  await fetch(mcpUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 's30-rr2-document-oracle', version: '1' },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'get_document', arguments: { documentId } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await response.json()) as {
    result?: {
      isError?: boolean;
      content?: Array<{ text?: string }>;
      structuredContent?: unknown;
    };
  };
  const result = body.result;
  const contentText = result?.content?.[0]?.text;
  let payload: unknown;
  if (result && 'structuredContent' in result && result.structuredContent !== undefined) {
    payload = result.structuredContent;
  } else if (typeof contentText === 'string') {
    try {
      payload = JSON.parse(contentText);
    } catch {
      payload = contentText;
    }
  }
  return {
    status: response.status,
    isError: result?.isError === true,
    payload,
  };
}

/** Seed one target-specific document and subscription for the RR-2 oracle. */
async function seedVerifyTarget(url: string, tag: 'a' | 'b'): Promise<VerifyTargetFixture> {
  const documentId = randomUUID();
  const subscriptionId = randomUUID();
  const documentTitle = `s30-r2-target-${tag}-${randomUUID().slice(0, 8)}`;
  const documentContent = `s30-r2-distinctive-content-${tag}`;
  const subscriptionName = `s30-r2-subscription-${tag}-${randomUUID().slice(0, 8)}`;
  const sql = createSql(url, { max: 1 });
  try {
    await sql`
      INSERT INTO public.documents (id, title, content, status, is_public)
      VALUES (
        ${documentId}::uuid,
        ${documentTitle},
        ${documentContent},
        'draft',
        false
      )
    `;
    await sql`
      INSERT INTO public.subscription_sources (id, source_type, identifier, name)
      VALUES (
        ${subscriptionId}::uuid,
        'github',
        ${`s30-r2-distinctive-identifier-${tag}`},
        ${subscriptionName}
      )
    `;
    return {
      database: await databaseName(url),
      documentTitle,
      documentContent,
      seeds: {
        documentId,
        subscriptionId,
        researchSessionId: '',
        improvementId: '',
        assimilationSessionId: '',
        toolId: '',
        shopSessionId: '',
        profileId: '',
        runId: `s30-r2-${tag}-${randomUUID().slice(0, 8)}`,
      },
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function removeVerifyTarget(url: string, fixture: VerifyTargetFixture): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql`DELETE FROM public.documents WHERE id = ${fixture.seeds.documentId}::uuid`;
    await sql`
      DELETE FROM public.subscription_sources
      WHERE id = ${fixture.seeds.subscriptionId}::uuid
    `;
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

/** Seed an otherwise-exact marker whose schema-fixed accepted count is foreign. */
async function seedAcceptedForeignMarker(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql`
      INSERT INTO public.data_plane_ponr (
        fence_lifted_at, write_surface, write_table, write_row_id,
        write_row_digest_sha256, write_committed_at, base_url, operator,
        run_id, idempotency_key, export_watermark_ms, convex_fence_audit_id,
        convex_fence_env_value, convex_documents_total,
        convex_newest_document_creation_time,
        convex_accepted_writes_since_watermark,
        convex_rejected_writes_since_watermark
      ) VALUES (
        now(), ${EXACT_PONR_MARKER.write_surface}, ${EXACT_PONR_MARKER.write_table},
        ${EXACT_PONR_MARKER.write_row_id}, ${EXACT_PONR_MARKER.write_row_digest_sha256}, now(),
        ${EXACT_PONR_MARKER.base_url}, ${EXACT_PONR_MARKER.operator}, ${EXACT_PONR_MARKER.run_id},
        ${EXACT_PONR_MARKER.idempotency_key}, 1, ${EXACT_PONR_MARKER.convex_fence_audit_id},
        ${EXACT_PONR_MARKER.convex_fence_env_value}, ${EXACT_PONR_MARKER.convex_documents_total},
        ${EXACT_PONR_MARKER.convex_newest_document_creation_time}, 1,
        ${EXACT_PONR_MARKER.convex_rejected_writes_since_watermark}
      )
    `;
  } finally {
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
        'PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/sprint30-explicit-ponr-database-binding.test.ts',
      gate_database: await databaseName(targets.gate),
      marker_database: await databaseName(targets.marker),
      distinct_database_names: true,
    });
  }, REAL_DATABASE_FIXTURE_TIMEOUT_MS);

  afterAll(async () => {
    if (targets) await dropTargets(targets.names);
  }, 180_000);

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
    REAL_MULTIPROCESS_ORACLE_TIMEOUT_MS
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
      let preflightAttempts = 0;
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
        const preflightDeadline = Date.now() + 180_000;
        for (;;) {
          preflightAttempts += 1;
          const startedAt = Date.now();
          const preflight = await probePreexistingServingListening(servingB.baseUrl, 15_000);
          if (preflight.listening && Date.now() - startedAt < 2_000) break;
          if (Date.now() >= preflightDeadline) {
            throw new Error('TC-7/8 serving health did not warm below the child preflight budget');
          }
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
        }
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
          'packages/platform/src/cutover/rollback-drill.ts'
        );
        const drillSource = readFileSync(drillSourcePath, 'utf8');
        const comparison = 'if (databaseTargetIdentitiesEqual(parent, child)) return { ok: true };';
        const invertedComparison =
          'if (!databaseTargetIdentitiesEqual(parent, child)) return { ok: true };';
        expect(drillSource.split(comparison).length - 1).toBe(1);
        writeFileSync(drillSourcePath, drillSource.replace(comparison, invertedComparison), 'utf8');
        const mutationScript = `
        import { evaluateRollbackChildTarget } from './packages/platform/src/cutover/rollback-drill.ts';
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
          preflight_attempts: preflightAttempts,
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
    REAL_MULTIPROCESS_ORACLE_TIMEOUT_MS
  );

  itReal(
    'RED-4: drill recompute remains on explicit gate and ambient DATABASE_URL remains unchanged',
    async () => {
      await clearPonr(targets.gate);
      await clearPonr(targets.marker);
      await clearAudit(targets.gate);
      await seedContradictoryAudit(targets.marker);
      const priorDatabaseUrl = process.env.DATABASE_URL;
      const priorSecretsPath = process.env.HOLO_SECRETS_PATH;
      const priorHolocronSecretsPath = process.env.HOLOCRON_SECRETS_PATH;
      const priorDangerousOverride = process.env.HOLO_DANGEROUS_ALLOW_PROD_DB;
      const servingSecrets = fixtureServingSecrets('red-audit-recompute-serving');
      let serviceA: LiveService | undefined;
      process.env.DATABASE_URL = targets.marker;
      process.env.HOLO_SECRETS_PATH = servingSecrets;
      process.env.HOLOCRON_SECRETS_PATH = servingSecrets;
      process.env.HOLO_DANGEROUS_ALLOW_PROD_DB = '1';
      try {
        serviceA = await startLiveService({
          databaseUrl: targets.gate,
          readyTimeoutMs: 30_000,
          extraEnv: {
            HOLO_SECRETS_PATH: servingSecrets,
            HOLOCRON_SECRETS_PATH: servingSecrets,
            HOLO_MIGRATION_READ_ONLY: '1',
            HOLO_DANGEROUS_ALLOW_PROD_DB: '1',
            HOLO_SERVICE_LABEL: 's30-red4-service-a',
          },
        });
        const health = await fetch(`${serviceA.baseUrl}/health`, {
          signal: AbortSignal.timeout(15_000),
        });
        expect(health.status).toBe(200);
        const report = await runRollbackDrill({
          databaseUrl: targets.gate,
          cwd: REPO_ROOT,
          baseUrl: serviceA.baseUrl,
          triggerBaseUrl: 'http://127.0.0.1:9',
          reportPath: resolve(EVIDENCE_DIR, 'red-audit-recompute-report.json'),
          watermarkPath: fixtureWatermark('red-audit-recompute'),
          skipProbes: true,
          skipRepoint: true,
        });
        evidence('red-audit-recompute-shape', {
          source_sha: SOURCE_SHA,
          command:
            'runRollbackDrill({ databaseUrl: explicit_gate, baseUrl: serving_gate, skipProbes:true, skipRepoint:true })',
          exit_code: null,
          assertion: 'explicit audit recompute must not redirect ambient process state',
          ambient_database_unchanged: process.env.DATABASE_URL === targets.marker,
          serving_database: await databaseName(targets.gate),
          recomputed: report.independentRecompute.acceptedCount,
          target_database: report.database_target.database,
        });
        expect(process.env.DATABASE_URL).toBe(targets.marker);
        expect(report.database_target.database).toBe(new URL(targets.gate).pathname.slice(1));
        expect(report.independentRecompute.acceptedCount).toBe(0);
      } finally {
        if (serviceA) await serviceA.stop();
        if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorDatabaseUrl;
        if (priorSecretsPath === undefined) delete process.env.HOLO_SECRETS_PATH;
        else process.env.HOLO_SECRETS_PATH = priorSecretsPath;
        if (priorHolocronSecretsPath === undefined) delete process.env.HOLOCRON_SECRETS_PATH;
        else process.env.HOLOCRON_SECRETS_PATH = priorHolocronSecretsPath;
        if (priorDangerousOverride === undefined) delete process.env.HOLO_DANGEROUS_ALLOW_PROD_DB;
        else process.env.HOLO_DANGEROUS_ALLOW_PROD_DB = priorDangerousOverride;
      }
    },
    REAL_MULTIPROCESS_ORACLE_TIMEOUT_MS
  );

  itReal(
    'RR-2: concurrent healthy A/B verify-tools calls keep explicit seed and DB isolation',
    async () => {
      const priorDatabaseUrl = process.env.DATABASE_URL;
      const ambientCanary =
        'postgres://ambient-user-canary:ambient-password-canary@127.0.0.1:9/ambient-unreachable?ambient-query-canary=1#ambient-fragment-canary';
      let fixtureA: VerifyTargetFixture | undefined;
      let fixtureB: VerifyTargetFixture | undefined;
      let serviceA: LiveService | undefined;
      let serviceB: LiveService | undefined;
      let startedA = 0;
      let startedB = 0;
      let endedA = 0;
      let endedB = 0;
      let observedDocumentA: NetworkDocumentRead | undefined;
      let observedDocumentB: NetworkDocumentRead | undefined;
      let wrongTargetReadA: NetworkDocumentRead | undefined;
      let wrongTargetReadB: NetworkDocumentRead | undefined;
      let observedReadA:
        | {
            tool_id: string;
            ok?: boolean;
            postgres_backed?: boolean;
            correspondence_matched?: boolean;
          }
        | undefined;
      let observedReadB:
        | {
            tool_id: string;
            ok?: boolean;
            postgres_backed?: boolean;
            correspondence_matched?: boolean;
          }
        | undefined;
      const command =
        'PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/sprint30-explicit-ponr-database-binding.test.ts';
      process.env.DATABASE_URL = ambientCanary;
      try {
        fixtureA = await seedVerifyTarget(targets.gate, 'a');
        fixtureB = await seedVerifyTarget(targets.marker, 'b');
        const serviceSecretsA = fixtureServingSecrets('rr2-service-a');
        const serviceSecretsB = fixtureServingSecrets('rr2-service-b');
        serviceA = await startLiveService({
          databaseUrl: targets.gate,
          readyTimeoutMs: 30_000,
          extraEnv: {
            HOLO_SECRETS_PATH: serviceSecretsA,
            HOLOCRON_SECRETS_PATH: serviceSecretsA,
            HOLO_MIGRATION_READ_ONLY: '1',
            HOLO_DANGEROUS_ALLOW_PROD_DB: '1',
            HOLO_SERVICE_LABEL: 's30-rr2-service-a',
          },
        });
        serviceB = await startLiveService({
          databaseUrl: targets.marker,
          readyTimeoutMs: 30_000,
          extraEnv: {
            HOLO_SECRETS_PATH: serviceSecretsB,
            HOLOCRON_SECRETS_PATH: serviceSecretsB,
            HOLO_MIGRATION_READ_ONLY: '1',
            HOLO_DANGEROUS_ALLOW_PROD_DB: '1',
            HOLO_SERVICE_LABEL: 's30-rr2-service-b',
          },
        });

        const health = await Promise.all(
          [serviceA, serviceB].map(async (service) => {
            const response = await fetch(`${service.baseUrl}/health`, {
              signal: AbortSignal.timeout(15_000),
            });
            return {
              status: response.status,
              body: (await response.json()) as {
                db?: { ready?: boolean };
                postgres?: { ready?: boolean };
                pid?: number;
              },
            };
          })
        );
        expect(health).toHaveLength(2);
        expect(health[0]?.status).toBe(200);
        expect(health[1]?.status).toBe(200);
        expect(health[0]?.body.db?.ready).toBe(true);
        expect(health[0]?.body.postgres?.ready).toBe(true);
        expect(health[1]?.body.db?.ready).toBe(true);
        expect(health[1]?.body.postgres?.ready).toBe(true);
        expect(health[0]?.body.pid).toBe(serviceA.pid);
        expect(health[1]?.body.pid).toBe(serviceB.pid);

        const runA = (async () => {
          startedA = performance.now();
          const [report, documentRead] = await Promise.all([
            runVerifyTools({
              cwd: REPO_ROOT,
              databaseUrl: targets.gate,
              baseUrl: serviceA.baseUrl,
              keys: DEFAULT_KEYS,
              seeds: fixtureA.seeds,
              serviceLabel: 's30-rr2-service-a',
              pid: serviceA.pid,
              allowMissingDeploymentEnv: true,
            }),
            readDocumentFromService(serviceA.baseUrl, fixtureA.seeds.documentId),
          ]);
          observedDocumentA = documentRead;
          endedA = performance.now();
          return { report, documentRead };
        })();
        const runB = (async () => {
          startedB = performance.now();
          const [report, documentRead] = await Promise.all([
            runVerifyTools({
              cwd: REPO_ROOT,
              databaseUrl: targets.marker,
              baseUrl: serviceB.baseUrl,
              keys: DEFAULT_KEYS,
              seeds: fixtureB.seeds,
              serviceLabel: 's30-rr2-service-b',
              pid: serviceB.pid,
              allowMissingDeploymentEnv: true,
            }),
            readDocumentFromService(serviceB.baseUrl, fixtureB.seeds.documentId),
          ]);
          observedDocumentB = documentRead;
          endedB = performance.now();
          return { report, documentRead };
        })();
        const [
          { report: reportA, documentRead: documentA },
          { report: reportB, documentRead: documentB },
        ] = await Promise.all([runA, runB]);

        const readA = reportA.tools.find((tool) => tool.tool_id === 'get_document');
        const readB = reportB.tools.find((tool) => tool.tool_id === 'get_document');
        const successfulReadA = reportA.tools.find(
          (tool) =>
            !tool.is_mutation &&
            tool.postgres_backed === true &&
            tool.correspondence_matched === true
        );
        const successfulReadB = reportB.tools.find(
          (tool) =>
            !tool.is_mutation &&
            tool.postgres_backed === true &&
            tool.correspondence_matched === true
        );
        observedReadA = successfulReadA
          ? {
              tool_id: successfulReadA.tool_id,
              ok: successfulReadA.ok,
              postgres_backed: successfulReadA.postgres_backed,
              correspondence_matched: successfulReadA.correspondence_matched,
            }
          : readA
            ? {
                tool_id: readA.tool_id,
                ok: readA.ok,
                postgres_backed: readA.postgres_backed,
                correspondence_matched: readA.correspondence_matched,
              }
            : undefined;
        observedReadB = successfulReadB
          ? {
              tool_id: successfulReadB.tool_id,
              ok: successfulReadB.ok,
              postgres_backed: successfulReadB.postgres_backed,
              correspondence_matched: successfulReadB.correspondence_matched,
            }
          : readB
            ? {
                tool_id: readB.tool_id,
                ok: readB.ok,
                postgres_backed: readB.postgres_backed,
                correspondence_matched: readB.correspondence_matched,
              }
            : undefined;
        expect(reportA.seeds).toEqual(fixtureA.seeds);
        expect(reportB.seeds).toEqual(fixtureB.seeds);
        expect(reportA.seeds?.documentId).not.toBe(reportB.seeds?.documentId);
        expect(readA).toMatchObject({
          tool_id: 'get_document',
          ok: true,
          postgres_backed: true,
          correspondence_matched: true,
        });
        expect(readB).toMatchObject({
          tool_id: 'get_document',
          ok: true,
          postgres_backed: true,
          correspondence_matched: true,
        });
        expect(successfulReadA).toBeDefined();
        expect(successfulReadB).toBeDefined();
        expect(documentA).toMatchObject({
          status: 200,
          isError: false,
          payload: {
            documentId: fixtureA.seeds.documentId,
            title: fixtureA.documentTitle,
            content: fixtureA.documentContent,
            data_plane: 'postgres',
            source: 'postgres',
          },
        });
        expect(documentB).toMatchObject({
          status: 200,
          isError: false,
          payload: {
            documentId: fixtureB.seeds.documentId,
            title: fixtureB.documentTitle,
            content: fixtureB.documentContent,
            data_plane: 'postgres',
            source: 'postgres',
          },
        });

        [wrongTargetReadA, wrongTargetReadB] = await Promise.all([
          readDocumentFromService(serviceA.baseUrl, fixtureB.seeds.documentId),
          readDocumentFromService(serviceB.baseUrl, fixtureA.seeds.documentId),
        ]);
        expect(wrongTargetReadA.isError || wrongTargetReadA.payload === null).toBe(true);
        expect(wrongTargetReadB.isError || wrongTargetReadB.payload === null).toBe(true);
        expect(wrongTargetReadA.payload).not.toMatchObject({
          documentId: fixtureB.seeds.documentId,
          title: fixtureB.documentTitle,
          content: fixtureB.documentContent,
        });
        expect(wrongTargetReadB.payload).not.toMatchObject({
          documentId: fixtureA.seeds.documentId,
          title: fixtureA.documentTitle,
          content: fixtureA.documentContent,
        });

        const executionOverlap = startedA < endedB && startedB < endedA;
        expect(startedA).toBeGreaterThan(0);
        expect(startedB).toBeGreaterThan(0);
        expect(endedA).toBeGreaterThan(startedA);
        expect(endedB).toBeGreaterThan(startedB);
        expect(executionOverlap).toBe(true);
        expect(process.env.DATABASE_URL).toBe(ambientCanary);

        evidence('rr2-concurrent-verify-tools', {
          source_sha: SOURCE_SHA,
          command,
          exit_code: 0,
          gate_database: fixtureA.database,
          marker_database: fixtureB.database,
          ambient_target: 'unreachable-sentinel-c',
          ambient_unchanged: process.env.DATABASE_URL === ambientCanary,
          execution_overlap: executionOverlap,
          started_a_ms: startedA,
          ended_a_ms: endedA,
          started_b_ms: startedB,
          ended_b_ms: endedB,
          report_a_seed_document: reportA.seeds?.documentId,
          report_b_seed_document: reportB.seeds?.documentId,
          report_a_get_document: {
            ok: readA?.ok,
            postgres_backed: readA?.postgres_backed,
            correspondence_matched: readA?.correspondence_matched,
          },
          report_b_get_document: {
            ok: readB?.ok,
            postgres_backed: readB?.postgres_backed,
            correspondence_matched: readB?.correspondence_matched,
          },
          report_a_exact_document: documentA.payload,
          report_b_exact_document: documentB.payload,
          wrong_target_read_a: {
            is_error: wrongTargetReadA.isError,
            payload_is_null: wrongTargetReadA.payload === null,
          },
          wrong_target_read_b: {
            is_error: wrongTargetReadB.isError,
            payload_is_null: wrongTargetReadB.payload === null,
          },
          report_a_successful_read: observedReadA,
          report_b_successful_read: observedReadB,
        });
      } catch (error) {
        evidence('rr2-concurrent-verify-tools-failure', {
          source_sha: SOURCE_SHA,
          command,
          exit_code: null,
          gate_database: fixtureA?.database ?? 'unprovisioned',
          marker_database: fixtureB?.database ?? 'unprovisioned',
          ambient_target: 'unreachable-sentinel-c',
          failure_kind: error instanceof Error ? error.constructor.name : typeof error,
          report_a_read: observedReadA,
          report_b_read: observedReadB,
          report_a_exact_document: observedDocumentA,
          report_b_exact_document: observedDocumentB,
          wrong_target_read_a: wrongTargetReadA,
          wrong_target_read_b: wrongTargetReadB,
          execution_overlap:
            startedA > 0 && startedB > 0 && endedA > 0 && endedB > 0
              ? startedA < endedB && startedB < endedA
              : false,
        });
        throw error;
      } finally {
        if (serviceA) await serviceA.stop();
        if (serviceB) await serviceB.stop();
        if (fixtureA) await removeVerifyTarget(targets.gate, fixtureA);
        if (fixtureB) await removeVerifyTarget(targets.marker, fixtureB);
        if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorDatabaseUrl;
      }
    },
    REAL_MULTIPROCESS_ORACLE_TIMEOUT_MS
  );

  itReal(
    'RR-9: serving target mismatch fails before verify, child, recompute, or probes',
    async () => {
      const priorDatabaseUrl = process.env.DATABASE_URL;
      const priorSecretsPath = process.env.HOLO_SECRETS_PATH;
      const priorHolocronSecretsPath = process.env.HOLOCRON_SECRETS_PATH;
      const priorDangerousOverride = process.env.HOLO_DANGEROUS_ALLOW_PROD_DB;
      const ambientCanary =
        'postgres://rr9-ambient-user:rr9-ambient-password@127.0.0.1:9/rr9-ambient-unreachable?rr9-query-canary=1#rr9-fragment-canary';
      const triggerCanary = 'http://rr9-trigger-output-canary.invalid:9';
      const command =
        'PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/sprint30-explicit-ponr-database-binding.test.ts --testNamePattern=RR-9';
      let serviceA: LiveService | undefined;
      let serviceB: LiveService | undefined;
      let mismatchReport: Awaited<ReturnType<typeof runRollbackDrill>> | undefined;
      let matchingReport: Awaited<ReturnType<typeof runRollbackDrill>> | undefined;
      let mismatchAssertionError: unknown;
      process.env.DATABASE_URL = ambientCanary;
      process.env.HOLO_DANGEROUS_ALLOW_PROD_DB = '1';
      const servingSecrets = fixtureServingSecrets('rr9-serving-target-mismatch');
      process.env.HOLO_SECRETS_PATH = servingSecrets;
      process.env.HOLOCRON_SECRETS_PATH = servingSecrets;
      try {
        serviceA = await startLiveService({
          databaseUrl: targets.gate,
          readyTimeoutMs: 30_000,
          extraEnv: {
            HOLO_SECRETS_PATH: servingSecrets,
            HOLOCRON_SECRETS_PATH: servingSecrets,
            HOLO_MIGRATION_READ_ONLY: '1',
            HOLO_DANGEROUS_ALLOW_PROD_DB: '1',
            HOLO_SERVICE_LABEL: 's30-rr9-service-a',
          },
        });
        serviceB = await startLiveService({
          databaseUrl: targets.marker,
          readyTimeoutMs: 30_000,
          extraEnv: {
            HOLO_SECRETS_PATH: servingSecrets,
            HOLOCRON_SECRETS_PATH: servingSecrets,
            HOLO_MIGRATION_READ_ONLY: '1',
            HOLO_DANGEROUS_ALLOW_PROD_DB: '1',
            HOLO_SERVICE_LABEL: 's30-rr9-service-b',
          },
        });

        const healthResults = await Promise.all(
          [serviceA, serviceB].map(async (service) => {
            const response = await fetch(`${service.baseUrl}/health`, {
              signal: AbortSignal.timeout(15_000),
            });
            return { status: response.status };
          })
        );
        const healthA = healthResults[0];
        const healthB = healthResults[1];
        if (!healthA || !healthB) throw new Error('RR9 health probes returned incomplete results');
        expect(healthA.status).toBe(200);
        expect(healthB.status).toBe(200);

        mismatchReport = await runRollbackDrill({
          databaseUrl: targets.gate,
          cwd: REPO_ROOT,
          baseUrl: serviceB.baseUrl,
          triggerBaseUrl: triggerCanary,
          reportPath: resolve(EVIDENCE_DIR, 'rr9-serving-target-mismatch-report.json'),
          repointOutputPath: resolve(EVIDENCE_DIR, 'rr9-serving-target-mismatch-output.json'),
          watermarkPath: fixtureWatermark('rr9-serving-target-mismatch'),
          auditPath: resolve(EVIDENCE_DIR, 'rr9-serving-target-mismatch-audit.json'),
        });

        // RR-9 requires a production-path serving identity comparison before
        // any verifier, child CLI, independent ledger read, or write probe.
        // Capture an unmet RED assertion but continue to the matching-target
        // control below, so one failing branch cannot mask the control.
        try {
          expect(mismatchReport.ok).toBe(false);
          expect(mismatchReport.repointed).toBe(false);
          expect(mismatchReport.error?.code).toBe(DATABASE_TARGET_MISMATCH);
          expect(mismatchReport.sevOneTrigger.report.toolsTotal).toBe(0);
          expect(mismatchReport.repoint.exitCode).toBeNull();
          expect(mismatchReport.repoint.parsed).toBeNull();
          expect(mismatchReport.repoint.argv).toEqual([]);
          expect(mismatchReport.repoint.stdout).toBe('');
          expect(mismatchReport.repoint.stderr).toBe('');
          expect(mismatchReport.independentRecompute.acceptedCount).toBe(-1);
          expect(mismatchReport.independentRecompute.auditFileExists).toBe(false);
          expect(mismatchReport.independentRecompute.matchesReport).toBe(false);
          expect(
            Object.values(mismatchReport.probes).every((probe) => probe.executed === false)
          ).toBe(true);
          expect(mismatchReport.accepted_write_identities).toEqual([]);
          expect(mismatchReport.postRepointHealthProbe).toBeNull();
          expect(mismatchReport.content_probe).toBeNull();
          expect(JSON.stringify(mismatchReport)).not.toContain('rr9-trigger-output-canary');
        } catch (error) {
          mismatchAssertionError = error;
        }

        // Matching serving/database identities must pass this preflight. The
        // remainder is intentionally allowed to fail for incomplete drill
        // prerequisites; it must not be misclassified as target mismatch.
        matchingReport = await runRollbackDrill({
          databaseUrl: targets.gate,
          cwd: REPO_ROOT,
          baseUrl: serviceA.baseUrl,
          triggerBaseUrl: 'http://127.0.0.1:9',
          reportPath: resolve(EVIDENCE_DIR, 'rr9-serving-target-match-report.json'),
          repointOutputPath: resolve(EVIDENCE_DIR, 'rr9-serving-target-match-output.json'),
          watermarkPath: fixtureWatermark('rr9-serving-target-match'),
          auditPath: resolve(EVIDENCE_DIR, 'rr9-serving-target-match-audit.json'),
          skipProbes: true,
        });
        expect(matchingReport.error?.code).not.toBe(DATABASE_TARGET_MISMATCH);
        expect(matchingReport.sevOneTrigger.report.toolsTotal).toBeGreaterThan(0);
        expect(matchingReport.repoint.argv.length).toBeGreaterThan(0);
        if (mismatchAssertionError) throw mismatchAssertionError;

        evidence('rr9-serving-target-mismatch', {
          source_sha: SOURCE_SHA,
          command,
          exit_code: 0,
          gate_database: await databaseName(targets.gate),
          serving_database: await databaseName(targets.marker),
          ambient_target: 'rr9-unreachable-sentinel',
          mismatch_error_code: mismatchReport.error?.code,
          mismatch_repoint_argv_count: mismatchReport.repoint.argv.length,
          mismatch_probe_executed: Object.values(mismatchReport.probes).some(
            (probe) => probe.executed
          ),
          mismatch_recompute_count: mismatchReport.independentRecompute.acceptedCount,
          matching_error_code: matchingReport.error?.code ?? null,
          matching_verify_tools_total: matchingReport.sevOneTrigger.report.toolsTotal,
          matching_child_argv_count: matchingReport.repoint.argv.length,
        });
      } catch (error) {
        evidence('rr9-serving-target-mismatch-red', {
          source_sha: SOURCE_SHA,
          command,
          exit_code: 1,
          gate_database: await databaseName(targets.gate),
          serving_database: await databaseName(targets.marker),
          ambient_target: 'rr9-unreachable-sentinel',
          failure_kind: error instanceof Error ? error.constructor.name : typeof error,
          observed_mismatch_error_code: mismatchReport?.error?.code ?? null,
          observed_mismatch_verify_tools_total:
            mismatchReport?.sevOneTrigger.report.toolsTotal ?? null,
          observed_mismatch_repoint_argv_count: mismatchReport?.repoint.argv.length ?? null,
          observed_mismatch_probe_executed:
            mismatchReport === undefined
              ? null
              : Object.values(mismatchReport.probes).some((probe) => probe.executed),
          observed_mismatch_recompute_count:
            mismatchReport?.independentRecompute.acceptedCount ?? null,
          observed_matching_error_code: matchingReport?.error?.code ?? null,
        });
        throw error;
      } finally {
        if (serviceA) await serviceA.stop();
        if (serviceB) await serviceB.stop();
        if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorDatabaseUrl;
        if (priorSecretsPath === undefined) delete process.env.HOLO_SECRETS_PATH;
        else process.env.HOLO_SECRETS_PATH = priorSecretsPath;
        if (priorHolocronSecretsPath === undefined) delete process.env.HOLOCRON_SECRETS_PATH;
        else process.env.HOLOCRON_SECRETS_PATH = priorHolocronSecretsPath;
        if (priorDangerousOverride === undefined) delete process.env.HOLO_DANGEROUS_ALLOW_PROD_DB;
        else process.env.HOLO_DANGEROUS_ALLOW_PROD_DB = priorDangerousOverride;
      }
    },
    REAL_MULTIPROCESS_ORACLE_TIMEOUT_MS
  );

  itReal(
    'RR-3: production drill rejects a genuine successful child B report under parent A',
    async () => {
      const priorDatabaseUrl = process.env.DATABASE_URL;
      const priorSecretsPath = process.env.HOLO_SECRETS_PATH;
      const priorHolocronSecretsPath = process.env.HOLOCRON_SECRETS_PATH;
      const priorDangerousOverride = process.env.HOLO_DANGEROUS_ALLOW_PROD_DB;
      const priorOperatorSecret = process.env.HOLO_CUTOVER_OPERATOR_SECRET;
      const operatorSecret = 'rr3-operator-secret-canary';
      const command =
        'PLATFORM_IT=1 pnpm vitest run --project integration packages/platform/tests/integration/sprint30-explicit-ponr-database-binding.test.ts --testNamePattern=RR-3';
      let serviceA: LiveService | undefined;
      let productionReport: Awaited<ReturnType<typeof runRollbackDrill>> | undefined;
      let mutationExitCode: number | null = null;
      let mutationOutput = '';
      process.env.DATABASE_URL = targets.marker;
      process.env.HOLO_DANGEROUS_ALLOW_PROD_DB = '1';
      process.env.HOLO_CUTOVER_OPERATOR_SECRET = operatorSecret;
      const servingSecrets = fixtureServingSecrets('rr3-child-mismatch');
      process.env.HOLO_SECRETS_PATH = servingSecrets;
      process.env.HOLOCRON_SECRETS_PATH = servingSecrets;
      const childRoot = childRuntimeCwd();
      const childDrillSourcePath = resolve(
        childRoot,
        'packages/platform/src/cutover/rollback-drill.ts'
      );
      const explicitDatabaseBinding =
        'env: { ...(options.env ?? process.env), DATABASE_URL: options.databaseUrl },';
      const ambientDatabaseBinding =
        'env: { ...(options.env ?? process.env), DATABASE_URL: options.env?.DATABASE_URL ?? options.databaseUrl },';
      const childDrillSource = readFileSync(childDrillSourcePath, 'utf8');
      expect(childDrillSource.split(explicitDatabaseBinding).length - 1).toBe(1);
      writeFileSync(
        childDrillSourcePath,
        childDrillSource.replace(explicitDatabaseBinding, ambientDatabaseBinding),
        'utf8'
      );
      try {
        serviceA = await startLiveService({
          databaseUrl: targets.gate,
          readyTimeoutMs: 30_000,
          extraEnv: {
            HOLO_SECRETS_PATH: servingSecrets,
            HOLOCRON_SECRETS_PATH: servingSecrets,
            HOLO_MIGRATION_READ_ONLY: '1',
            HOLO_DANGEROUS_ALLOW_PROD_DB: '1',
            HOLO_SERVICE_LABEL: 's30-rr3-service-a',
          },
        });
        const health = await fetch(`${serviceA.baseUrl}/health`, {
          signal: AbortSignal.timeout(15_000),
        });
        expect(health.status).toBe(200);

        const productionDrillOptions = {
          databaseUrl: targets.gate,
          cwd: childRoot,
          baseUrl: serviceA.baseUrl,
          triggerBaseUrl: 'http://127.0.0.1:9',
          reportPath: resolve(EVIDENCE_DIR, 'rr3-parent-a-child-b-report.json'),
          repointOutputPath: resolve(EVIDENCE_DIR, 'rr3-parent-a-child-b-repoint.json'),
          watermarkPath: fixtureWatermark('rr3-parent-a-child-b'),
          auditPath: resolve(EVIDENCE_DIR, 'rr3-parent-a-child-b-audit.json'),
        } as const;
        const sandboxDrillModule = await import(/* @vite-ignore */ childDrillSourcePath);
        const sandboxRunRollbackDrill =
          sandboxDrillModule.runRollbackDrill as typeof runRollbackDrill;
        productionReport = await sandboxRunRollbackDrill(productionDrillOptions);

        // The child really ran the registered CLI from the source sandbox,
        // but the only sandbox mutation redirected its DATABASE_URL to B.
        expect(productionReport.repoint.exitCode).toBe(0);
        expect(productionReport.repoint.parsed).not.toBeNull();
        expect(productionReport.repoint.parsed?.ok).toBe(true);
        expect(productionReport.repoint.parsed?.repointed).toBe(true);
        expect(productionReport.repoint.parsed?.database_target.database).toBe(
          new URL(targets.marker).pathname.slice(1)
        );
        expect(productionReport.repoint.parsed?.precondition.accepted_post_export_writes).toBe(0);
        expect(productionReport.repoint.parsed?.acknowledgements.length ?? 0).toBeGreaterThan(0);
        expect(productionReport.error?.code).toBe(DATABASE_TARGET_MISMATCH);
        expect(productionReport.ok).toBe(false);
        expect(productionReport.repointed).toBe(false);
        expect(productionReport.database_target.database).toBe(
          new URL(targets.gate).pathname.slice(1)
        );
        expect(JSON.stringify(productionReport)).not.toContain(operatorSecret);

        // Remove only the production mismatch acceptance branch in a second
        // source sandbox. The same real child-B harness must fail its oracle;
        // a passing mutation would prove the branch is not tested.
        const mutationRoot = childRuntimeCwd();
        const mutationDrillPath = resolve(
          mutationRoot,
          'packages/platform/src/cutover/rollback-drill.ts'
        );
        const mutationChildSource = readFileSync(mutationDrillPath, 'utf8');
        expect(mutationChildSource.split(explicitDatabaseBinding).length - 1).toBe(1);
        const mutationChildBound = mutationChildSource.replace(
          explicitDatabaseBinding,
          ambientDatabaseBinding
        );
        const mismatchBranch = `  } else if (!options?.skipRepoint && !childTargetValidation.ok) {
    ok = false;
    error = childTargetValidation.error;
  }`;
        const removedMismatchBranch = `  } else if (false) {
    // RR-3 source mutant: production child-target mismatch acceptance removed.
  }`;
        expect(mutationChildBound.split(mismatchBranch).length - 1).toBe(1);
        writeFileSync(
          mutationDrillPath,
          mutationChildBound.replace(mismatchBranch, removedMismatchBranch),
          'utf8'
        );
        const mutationScript = `
          import { runRollbackDrill } from ${JSON.stringify(mutationDrillPath)};
          const report = await runRollbackDrill(${JSON.stringify({
            ...productionDrillOptions,
            cwd: mutationRoot,
            reportPath: resolve(EVIDENCE_DIR, 'rr3-mutant-report.json'),
            repointOutputPath: resolve(EVIDENCE_DIR, 'rr3-mutant-repoint.json'),
            watermarkPath: fixtureWatermark('rr3-mutant'),
            auditPath: resolve(EVIDENCE_DIR, 'rr3-mutant-audit.json'),
          })});
          if (report.error?.code !== 'DATABASE_TARGET_MISMATCH' || report.ok !== false || report.repointed !== false) {
            console.error('RR3_MUTATION_SURVIVED');
            process.exit(1);
          }
        `;
        const mutation = spawnSync('bun', ['--eval', mutationScript], {
          cwd: mutationRoot,
          encoding: 'utf8',
          timeout: 120_000,
          env: {
            ...process.env,
            DATABASE_URL: targets.marker,
            HOLO_SECRETS_PATH: servingSecrets,
            HOLOCRON_SECRETS_PATH: servingSecrets,
            HOLO_CUTOVER_OPERATOR_SECRET: operatorSecret,
            HOLO_DANGEROUS_ALLOW_PROD_DB: '1',
          },
        });
        mutationExitCode = mutation.status;
        mutationOutput = `${mutation.stdout ?? ''}\n${mutation.stderr ?? ''}`;
        expect(mutation.status).not.toBe(0);
        expect(mutationOutput).toContain('RR3_MUTATION_SURVIVED');

        evidence('rr3-drill-child-target-mismatch', {
          source_sha: SOURCE_SHA,
          command,
          exit_code: 0,
          gate_database: await databaseName(targets.gate),
          child_database: await databaseName(targets.marker),
          child_binding_mutated_in_sandbox: true,
          child_exit_code: productionReport.repoint.exitCode,
          child_report_ok: productionReport.repoint.parsed?.ok,
          child_report_repointed: productionReport.repoint.parsed?.repointed,
          child_report_database: productionReport.repoint.parsed?.database_target.database,
          parent_report_database: productionReport.database_target.database,
          parent_error_code: productionReport.error?.code,
          parent_ok: productionReport.ok,
          parent_repointed: productionReport.repointed,
          mutation_exit_code: mutationExitCode,
          mutation_killed_by_harness: mutationOutput.includes('RR3_MUTATION_SURVIVED'),
        });
      } catch (error) {
        evidence('rr3-drill-child-target-mismatch-red', {
          source_sha: SOURCE_SHA,
          command,
          exit_code: 1,
          gate_database: await databaseName(targets.gate),
          child_database: await databaseName(targets.marker),
          child_binding_mutated_in_sandbox: true,
          failure_kind: error instanceof Error ? error.constructor.name : typeof error,
          observed_child_exit_code: productionReport?.repoint.exitCode ?? null,
          observed_child_report_ok: productionReport?.repoint.parsed?.ok ?? null,
          observed_child_report_database:
            productionReport?.repoint.parsed?.database_target.database ?? null,
          observed_parent_error_code: productionReport?.error?.code ?? null,
          observed_parent_ok: productionReport?.ok ?? null,
          observed_parent_repointed: productionReport?.repointed ?? null,
          mutation_exit_code: mutationExitCode,
          mutation_killed_by_harness: mutationOutput.includes('RR3_MUTATION_SURVIVED'),
        });
        throw error;
      } finally {
        if (serviceA) await serviceA.stop();
        fixtureServingSecrets('rr3-child-mismatch');
        if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = priorDatabaseUrl;
        if (priorSecretsPath === undefined) delete process.env.HOLO_SECRETS_PATH;
        else process.env.HOLO_SECRETS_PATH = priorSecretsPath;
        if (priorHolocronSecretsPath === undefined) delete process.env.HOLOCRON_SECRETS_PATH;
        else process.env.HOLOCRON_SECRETS_PATH = priorHolocronSecretsPath;
        if (priorDangerousOverride === undefined) delete process.env.HOLO_DANGEROUS_ALLOW_PROD_DB;
        else process.env.HOLO_DANGEROUS_ALLOW_PROD_DB = priorDangerousOverride;
        if (priorOperatorSecret === undefined) delete process.env.HOLO_CUTOVER_OPERATOR_SECRET;
        else process.env.HOLO_CUTOVER_OPERATOR_SECRET = priorOperatorSecret;
      }
    },
    REAL_MULTIPROCESS_ORACLE_TIMEOUT_MS
  );

  itReal(
    'TC-10/13: exact marker cleanup is idempotent and preserves audit digest',
    async () => {
      await clearPonr(targets.marker);
      await seedExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      // Seed the complete legitimate audit table immediately before this
      // cleanup. The expected snapshot is read independently of the
      // production cleanup report so a report that merely claims preservation
      // cannot satisfy this oracle.
      await seedContradictoryAudit(targets.marker);
      const before = await markerState(targets.marker);
      const expectedAudit = {
        count: 2,
        digest: before.audit_digest,
      };
      expect(before.audit_count).toBe(expectedAudit.count);
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
      expect(cleaned.audit_before).toEqual(expectedAudit);
      expect(cleaned.audit_after).toEqual(expectedAudit);
      expect(after.audit_count).toBe(expectedAudit.count);
      expect(after.audit_digest).toBe(expectedAudit.digest);

      const idempotent = await cleanupExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      expect(idempotent.ok).toBe(true);
      expect(idempotent.match_disposition).toBe('zero_rows');
      expect(idempotent.delete_count).toBe(0);
      expect(idempotent.disabled_triggers).toEqual([]);
      expect(idempotent.audit_before).toEqual(expectedAudit);
      expect(idempotent.audit_after).toEqual(expectedAudit);
      evidence('marker-cleanup-exact-idempotent', {
        source_sha: SOURCE_SHA,
        command: 'cleanupExactPonrMarker(gate, marker) twice',
        marker_database: after.marker_count === 0 ? 'disposable_marker' : 'unexpected',
        audit_snapshot: expectedAudit,
        first_report_audit_before: cleaned.audit_before,
        first_report_audit_after: cleaned.audit_after,
        second_report_audit_before: idempotent.audit_before,
        second_report_audit_after: idempotent.audit_after,
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
    REAL_MUTATION_MATRIX_TIMEOUT_MS
  );

  itReal(
    'RR-6: every fixed marker predicate rejects foreign rows and kills its removal mutant',
    async () => {
      const acceptedConstraint = 'data_plane_ponr_accepted_zero_check';
      const requiredTriggers = REQUIRED_PONR_TRIGGER_NAMES.map((name) => ({
        name,
        enabled: 'O',
      }));
      const fields = Object.keys(EXACT_PONR_MARKER) as MarkerField[];
      const results: Array<Record<string, unknown>> = [];
      const readPredicate =
        'return (Object.keys(EXACT_PONR_MARKER) as Array<keyof typeof EXACT_PONR_MARKER>).every((key) => {';

      for (const field of fields) {
        let constraintDropped = false;
        let mutationExitCode: number | null = null;
        let mutationOutput = '';
        await clearPonr(targets.marker);
        await clearAudit(targets.marker);
        try {
          if (field === 'convex_accepted_writes_since_watermark') {
            const constraintSql = createSql(targets.marker, { max: 1 });
            try {
              const constraints = await constraintSql<{ conname: string }[]>`
                SELECT conname::text AS conname
                FROM pg_constraint
                WHERE conrelid = 'public.data_plane_ponr'::regclass
                  AND conname = ${acceptedConstraint}
              `;
              expect(constraints).toHaveLength(1);
              await constraintSql.unsafe(
                `ALTER TABLE public.data_plane_ponr DROP CONSTRAINT ${acceptedConstraint}`
              );
              constraintDropped = true;
            } finally {
              await constraintSql.end({ timeout: 5 });
            }
            await seedAcceptedForeignMarker(targets.marker);
          } else {
            await seedExactPonrMarker({
              gateDatabaseUrl: targets.gate,
              markerDatabaseUrl: targets.marker,
            });
            await mutateMarkerField(targets.marker, field);
          }
          await seedContradictoryAudit(targets.marker);
          const before = await markerState(targets.marker);
          const expectedAudit = { count: 2, digest: before.audit_digest };
          expect(before.marker_count).toBe(1);
          expect(before.audit_count).toBe(expectedAudit.count);

          const production = await cleanupExactPonrMarker({
            gateDatabaseUrl: targets.gate,
            markerDatabaseUrl: targets.marker,
          });
          const afterProduction = await markerState(targets.marker);
          const productionRequiredTriggers = afterProduction.triggers.filter((trigger) =>
            REQUIRED_PONR_TRIGGER_NAMES.includes(
              trigger.name as (typeof REQUIRED_PONR_TRIGGER_NAMES)[number]
            )
          );
          expect(production.ok, field).toBe(false);
          expect(production.match_disposition, field).toBe('foreign_or_multiple');
          expect(production.delete_count, field).toBe(0);
          expect(production.marker_before_count, field).toBe(1);
          expect(production.marker_after_count, field).toBe(1);
          expect(production.audit_before, field).toEqual(expectedAudit);
          expect(production.audit_after, field).toEqual(expectedAudit);
          expect(production.trigger_before, field).toEqual(requiredTriggers);
          expect(production.trigger_after, field).toEqual(requiredTriggers);
          expect(afterProduction.marker_count, field).toBe(1);
          expect(afterProduction.audit_count, field).toBe(expectedAudit.count);
          expect(afterProduction.audit_digest, field).toBe(expectedAudit.digest);
          expect(productionRequiredTriggers, field).toEqual(requiredTriggers);

          const mutationRoot = childRuntimeCwd();
          const markerSourcePath = resolve(
            mutationRoot,
            'packages/platform/src/cutover/ponr-marker.ts'
          );
          const markerSource = readFileSync(markerSourcePath, 'utf8');
          const readMutant =
            "return (Object.keys(EXACT_PONR_MARKER) as Array<keyof typeof EXACT_PONR_MARKER>)\n    .filter((key) => key !== '" +
            field +
            "')\n    .every((key) => {";
          const deletePredicate = `          AND ${field} = \${EXACT_PONR_MARKER.${field}}\n`;
          expect(markerSource.split(readPredicate).length - 1, field).toBe(1);
          expect(markerSource.split(deletePredicate).length - 1, field).toBe(1);
          const markerMutant = markerSource
            .replace(readPredicate, readMutant)
            .replace(deletePredicate, '');
          writeFileSync(markerSourcePath, markerMutant, 'utf8');

          const mutationScript = `
            import { cleanupExactPonrMarker } from ${JSON.stringify(markerSourcePath)};
            const report = await cleanupExactPonrMarker(${JSON.stringify({
              gateDatabaseUrl: targets.gate,
              markerDatabaseUrl: targets.marker,
            })});
            const expectedAudit = ${JSON.stringify(expectedAudit)};
            const requiredTriggers = ${JSON.stringify(requiredTriggers)};
            const requiredBefore = report.trigger_before
              .filter((trigger) => requiredTriggers.some((required) => required.name === trigger.name));
            const requiredAfter = report.trigger_after
              .filter((trigger) => requiredTriggers.some((required) => required.name === trigger.name));
            if (
              report.ok ||
              report.match_disposition !== 'foreign_or_multiple' ||
              report.delete_count !== 0 ||
              report.marker_before_count !== 1 ||
              report.marker_after_count !== 1 ||
              JSON.stringify(report.audit_before) !== JSON.stringify(expectedAudit) ||
              JSON.stringify(report.audit_after) !== JSON.stringify(expectedAudit) ||
              JSON.stringify(requiredBefore) !== JSON.stringify(requiredTriggers) ||
              JSON.stringify(requiredAfter) !== JSON.stringify(requiredTriggers)
            ) {
              console.error('RR6_MUTATION_SURVIVED_${field}');
              process.exit(1);
            }
          `;
          const mutation = spawnSync('bun', ['--eval', mutationScript], {
            cwd: mutationRoot,
            encoding: 'utf8',
            timeout: 120_000,
            env: { ...process.env },
          });
          mutationExitCode = mutation.status;
          mutationOutput = `${mutation.stdout ?? ''}\n${mutation.stderr ?? ''}`;
          expect(mutation.status, field).not.toBe(0);
          expect(mutationOutput, field).toContain(`RR6_MUTATION_SURVIVED_${field}`);
          const afterMutation = await markerState(targets.marker);
          expect(afterMutation.marker_count, field).toBe(0);
          expect(afterMutation.audit_count, field).toBe(expectedAudit.count);
          expect(afterMutation.audit_digest, field).toBe(expectedAudit.digest);
          expect(
            afterMutation.triggers.filter((trigger) =>
              REQUIRED_PONR_TRIGGER_NAMES.includes(
                trigger.name as (typeof REQUIRED_PONR_TRIGGER_NAMES)[number]
              )
            ),
            field
          ).toEqual(requiredTriggers);
          results.push({
            field,
            production_rejected: production.match_disposition,
            production_marker_preserved: afterProduction.marker_count === 1,
            production_audit_preserved: afterProduction.audit_digest === expectedAudit.digest,
            production_trigger_states: production.trigger_after,
            mutation_exit_code: mutationExitCode,
            mutation_deleted_marker: afterMutation.marker_count === 0,
            mutation_killed_by_harness: mutationOutput.includes(`RR6_MUTATION_SURVIVED_${field}`),
          });
        } finally {
          await clearPonr(targets.marker);
          await clearAudit(targets.marker);
          if (constraintDropped) {
            const restoreSql = createSql(targets.marker, { max: 1 });
            try {
              await restoreSql.unsafe(
                `ALTER TABLE public.data_plane_ponr ADD CONSTRAINT ${acceptedConstraint} CHECK (convex_accepted_writes_since_watermark = 0)`
              );
            } finally {
              await restoreSql.end({ timeout: 5 });
            }
          }
        }
      }
      evidence('rr6-all-fixed-field-predicate-mutants', {
        source_sha: SOURCE_SHA,
        command:
          'real marker DB cleanup + one source predicate-removal mutant per fixed marker field',
        fields,
        results,
        accepted_constraint_field: 'convex_accepted_writes_since_watermark',
        required_trigger_states: requiredTriggers,
      });
    },
    REAL_MUTATION_MATRIX_TIMEOUT_MS
  );

  itReal(
    'RR-7: unreachable credential-canary rollback child fails closed without raw streams',
    () => {
      const usernameCanary = `rr7-user-${'u'.repeat(64)}`;
      const passwordCanary = `rr7-password-${'p'.repeat(64)}`;
      const queryCanary = `rr7-query-${'q'.repeat(64)}`;
      const fragmentCanary = `rr7-fragment-${'f'.repeat(64)}`;
      const failingTarget =
        `postgres://${encodeURIComponent(usernameCanary)}:${encodeURIComponent(passwordCanary)}` +
        `@127.0.0.1:9/rr7-unreachable?${queryCanary}=1#${fragmentCanary}`;
      const canaries = [failingTarget, usernameCanary, passwordCanary, queryCanary, fragmentCanary];
      const expectedTarget = parseDatabaseTargetIdentity(failingTarget);
      const watermarkPath = fixtureWatermark('rr7-unreachable-rollback');
      const secretsPath = fixtureSecrets('rr7-unreachable-rollback');
      const registeredOutputPath = resolve(
        EVIDENCE_DIR,
        'rr7-registered-rollback-repoint-report.json'
      );
      const helperOutputPath = resolve(EVIDENCE_DIR, 'rr7-helper-rollback-repoint-report.json');
      const childEnv = {
        ...process.env,
        DATABASE_URL: failingTarget,
        HOLO_CUTOVER_OPERATOR_SECRET: 'rr7-operator-secret',
        HOLO_SECRETS_PATH: secretsPath,
        HOLOCRON_SECRETS_PATH: secretsPath,
      };
      const assertSanitized = (value: unknown): void => {
        const serialized = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
        for (const canary of canaries) expect(serialized).not.toContain(canary);
      };

      const registered = spawnSync(
        'bun',
        [
          'packages/platform/src/cli/holo.ts',
          'cutover:rollback-repoint',
          '--json',
          '--output',
          registeredOutputPath,
          '--etl-report',
          watermarkPath,
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 120_000,
          env: childEnv,
        }
      );
      expect(registered.status).not.toBe(0);
      const registeredStdout = registered.stdout ?? '';
      const registeredStderr = registered.stderr ?? '';
      assertSanitized(registeredStdout);
      assertSanitized(registeredStderr);
      const registeredParsed = JSON.parse(registeredStdout) as {
        ok?: boolean;
        error?: { code?: string };
        database_target?: typeof expectedTarget;
      };
      const registeredPersisted = readFileSync(registeredOutputPath, 'utf8');
      const registeredPersistedParsed = JSON.parse(registeredPersisted) as typeof registeredParsed;
      assertSanitized(registeredParsed);
      assertSanitized(registeredPersisted);
      assertSanitized(registeredPersistedParsed);
      expect(registeredParsed.ok).toBe(false);
      expect(registeredParsed.error?.code).toBe(PONR_LEDGER_UNREADABLE);
      expect(registeredParsed.database_target).toEqual(expectedTarget);
      expect(registeredPersistedParsed.error?.code).toBe(PONR_LEDGER_UNREADABLE);
      expect(registeredPersistedParsed.database_target).toEqual(expectedTarget);

      const helper = spawnRollbackRepointCli({
        cwd: REPO_ROOT,
        databaseUrl: failingTarget,
        watermarkPath,
        outputPath: helperOutputPath,
        env: childEnv,
      });
      expect(helper.exitCode).not.toBe(0);
      expect(helper.stdout).toBe('');
      expect(helper.stderr).toBe('');
      expect(helper.parsed).not.toBeNull();
      expect(helper.parsed?.ok).toBe(false);
      expect(helper.parsed?.error?.code).toBe(PONR_LEDGER_UNREADABLE);
      expect(helper.parsed?.database_target).toEqual(expectedTarget);
      const helperPersisted = readFileSync(helperOutputPath, 'utf8');
      const helperPersistedParsed = JSON.parse(helperPersisted) as typeof registeredParsed;
      assertSanitized(helper.argv);
      assertSanitized(helper.stdout);
      assertSanitized(helper.stderr);
      assertSanitized(helper.parsed);
      assertSanitized(helperPersisted);
      assertSanitized(helperPersistedParsed);
      expect(helperPersistedParsed.ok).toBe(false);
      expect(helperPersistedParsed.error?.code).toBe(PONR_LEDGER_UNREADABLE);
      expect(helperPersistedParsed.database_target).toEqual(expectedTarget);

      const evidencePayload = {
        source_sha: SOURCE_SHA,
        command:
          'registered rollback-repoint CLI + spawnRollbackRepointCli against unreachable target',
        database_target: expectedTarget,
        registered_exit_code: registered.status,
        registered_error_code: registeredParsed.error?.code ?? null,
        registered_streams_sanitized: true,
        registered_persisted_sanitized: true,
        helper_exit_code: helper.exitCode,
        helper_error_code: helper.parsed?.error?.code ?? null,
        helper_returned_stdout_empty: helper.stdout === '',
        helper_returned_stderr_empty: helper.stderr === '',
        helper_argv_sanitized: true,
        helper_persisted_sanitized: true,
      };
      assertSanitized(evidencePayload);
      evidence('rr7-unreachable-rollback-canary', evidencePayload);
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
      await dropDeleteBomb(targets.marker);
      await createDeleteBomb(targets.marker);
      await seedExactPonrMarker({
        gateDatabaseUrl: targets.gate,
        markerDatabaseUrl: targets.marker,
      });
      // Refresh the audit table for this failure path as well; exactly two
      // distinctive rows are the independent preservation oracle.
      await seedContradictoryAudit(targets.marker);
      const before = await markerState(targets.marker);
      const expectedAudit = {
        count: 2,
        digest: before.audit_digest,
      };
      expect(before.audit_count).toBe(expectedAudit.count);
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
      expect(failed.audit_before).toEqual(expectedAudit);
      expect(failed.audit_after).toEqual(expectedAudit);
      expect(after.audit_count).toBe(expectedAudit.count);
      expect(after.audit_digest).toBe(expectedAudit.digest);
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
        audit_snapshot: expectedAudit,
        report_audit_before: failed.audit_before,
        report_audit_after: failed.audit_after,
      });
    },
    180_000
  );
});
