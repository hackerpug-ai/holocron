/**
 * GATE-FIX-explicit-ponr-database-binding shell/process RED surface.
 *
 * The target-equality case executes the real human-gate process with two
 * simultaneously reachable disposable Postgres targets. It proves that no
 * ledger/PONR/fence/step mutation happens before URL validation.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EXACT_PONR_MARKER,
  seedExactPonrMarker,
} from '../../services/platform/src/cutover/ponr-marker.ts';
import { createSql } from '../../services/platform/src/db/client.ts';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;
const ADMIN_URL = process.env.GATE_FIX_TEST_ADMIN_URL ?? 'postgres://127.0.0.1:5432/postgres';
const SOURCE_URL = process.env.GATE_FIX_TEST_SOURCE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const REAL_IT = process.env.PLATFORM_IT === '1';
const itReal = REAL_IT ? it : it.skip;
let gateUrl = '';
let markerUrl = '';
let disposableNames: string[] = [];

function dbUrl(base: string, name: string): string {
  const parsed = new URL(base);
  parsed.pathname = `/${name}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function libpqEnv(url: string): NodeJS.ProcessEnv {
  const parsed = new URL(url);
  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
  };
}

async function clearShellPonr(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe(
      'ALTER TABLE public.data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_mutation'
    );
    await sql.unsafe(
      'ALTER TABLE public.data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_truncate'
    );
    await sql.unsafe('DELETE FROM public.data_plane_ponr');
    await sql.unsafe(
      'ALTER TABLE public.data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_mutation'
    );
    await sql.unsafe(
      'ALTER TABLE public.data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_truncate'
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function clearShellAudit(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe('DELETE FROM public.post_export_write_audit');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function provisionShellTargets(): Promise<void> {
  const suffix = `${Date.now()}${process.pid}`.slice(-12);
  disposableNames = [`s30_shell_gate_${suffix}`, `s30_shell_marker_${suffix}`];
  const admin = postgres(ADMIN_URL, { max: 1, prepare: false });
  try {
    for (const name of disposableNames)
      await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE template0`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  const dump = execFileSync('pg_dump', ['--no-owner', '--no-privileges'], {
    cwd: REPO_ROOT,
    env: libpqEnv(SOURCE_URL),
    maxBuffer: 256 * 1024 * 1024,
  });
  const gateName = disposableNames[0];
  const markerName = disposableNames[1];
  if (!gateName || !markerName)
    throw new Error('shell fixture database names were not provisioned');
  gateUrl = dbUrl(ADMIN_URL, gateName);
  markerUrl = dbUrl(ADMIN_URL, markerName);
  for (const target of [gateUrl, markerUrl]) {
    execFileSync('psql', ['--quiet'], { cwd: REPO_ROOT, input: dump, env: libpqEnv(target) });
    await clearShellPonr(target);
    await clearShellAudit(target);
  }
}

async function dropShellTargets(): Promise<void> {
  if (disposableNames.length === 0) return;
  const admin = postgres(ADMIN_URL, { max: 1, prepare: false });
  try {
    for (const name of disposableNames)
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

function canonicalAlias(url: string): string {
  const parsed = new URL(url);
  parsed.protocol = parsed.protocol === 'postgres:' ? 'postgresql:' : 'postgres:';
  if (!parsed.port) parsed.port = '5432';
  parsed.hostname = parsed.hostname.toUpperCase();
  return parsed.toString();
}

async function gateCount(url: string): Promise<{ ponr: number; audit: number }> {
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const rows = await sql<{ ponr: number; audit: number }[]>`
      SELECT (SELECT count(*)::int FROM data_plane_ponr) AS ponr,
             (SELECT count(*)::int FROM post_export_write_audit) AS audit
    `;
    const row = rows[0];
    if (!row) throw new Error('shell gate count query returned no row');
    return row;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

type MarkerState = {
  count: number;
  auditCount: number;
  auditDigest: string;
  requiredTriggers: Array<{ name: string; enabled: string }>;
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
      WHERE tgrelid = 'public.data_plane_ponr'::regclass
        AND NOT tgisinternal
        AND tgname IN ('data_plane_ponr_reject_mutation', 'data_plane_ponr_reject_truncate')
      ORDER BY tgname
    `;
    return {
      count: marker[0]?.count ?? 0,
      auditCount: audit.length,
      auditDigest: createHash('sha256').update(JSON.stringify(audit)).digest('hex'),
      requiredTriggers: triggers,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function expectMarkerLifecycle(
  before: MarkerState,
  after: MarkerState,
  expectedCount: number
): void {
  expect(after.count).toBe(expectedCount);
  expect(after.auditCount).toBe(before.auditCount);
  expect(after.auditDigest).toBe(before.auditDigest);
  expect(after.requiredTriggers).toEqual([
    { name: 'data_plane_ponr_reject_mutation', enabled: 'O' },
    { name: 'data_plane_ponr_reject_truncate', enabled: 'O' },
  ]);
}

async function mutateMarkerSurface(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe(
      'ALTER TABLE public.data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_mutation'
    );
    await sql`UPDATE public.data_plane_ponr SET write_surface = 'foreign.shell'`;
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

describe('GATE-FIX explicit target shell/process contracts', () => {
  beforeAll(async () => {
    if (REAL_IT) {
      mkdirSync(
        new URL('../../.tmp/GATE-FIX-explicit-ponr-database-binding/red', import.meta.url).pathname,
        { recursive: true }
      );
      await provisionShellTargets();
    }
  }, 180_000);

  afterAll(async () => {
    if (REAL_IT) await dropShellTargets();
  });

  itReal(
    'RED-5: equal canonical gate/marker targets stop before mutation canaries',
    async () => {
      const before = await gateCount(gateUrl);
      const result = spawnSync('bash', ['scripts/run-sprint30-human-gate.sh'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: gateUrl,
          HOLO_PROBE_MARKER_MISS_DATABASE_URL: canonicalAlias(gateUrl),
          HOLO_VERIFY_BASE_URL: 'http://127.0.0.1:9',
          VERIFY_GATE_EVIDENCE: '/usr/bin/true',
          HOLO_GATE_RESET_LEDGER: '1',
          HOLO_GATE_REARM_FENCE: '1',
          GATE_RUN_ID: `red-equal-target-${Date.now()}`,
        },
      });
      const after = await gateCount(gateUrl);
      const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      const evidenceDir = new URL(
        '../../.tmp/GATE-FIX-explicit-ponr-database-binding/red',
        import.meta.url
      ).pathname;
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(
        `${evidenceDir}/${Date.now()}-${process.pid}-shell-equal-target.json`,
        `${JSON.stringify(
          {
            source_sha: spawnSync('git', ['rev-parse', 'HEAD'], {
              cwd: REPO_ROOT,
              encoding: 'utf8',
            }).stdout.trim(),
            command:
              'bash scripts/run-sprint30-human-gate.sh with canonical-equal gate/marker targets',
            exit_code: result.status,
            assertion: 'equal target validation precedes ledger/PONR/fence/step mutation',
            error_code_observed: combined.includes('DATABASE_TARGET_EQUAL'),
            mutation_canaries_unchanged: JSON.stringify(after) === JSON.stringify(before),
            gate_database_name:
              (await gateCount(gateUrl)).ponr >= 0 ? 'disposable_gate' : 'unavailable',
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      expect(result.status).not.toBe(0);
      expect(combined).toContain('DATABASE_TARGET_EQUAL');
      expect(combined).not.toContain('preflight: dual-reset');
      expect(combined).not.toContain('preflight: re-arm durable soak fence');
      expect(combined).not.toContain('step1');
      expect(after).toEqual(before);
    },
    180_000
  );

  itReal(
    'TC-16: malformed gate target exits before disposable DB mutation',
    async () => {
      const before = await gateCount(gateUrl);
      const result = spawnSync('bash', ['scripts/run-sprint30-human-gate.sh'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: 'not-a-postgres-target',
          HOLO_PROBE_MARKER_MISS_DATABASE_URL: markerUrl,
          HOLO_VERIFY_BASE_URL: 'http://127.0.0.1:9',
          VERIFY_GATE_EVIDENCE: '/usr/bin/true',
          HOLO_CUTOVER_OPERATOR_SECRET: 's30-red-test-secret',
          GATE_RUN_ID: `red-malformed-target-${Date.now()}`,
        },
      });
      const after = await gateCount(gateUrl);
      const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      expect(result.status).not.toBe(0);
      expect(combined).toContain('DATABASE_TARGET_INVALID');
      expect(combined).not.toContain('preflight: dual-reset');
      expect(after).toEqual(before);
    },
    180_000
  );

  itReal(
    'TC-17: real C-3 EXIT cleanup preserves forced RC 37 and removes exact marker',
    async () => {
      await seedExactPonrMarker({ gateDatabaseUrl: gateUrl, markerDatabaseUrl: markerUrl });
      const beforeGate = await gateCount(gateUrl);
      const beforeMarker = await markerState(markerUrl);
      const result = spawnSync('bash', ['scripts/run-sprint30-human-gate.sh'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: gateUrl,
          HOLO_PROBE_MARKER_MISS_DATABASE_URL: markerUrl,
          HOLO_GATE_TEST_MODE: '1',
          HOLO_GATE_TEST_FORCE_RC: '37',
          VERIFY_GATE_EVIDENCE: '/usr/bin/true',
          HOLO_CUTOVER_OPERATOR_SECRET: 's30-red-test-secret',
          GATE_RUN_ID: `red-exit-cleanup-${Date.now()}`,
        },
      });
      const afterMarker = await markerState(markerUrl);
      expect(result.status).toBe(37);
      expectMarkerLifecycle(beforeMarker, afterMarker, 0);
      expect(await gateCount(gateUrl)).toEqual(beforeGate);
    },
    180_000
  );

  itReal(
    'TC-17: real C-3 normal success returns 0 and removes exact marker',
    async () => {
      await seedExactPonrMarker({ gateDatabaseUrl: gateUrl, markerDatabaseUrl: markerUrl });
      const beforeGate = await gateCount(gateUrl);
      const beforeMarker = await markerState(markerUrl);
      const result = spawnSync('bash', ['scripts/run-sprint30-human-gate.sh'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: gateUrl,
          HOLO_PROBE_MARKER_MISS_DATABASE_URL: markerUrl,
          HOLO_GATE_TEST_MODE: '1',
          HOLO_GATE_TEST_FORCE_RC: '0',
          VERIFY_GATE_EVIDENCE: '/usr/bin/true',
          HOLO_CUTOVER_OPERATOR_SECRET: 's30-red-test-secret',
          GATE_RUN_ID: `red-exit-cleanup-success-${Date.now()}`,
        },
      });
      const afterMarker = await markerState(markerUrl);
      expect(result.status).toBe(0);
      expectMarkerLifecycle(beforeMarker, afterMarker, 0);
      expect(await gateCount(gateUrl)).toEqual(beforeGate);
    },
    180_000
  );

  itReal(
    'TC-17: cleanup failure promotes main RC 0 to nonzero and preserves marker/audit/triggers',
    async () => {
      await seedExactPonrMarker({ gateDatabaseUrl: gateUrl, markerDatabaseUrl: markerUrl });
      const beforeGate = await gateCount(gateUrl);
      const beforeMarker = await markerState(markerUrl);
      const result = spawnSync('bash', ['scripts/run-sprint30-human-gate.sh'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: gateUrl,
          HOLO_PROBE_MARKER_MISS_DATABASE_URL: markerUrl,
          HOLO_GATE_TEST_MODE: '1',
          HOLO_GATE_TEST_CLEANUP_FAILURE: '1',
          VERIFY_GATE_EVIDENCE: '/usr/bin/true',
          HOLO_CUTOVER_OPERATOR_SECRET: 's30-red-test-secret',
          GATE_RUN_ID: `red-exit-cleanup-promotion-${Date.now()}`,
        },
      });
      const afterMarker = await markerState(markerUrl);
      expect(result.status).toBe(1);
      expectMarkerLifecycle(beforeMarker, afterMarker, 1);
      expect(await gateCount(gateUrl)).toEqual(beforeGate);
    },
    180_000
  );

  itReal(
    'TC-17: real C-3 pre-cleanup failure preserves a nonzero RC and foreign marker',
    async () => {
      await seedExactPonrMarker({ gateDatabaseUrl: gateUrl, markerDatabaseUrl: markerUrl });
      const beforeMarker = await markerState(markerUrl);
      await mutateMarkerSurface(markerUrl);
      const result = spawnSync('bash', ['scripts/run-sprint30-human-gate.sh'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: gateUrl,
          HOLO_PROBE_MARKER_MISS_DATABASE_URL: markerUrl,
          HOLO_GATE_TEST_MODE: '1',
          HOLO_GATE_TEST_FORCE_RC: '37',
          VERIFY_GATE_EVIDENCE: '/usr/bin/true',
          HOLO_CUTOVER_OPERATOR_SECRET: 's30-red-test-secret',
          GATE_RUN_ID: `red-exit-cleanup-failure-${Date.now()}`,
        },
      });
      const afterMarker = await markerState(markerUrl);
      expect(result.status).toBe(1);
      expectMarkerLifecycle(beforeMarker, afterMarker, 1);
      const sql = createSql(markerUrl, { max: 1 });
      try {
        await sql.unsafe(
          'ALTER TABLE public.data_plane_ponr DISABLE TRIGGER data_plane_ponr_reject_mutation'
        );
        await sql`UPDATE public.data_plane_ponr SET write_surface = ${EXACT_PONR_MARKER.write_surface}`;
      } finally {
        await sql.unsafe(
          'ALTER TABLE public.data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_mutation'
        );
        await sql.unsafe(
          'ALTER TABLE public.data_plane_ponr ENABLE TRIGGER data_plane_ponr_reject_truncate'
        );
        await sql.end({ timeout: 5 });
      }
    },
    180_000
  );

  it('TC-18: marker cleanup wrapper rejects URL command-line arguments', () => {
    const result = spawnSync(
      'bash',
      ['scripts/cleanup-sprint30-ponr-marker.sh', '--database-url', 'redacted-target'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env },
      }
    );
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(result.status).toBe(2);
    expect(combined).toContain('URLs are environment-only');
    expect(combined).not.toContain('redacted-target');
  });

  it('TC-16: human gate rejects a missing gate target before any gate work', () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const result = spawnSync('bash', ['scripts/run-sprint30-human-gate.sh'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env,
    });
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(result.status).not.toBe(0);
    expect(combined).toContain('DATABASE_URL required');
    expect(combined).not.toContain('preflight: dual-reset');
  });

  itReal(
    'RED-6: runVerifyTools must preserve ambient DATABASE_URL during an explicit-target call',
    () => {
      const script = `
      import { runVerifyTools } from './services/platform/src/cutover/soak-fence.ts';
      const explicitA = process.env.S30_EXPLICIT_A;
      const explicitB = process.env.S30_EXPLICIT_B;
      if (!explicitA || !explicitB) throw new Error('real explicit fixture targets missing');
      process.env.DATABASE_URL = 'postgres://ambient-sentinel.invalid:5432/ambient_c';
      const before = process.env.DATABASE_URL;
      const results = await Promise.all([
        runVerifyTools({
          databaseUrl: explicitA,
          baseUrl: 'http://127.0.0.1:9',
          allowMissingDeploymentEnv: true,
          seeds: { documentId: '00000000-0000-0000-0000-000000000001', subscriptionId: '00000000-0000-0000-0000-000000000002', researchSessionId: '', improvementId: '', assimilationSessionId: '', toolId: '', shopSessionId: '', profileId: '', runId: 'red-race-a' },
        }),
        runVerifyTools({
          databaseUrl: explicitB,
          baseUrl: 'http://127.0.0.1:9',
          allowMissingDeploymentEnv: true,
          seeds: { documentId: '00000000-0000-0000-0000-000000000003', subscriptionId: '00000000-0000-0000-0000-000000000004', researchSessionId: '', improvementId: '', assimilationSessionId: '', toolId: '', shopSessionId: '', profileId: '', runId: 'red-race-b' },
        }),
      ]);
      process.stdout.write(JSON.stringify({ before, after: process.env.DATABASE_URL, result_count: results.length }));
    `;
      const result = spawnSync('bun', ['--eval', script], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: 'postgres://ambient-sentinel.invalid:5432/ambient_c',
          S30_EXPLICIT_A: gateUrl,
          S30_EXPLICIT_B: markerUrl,
        },
      });
      expect(result.status, result.stderr).toBe(0);
      const output = JSON.parse(result.stdout) as {
        before: string;
        after: string;
        result_count: number;
      };
      expect(output.after, 'ambient DATABASE_URL changed during explicit call').toBe(output.before);
      expect(output.result_count).toBe(2);
    }
  );
});
