/**
 * GATE-FIX-explicit-ponr-database-binding shell/process RED surface.
 *
 * The target-equality case executes the real human-gate process with two
 * simultaneously reachable disposable Postgres targets. It proves that no
 * ledger/PONR/fence/step mutation happens before URL validation.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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

function runDatabaseUrlTypeContract(): {
  status: number | null;
  stdout: string;
  stderr: string;
  fixturePath: string;
} {
  const evidenceDir = new URL(
    '../../.tmp/GATE-FIX-explicit-ponr-database-binding/red/type-contract-runnable',
    import.meta.url
  ).pathname;
  mkdirSync(evidenceDir, { recursive: true });
  const fixturePath = `${evidenceDir}/${Date.now()}-${process.pid}-omitted-database-url.ts`;
  const dependencyShimPath = `${evidenceDir}/${Date.now()}-${process.pid}-dependency-shim.d.ts`;
  const tsconfigPath = `${evidenceDir}/${Date.now()}-${process.pid}-tsconfig.json`;
  writeFileSync(
    fixturePath,
    `import { runRollbackRepoint } from '../../../../services/platform/src/cutover/rollback-repoint.ts';
import { runRollbackDrill, spawnRollbackRepointCli } from '../../../../services/platform/src/cutover/rollback-drill.ts';

// Each expected error is on an otherwise valid options object. If databaseUrl
// becomes optional, TypeScript reports TS2578 (unused @ts-expect-error).
// @ts-expect-error databaseUrl is required by the rollback repoint contract
const omittedRepoint: Parameters<typeof runRollbackRepoint>[0] = {};
// @ts-expect-error databaseUrl is required by the rollback drill contract
const omittedDrill: Parameters<typeof runRollbackDrill>[0] = {};
// @ts-expect-error databaseUrl is required by the spawned rollback contract
const omittedChild: Parameters<typeof spawnRollbackRepointCli>[0] = { cwd: '/tmp' };

void omittedRepoint;
void omittedDrill;
void omittedChild;
`,
    'utf8'
  );
  writeFileSync(dependencyShimPath, "declare module 'graphile-worker';\n", 'utf8');
  writeFileSync(
    tsconfigPath,
    `${JSON.stringify(
      {
        extends: '../../../../services/platform/tsconfig.json',
        include: [
          fixturePath.slice(evidenceDir.length + 1),
          dependencyShimPath.slice(evidenceDir.length + 1),
        ],
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  const result = spawnSync(
    'pnpm',
    ['exec', 'tsc', '--noEmit', '--pretty', 'false', '-p', tsconfigPath],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: process.env,
      timeout: 120_000,
    }
  );
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    fixturePath,
  };
}

function dbUrl(base: string, name: string): string {
  const parsed = new URL(base);
  parsed.pathname = `/${name}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

const C3_CANARIES = [
  's30_c3_user_canary',
  's30_c3_password_canary',
  's30_c3_query_canary',
  's30_c3_fragment_canary',
] as const;

function credentialCanaryUrl(base: string): string {
  const parsed = new URL(base);
  parsed.username = C3_CANARIES[0];
  parsed.password = C3_CANARIES[1];
  parsed.search = `?${C3_CANARIES[2]}=1`;
  parsed.hash = C3_CANARIES[3];
  return parsed.toString();
}

function queryFragmentCanaryUrl(base: string): string {
  const parsed = new URL(base);
  parsed.search = `?application_name=${C3_CANARIES[2]}`;
  parsed.hash = C3_CANARIES[3];
  return parsed.toString();
}

function malformedCanaryUrl(base: string): string {
  const parsed = new URL(credentialCanaryUrl(base));
  parsed.pathname = '/%ZZ';
  return parsed.toString();
}

function writeProcessRecorder(dir: string): string {
  const recorderDir = `${dir}/process-recorder`;
  mkdirSync(recorderDir, { recursive: true });
  const recordPath = `${recorderDir}/argv-summary.jsonl`;
  const recordScript = `#!/usr/bin/env bash
set -euo pipefail
seen=0
for arg in "$@"; do
  for token in "$S30_C3_USER_CANARY" "$S30_C3_PASSWORD_CANARY" "$S30_C3_QUERY_CANARY" "$S30_C3_FRAGMENT_CANARY"; do
    case "$arg" in *"$token"*) seen=1 ;; esac
  done
done
printf '{"argv_count":%s,"raw_canary_seen":%s,"program":"psql"}\\n' "$#" "$seen" >> "$S30_PROCESS_RECORD"
exit 2
`;
  const pythonScript = `#!/usr/bin/env bash
set -euo pipefail
seen=0
for arg in "$@"; do
  for token in "$S30_C3_USER_CANARY" "$S30_C3_PASSWORD_CANARY" "$S30_C3_QUERY_CANARY" "$S30_C3_FRAGMENT_CANARY"; do
    case "$arg" in *"$token"*) seen=1 ;; esac
  done
done
printf '{"argv_count":%s,"raw_canary_seen":%s,"program":"python3"}\\n' "$#" "$seen" >> "$S30_PROCESS_RECORD"
exec "$S30_REAL_PYTHON" "$@"
`;
  const bunScript = `#!/usr/bin/env bash
set -euo pipefail
seen=0
for arg in "$@"; do
  for token in "$S30_C3_USER_CANARY" "$S30_C3_PASSWORD_CANARY" "$S30_C3_QUERY_CANARY" "$S30_C3_FRAGMENT_CANARY"; do
    case "$arg" in *"$token"*) seen=1 ;; esac
  done
done
printf '{"argv_count":%s,"raw_canary_seen":%s,"program":"bun"}\\n' "$#" "$seen" >> "$S30_PROCESS_RECORD"
exec "$S30_REAL_BUN" "$@"
`;
  writeFileSync(`${recorderDir}/psql`, recordScript, 'utf8');
  writeFileSync(`${recorderDir}/python3`, pythonScript, 'utf8');
  writeFileSync(`${recorderDir}/bun`, bunScript, 'utf8');
  chmodSync(`${recorderDir}/psql`, 0o755);
  chmodSync(`${recorderDir}/python3`, 0o755);
  chmodSync(`${recorderDir}/bun`, 0o755);
  writeFileSync(recordPath, '', 'utf8');
  return recordPath;
}

function scanTextFiles(dir: string): { files: number; canaryHits: number; rawUrlHits: number } {
  let files = 0;
  let canaryHits = 0;
  let rawUrlHits = 0;
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) {
      const nested = scanTextFiles(path);
      files += nested.files;
      canaryHits += nested.canaryHits;
      rawUrlHits += nested.rawUrlHits;
      continue;
    }
    files += 1;
    const text = readFileSync(path, 'utf8');
    if (C3_CANARIES.some((canary) => text.includes(canary))) canaryHits += 1;
    if (/postgres(?:ql)?:\/\//i.test(text)) rawUrlHits += 1;
  }
  return { files, canaryHits, rawUrlHits };
}

function readProcessRecords(path: string): Array<{
  argv_count: number;
  raw_canary_seen: number;
  program?: string;
}> {
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').map(
    (line) =>
      JSON.parse(line) as {
        argv_count: number;
        raw_canary_seen: number;
        program?: string;
      }
  );
}

function credentialFreeTranscript(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s'"\\]+/gi, '[database-target-redacted]')
    .slice(-2_000);
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

async function seedShellAudit(url: string): Promise<void> {
  await clearShellAudit(url);
  const sql = createSql(url, { max: 1 });
  try {
    const watermark = Date.now() - 60_000;
    await sql`
      INSERT INTO public.post_export_write_audit
        (committed_at_ms, surface, write_row_id, export_watermark_ms)
      VALUES
        (${watermark + 10_000}, ${'fixture.c3.app'}, ${'c3-audit-a'}, ${watermark}),
        (${watermark + 20_000}, ${'fixture.c3.mcp'}, ${'c3-audit-b'}, ${watermark})
    `;
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

function createNormalC3Sandbox(root: string): string {
  const sandboxScripts = `${root}/scripts`;
  const sandboxPlan =
    `${root}/.spec/prds/mk6-migration/tasks/` +
    'sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return';
  const sourceScript = readFileSync(`${REPO_ROOT}/scripts/run-sprint30-human-gate.sh`, 'utf8');
  const gateStart = `DEPLOYED_BASE_URL="\${HOLO_VERIFY_BASE_URL:-\${HOLO_SOAK_BASE_URL:-\${PLATFORM_URL:-}}}"`;
  const c3Start = '# ── C-3 / RH-S30-18+21: MANDATORY success-path + forced-marker-miss ─────────';
  const markerExit = 'echo "$MARKER_MISS_RC" >"$EVID_DIR/ponr-role-provenance-marker-miss.exit"';
  const sandboxBranch = `if [[ "\${HOLO_GATE_SANDBOX_NORMAL_C3:-0}" == "1" ]]; then
  SOURCE_REV="$SOURCE_SHA"
  DEPLOYED_BASE_URL='sandbox'
  VERIFY_RC=0
  ASSERT_RC=0
  VERDICT='pass'
  steps_passed=5
  steps_failed=0
  steps_executed=5
  WRITE_GATE_RESULTS=0
else`;
  if (!sourceScript.includes(gateStart) || !sourceScript.includes(c3Start)) {
    throw new Error('normal C-3 sandbox anchors missing from production gate script');
  }
  if (sourceScript.split(markerExit).length !== 2) {
    throw new Error('normal C-3 sandbox marker-miss anchor is not unique');
  }
  let sandboxScript = sourceScript.replace(gateStart, `${sandboxBranch}\n${gateStart}`);
  sandboxScript = sandboxScript.replace(c3Start, `  fi\n\n${c3Start}`);
  sandboxScript = sandboxScript.replace(
    markerExit,
    `${markerExit}
if [[ -n "\${HOLO_GATE_SANDBOX_NORMAL_C3_FORCE_RC:-}" ]]; then
  exit "\${HOLO_GATE_SANDBOX_NORMAL_C3_FORCE_RC}"
fi`
  );
  mkdirSync(sandboxScripts, { recursive: true });
  mkdirSync(sandboxPlan, { recursive: true });
  for (const name of [
    'REDHAT-FIX-RH-S30-08',
    'REDHAT-FIX-RH-S30-14',
    'REDHAT-FIX-RH-S30-15',
    'REDHAT-FIX-RH-S30-18',
    'REDHAT-FIX-RH-S30-21',
    'REDHAT-FIX-RH-S30-30',
  ]) {
    mkdirSync(`${root}/.tmp/${name}`, { recursive: true });
  }
  writeFileSync(`${sandboxScripts}/run-sprint30-human-gate.sh`, sandboxScript, 'utf8');
  chmodSync(`${sandboxScripts}/run-sprint30-human-gate.sh`, 0o755);
  for (const name of [
    'cleanup-sprint30-ponr-marker.sh',
    'probe-ponr-role-immutability.sh',
    'probe-ponr-role-immutability-negative-marker.sh',
    'probe-ponr-one-trigger-missing-negative.sh',
  ]) {
    symlinkSync(`${REPO_ROOT}/scripts/${name}`, `${sandboxScripts}/${name}`);
  }
  symlinkSync(`${REPO_ROOT}/scripts/lib`, `${sandboxScripts}/lib`, 'dir');
  symlinkSync(`${REPO_ROOT}/services`, `${root}/services`, 'dir');
  symlinkSync(`${REPO_ROOT}/.git`, `${root}/.git`, 'dir');
  writeFileSync(
    `${sandboxPlan}/gate-plan.json`,
    readFileSync(
      `${REPO_ROOT}/.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/gate-plan.json`,
      'utf8'
    ),
    'utf8'
  );
  return `${sandboxScripts}/run-sprint30-human-gate.sh`;
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

type PonrTriggerState = { name: string; enabled: string };

async function allPonrTriggerStates(url: string): Promise<PonrTriggerState[]> {
  const sql = createSql(url, { max: 1 });
  try {
    return await sql<PonrTriggerState[]>`
      SELECT tgname AS name, tgenabled::text AS enabled
      FROM pg_trigger
      WHERE tgrelid = 'public.data_plane_ponr'::regclass
        AND NOT tgisinternal
      ORDER BY tgname
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function createDeleteBomb(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION public.s30_shell_delete_bomb()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$ BEGIN RAISE EXCEPTION 's30 shell cleanup bomb'; END; $$
    `);
    await sql.unsafe('DROP TRIGGER IF EXISTS s30_shell_delete_bomb ON public.data_plane_ponr');
    await sql.unsafe(`
      CREATE TRIGGER s30_shell_delete_bomb
      BEFORE DELETE ON public.data_plane_ponr
      FOR EACH ROW EXECUTE FUNCTION public.s30_shell_delete_bomb()
    `);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function dropDeleteBomb(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql.unsafe('DROP TRIGGER IF EXISTS s30_shell_delete_bomb ON public.data_plane_ponr');
    await sql.unsafe('DROP FUNCTION IF EXISTS public.s30_shell_delete_bomb()');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function scanSensitiveText(text: string): { canaryHit: boolean; rawUrlHit: boolean } {
  return {
    canaryHit: C3_CANARIES.some((canary) => text.includes(canary)),
    rawUrlHit: /postgres(?:ql)?:\/\//i.test(text),
  };
}

function readEvidenceJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function scanTextFilesIfPresent(dir: string): {
  files: number;
  canaryHits: number;
  rawUrlHits: number;
} {
  try {
    if (!statSync(dir).isDirectory()) return { files: 0, canaryHits: 0, rawUrlHits: 0 };
  } catch {
    return { files: 0, canaryHits: 0, rawUrlHits: 0 };
  }
  return scanTextFiles(dir);
}

type CleanupWrapperRun = {
  result: ReturnType<typeof spawnSync>;
  output: string;
  outputCanaryHit: boolean;
  outputRawUrlHit: boolean;
  argvCanaryHit: boolean;
  argvRawUrlHit: boolean;
  childProcessRecordCount: number;
  childProcessRawCanarySeenCount: number;
  childProcessPrograms: string[];
  evidence: { files: number; canaryHits: number; rawUrlHits: number };
  outPath: string;
};

function runCleanupWrapper(
  evidenceRoot: string,
  gateTarget: string,
  markerTarget: string,
  label: string
): CleanupWrapperRun {
  mkdirSync(evidenceRoot, { recursive: true });
  const outPath = `${evidenceRoot}/${label}.json`;
  const argv = ['scripts/cleanup-sprint30-ponr-marker.sh', '--out', outPath];
  const recordPath = writeProcessRecorder(evidenceRoot);
  const recorderDir = `${evidenceRoot}/process-recorder`;
  const realBun = execFileSync('which', ['bun'], { encoding: 'utf8' }).trim();
  const result = spawnSync('bash', argv, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${recorderDir}:${process.env.PATH ?? ''}`,
      S30_PROCESS_RECORD: recordPath,
      S30_REAL_BUN: realBun,
      S30_C3_USER_CANARY: C3_CANARIES[0],
      S30_C3_PASSWORD_CANARY: C3_CANARIES[1],
      S30_C3_QUERY_CANARY: C3_CANARIES[2],
      S30_C3_FRAGMENT_CANARY: C3_CANARIES[3],
      DATABASE_URL: gateTarget,
      HOLO_PROBE_MARKER_MISS_DATABASE_URL: markerTarget,
    },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const outputHits = scanSensitiveText(output);
  const argvHits = scanSensitiveText(argv.join('\u0000'));
  const childRecords = readProcessRecords(recordPath);
  return {
    result,
    output,
    outputCanaryHit: outputHits.canaryHit,
    outputRawUrlHit: outputHits.rawUrlHit,
    argvCanaryHit: argvHits.canaryHit,
    argvRawUrlHit: argvHits.rawUrlHit,
    childProcessRecordCount: childRecords.filter((record) => record.program === 'bun').length,
    childProcessRawCanarySeenCount: childRecords.filter(
      (record) => record.program === 'bun' && record.raw_canary_seen !== 0
    ).length,
    childProcessPrograms: [
      ...new Set(childRecords.map((record) => record.program).filter(Boolean)),
    ] as string[],
    evidence: scanTextFiles(evidenceRoot),
    outPath,
  };
}

type GateTargetValidationRun = {
  result: ReturnType<typeof spawnSync>;
  output: string;
  validationCodeHit: boolean;
  outputCanaryHit: boolean;
  outputRawUrlHit: boolean;
  argvCanaryHit: boolean;
  argvRawUrlHit: boolean;
  evidence: { files: number; canaryHits: number; rawUrlHits: number };
};

function runMalformedGateTargetValidation(
  evidenceRoot: string,
  gateTarget: string,
  markerTarget: string,
  label: string
): GateTargetValidationRun {
  const taskEvidence =
    `${REPO_ROOT}/.spec/prds/mk6-migration/tasks/` +
    'sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence';
  const runId = `rr7-${label}-${Date.now()}-${process.pid}`;
  const runDir = `${taskEvidence}/${runId}`;
  mkdirSync(evidenceRoot, { recursive: true });
  const argv = ['scripts/run-sprint30-human-gate.sh'];
  let result: ReturnType<typeof spawnSync>;
  try {
    result = spawnSync('bash', argv, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: gateTarget,
        HOLO_PROBE_MARKER_MISS_DATABASE_URL: markerTarget,
        GATE_RUN_ID: runId,
      },
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const outputHits = scanSensitiveText(output);
    const argvHits = scanSensitiveText(argv.join('\u0000'));
    return {
      result,
      output,
      validationCodeHit: output.includes('DATABASE_TARGET_INVALID'),
      outputCanaryHit: outputHits.canaryHit,
      outputRawUrlHit: outputHits.rawUrlHit,
      argvCanaryHit: argvHits.canaryHit,
      argvRawUrlHit: argvHits.rawUrlHit,
      evidence: scanTextFilesIfPresent(runDir),
    };
  } finally {
    rmSync(runDir, { recursive: true, force: true });
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

async function restoreMarkerSurface(url: string): Promise<void> {
  const sql = createSql(url, { max: 1 });
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

  it('TC-1: runnable compiler rejects omission of databaseUrl at all three boundaries', () => {
    const result = runDatabaseUrlTypeContract();
    const evidenceDir = new URL(
      '../../.tmp/GATE-FIX-explicit-ponr-database-binding/red',
      import.meta.url
    ).pathname;
    writeFileSync(
      `${evidenceDir}/${Date.now()}-${process.pid}-type-contract-runnable.json`,
      `${JSON.stringify(
        {
          source_sha: spawnSync('git', ['rev-parse', 'HEAD'], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
          }).stdout.trim(),
          command: 'pnpm exec tsc --noEmit --pretty false -p <temporary platform-derived tsconfig>',
          exit_code: result.status,
          fixture: 'credential-free temporary omission fixture',
          omitted_database_url_assertions: 3,
          compiler_output_empty: result.stdout.length === 0 && result.stderr.length === 0,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).not.toContain('TS2578');
    expect(result.stderr).not.toContain('TS2578');
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

  itReal(
    'RR-4: ordinary C-3 path cleans before C-3 and EXIT-cleans forced RC 37 and success RC 0',
    async () => {
      const sandboxRoot = new URL(
        `../../.tmp/GATE-FIX-explicit-ponr-database-binding/red/normal-c3-sandbox-${Date.now()}-${process.pid}`,
        import.meta.url
      ).pathname;
      const sandboxScript = createNormalC3Sandbox(sandboxRoot);
      const taskEvidence =
        `${sandboxRoot}/.spec/prds/mk6-migration/tasks/` +
        'sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence';

      const runNormalC3 = async (forceRc: string | undefined) => {
        await clearShellPonr(markerUrl);
        await seedExactPonrMarker({ gateDatabaseUrl: gateUrl, markerDatabaseUrl: markerUrl });
        await seedShellAudit(markerUrl);
        const seeded = await markerState(markerUrl);
        const runId = `red-normal-c3-${forceRc ?? 'success'}-${Date.now()}-${process.pid}`;
        const result = spawnSync('bash', [sandboxScript], {
          cwd: sandboxRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            DATABASE_URL: gateUrl,
            HOLO_PROBE_MARKER_MISS_DATABASE_URL: markerUrl,
            GATE_RUN_ID: runId,
            HOLO_GATE_SANDBOX_NORMAL_C3: '1',
            HOLO_PROBE_SEED_PONR: '1',
            VERIFY_GATE_EVIDENCE: '/usr/bin/true',
            ASSERT_HUMAN_TEST_VERDICT: '/usr/bin/true',
            WRITE_GATE_RESULTS: '0',
            HOLO_GATE_RESET_LEDGER: '0',
            HOLO_GATE_REARM_FENCE: '0',
            ...(forceRc ? { HOLO_GATE_SANDBOX_NORMAL_C3_FORCE_RC: forceRc } : {}),
          },
        });
        const runEvidence = `${taskEvidence}/${runId}`;
        const readJson = (name: string): Record<string, unknown> | null => {
          try {
            return JSON.parse(readFileSync(`${runEvidence}/${name}`, 'utf8')) as Record<
              string,
              unknown
            >;
          } catch {
            return null;
          }
        };
        const preCleanup = readJson('marker-cleanup-pre-c3.json');
        const exitCleanup = readJson('marker-cleanup-exit.json');
        const after = await markerState(markerUrl);
        // Nested C-3 artifacts can contain canonical target URLs. Keep only
        // the credential-free summary below as task evidence.
        rmSync(runEvidence, { recursive: true, force: true });
        return {
          runId,
          result,
          seeded,
          preCleanup,
          exitCleanup,
          after,
          output_has_raw_target: /postgres(?:ql)?:\/\//i.test(
            `${result.stdout ?? ''}\n${result.stderr ?? ''}`
          ),
        };
      };

      const forced = await runNormalC3('37');
      // Explicit string "0" is truthy for the sandbox branch, so the normal
      // control exits immediately after the real marker-miss C-3 block. This
      // keeps the oracle focused on C-3/EXIT cleanup, not downstream gate work.
      const normal = await runNormalC3('0');
      const summary = {
        source_sha: spawnSync('git', ['rev-parse', 'HEAD'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        }).stdout.trim(),
        command: 'source-sandboxed ordinary C-3 path with disposable gate/marker databases',
        forced_rc: forced.result.status,
        normal_rc: normal.result.status,
        forced_seeded_marker_count: forced.seeded.count,
        forced_pre_c3_marker_before: forced.preCleanup?.marker_before_count,
        forced_pre_c3_marker_after: forced.preCleanup?.marker_after_count,
        forced_exit_marker_after: forced.exitCleanup?.marker_after_count,
        forced_post_marker_count: forced.after.count,
        forced_post_audit_count: forced.after.auditCount,
        forced_post_audit_digest: forced.after.auditDigest,
        forced_post_required_triggers: forced.after.requiredTriggers,
        forced_stdout_tail: credentialFreeTranscript(forced.result.stdout ?? ''),
        forced_stderr_tail: credentialFreeTranscript(forced.result.stderr ?? ''),
        normal_seeded_marker_count: normal.seeded.count,
        normal_pre_c3_marker_before: normal.preCleanup?.marker_before_count,
        normal_pre_c3_marker_after: normal.preCleanup?.marker_after_count,
        normal_exit_marker_after: normal.exitCleanup?.marker_after_count,
        normal_post_marker_count: normal.after.count,
        normal_post_audit_count: normal.after.auditCount,
        normal_post_audit_digest: normal.after.auditDigest,
        normal_post_required_triggers: normal.after.requiredTriggers,
        normal_stdout_tail: credentialFreeTranscript(normal.result.stdout ?? ''),
        normal_stderr_tail: credentialFreeTranscript(normal.result.stderr ?? ''),
        forced_output_has_raw_target: forced.output_has_raw_target,
        normal_output_has_raw_target: normal.output_has_raw_target,
      };
      writeFileSync(
        `${sandboxRoot}/sanitized-summary.json`,
        `${JSON.stringify(summary, null, 2)}\n`,
        'utf8'
      );
      rmSync(`${sandboxRoot}/.spec`, { recursive: true, force: true });
      rmSync(`${sandboxRoot}/.tmp`, { recursive: true, force: true });

      const requiredTriggers = [
        { name: 'data_plane_ponr_reject_mutation', enabled: 'O' },
        { name: 'data_plane_ponr_reject_truncate', enabled: 'O' },
      ];
      expect(forced.seeded.count).toBe(1);
      expect(forced.preCleanup?.marker_before_count).toBe(1);
      expect(forced.preCleanup?.marker_after_count).toBe(0);
      expect(forced.preCleanup?.audit_before).toEqual(forced.preCleanup?.audit_after);
      expect(forced.preCleanup?.audit_before?.count).toBe(2);
      expect(forced.exitCleanup?.marker_after_count).toBe(0);
      expect(forced.result.status).toBe(37);
      expect(forced.after).toEqual({
        count: 0,
        auditCount: 2,
        auditDigest: forced.preCleanup?.audit_before?.digest,
        requiredTriggers,
      });
      expect(normal.seeded.count).toBe(1);
      expect(normal.preCleanup?.marker_before_count).toBe(1);
      expect(normal.preCleanup?.marker_after_count).toBe(0);
      expect(normal.preCleanup?.audit_before).toEqual(normal.preCleanup?.audit_after);
      expect(normal.preCleanup?.audit_before?.count).toBe(2);
      expect(normal.exitCleanup?.marker_after_count).toBe(0);
      expect(normal.result.status).toBe(0);
      expect(normal.after).toEqual({
        count: 0,
        auditCount: 2,
        auditDigest: normal.preCleanup?.audit_before?.digest,
        requiredTriggers,
      });
      expect(forced.output_has_raw_target).toBe(false);
      expect(normal.output_has_raw_target).toBe(false);
    },
    300_000
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
    'RR-7: malformed gate and marker targets fail closed without credential leakage',
    async () => {
      await clearShellPonr(markerUrl);
      await seedShellAudit(markerUrl);
      await seedExactPonrMarker({ gateDatabaseUrl: gateUrl, markerDatabaseUrl: markerUrl });
      const before = await markerState(markerUrl);
      const evidenceRoot = new URL(
        `../../.tmp/GATE-FIX-explicit-ponr-database-binding/red/rr7-malformed-${Date.now()}-${process.pid}`,
        import.meta.url
      ).pathname;
      const malformedGate = runMalformedGateTargetValidation(
        evidenceRoot,
        malformedCanaryUrl(gateUrl),
        credentialCanaryUrl(markerUrl),
        'gate'
      );
      const malformedMarker = runMalformedGateTargetValidation(
        evidenceRoot,
        gateUrl,
        malformedCanaryUrl(markerUrl),
        'marker'
      );
      const after = await markerState(markerUrl);
      const evidence = scanTextFiles(evidenceRoot);
      const summary = {
        source_sha: spawnSync('git', ['rev-parse', 'HEAD'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        }).stdout.trim(),
        gate_exit_code: malformedGate.result.status,
        marker_exit_code: malformedMarker.result.status,
        gate_validation_code_hit: malformedGate.validationCodeHit,
        marker_validation_code_hit: malformedMarker.validationCodeHit,
        gate_output_canary_hit: malformedGate.outputCanaryHit,
        marker_output_canary_hit: malformedMarker.outputCanaryHit,
        gate_output_raw_url_hit: malformedGate.outputRawUrlHit,
        marker_output_raw_url_hit: malformedMarker.outputRawUrlHit,
        gate_argv_canary_hit: malformedGate.argvCanaryHit,
        marker_argv_canary_hit: malformedMarker.argvCanaryHit,
        gate_evidence: malformedGate.evidence,
        marker_evidence: malformedMarker.evidence,
        all_evidence: evidence,
        marker_before: before,
        marker_after: after,
      };
      writeFileSync(
        `${evidenceRoot}/sanitized-summary.json`,
        `${JSON.stringify(summary, null, 2)}\n`
      );

      expect(malformedGate.result.status).not.toBe(0);
      expect(malformedMarker.result.status).not.toBe(0);
      expect(malformedGate.validationCodeHit).toBe(true);
      expect(malformedMarker.validationCodeHit).toBe(true);
      expect(malformedGate.outputCanaryHit).toBe(false);
      expect(malformedMarker.outputCanaryHit).toBe(false);
      expect(malformedGate.outputRawUrlHit).toBe(false);
      expect(malformedMarker.outputRawUrlHit).toBe(false);
      expect(malformedGate.argvCanaryHit).toBe(false);
      expect(malformedMarker.argvCanaryHit).toBe(false);
      expect(malformedGate.argvRawUrlHit).toBe(false);
      expect(malformedMarker.argvRawUrlHit).toBe(false);
      expect(evidence.canaryHits).toBe(0);
      expect(evidence.rawUrlHits).toBe(0);
      expect(after).toEqual(before);
    },
    180_000
  );

  itReal(
    'RR-7: exact cleanup failure preserves marker, audit, and all trigger states without leakage',
    async () => {
      await clearShellPonr(markerUrl);
      await seedShellAudit(markerUrl);
      await seedExactPonrMarker({ gateDatabaseUrl: gateUrl, markerDatabaseUrl: markerUrl });
      const before = await markerState(markerUrl);
      const evidenceRoot = new URL(
        `../../.tmp/GATE-FIX-explicit-ponr-database-binding/red/rr7-cleanup-bomb-${Date.now()}-${process.pid}`,
        import.meta.url
      ).pathname;
      await createDeleteBomb(markerUrl);
      let run: CleanupWrapperRun | undefined;
      let duringFailure: PonrTriggerState[] = [];
      try {
        run = runCleanupWrapper(
          evidenceRoot,
          queryFragmentCanaryUrl(gateUrl),
          queryFragmentCanaryUrl(markerUrl),
          'forced-cleanup-failure'
        );
        duringFailure = await allPonrTriggerStates(markerUrl);
      } finally {
        await dropDeleteBomb(markerUrl);
      }
      if (!run) throw new Error('forced cleanup run did not execute');
      const after = await markerState(markerUrl);
      const evidence = scanTextFiles(evidenceRoot);
      const report = readEvidenceJson(run.outPath);
      const summary = {
        source_sha: spawnSync('git', ['rev-parse', 'HEAD'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        }).stdout.trim(),
        exit_code: run.result.status,
        output_canary_hit: run.outputCanaryHit,
        output_raw_url_hit: run.outputRawUrlHit,
        argv_canary_hit: run.argvCanaryHit,
        argv_raw_url_hit: run.argvRawUrlHit,
        child_bun_argv_record_count: run.childProcessRecordCount,
        child_bun_raw_canary_seen_count: run.childProcessRawCanarySeenCount,
        child_process_programs: run.childProcessPrograms,
        cleanup_report_ok: report?.ok,
        cleanup_report_match_disposition: report?.match_disposition,
        cleanup_report_delete_count: report?.delete_count,
        evidence,
        before,
        during_failure: duringFailure,
        after,
      };
      writeFileSync(
        `${evidenceRoot}/sanitized-summary.json`,
        `${JSON.stringify(summary, null, 2)}\n`
      );

      expect(run.result.status).not.toBe(0);
      expect(run.outputCanaryHit).toBe(false);
      expect(run.outputRawUrlHit).toBe(false);
      expect(run.argvCanaryHit).toBe(false);
      expect(run.argvRawUrlHit).toBe(false);
      expect(run.childProcessRecordCount).toBeGreaterThan(0);
      expect(run.childProcessRawCanarySeenCount).toBe(0);
      expect(report?.ok).toBe(false);
      expect(report?.match_disposition).toBe('exact_one');
      expect(report?.delete_count).toBe(0);
      expect(evidence.canaryHits).toBe(0);
      expect(evidence.rawUrlHits).toBe(0);
      expect(duringFailure).toEqual([
        { name: 'data_plane_ponr_reject_mutation', enabled: 'O' },
        { name: 'data_plane_ponr_reject_truncate', enabled: 'O' },
        { name: 's30_shell_delete_bomb', enabled: 'O' },
      ]);
      expectMarkerLifecycle(before, after, 1);
    },
    180_000
  );

  itReal(
    'RR-7: foreign PONR is rejected fail-closed with full identity canaries absent everywhere',
    async () => {
      await clearShellPonr(markerUrl);
      await seedShellAudit(markerUrl);
      await seedExactPonrMarker({ gateDatabaseUrl: gateUrl, markerDatabaseUrl: markerUrl });
      await mutateMarkerSurface(markerUrl);
      const before = await markerState(markerUrl);
      const evidenceRoot = new URL(
        `../../.tmp/GATE-FIX-explicit-ponr-database-binding/red/rr7-foreign-${Date.now()}-${process.pid}`,
        import.meta.url
      ).pathname;
      let fullIdentityFailure: CleanupWrapperRun | undefined;
      let foreignRowFailure: CleanupWrapperRun | undefined;
      try {
        fullIdentityFailure = runCleanupWrapper(
          evidenceRoot,
          credentialCanaryUrl(gateUrl),
          credentialCanaryUrl(markerUrl),
          'foreign-auth-failure'
        );
        foreignRowFailure = runCleanupWrapper(
          evidenceRoot,
          queryFragmentCanaryUrl(gateUrl),
          queryFragmentCanaryUrl(markerUrl),
          'foreign-row-rejection'
        );
      } finally {
        await restoreMarkerSurface(markerUrl);
      }
      const after = await markerState(markerUrl);
      const evidence = scanTextFiles(evidenceRoot);
      const fullRun = fullIdentityFailure;
      const foreignRun = foreignRowFailure;
      if (!fullRun || !foreignRun) throw new Error('foreign cleanup runs did not execute');
      const foreignReport = readEvidenceJson(foreignRun.outPath);
      const summary = {
        source_sha: spawnSync('git', ['rev-parse', 'HEAD'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        }).stdout.trim(),
        full_identity_exit_code: fullRun.result.status,
        foreign_row_exit_code: foreignRun.result.status,
        full_identity_output_canary_hit: fullRun.outputCanaryHit,
        foreign_row_output_canary_hit: foreignRun.outputCanaryHit,
        full_identity_output_raw_url_hit: fullRun.outputRawUrlHit,
        foreign_row_output_raw_url_hit: foreignRun.outputRawUrlHit,
        full_identity_argv_canary_hit: fullRun.argvCanaryHit,
        foreign_row_argv_canary_hit: foreignRun.argvCanaryHit,
        full_identity_child_bun_argv_record_count: fullRun.childProcessRecordCount,
        foreign_row_child_bun_argv_record_count: foreignRun.childProcessRecordCount,
        full_identity_child_bun_raw_canary_seen_count: fullRun.childProcessRawCanarySeenCount,
        foreign_row_child_bun_raw_canary_seen_count: foreignRun.childProcessRawCanarySeenCount,
        foreign_row_report_ok: foreignReport?.ok,
        foreign_row_report_match_disposition: foreignReport?.match_disposition,
        foreign_row_report_error_code: (foreignReport?.error as { code?: unknown } | undefined)
          ?.code,
        evidence,
        before,
        after,
      };
      writeFileSync(
        `${evidenceRoot}/sanitized-summary.json`,
        `${JSON.stringify(summary, null, 2)}\n`
      );

      expect(fullRun.result.status).not.toBe(0);
      expect(foreignRun.result.status).not.toBe(0);
      expect(fullRun.outputCanaryHit).toBe(false);
      expect(foreignRun.outputCanaryHit).toBe(false);
      expect(fullRun.outputRawUrlHit).toBe(false);
      expect(foreignRun.outputRawUrlHit).toBe(false);
      expect(fullRun.argvCanaryHit).toBe(false);
      expect(foreignRun.argvCanaryHit).toBe(false);
      expect(fullRun.argvRawUrlHit).toBe(false);
      expect(foreignRun.argvRawUrlHit).toBe(false);
      expect(fullRun.childProcessRecordCount).toBeGreaterThan(0);
      expect(foreignRun.childProcessRecordCount).toBeGreaterThan(0);
      expect(fullRun.childProcessRawCanarySeenCount).toBe(0);
      expect(foreignRun.childProcessRawCanarySeenCount).toBe(0);
      expect(foreignReport?.ok).toBe(false);
      expect(foreignReport?.match_disposition).toBe('foreign_or_multiple');
      expect((foreignReport?.error as { code?: unknown } | undefined)?.code).toBe(
        'PONR_MARKER_FOREIGN_OR_MULTIPLE'
      );
      expect(evidence.canaryHits).toBe(0);
      expect(evidence.rawUrlHits).toBe(0);
      expectMarkerLifecycle(before, after, 1);
    },
    180_000
  );

  itReal(
    'RED-7: C-3 role probes never place credential canaries on child argv or output',
    () => {
      const evidenceRoot = new URL(
        `../../.tmp/GATE-FIX-explicit-ponr-database-binding/red/c3-canary-${Date.now()}-${process.pid}`,
        import.meta.url
      ).pathname;
      const directDir = `${evidenceRoot}/direct-role-probe`;
      const negativeDir = `${evidenceRoot}/negative-marker-chain`;
      mkdirSync(directDir, { recursive: true });
      mkdirSync(negativeDir, { recursive: true });
      const recordPath = writeProcessRecorder(evidenceRoot);
      const recorderDir = `${evidenceRoot}/process-recorder`;
      const canaryGate = credentialCanaryUrl(gateUrl);
      const queryFragmentGate = queryFragmentCanaryUrl(gateUrl);
      const queryFragmentMarker = queryFragmentCanaryUrl(markerUrl);
      const commandEnv = {
        ...process.env,
        PATH: `${recorderDir}:${process.env.PATH ?? ''}`,
        S30_PROCESS_RECORD: recordPath,
        S30_REAL_BUN: execFileSync('which', ['bun'], { encoding: 'utf8' }).trim(),
        S30_REAL_PYTHON: execFileSync('which', ['python3'], { encoding: 'utf8' }).trim(),
        S30_C3_USER_CANARY: C3_CANARIES[0],
        S30_C3_PASSWORD_CANARY: C3_CANARIES[1],
        S30_C3_QUERY_CANARY: C3_CANARIES[2],
        S30_C3_FRAGMENT_CANARY: C3_CANARIES[3],
      };
      const direct = spawnSync('bash', ['scripts/probe-ponr-role-immutability.sh', directDir], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...commandEnv, DATABASE_URL: canaryGate },
      });
      const negative = spawnSync(
        'bash',
        ['scripts/probe-ponr-role-immutability-negative-marker.sh', negativeDir],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: {
            ...commandEnv,
            DATABASE_URL: queryFragmentGate,
            HOLO_PROBE_MARKER_MISS_DATABASE_URL: queryFragmentMarker,
          },
        }
      );
      const directOutput = `${direct.stdout ?? ''}\n${direct.stderr ?? ''}`;
      const negativeOutput = `${negative.stdout ?? ''}\n${negative.stderr ?? ''}`;
      const records = readProcessRecords(recordPath);
      const recordedPrograms = new Set(
        records
          .map((record) => record.program)
          .filter((program): program is string => Boolean(program))
      );
      const directFiles = scanTextFiles(directDir);
      const negativeFiles = scanTextFiles(negativeDir);
      const evidenceSummary = {
        source_sha: spawnSync('git', ['rev-parse', 'HEAD'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        }).stdout.trim(),
        command:
          'probe-ponr-role-immutability.sh and probe-ponr-role-immutability-negative-marker.sh',
        direct_exit_code: direct.status,
        negative_exit_code: negative.status,
        process_record_count: records.length,
        recorded_programs: [...recordedPrograms].sort(),
        process_raw_canary_seen_count: records.filter((record) => record.raw_canary_seen !== 0)
          .length,
        direct_output_canary_hit: C3_CANARIES.some((canary) => directOutput.includes(canary)),
        negative_output_canary_hit: C3_CANARIES.some((canary) => negativeOutput.includes(canary)),
        direct_evidence_files: directFiles.files,
        direct_evidence_canary_hit_files: directFiles.canaryHits,
        direct_evidence_raw_url_hit_files: directFiles.rawUrlHits,
        negative_evidence_files: negativeFiles.files,
        negative_evidence_canary_hit_files: negativeFiles.canaryHits,
        negative_evidence_raw_url_hit_files: negativeFiles.rawUrlHits,
      };
      writeFileSync(
        `${evidenceRoot}/sanitized-summary.json`,
        `${JSON.stringify(evidenceSummary, null, 2)}\n`,
        'utf8'
      );

      expect(records.length).toBeGreaterThan(0);
      expect(recordedPrograms.has('bun')).toBe(true);
      expect(recordedPrograms.has('python3')).toBe(true);
      expect(recordedPrograms.has('psql')).toBe(true);
      expect(direct.status).toBe(0);
      expect(negative.status).not.toBe(0);
      expect(evidenceSummary.process_raw_canary_seen_count).toBe(0);
      expect(evidenceSummary.direct_output_canary_hit).toBe(false);
      expect(evidenceSummary.negative_output_canary_hit).toBe(false);
      expect(evidenceSummary.direct_evidence_canary_hit_files).toBe(0);
      expect(evidenceSummary.negative_evidence_canary_hit_files).toBe(0);
      expect(evidenceSummary.direct_evidence_raw_url_hit_files).toBe(0);
      expect(evidenceSummary.negative_evidence_raw_url_hit_files).toBe(0);
    },
    180_000
  );

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
