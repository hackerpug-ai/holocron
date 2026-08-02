/**
 * D06-05 GREEN + REDHAT-FIX-S29-C02: durable flip, cross-process fence, rollback-repoint.
 * D06-05 GREEN + REDHAT-FIX-S29-H01: flip app + MCP into rollbackable read-only soak;
 * verification gates hit a real listening network /mcp and /article (not in-process sole oracle).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-soak-flip.test.ts
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  DEFAULT_KEYS,
  type LiveService,
  PLATFORM_IT,
  startLiveService,
} from '../../../../tests/integration/service/harness';
import { loadSecretsFile } from '../../src/config/secrets.ts';
import {
  ETL_NOT_RECONCILED,
  isMigrationReadOnly,
  MIGRATION_READ_ONLY_ENV,
  readDurableMigrationReadOnly,
  runCutoverFlip,
  runCutoverRollbackRepoint,
  runHonoWriteSweep,
  runVerifyArticle,
  runVerifyJobs,
  runVerifyReads,
  runVerifySoak,
  runVerifyTools,
  setMigrationReadOnlyEnv,
  writeDurableMigrationReadOnly,
} from '../../src/cutover/soak-fence.ts';
import { createSql, type Sql } from '../../src/db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../src/db/connection.ts';
import { executePostgresMcpTool } from '../../src/mcp/executor.ts';
import { defaultManifestPath, loadManifest } from '../../src/mcp/manifest-loader.ts';
import { MIGRATED_JOBS } from '../../src/queue/jobs-registry.ts';
import { runJob } from '../../src/queue/jobs-runner.ts';
import {
  buildHonoMinBodies,
  buildRouteRequest,
  createFencedApp,
  discoverHonoWriteRoutes,
  discoverTaskTimeoutJob,
  freshSeedIds,
  issueHonoWrite,
  unsetMigrationFlag,
} from './write-fence-red.helpers';

if (!PLATFORM_IT) {
  throw new Error('sprint29-soak-flip requires PLATFORM_IT=1');
}

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/D06-05');
const C02_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-C02');
const H01_EVIDENCE = resolve(
  REPO_ROOT,
  '.tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip'
);
const H02_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-H02');
/** Immutable multi-table D06-04-shaped watermark (committed). Never authored from live SELECT. */
const IMMUTABLE_ETL_FIXTURE = resolve(
  REPO_ROOT,
  'services/platform/tests/fixtures/sprint29/watermark-report-multi-table.json'
);
const HOLO = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const DATABASE_URL = resolveHolocronNonprodDatabaseUrl({
  databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  context: 'sprint29-soak-flip test',
});
const RUN = randomUUID().slice(0, 8);
/** Disposable control-plane for durable fence tests (never touch real secrets.yaml). */
const DISPOSABLE_SECRETS = resolve(C02_EVIDENCE, `secrets-${RUN}.yaml`);

function evidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(resolve(EVIDENCE, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function c02Evidence(name: string, body: unknown): void {
  mkdirSync(C02_EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(resolve(C02_EVIDENCE, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function holo(
  args: string[],
  env: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('bun', [HOLO, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 300_000,
    env: {
      ...process.env,
      DATABASE_URL,
      HOLO_KEY_RN: DEFAULT_KEYS.rn,
      HOLO_KEY_MCP: DEFAULT_KEYS.mcp,
      HOLO_KEY_CONTROL: DEFAULT_KEYS.control,
      HOLO_SECRETS_PATH: DISPOSABLE_SECRETS,
      ...env,
    },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('Sprint 29 D06-05 soak flip + verify gates', () => {
  let sql: Sql;
  let greenEtlPath: string;
  let varianceEtlPath: string;
  let articleBaselinePath: string;
  let shareToken: string;
  let baselineCounts: Record<string, number>;
  /** Real listening Hono/MCP server — production oracle for H-01 network verify. */
  let liveService: LiveService | undefined;
  let networkBaseUrl = '';

  beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(C02_EVIDENCE, { recursive: true });
    // Disposable control-plane — isolate durable fence from operator secrets.yaml
    writeFileSync(
      DISPOSABLE_SECRETS,
      '# disposable C-02 secrets\nHOLO_MIGRATION_READ_ONLY: "0"\nHOLO_DATA_PLANE: "postgres"\n',
      { mode: 0o600 }
    );
    process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
    mkdirSync(H01_EVIDENCE, { recursive: true });
    unsetMigrationFlag();
    // Explicit disengage so durable re-read of "0" does not arm fence
    setMigrationReadOnlyEnv('0');
    sql = createSql(DATABASE_URL);

    // H-02: reuse a pre-existing public document so we do not mutate table counts
    // that the immutable ETL fixture binds (no live SELECT→loadedByTable authorship).
    const existingPublic = await sql<
      { share_token: string }[]
    >`SELECT share_token FROM documents
      WHERE is_public = true AND share_token IS NOT NULL
      ORDER BY id
      LIMIT 1`;
    if (!existingPublic[0]?.share_token) {
      throw new Error(
        'H-02 requires a pre-existing public document for article baseline; refusing to INSERT and rewrite ETL counts from live SELECT'
      );
    }
    shareToken = existingPublic[0].share_token;

    // Capture baseline from the real Hono /article/ route (same bytes AC-4 compares)
    process.env.DATABASE_URL = DATABASE_URL;
    // Arm fence in this process (jobs / hono sweep / flip) AND the live server child
    setMigrationReadOnlyEnv('1');
    liveService = await startLiveService({
      keys: { ...DEFAULT_KEYS },
      databaseUrl: DATABASE_URL,
      extraEnv: {
        HOLO_MIGRATION_READ_ONLY: '1',
        // Propagate live search key when present so findRecommendations is schema-valid
        ...(process.env.JINA_API_KEY ? { JINA_API_KEY: process.env.JINA_API_KEY } : {}),
      },
      readyTimeoutMs: 60_000,
    });
    networkBaseUrl = liveService.baseUrl;
    process.env.HOLO_VERIFY_BASE_URL = networkBaseUrl;
    process.env.PLATFORM_URL = networkBaseUrl;

    // Network baseline capture (H-01: not sole in-process oracle)
    const baselineRes = await fetch(`${networkBaseUrl}/article/${shareToken}`, {
      method: 'GET',
      headers: { accept: 'text/html' },
    });
    const baselineBuf = Buffer.from(await baselineRes.arrayBuffer());
    if (baselineRes.status !== 200 || baselineBuf.byteLength === 0) {
      throw new Error(
        `failed to capture article baseline status=${baselineRes.status} bytes=${baselineBuf.byteLength} stderr=${liveService.stderr.slice(0, 500)}`
      );
    }
    const sha256 = createHash('sha256').update(baselineBuf).digest('hex');
    articleBaselinePath = resolve(EVIDENCE, 'article-baseline.json');
    writeFileSync(
      articleBaselinePath,
      `${JSON.stringify(
        {
          ok: true,
          sha256,
          byteLength: baselineBuf.byteLength,
          capturedAtMs: Date.now(),
          fence_armed_at: Date.now() - 1000,
          shareToken,
          url: `${networkBaseUrl}/article/${shareToken}`,
          status: 200,
          path: articleBaselinePath,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    // Also place at D06-03 default path so CLI defaults resolve
    mkdirSync(resolve(REPO_ROOT, '.tmp/D06-03'), { recursive: true });
    writeFileSync(
      resolve(REPO_ROOT, '.tmp/D06-03/article-baseline.json'),
      readFileSync(articleBaselinePath, 'utf8'),
      'utf8'
    );

    // H-02: load immutable multi-table D06-04-shaped watermark from committed fixture.
    // NEVER derive loadedByTable from live SELECT count(*) (dual-lens anti-stub).
    if (!existsSync(IMMUTABLE_ETL_FIXTURE)) {
      throw new Error(`H-02 immutable ETL fixture missing: ${IMMUTABLE_ETL_FIXTURE}`);
    }
    const frozenRaw = readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8');
    const frozen = JSON.parse(frozenRaw) as {
      ok?: boolean;
      runId?: string;
      unexplainedVariance?: number;
      exportArchiveHash?: string;
      loadedByTable?: Record<string, number>;
      reconcile?: { ok?: boolean; unexplainedVariance?: number };
    };
    if (!frozen.loadedByTable || typeof frozen.loadedByTable !== 'object') {
      throw new Error('H-02 immutable fixture missing loadedByTable');
    }
    baselineCounts = { ...frozen.loadedByTable };
    if (Object.keys(baselineCounts).length < 4) {
      throw new Error('H-02 requires multi-table immutable baseline (>=4 tables)');
    }
    if (!frozen.runId || frozen.runId.length === 0) {
      throw new Error('H-02 immutable fixture missing runId');
    }
    if (
      typeof frozen.exportArchiveHash !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(frozen.exportArchiveHash)
    ) {
      throw new Error('H-02 immutable fixture missing exportArchiveHash (64-hex)');
    }

    // Copy fixture verbatim into evidence + default D06-04 path (read-only source of truth).
    greenEtlPath = resolve(EVIDENCE, 'watermark-report-green.json');
    const fixtureBody = frozenRaw.endsWith('\n') ? frozenRaw : `${frozenRaw}\n`;
    writeFileSync(greenEtlPath, fixtureBody, 'utf8');
    mkdirSync(resolve(REPO_ROOT, '.tmp/D06-04'), { recursive: true });
    writeFileSync(resolve(REPO_ROOT, '.tmp/D06-04/watermark-report.json'), fixtureBody, 'utf8');
    mkdirSync(H02_EVIDENCE, { recursive: true });
    writeFileSync(resolve(H02_EVIDENCE, 'immutable-etl-fixture-copy.json'), fixtureBody, 'utf8');

    // Variance fixture reuses the same immutable loadedByTable (flip refuse path only).
    varianceEtlPath = resolve(EVIDENCE, 'watermark-report-variance.json');
    writeFileSync(
      varianceEtlPath,
      `${JSON.stringify(
        {
          ok: false,
          runId: `variance-${frozen.runId}`,
          unexplainedVariance: 3,
          exportArchiveHash: frozen.exportArchiveHash,
          loadedByTable: baselineCounts,
          reconcile: { ok: false, unexplainedVariance: 3 },
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    evidence('setup.json', {
      RUN,
      shareToken,
      baselineCounts,
      greenEtlPath,
      immutableEtlFixture: IMMUTABLE_ETL_FIXTURE,
      articleBaselinePath,
      networkBaseUrl,
      note: 'H-02 baselineCounts loaded from committed fixture — not live SELECT',
    });
  }, 120_000);

  afterAll(async () => {
    // Disengage durable + in-process fence for isolation
    try {
      writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });
    } catch {
      /* ignore */
    }
    setMigrationReadOnlyEnv('0');
    unsetMigrationFlag();
    await liveService?.stop();
    await sql?.end({ timeout: 5 });
  });

  // ── AC-1 / TC-1 / TC-2 ────────────────────────────────────────────────────

  it('TC-1/AC-1: cutover:flip refuses when unexplainedVariance > 0', () => {
    setMigrationReadOnlyEnv('0');
    const report = runCutoverFlip({
      cwd: REPO_ROOT,
      etlReportPath: varianceEtlPath,
      reportPath: resolve(EVIDENCE, 'flip-variance.json'),
      secretsPath: DISPOSABLE_SECRETS,
    });
    evidence('tc1-flip-variance.json', report);
    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe(ETL_NOT_RECONCILED);
    expect(report.unexplainedVariance).toBeGreaterThan(0);
    // Failed flip must not arm durable fence to 1
    expect(readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS)).not.toBe('1');
    expect(isMigrationReadOnly()).toBe(false);

    const cli = holo([
      'cutover:flip',
      '--json',
      '--etl-report',
      varianceEtlPath,
      '--output',
      resolve(EVIDENCE, 'flip-variance-cli.json'),
    ]);
    evidence('tc1-cli.json', { status: cli.status, stdout: cli.stdout, stderr: cli.stderr });
    expect(cli.status).not.toBe(0);
  });

  it('TC-2/AC-1: cutover:flip engages HOLO_MIGRATION_READ_ONLY=1 with engaged_at + etl runId', () => {
    setMigrationReadOnlyEnv('0');
    const report = runCutoverFlip({
      cwd: REPO_ROOT,
      etlReportPath: greenEtlPath,
      reportPath: resolve(EVIDENCE, 'flip-green.json'),
      secretsPath: DISPOSABLE_SECRETS,
    });
    evidence('tc2-flip-green.json', report);
    expect(report.ok).toBe(true);
    expect(report.engaged_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.etl_run_id.length).toBeGreaterThan(0);
    expect(report.env_value).toBe('1');
    expect(isMigrationReadOnly()).toBe(true);
    expect(process.env.HOLO_MIGRATION_READ_ONLY).toBe('1');
    // C-02: durable control-plane write (not process.env alone)
    expect(report.configured_target.length).toBeGreaterThanOrEqual(8);
    expect(report.configured_target).toBe(DISPOSABLE_SECRETS);
    expect(report.durable_reread).toBe(true);
    expect(report.process_generations.before.length).toBeGreaterThan(0);
    expect(report.process_generations.after.length).toBeGreaterThan(0);
    const durable = readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS);
    expect(durable).toBe('1');
    expect(loadSecretsFile(DISPOSABLE_SECRETS)[MIGRATION_READ_ONLY_ENV]).toBe('1');

    const cli = holo([
      'cutover:flip',
      '--json',
      '--etl-report',
      greenEtlPath,
      '--output',
      resolve(EVIDENCE, 'flip-green-cli.json'),
    ]);
    evidence('tc2-cli.json', { status: cli.status, stdout: cli.stdout.slice(0, 2000) });
    expect(cli.status).toBe(0);
    const parsed = JSON.parse(cli.stdout) as {
      ok?: boolean;
      engaged_at?: string;
      configured_target?: string;
      durable_reread?: boolean;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.engaged_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((parsed.configured_target ?? '').length).toBeGreaterThanOrEqual(8);
    expect(parsed.durable_reread).toBe(true);
  });

  // ── REDHAT-FIX-S29-C02: durable + cross-process + rollback ────────────────

  it('REDHAT-FIX-S29-C02: durable control-plane write + process_generations on flip', () => {
    setMigrationReadOnlyEnv('0');
    writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });
    const report = runCutoverFlip({
      cwd: REPO_ROOT,
      etlReportPath: greenEtlPath,
      reportPath: resolve(C02_EVIDENCE, 'flip-report.json'),
      secretsPath: DISPOSABLE_SECRETS,
    });
    c02Evidence('tc-c02-durable-flip.json', report);
    expect(report.ok).toBe(true);
    expect(report.configured_target).toBe(DISPOSABLE_SECRETS);
    expect(report.durable_reread).toBe(true);
    expect(report.env_value).toBe('1');
    expect(report.etl_run_id.length).toBeGreaterThan(0);
    expect(report.engaged_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.process_generations.before.some((u) => u.id.length > 0)).toBe(true);
    expect(report.process_generations.after.some((u) => u.id.length > 0)).toBe(true);
    // Authoritative file content
    const fileBody = readFileSync(DISPOSABLE_SECRETS, 'utf8');
    expect(fileBody).toMatch(/HOLO_MIGRATION_READ_ONLY[: ]+["']?1/);
    // Mirror report for operators
    writeFileSync(
      resolve(REPO_ROOT, '.tmp/D06-05/flip-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
  });

  it('REDHAT-FIX-S29-C02: cross-process child without env inject still fences writes', async () => {
    // Ensure durable fence is armed on disposable control-plane
    writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });
    // Parent process must NOT inject HOLO_MIGRATION_READ_ONLY into the child
    setMigrationReadOnlyEnv('0'); // explicit parent disengage — child has no inherit of '1'
    unsetMigrationFlag();

    const before = Number((await sql`SELECT count(*)::int AS c FROM documents`)[0]?.c ?? 0);

    // Child process: HOLO_SECRETS_PATH set, HOLO_MIGRATION_READ_ONLY stripped
    const childScript = `
      import { createHonoApp } from ${JSON.stringify(resolve(REPO_ROOT, 'services/platform/src/http/hono-app.ts'))};
      import { isMigrationReadOnly, MIGRATION_READ_ONLY_BODY } from ${JSON.stringify(resolve(REPO_ROOT, 'services/platform/src/cutover/soak-fence.ts'))};
      import { runJob } from ${JSON.stringify(resolve(REPO_ROOT, 'services/platform/src/queue/jobs-runner.ts'))};
      import { MIGRATED_JOBS } from ${JSON.stringify(resolve(REPO_ROOT, 'services/platform/src/queue/jobs-registry.ts'))};
      import { executePostgresMcpTool } from ${JSON.stringify(resolve(REPO_ROOT, 'services/platform/src/mcp/executor.ts'))};

      const envInjected = process.env.HOLO_MIGRATION_READ_ONLY;
      const fenced = isMigrationReadOnly();
      const app = createHonoApp({
        keys: {
          rn: process.env.HOLO_KEY_RN ?? 'test-rn',
          mcp: process.env.HOLO_KEY_MCP ?? 'test-mcp',
          control: process.env.HOLO_KEY_CONTROL ?? 'test-control',
        },
        databaseUrl: process.env.DATABASE_URL,
      });
      const res = await app.request('/api/documents', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + (process.env.HOLO_KEY_RN ?? 'test-rn'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ title: 'c02-cross-process', content: 'must-block' }),
      });
      const body = await res.json().catch(() => ({}));
      let mcpMsg = '';
      try {
        await executePostgresMcpTool(
          'store_document',
          { title: 'c02-mcp', content: 'blocked' },
          { databaseUrl: process.env.DATABASE_URL }
        );
      } catch (e) {
        mcpMsg = e instanceof Error ? e.message : String(e);
      }
      const job = MIGRATED_JOBS.find((j) => j.name === 'task-timeout-worker') ?? MIGRATED_JOBS[0];
      const jobResult = await runJob(job, { databaseUrl: process.env.DATABASE_URL });
      console.log(JSON.stringify({
        envInjected: envInjected ?? null,
        fenced,
        status: res.status,
        error: body?.error ?? null,
        code: body?.code ?? null,
        mcpMsg,
        jobOk: jobResult.ok,
        jobError: jobResult.error ?? null,
      }));
    `;

    const childEnv: Record<string, string | undefined> = {
      ...process.env,
      DATABASE_URL,
      HOLO_KEY_RN: DEFAULT_KEYS.rn,
      HOLO_KEY_MCP: DEFAULT_KEYS.mcp,
      HOLO_KEY_CONTROL: DEFAULT_KEYS.control,
      HOLO_SECRETS_PATH: DISPOSABLE_SECRETS,
      HOLOCRON_SECRETS_PATH: DISPOSABLE_SECRETS,
    };
    // Critical: strip client env inject anti-pattern (gate-plan.json:75-80)
    delete childEnv.HOLO_MIGRATION_READ_ONLY;

    const child = spawnSync('bun', ['-e', childScript], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120_000,
      env: childEnv as NodeJS.ProcessEnv,
    });
    c02Evidence('tc-c02-cross-process.json', {
      status: child.status,
      stdout: child.stdout,
      stderr: child.stderr?.slice(0, 2000),
    });
    expect(child.status, `child failed: ${child.stderr}`).toBe(0);
    const parsed = JSON.parse(child.stdout.trim().split('\n').pop() ?? '{}') as {
      envInjected: string | null;
      fenced: boolean;
      status: number;
      error: string | null;
      code: string | null;
      mcpMsg: string;
      jobOk: boolean;
      jobError: string | null;
    };
    expect(parsed.envInjected).toBeNull();
    expect(parsed.fenced).toBe(true);
    expect(parsed.status).toBe(423);
    expect(parsed.error).toBe('migration_read_only');
    expect(parsed.code).toBe('migration_read_only');
    expect(parsed.mcpMsg.startsWith('MIGRATION_READ_ONLY:')).toBe(true);
    expect(parsed.jobOk).toBe(false);
    expect(String(parsed.jobError).startsWith('migration_read_only:')).toBe(true);

    const after = Number((await sql`SELECT count(*)::int AS c FROM documents`)[0]?.c ?? 0);
    expect(after).toBe(before);

    // Re-arm parent env for subsequent suite tests
    setMigrationReadOnlyEnv('1');
  }, 180_000);

  it('REDHAT-FIX-S29-C02: cutover:rollback-repoint writes Convex data-plane audit', () => {
    writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });
    setMigrationReadOnlyEnv('1');
    const report = runCutoverRollbackRepoint({
      cwd: REPO_ROOT,
      reportPath: resolve(C02_EVIDENCE, 'rollback-report.json'),
      secretsPath: DISPOSABLE_SECRETS,
      target: 'frozen:convex:c02-test',
    });
    c02Evidence('tc-c02-rollback-repoint.json', report);
    expect(report.ok).toBe(true);
    expect(report.action).toBe('rollback-repoint');
    expect(report.data_plane).toBe('convex');
    expect(report.target_kind).toBe('convex');
    expect(report.target.length).toBeGreaterThan(0);
    expect(report.engaged_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.configured_target).toBe(DISPOSABLE_SECRETS);
    expect(existsSync(resolve(REPO_ROOT, 'convex'))).toBe(true);
    const secrets = loadSecretsFile(DISPOSABLE_SECRETS);
    expect(secrets.HOLO_DATA_PLANE).toBe('convex');
    expect(secrets.HOLO_ROLLBACK_TARGET).toBe('frozen:convex:c02-test');

    const cli = holo([
      'cutover:rollback-repoint',
      '--json',
      '--target',
      'frozen:convex:cli',
      '--output',
      resolve(C02_EVIDENCE, 'rollback-report-cli.json'),
    ]);
    c02Evidence('tc-c02-rollback-cli.json', {
      status: cli.status,
      stdout: cli.stdout.slice(0, 2000),
    });
    expect(cli.status).toBe(0);
    const parsed = JSON.parse(cli.stdout) as {
      ok?: boolean;
      data_plane?: string;
      target?: string;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data_plane).toBe('convex');
    expect((parsed.target ?? '').length).toBeGreaterThan(0);

    // Also land under D06-05 path for VERIFY jq contract
    writeFileSync(
      resolve(REPO_ROOT, '.tmp/D06-05/rollback-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
  });

  // ── D06-01 fence ACs turned GREEN ─────────────────────────────────────────

  it('TC-Hono/AC-5: fenced Hono write routes return 423 + dual-key body; row count unchanged', async () => {
    setMigrationReadOnlyEnv('1');
    const app = createFencedApp();
    const routes = discoverHonoWriteRoutes(app);
    expect(routes.length).toBeGreaterThanOrEqual(23);
    const seeds = freshSeedIds();
    const bodies = buildHonoMinBodies(RUN, seeds);
    const before = Number((await sql`SELECT count(*)::int AS c FROM documents`)[0]?.c ?? 0);
    const failures: string[] = [];
    for (const route of routes) {
      const req = buildRouteRequest(route, RUN, seeds, bodies);
      const res = await issueHonoWrite(app, req);
      const bodyOk =
        res.status === 423 &&
        res.body !== null &&
        typeof res.body === 'object' &&
        (res.body as { error?: string }).error === 'migration_read_only' &&
        (res.body as { code?: string }).code === 'migration_read_only';
      if (!bodyOk) {
        failures.push(
          `${route.id} status=${res.status} body=${JSON.stringify(res.body).slice(0, 180)}`
        );
      }
    }
    const after = Number((await sql`SELECT count(*)::int AS c FROM documents`)[0]?.c ?? 0);
    evidence('tc-hono-fenced.json', { failures, before, after, routeCount: routes.length });
    expect(failures, failures.join('; ')).toEqual([]);
    expect(after).toBe(before);

    // AC-5 primary path: POST /api/documents
    const sweep = await runHonoWriteSweep({ keys: { ...DEFAULT_KEYS }, databaseUrl: DATABASE_URL });
    evidence('tc-hono-sweep.json', sweep);
    expect(sweep.ok).toBe(true);
    expect(sweep.status).toBe(423);
  }, 120_000);

  it('TC-MCP: mutation tools throw MIGRATION_READ_ONLY when fenced; reads still invoke', async () => {
    setMigrationReadOnlyEnv('1');
    let rejected = false;
    let msg = '';
    try {
      await executePostgresMcpTool(
        'store_document',
        { title: `soak-${RUN}`, content: 'blocked' },
        { databaseUrl: DATABASE_URL }
      );
    } catch (err) {
      rejected = true;
      msg = err instanceof Error ? err.message : String(err);
    }
    evidence('tc-mcp-mutation.json', { rejected, msg });
    expect(rejected).toBe(true);
    expect(msg.startsWith('MIGRATION_READ_ONLY:')).toBe(true);

    // Read tool should not throw MIGRATION_READ_ONLY
    let readOk = false;
    try {
      await executePostgresMcpTool('list_documents', { limit: 1 }, { databaseUrl: DATABASE_URL });
      readOk = true;
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      // Domain errors ok; fence prefix is not
      expect(m.startsWith('MIGRATION_READ_ONLY:')).toBe(false);
      readOk = true;
    }
    expect(readOk).toBe(true);
  }, 60_000);

  it('TC-Jobs: runJob returns ok:false migration_read_only: without side effects', async () => {
    setMigrationReadOnlyEnv('1');
    const job = discoverTaskTimeoutJob();
    const before = Number(
      (await sql`SELECT count(*)::int AS c FROM job_runs WHERE job_name = 'task-timeout-worker'`)[0]
        ?.c ?? 0
    );
    const result = await runJob(job, { databaseUrl: DATABASE_URL, runId: randomUUID() });
    const after = Number(
      (await sql`SELECT count(*)::int AS c FROM job_runs WHERE job_name = 'task-timeout-worker'`)[0]
        ?.c ?? 0
    );
    evidence('tc-job-fenced.json', { result, before, after });
    expect(result.ok).toBe(false);
    expect(String(result.error).startsWith('migration_read_only:')).toBe(true);
    expect(after).toBe(before);
  }, 60_000);

  // ── AC-2 / TC-3 / TC-4 / H-01 network ─────────────────────────────────────

  it('TC-3/4 AC-2 H-01: network /mcp verify-tools; schema_valid reads; mutations MIGRATION_READ_ONLY', async () => {
    setMigrationReadOnlyEnv('1');
    process.env.DATABASE_URL = DATABASE_URL;
    expect(networkBaseUrl.length).toBeGreaterThan(0);
    const manifest = loadManifest(defaultManifestPath(REPO_ROOT));
    const report = await runVerifyTools({
      cwd: REPO_ROOT,
      keys: { ...DEFAULT_KEYS },
      databaseUrl: DATABASE_URL,
      baseUrl: networkBaseUrl,
    });
    evidence('tc-verify-tools.json', {
      toolsTotal: report.toolsTotal,
      toolsPassed: report.toolsPassed,
      toolsStubbed: report.toolsStubbed,
      ok: report.ok,
      transport: report.transport,
      base_url: report.base_url,
      mutations: report.tools
        .filter((t) => t.is_mutation)
        .map((t) => ({
          id: t.tool_id,
          ok: t.ok,
          code: t.code,
        })),
      reads: report.tools
        .filter((t) => !t.is_mutation)
        .map((t) => ({
          id: t.tool_id,
          ok: t.ok,
          isError: t.isError,
          schema_valid: t.schema_valid,
          status: t.status,
        })),
    });
    writeFileSync(
      resolve(H01_EVIDENCE, 'verify-tools-network.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );

    // H-01: network transport + non-null concrete counts
    expect(report.transport).toBe('network');
    expect(report.base_url).toBe(networkBaseUrl);
    expect(report.toolsTotal).toBe(manifest.tools.length);
    expect(report.toolsTotal).toBeGreaterThanOrEqual(44);
    expect(typeof report.toolsPassed).toBe('number');
    expect(typeof report.toolsTotal).toBe('number');
    expect(report.toolsPassed).not.toBeNull();
    expect(report.toolsTotal).not.toBeNull();
    expect(report.toolsStubbed).toBe(0);
    expect(report.tools.length).toBe(report.toolsTotal);
    expect(report.tools.every((t) => t.invoked === true)).toBe(true);

    const mutations = report.tools.filter((t) => t.is_mutation);
    expect(mutations.length).toBe(21);
    expect(
      mutations.every(
        (t) =>
          t.ok === true &&
          t.isError === true &&
          (t.code === 'MIGRATION_READ_ONLY' ||
            (typeof t.message === 'string' && t.message.startsWith('MIGRATION_READ_ONLY:')))
      )
    ).toBe(true);

    const reads = report.tools.filter((t) => !t.is_mutation);
    // H-01 AC-2: never pass a read solely on HTTP 200 when isError
    expect(reads.every((t) => !(t.ok === true && t.isError === true))).toBe(true);
    expect(reads.every((t) => t.schema_valid === true)).toBe(true);
    expect(reads.every((t) => t.isError !== true)).toBe(true);
    expect(reads.every((t) => t.ok === true)).toBe(true);

    expect(report.toolsPassed).toBe(report.toolsTotal);
    expect(report.ok).toBe(true);
  }, 300_000);

  it('H-01 AC-5: unreachable base URL fails closed with non-null toolsPassed/toolsTotal', async () => {
    setMigrationReadOnlyEnv('1');
    const report = await runVerifyTools({
      cwd: REPO_ROOT,
      keys: { ...DEFAULT_KEYS },
      databaseUrl: DATABASE_URL,
      baseUrl: 'http://127.0.0.1:1',
    });
    writeFileSync(
      resolve(H01_EVIDENCE, 'verify-tools-unreachable.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    expect(report.ok).toBe(false);
    expect(typeof report.toolsTotal).toBe('number');
    expect(typeof report.toolsPassed).toBe('number');
    expect(report.toolsTotal).toBeGreaterThan(0);
    expect(report.toolsPassed).toBe(0);
    expect(report.transport).toBe('network');
    expect(report.base_url).toBe('http://127.0.0.1:1');
  }, 60_000);

  // ── AC-3 / TC-5 ───────────────────────────────────────────────────────────

  it('TC-5/AC-3/H-02: verify-reads full loadedByTable parity vs immutable baseline', async () => {
    setMigrationReadOnlyEnv('1');
    // Point at committed fixture path directly (immutable — not live-authored).
    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: IMMUTABLE_ETL_FIXTURE,
      databaseUrl: DATABASE_URL,
    });
    evidence('tc-verify-reads.json', report);
    mkdirSync(H02_EVIDENCE, { recursive: true });
    writeFileSync(
      resolve(H02_EVIDENCE, 'verify-reads-green.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    expect(report.tablesTotal).toBeGreaterThanOrEqual(4);
    expect(report.tablesTotal).toBe(Object.keys(report.perTableCounts).length);
    expect(report.tablesTotal).toBe(Object.keys(report.baselineCounts).length);
    expect(report.tablesMatched).toBe(report.tablesTotal);
    expect(report.perTableCounts.documents).toBe(report.baselineCounts.documents);
    expect(report.perTableCounts.conversations).toBe(report.baselineCounts.conversations);
    // baselineCounts must equal committed fixture keys (not a live-derived map)
    expect(report.baselineCounts.documents).toBe(baselineCounts.documents);
    expect(report.baselineCounts.conversations).toBe(baselineCounts.conversations);
    // At least one additional mapped table beyond the old three-table sample set
    const extraKeys = Object.keys(report.perTableCounts).filter(
      (k) => !['documents', 'conversations', 'subscription_sources'].includes(k)
    );
    expect(extraKeys.length).toBeGreaterThanOrEqual(1);
    expect(report.mismatches).toEqual([]);
    expect(report.baseline_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.baseline_path).toContain('watermark-report-multi-table.json');
    expect(report.etl_run_id.length).toBeGreaterThan(0);
    expect(report.exportArchiveHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ok).toBe(true);
  }, 60_000);

  it('TC-H02-mismatch: induced single-table baseline divergence fails closed', async () => {
    setMigrationReadOnlyEnv('1');
    // Start from committed immutable fixture (not live-authored counts)
    const frozen = JSON.parse(readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8')) as {
      ok: boolean;
      runId: string;
      unexplainedVariance: number;
      exportArchiveHash: string;
      loadedByTable: Record<string, number>;
      reconcile: { ok: boolean; unexplainedVariance: number };
    };
    const divergedPath = resolve(EVIDENCE, 'watermark-report-diverged.json');
    const loaded = { ...frozen.loadedByTable };
    // Diverge a non-sample table so three-table sampling cannot hide it
    const targetKey = Object.hasOwn(loaded, 'researchSessions')
      ? 'researchSessions'
      : Object.hasOwn(loaded, 'tasks')
        ? 'tasks'
        : 'documents';
    loaded[targetKey] = (loaded[targetKey] ?? 0) + 999;
    writeFileSync(
      divergedPath,
      `${JSON.stringify(
        {
          ...frozen,
          loadedByTable: loaded,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: divergedPath,
      databaseUrl: DATABASE_URL,
    });
    evidence('tc-verify-reads-mismatch.json', report);
    writeFileSync(
      resolve(H02_EVIDENCE, 'verify-reads-mismatch.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThanOrEqual(1);
    expect(report.tablesMatched).toBeLessThan(report.tablesTotal);
    expect(report.mismatches.some((m) => m.includes('live=') && m.includes('baseline='))).toBe(
      true
    );
  }, 60_000);

  it('TC-H02-missing: missing ETL report fails closed', async () => {
    setMigrationReadOnlyEnv('1');
    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: resolve(EVIDENCE, 'does-not-exist-watermark.json'),
      databaseUrl: DATABASE_URL,
    });
    evidence('tc-verify-reads-missing.json', report);
    expect(report.ok).toBe(false);
    expect(report.mismatches.some((m) => m.includes('etl report missing'))).toBe(true);
    expect(report.tablesTotal).toBe(0);
  }, 30_000);

  // ── AC-4 / TC-6 / H-01 network article ────────────────────────────────────

  it('TC-6/AC-4 H-01: network GET /article/:token sha256 matches article-baseline.json', async () => {
    setMigrationReadOnlyEnv('1');
    process.env.DATABASE_URL = DATABASE_URL;
    const report = await runVerifyArticle({
      cwd: REPO_ROOT,
      baselinePath: articleBaselinePath,
      keys: { ...DEFAULT_KEYS },
      databaseUrl: DATABASE_URL,
      baseUrl: networkBaseUrl,
    });
    evidence('tc-verify-article.json', report);
    writeFileSync(
      resolve(H01_EVIDENCE, 'verify-article-network.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    expect(report.transport).toBe('network');
    expect(report.base_url).toBe(networkBaseUrl);
    expect(report.status).toBe(200);
    expect(report.byteLength).toBeGreaterThan(0);
    expect(report.sha256).toBe(report.baselineSha256);
    expect(report.byteLength).toBe(report.baselineByteLength);
    expect(report.match).toBe(true);
    expect(report.ok).toBe(true);

    // Network fetch cross-check (not in-process app.request as sole oracle)
    const res = await fetch(`${networkBaseUrl}/article/${shareToken}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = createHash('sha256').update(buf).digest('hex');
    expect(res.status).toBe(200);
    expect(sha).toBe(report.baselineSha256);
  }, 60_000);

  // ── AC-6 / TC-8 / TC-9 ────────────────────────────────────────────────────

  it('TC-8/9 AC-6: verify-soak aggregates all gates; jobsAccounted; zeroWritePath NOT_LANDED', async () => {
    setMigrationReadOnlyEnv('1');
    process.env.DATABASE_URL = DATABASE_URL;
    // H-02: use the frozen beforeAll ETL baseline as-is — do NOT rewrite loadedByTable
    // from live SELECT counts. Fence keeps write paths closed so counts stay stable.

    const jobsOnly = await runVerifyJobs({ databaseUrl: DATABASE_URL });
    evidence('tc-jobs-only.json', jobsOnly);
    expect(jobsOnly.jobsTotal).toBe(MIGRATED_JOBS.length);
    expect(jobsOnly.jobsAccounted).toBe(jobsOnly.jobsTotal);
    expect(jobsOnly.ok).toBe(true);

    const report = await runVerifySoak({
      cwd: REPO_ROOT,
      keys: { ...DEFAULT_KEYS },
      databaseUrl: DATABASE_URL,
      etlReportPath: greenEtlPath,
      baselinePath: articleBaselinePath,
      reportPath: resolve(EVIDENCE, 'verify-soak-report.json'),
      baseUrl: networkBaseUrl,
    });
    evidence('tc-verify-soak.json', {
      overall: report.overall,
      jobsTotal: report.jobsTotal,
      jobsAccounted: report.jobsAccounted,
      zeroWritePath: report.zeroWritePath,
      toolsOk: report.tools.ok,
      toolsPassed: report.tools.toolsPassed,
      toolsTotal: report.tools.toolsTotal,
      toolsTransport: report.tools.transport,
      toolsBaseUrl: report.tools.base_url,
      readsOk: report.reads.ok,
      readsTablesTotal: report.reads.tablesTotal,
      readsTablesMatched: report.reads.tablesMatched,
      articleOk: report.article.ok,
      articleTransport: report.article.transport,
      honoOk: report.honoWrite.ok,
      jobsOk: report.jobs.ok,
      engaged: report.engaged,
    });
    writeFileSync(
      resolve(H01_EVIDENCE, 'verify-soak-network.json'),
      `${JSON.stringify(
        {
          overall: report.overall,
          toolsPassed: report.tools.toolsPassed,
          toolsTotal: report.tools.toolsTotal,
          toolsTransport: report.tools.transport,
          articleTransport: report.article.transport,
          ok: report.ok,
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    expect(report.zeroWritePath).toBeDefined();
    expect(report.zeroWritePath.status).toBe('NOT_LANDED');
    expect(report.jobsTotal).toBe(MIGRATED_JOBS.length);
    expect(report.jobsAccounted).toBe(report.jobsTotal);
    expect(report.engaged).toBe(true);
    expect(report.tools.transport).toBe('network');
    expect(report.tools.base_url).toBe(networkBaseUrl);
    expect(typeof report.tools.toolsPassed).toBe('number');
    expect(typeof report.tools.toolsTotal).toBe('number');
    expect(report.tools.toolsPassed).not.toBeNull();
    expect(report.tools.toolsTotal).not.toBeNull();
    expect(report.tools.ok).toBe(true);
    expect(report.reads.ok).toBe(true);
    expect(report.reads.tablesTotal).toBeGreaterThanOrEqual(4);
    expect(report.reads.tablesMatched).toBe(report.reads.tablesTotal);
    expect(report.article.transport).toBe('network');
    expect(report.article.ok).toBe(true);
    expect(report.honoWrite.ok).toBe(true);
    expect(report.jobs.ok).toBe(true);
    expect(report.overall.ok).toBe(true);
    expect(report.ok).toBe(true);
  }, 600_000);
});
