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
  capturePreFreezeArticleBaseline,
  defaultArticleBaselinePath,
  loadArticleBaseline,
} from '../../src/cutover/article-baseline.ts';
import {
  contentHashStable,
  ETL_NOT_RECONCILED,
  evaluateReadToolSuccess,
  isMigrationReadOnly,
  MIGRATION_READ_ONLY_ENV,
  payloadCorrespondsToPostgres,
  readDurableMigrationReadOnly,
  resolveDeployedTargetIdentity,
  resolveTargetIdentity,
  resolveVerifyToolSeeds,
  runCutoverFlip,
  runCutoverRollbackRepoint,
  runHonoWriteSweep,
  runVerifyArticle,
  runVerifyJobs,
  runVerifyReads,
  runVerifySoak,
  runVerifyTools,
  selectPostgresOracleForTool,
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
const H03_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R2-H03');
const H03_SPRINT_EVIDENCE = resolve(
  REPO_ROOT,
  '.tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip'
);
/** R2-H02 evidence (user path + sprint gate path). */
const R2_H02_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R2-H02');
const R2_H02_SPRINT_EVIDENCE = resolve(
  REPO_ROOT,
  '.tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip'
);
/** REDHAT-FIX-S29-R2-C01 evidence tree (durable override + already-running service). */
const R2_C01_EVIDENCE = resolve(
  REPO_ROOT,
  '.tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip'
);
const R2_C01_ALT = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R2-C01');
/** R2-C03 evidence path. */
const C03_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R2-C03');
/** R3-C03 evidence: real Postgres correspondence + health-bound identity. */
const R3_C03_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R3-C03');
/** Immutable multi-table D06-04-shaped watermark (committed). Never authored from live SELECT. */
const IMMUTABLE_ETL_FIXTURE = resolve(
  REPO_ROOT,
  'services/platform/tests/fixtures/sprint29/watermark-report-multi-table.json'
);
/** R2-C03: content-addressed cutover-parity inventory bound to export archive. */
const IMMUTABLE_PARITY_FIXTURE = resolve(
  REPO_ROOT,
  'services/platform/tests/fixtures/sprint29/immutable-export-catalog/cutover-parity.json'
);
const IMMUTABLE_EXPORT_DIR = resolve(REPO_ROOT, 'services/platform/tests/fixtures/export-sample');
/**
 * R2-H03: committed pre-freeze article baseline fixture (structure + provenance).
 * Suite captures live pre-freeze bytes into working D06-03 path via renderPublicArticle
 * BEFORE starting the post-fence SUT child — never fetch→write from that child.
 */
const IMMUTABLE_ARTICLE_BASELINE_FIXTURE = resolve(
  REPO_ROOT,
  'services/platform/tests/fixtures/sprint29/article-baseline-pre-freeze.json'
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

function r2c01Evidence(name: string, body: unknown): void {
  mkdirSync(R2_C01_EVIDENCE, { recursive: true });
  mkdirSync(R2_C01_ALT, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(resolve(R2_C01_EVIDENCE, name), payload, 'utf8');
  writeFileSync(resolve(R2_C01_ALT, name), payload, 'utf8');
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
  /** R2-H02: labeled soak endpoint identity (host/port/pid/service_label). */
  let soakServiceLabel = '';

  beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(C02_EVIDENCE, { recursive: true });
    mkdirSync(R2_H02_EVIDENCE, { recursive: true });
    mkdirSync(R2_H02_SPRINT_EVIDENCE, { recursive: true });
    mkdirSync(R3_C03_EVIDENCE, { recursive: true });
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
    const existingPublic = await sql<{ share_token: string }[]>`SELECT share_token FROM documents
      WHERE is_public = true AND share_token IS NOT NULL
      ORDER BY id
      LIMIT 1`;
    if (!existingPublic[0]?.share_token) {
      throw new Error(
        'H-02 requires a pre-existing public document for article baseline; refusing to INSERT and rewrite ETL counts from live SELECT'
      );
    }
    shareToken = existingPublic[0].share_token;

    // R2-H02 / R3-C03: ensure non-ETL-bound rows exist so get_* reads return
    // real SELECT-correspondable application data (do NOT touch documents /
    // subscription_sources counts used by the immutable ETL fixture).
    const toolCount = Number((await sql`SELECT count(*)::int AS c FROM toolbelt_tools`)[0]?.c ?? 0);
    if (toolCount === 0) {
      await sql`
        INSERT INTO toolbelt_tools (id, title, description, content, source_type, category, status)
        VALUES (
          ${randomUUID()}::uuid,
          ${`r3-c03-seed-tool-${RUN}`},
          'R3-C03 verify-tools seed',
          'seed content',
          'github',
          'tool',
          'draft'
        )
      `;
    }
    const shopCount = Number((await sql`SELECT count(*)::int AS c FROM shop_sessions`)[0]?.c ?? 0);
    if (shopCount === 0) {
      await sql`
        INSERT INTO shop_sessions (id, query, status, retailers)
        VALUES (${randomUUID()}::uuid, ${`r3-c03-seed-${RUN}`}, 'completed', ${sql.json(['amazon'])})
      `;
    }
    const profileCount = Number(
      (await sql`SELECT count(*)::int AS c FROM creator_profiles`)[0]?.c ?? 0
    );
    if (profileCount === 0) {
      await sql`
        INSERT INTO creator_profiles (id, name, handle)
        VALUES (${randomUUID()}::uuid, ${`r3-c03-${RUN}`}, ${`r3c03_${RUN}`})
      `;
    }
    const researchCount = Number(
      (await sql`SELECT count(*)::int AS c FROM research_sessions`)[0]?.c ?? 0
    );
    if (researchCount === 0) {
      await sql`
        INSERT INTO research_sessions (id, topic, status)
        VALUES (${randomUUID()}::uuid, ${`r3-c03-research-${RUN}`}, 'completed')
      `;
    }
    const improvementCount = Number(
      (await sql`SELECT count(*)::int AS c FROM improvement_requests`)[0]?.c ?? 0
    );
    if (improvementCount === 0) {
      await sql`
        INSERT INTO improvement_requests (id, description, status, source_screen)
        VALUES (${randomUUID()}::uuid, ${`r3-c03-imp-${RUN}`}, 'pending', 'soak')
      `;
    }
    const assimCount = Number(
      (await sql`SELECT count(*)::int AS c FROM assimilation_sessions`)[0]?.c ?? 0
    );
    if (assimCount === 0) {
      await sql`
        INSERT INTO assimilation_sessions (id, repository_url, profile, status)
        VALUES (
          ${randomUUID()}::uuid,
          ${`https://github.com/example/r3-c03-${RUN}`},
          'standard',
          'planning'
        )
      `;
    }
    const whatsNewCount = Number(
      (await sql`SELECT count(*)::int AS c FROM whats_new_reports`)[0]?.c ?? 0
    );
    if (whatsNewCount === 0) {
      await sql`
        INSERT INTO whats_new_reports (
          id, period_start, period_end, summary_json, findings_json, findings_count
        ) VALUES (
          ${randomUUID()}::uuid,
          now() - interval '7 days',
          now(),
          ${sql.json({ summary: `r3-c03-${RUN}` })},
          ${sql.json([])},
          0
        )
      `;
    }

    // Capture baseline from the real Hono /article/ route (same bytes AC-4 compares)
    process.env.DATABASE_URL = DATABASE_URL;

    // ── R2-H03: immutable pre-freeze article baseline (NOT from post-fence SUT) ──
    // Capture via renderPublicArticle (same articleHtml as Hono) BEFORE arming fence
    // or starting the soak child. Verify phase only READs this file.
    if (!existsSync(IMMUTABLE_ARTICLE_BASELINE_FIXTURE)) {
      throw new Error(
        `R2-H03 immutable article baseline fixture missing: ${IMMUTABLE_ARTICLE_BASELINE_FIXTURE}`
      );
    }
    const fixtureMeta = JSON.parse(readFileSync(IMMUTABLE_ARTICLE_BASELINE_FIXTURE, 'utf8')) as {
      provenance?: { kind?: string };
      phase?: string;
    };
    if (fixtureMeta.provenance?.kind !== 'immutable-pre-freeze-article-baseline') {
      throw new Error(
        'R2-H03 fixture missing provenance.kind=immutable-pre-freeze-article-baseline'
      );
    }

    articleBaselinePath = resolve(EVIDENCE, 'article-baseline.json');
    const d06_03Path = defaultArticleBaselinePath(REPO_ROOT);
    const preFreeze = await capturePreFreezeArticleBaseline({
      token: shareToken,
      outputPath: articleBaselinePath,
      cwd: REPO_ROOT,
      databaseUrl: DATABASE_URL,
    });
    if (!preFreeze.ok || !('sha256' in preFreeze) || preFreeze.sha256.length !== 64) {
      throw new Error(
        `R2-H03 pre-freeze capture failed: ${JSON.stringify(preFreeze).slice(0, 400)}`
      );
    }
    // Install at D06-03 default path (operator artifact location); verify only reads.
    mkdirSync(resolve(REPO_ROOT, '.tmp/D06-03'), { recursive: true });
    writeFileSync(d06_03Path, readFileSync(articleBaselinePath, 'utf8'), 'utf8');
    mkdirSync(H03_EVIDENCE, { recursive: true });
    mkdirSync(H03_SPRINT_EVIDENCE, { recursive: true });
    writeFileSync(
      resolve(H03_EVIDENCE, 'article-baseline-pre-freeze-working.json'),
      readFileSync(articleBaselinePath, 'utf8'),
      'utf8'
    );
    const loadedBaseline = loadArticleBaseline(articleBaselinePath);
    if (!loadedBaseline.ok) {
      throw new Error(`R2-H03 loadArticleBaseline failed: ${loadedBaseline.error.message}`);
    }
    if (loadedBaseline.baseline.phase !== 'pre-freeze') {
      throw new Error('R2-H03 baseline phase must be pre-freeze');
    }

    // Arm fence in this process (jobs / hono sweep / flip) AND the live server child
    // AFTER pre-freeze baseline is sealed (immutable for verify).
    setMigrationReadOnlyEnv('1');
    // R3-C03: label lives on the *serving* process env so /health reports it —
    // verify must not mint identity solely from caller options/env overwrite.
    soakServiceLabel = `soak-flip-r3-c03-${RUN}`;
    liveService = await startLiveService({
      keys: { ...DEFAULT_KEYS },
      databaseUrl: DATABASE_URL,
      extraEnv: {
        // Explicit boot-time disarmed overlay (secrets.ts sticky skip path)
        HOLO_MIGRATION_READ_ONLY: '0',
        HOLO_SECRETS_PATH: DISPOSABLE_SECRETS,
        HOLOCRON_SECRETS_PATH: DISPOSABLE_SECRETS,
        // Serving-process identity (health-bound; not caller-minted into report)
        HOLO_SERVICE_LABEL: soakServiceLabel,
        // Propagate live search key when present so findRecommendations is schema-valid
        ...(process.env.JINA_API_KEY ? { JINA_API_KEY: process.env.JINA_API_KEY } : {}),
      },
      readyTimeoutMs: 180_000,
    });
    networkBaseUrl = liveService.baseUrl;
    // Deployment env points at the pre-existing listener (started above, before verify).
    process.env.HOLO_VERIFY_BASE_URL = networkBaseUrl;
    process.env.PLATFORM_URL = networkBaseUrl;
    // Clear parent-side label/pid minting — identity must come from /health of the child.
    delete process.env.HOLO_VERIFY_SERVICE_LABEL;
    delete process.env.HOLO_SOAK_SERVICE_LABEL;
    delete process.env.HOLO_VERIFY_PID;

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
    // C-02 CLI rollback-repoint reads default D06-05 audit + watermark; isolate from sibling pollution.
    const exportWmMs = Date.now() - 60_000;
    writeFileSync(
      resolve(REPO_ROOT, '.tmp/D06-05/post-export-write-audit.json'),
      `${JSON.stringify({ export_watermark_ms: exportWmMs, accepted_writes: [] }, null, 2)}\n`,
      'utf8'
    );
    mkdirSync(H02_EVIDENCE, { recursive: true });
    mkdirSync(C03_EVIDENCE, { recursive: true });
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
      immutableArticleBaselineFixture: IMMUTABLE_ARTICLE_BASELINE_FIXTURE,
      articleBaselinePath,
      articleBaselinePhase: loadedBaseline.baseline.phase,
      articleBaselineSha256: loadedBaseline.baseline.sha256,
      networkBaseUrl,
      note: 'H-02 baselineCounts from committed fixture; R2-H03 article baseline from pre-freeze renderPublicArticle (not post-fence SUT child)',
    });
  }, 240_000);

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
    // R2-C01: durable overrides boot-time env
    expect(report.lookup_mode).toBe('durable_overrides_env');
    expect(report.durable_value).toBe('1');
    expect(report.process_generations.before.length).toBeGreaterThan(0);
    expect(report.process_generations.after.length).toBeGreaterThan(0);
    const durable = readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS);
    expect(durable).toBe('1');
    expect(loadSecretsFile(DISPOSABLE_SECRETS)[MIGRATION_READ_ONLY_ENV]).toBe('1');
    // R2-C01 AC-1: durable '1' wins even when process.env still holds boot-time '0'
    setMigrationReadOnlyEnv('0');
    expect(process.env.HOLO_MIGRATION_READ_ONLY).toBe('0');
    expect(isMigrationReadOnly()).toBe(true);
    setMigrationReadOnlyEnv('1');

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
      lookup_mode?: string;
      durable_value?: string;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.engaged_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((parsed.configured_target ?? '').length).toBeGreaterThanOrEqual(8);
    expect(parsed.durable_reread).toBe(true);
    expect(parsed.lookup_mode).toBe('durable_overrides_env');
    expect(parsed.durable_value).toBe('1');
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

  // ── REDHAT-FIX-S29-R2-C01: durable override + already-running service ─────

  it('REDHAT-FIX-S29-R2-C01: durable control-plane wins over boot-time env 0', () => {
    // AC-1: same long-lived process with boot overlay '0' observes durable flip
    writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });
    setMigrationReadOnlyEnv('0');
    expect(process.env.HOLO_MIGRATION_READ_ONLY).toBe('0');
    expect(isMigrationReadOnly()).toBe(false);

    const report = runCutoverFlip({
      cwd: REPO_ROOT,
      etlReportPath: greenEtlPath,
      reportPath: resolve(R2_C01_EVIDENCE, 'redhat-fix-s29-r2-c01-flip-report.json'),
      secretsPath: DISPOSABLE_SECRETS,
    });
    // Simulate already-running process that still holds boot-time env '0'
    // (applyConsolidatedSecretsToEnv sticky skip — secrets.ts:252-261)
    setMigrationReadOnlyEnv('0');
    const envStillZero = process.env.HOLO_MIGRATION_READ_ONLY;
    const armed = isMigrationReadOnly();
    const durable = readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS);
    r2c01Evidence('redhat-fix-s29-r2-c01-durable-override.json', {
      ok: report.ok && armed === true && envStillZero === '0' && durable === '1',
      report,
      envStillZero,
      durable,
      isMigrationReadOnly: armed,
      lookup_mode: report.lookup_mode,
      durable_value: report.durable_value,
      durable_reread: report.durable_reread,
    });
    expect(report.ok).toBe(true);
    expect(report.lookup_mode).toBe('durable_overrides_env');
    expect(report.durable_value).toBe('1');
    expect(report.durable_reread).toBe(true);
    expect(envStillZero).toBe('0');
    expect(durable).toBe('1');
    expect(armed).toBe(true);
    expect(readFileSync(DISPOSABLE_SECRETS, 'utf8')).toMatch(/HOLO_MIGRATION_READ_ONLY[: ]+["']?1/);
    // Re-arm parent env for subsequent suite tests that use process-local fence
    setMigrationReadOnlyEnv('1');
  });

  it('REDHAT-FIX-S29-R2-C01: already-running disarmed liveService blocks clean-env POST after flip', async () => {
    // AC-2: live child was started WITHOUT extraEnv HOLO_MIGRATION_READ_ONLY=1
    // (beforeAll uses '0' + disposable secrets). Flip durable, then clean-env POST.
    expect(networkBaseUrl.length).toBeGreaterThan(0);
    expect(liveService?.pid).toBeTypeOf('number');
    const pidBefore = liveService?.pid;

    writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });
    // Parent may hold any env; client must not inject fence
    setMigrationReadOnlyEnv('0');

    const before = Number((await sql`SELECT count(*)::int AS c FROM documents`)[0]?.c ?? 0);

    // Clean-env client: do not set HOLO_MIGRATION_READ_ONLY on the HTTP request path
    const res = await fetch(`${networkBaseUrl}/api/documents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${DEFAULT_KEYS.rn}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: `r2-c01-${RUN}`, content: 'must-block-already-running' }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    const after = Number((await sql`SELECT count(*)::int AS c FROM documents`)[0]?.c ?? 0);

    const evidenceBody = {
      observed_status: res.status === 423 ? 'PASS' : 'FAIL',
      observed_count: res.status === 423 ? 1 : 0,
      ok:
        res.status === 423 &&
        body.error === 'migration_read_only' &&
        body.code === 'migration_read_only',
      live_child_start_extraEnv_fence: '0',
      note: 'beforeAll starts liveService with HOLO_MIGRATION_READ_ONLY=0 (not 1)',
      pidBefore,
      pidAfter: liveService?.pid,
      same_process_generation: liveService?.pid === pidBefore,
      status: res.status,
      error: body.error ?? null,
      code: body.code ?? null,
      before,
      after,
      networkBaseUrl,
    };
    r2c01Evidence('redhat-fix-s29-r2-c01-already-running-post.json', evidenceBody);
    r2c01Evidence('redhat-fix-s29-r2-c01-green.json', {
      ac2: evidenceBody,
      path: 'A',
      agent: 'devops-engineer',
    });

    expect(res.status).toBe(423);
    expect(body.error).toBe('migration_read_only');
    expect(body.code).toBe('migration_read_only');
    expect(after).toBe(before);
    expect(liveService?.pid).toBe(pidBefore);
    setMigrationReadOnlyEnv('1');
  }, 120_000);

  it('REDHAT-FIX-S29-R2-C01: mcp + job blocked without client fence inject on already-running fence', async () => {
    // AC-3: mutation tools/call + runJob without client HOLO_MIGRATION_READ_ONLY inject
    writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });
    // Parent env intentionally '0' — proves durable override, not process inject
    setMigrationReadOnlyEnv('0');
    expect(process.env.HOLO_MIGRATION_READ_ONLY).toBe('0');
    expect(isMigrationReadOnly()).toBe(true);

    let mcpMsg = '';
    let mcpBlocked = false;
    try {
      await executePostgresMcpTool(
        'store_document',
        { title: `r2-c01-mcp-${RUN}`, content: 'blocked' },
        { databaseUrl: DATABASE_URL }
      );
    } catch (e) {
      mcpMsg = e instanceof Error ? e.message : String(e);
      mcpBlocked = mcpMsg.startsWith('MIGRATION_READ_ONLY:');
    }

    const job = MIGRATED_JOBS.find((j) => j.name === 'task-timeout-worker') ?? MIGRATED_JOBS[0];
    if (!job) throw new Error('migrated job registry is empty');
    const jobResult = await runJob(job, { databaseUrl: DATABASE_URL, runId: randomUUID() });
    const jobBlocked =
      jobResult.ok === false && String(jobResult.error ?? '').includes('migration_read_only');

    // Network MCP against already-running live child (no client fence inject)
    let networkMcpBlocked = false;
    let networkMcpMsg = '';
    if (networkBaseUrl) {
      const headers = {
        authorization: `Bearer ${DEFAULT_KEYS.mcp}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      };
      const mcpUrl = `${networkBaseUrl}/mcp`;
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
            clientInfo: { name: 'r2-c01', version: '1' },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => undefined);
      const call = await fetch(mcpUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'store_document',
            arguments: { title: `r2-c01-net-${RUN}`, content: 'blocked' },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const raw = await call.text();
      networkMcpMsg = raw.slice(0, 800);
      networkMcpBlocked =
        /MIGRATION_READ_ONLY/i.test(raw) || call.status === 423 || /migration_read_only/i.test(raw);
    }

    const mcpJob = {
      mcp_blocked: mcpBlocked,
      job_blocked: jobBlocked,
      network_mcp_blocked: networkMcpBlocked,
      mcpMsg,
      jobOk: jobResult.ok,
      jobError: jobResult.error ?? null,
      networkMcpMsg,
      env: process.env.HOLO_MIGRATION_READ_ONLY,
      durable: readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS),
    };
    r2c01Evidence('redhat-fix-s29-r2-c01-mcp-job.json', mcpJob);
    expect(mcpBlocked).toBe(true);
    expect(jobBlocked).toBe(true);
    expect(networkMcpBlocked).toBe(true);
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

  it('TC-3/4 AC-2 H-01/R2-H02/R3-C03: network /mcp; health identity; Postgres correspondence', async () => {
    setMigrationReadOnlyEnv('1');
    // Arm durable control-plane so the already-running child re-reads fence (R2-C01).
    writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });
    process.env.DATABASE_URL = DATABASE_URL;
    expect(networkBaseUrl.length).toBeGreaterThan(0);
    expect(process.env.HOLO_VERIFY_BASE_URL).toBe(networkBaseUrl);
    const manifest = loadManifest(defaultManifestPath(REPO_ROOT));
    // R3-C03: do NOT pass serviceLabel/pid as sole identity mint — health binds them.
    // Optional constraints may match health; omit so report cannot be self-supplied.
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
      target_identity: report.target_identity,
      seeds: report.seeds,
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
          postgres_backed: t.postgres_backed,
          correspondence_matched: t.correspondence_matched,
          status: t.status,
          message: t.message,
        })),
    });
    writeFileSync(
      resolve(H01_EVIDENCE, 'verify-tools-network.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    writeFileSync(
      resolve(R2_H02_EVIDENCE, 'verify-tools-network.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    writeFileSync(
      resolve(R2_H02_SPRINT_EVIDENCE, 'redhat-fix-s29-r2-h02-verify-tools.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    writeFileSync(
      resolve(R3_C03_EVIDENCE, 'verify-tools-network.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );

    // H-01: network transport + non-null concrete counts
    expect(report.transport).toBe('network');
    expect(report.base_url).toBe(networkBaseUrl);
    // R3-C03: identity from serving /health (already-listening child), not caller mint
    const identity = report.target_identity;
    expect(identity).not.toBeNull();
    if (!identity) throw new Error('target_identity missing');
    expect(identity.identity_source).toBe('health');
    expect(identity.host.length).toBeGreaterThan(0);
    expect(identity.port).toBeGreaterThan(0);
    expect(identity.pid).toBe(liveService?.pid);
    expect(identity.pid).not.toBe(process.pid);
    expect(identity.service_label).toBe(soakServiceLabel);
    expect(identity.host).toBe(new URL(networkBaseUrl).hostname);
    expect(identity.port).toBe(Number(new URL(networkBaseUrl).port));
    expect(typeof identity.uptime_ms).toBe('number');
    expect((identity.uptime_ms ?? 0) > 0).toBe(true);

    // R2-H02: seeds are real holocron_nonprod ids (not sole fixed sentinels without row proof)
    const seeds = report.seeds;
    expect(seeds).toBeDefined();
    if (!seeds) throw new Error('seeds missing');
    expect(seeds.documentId.length).toBeGreaterThan(0);
    expect(seeds.subscriptionId.length).toBeGreaterThan(0);
    const soleFixedSentinels =
      seeds.documentId === '00000000-0000-4000-8000-000000000001' &&
      seeds.subscriptionId === '00000000-0000-4000-8000-000000000002';
    if (soleFixedSentinels) {
      // Only allowed when those exact rows exist and return non-null (SELECT-backed).
      const doc = await sql`SELECT id FROM documents WHERE id = ${seeds.documentId}::uuid`;
      expect(doc.length).toBe(1);
    }

    // R3-C03: get_document correspondence — MCP title/content match independent SELECT
    const docOracle = await selectPostgresOracleForTool('get_document', seeds, {
      databaseUrl: DATABASE_URL,
    });
    expect(docOracle.ok).toBe(true);
    if (docOracle.ok) {
      const ora = docOracle.oracle as { documentId?: string; title?: string; content?: string };
      expect(ora?.documentId).toBe(seeds.documentId);
      expect(typeof ora?.title).toBe('string');
      writeFileSync(
        resolve(R3_C03_EVIDENCE, 'get-document-oracle.json'),
        `${JSON.stringify({ seeds, oracle: ora, content_sha256: contentHashStable(ora) }, null, 2)}\n`,
        'utf8'
      );
    }

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
    // R2-H02 / R3-C03: schema_valid via Zod; postgres_backed requires correspondence
    expect(reads.every((t) => t.schema_valid === true)).toBe(true);
    expect(reads.every((t) => t.postgres_backed === true)).toBe(true);
    expect(reads.every((t) => t.correspondence_matched === true)).toBe(true);
    expect(reads.every((t) => t.isError !== true)).toBe(true);
    expect(reads.every((t) => t.ok === true)).toBe(true);

    expect(report.toolsPassed).toBe(report.toolsTotal);
    expect(report.ok).toBe(true);
  }, 300_000);

  it('R2-H02/R3-C03 AC-3: shape-only never sets postgres_backed; null/Zod fail', () => {
    // list_documents output is non-nullable object — null fails Zod (no structural fallback)
    const nullResult = evaluateReadToolSuccess('list_documents', {
      status: 200,
      isError: false,
      payload: null,
      rawByteLength: 4,
      raw: 'null',
    });
    expect(nullResult.schema_valid).toBe(false);
    expect(nullResult.postgres_backed).toBe(false);
    expect(nullResult.ok).toBe(false);

    // get_document allows null via Zod but null is never postgres_backed success
    const nullGetDoc = evaluateReadToolSuccess('get_document', {
      status: 200,
      isError: false,
      payload: null,
      rawByteLength: 4,
      raw: 'null',
    });
    expect(nullGetDoc.postgres_backed).toBe(false);
    expect(nullGetDoc.ok).toBe(false);

    const zodFail = evaluateReadToolSuccess('list_documents', {
      status: 200,
      isError: false,
      payload: { unexpected: true },
      rawByteLength: 20,
      raw: '{"unexpected":true}',
    });
    expect(zodFail.schema_valid).toBe(false);
    expect(zodFail.postgres_backed).toBe(false);
    expect(zodFail.ok).toBe(false);

    // R3-C03: schema-valid shape WITHOUT oracle correspondence is NOT postgres_backed
    const shapeOnly = evaluateReadToolSuccess('list_documents', {
      status: 200,
      isError: false,
      payload: { documents: [{ id: 'x' }], hasMore: false },
      rawByteLength: 40,
      raw: '{"documents":[{"id":"x"}],"hasMore":false}',
    });
    expect(shapeOnly.schema_valid).toBe(true);
    expect(shapeOnly.postgres_backed).toBe(false);
    expect(shapeOnly.correspondence_matched).toBe(false);
    expect(shapeOnly.ok).toBe(false);

    const seeds = {
      documentId: '11111111-1111-4111-8111-111111111111',
      subscriptionId: '22222222-2222-4222-8222-222222222222',
      researchSessionId: '',
      improvementId: '',
      assimilationSessionId: '',
      toolId: '',
      shopSessionId: '',
      profileId: '',
      runId: 'unit',
    };
    const withOracle = evaluateReadToolSuccess(
      'list_documents',
      {
        status: 200,
        isError: false,
        payload: {
          documents: [{ id: seeds.documentId, title: 't' }],
          hasMore: false,
        },
        rawByteLength: 80,
        raw: '{"documents":[{"id":"11111111-1111-4111-8111-111111111111"}]}',
      },
      {
        oracleOk: true,
        oracle: { documents: [{ id: seeds.documentId, title: 't' }], hasMore: false },
        seeds,
      }
    );
    expect(withOracle.schema_valid).toBe(true);
    expect(withOracle.correspondence_matched).toBe(true);
    expect(withOracle.postgres_backed).toBe(true);
    expect(withOracle.ok).toBe(true);

    // Fabricated payload that does not match oracle ids fails correspondence
    const fabricated = evaluateReadToolSuccess(
      'get_document',
      {
        status: 200,
        isError: false,
        payload: {
          documentId: seeds.documentId,
          title: 'forged',
          content: 'not-in-db',
        },
        rawByteLength: 60,
        raw: '{"documentId":"...","title":"forged"}',
      },
      {
        oracleOk: true,
        oracle: {
          documentId: seeds.documentId,
          title: 'real-title',
          content: 'real-content',
        },
        seeds,
      }
    );
    expect(fabricated.schema_valid).toBe(true);
    expect(fabricated.correspondence_matched).toBe(false);
    expect(fabricated.postgres_backed).toBe(false);

    const minted = resolveTargetIdentity('http://127.0.0.1:4111', {
      serviceLabel: 'unit',
    });
    expect(minted?.identity_source).toBe('caller_minted');

    const evidenceBody = {
      nullResult,
      nullGetDoc,
      zodFail,
      shapeOnly,
      withOracle,
      fabricated,
      resolveTargetIdentity: minted,
    };
    writeFileSync(
      resolve(R2_H02_EVIDENCE, 'evaluate-read-tool-success.json'),
      `${JSON.stringify(evidenceBody, null, 2)}\n`,
      'utf8'
    );
    writeFileSync(
      resolve(R2_H02_SPRINT_EVIDENCE, 'redhat-fix-s29-r2-h02-evaluate-read.json'),
      `${JSON.stringify(evidenceBody, null, 2)}\n`,
      'utf8'
    );
    writeFileSync(
      resolve(R3_C03_EVIDENCE, 'evaluate-read-tool-success.json'),
      `${JSON.stringify(evidenceBody, null, 2)}\n`,
      'utf8'
    );
  });

  it('R3-C03: resolveDeployedTargetIdentity binds health pid/label; fails without deploy env', async () => {
    expect(networkBaseUrl.length).toBeGreaterThan(0);
    const bound = await resolveDeployedTargetIdentity(networkBaseUrl);
    expect(bound.identity).not.toBeNull();
    expect(bound.identity?.identity_source).toBe('health');
    expect(bound.identity?.pid).toBe(liveService?.pid);
    expect(bound.identity?.service_label).toBe(soakServiceLabel);
    expect(bound.identity?.pid).not.toBe(process.pid);

    const saved = {
      HOLO_PRODUCTION_BASE_URL: process.env.HOLO_PRODUCTION_BASE_URL,
      HOLO_VERIFY_BASE_URL: process.env.HOLO_VERIFY_BASE_URL,
      HOLO_SOAK_BASE_URL: process.env.HOLO_SOAK_BASE_URL,
      PLATFORM_URL: process.env.PLATFORM_URL,
      HOLO_DEPLOYMENT_VERIFICATION_PATH: process.env.HOLO_DEPLOYMENT_VERIFICATION_PATH,
    };
    delete process.env.HOLO_PRODUCTION_BASE_URL;
    delete process.env.HOLO_VERIFY_BASE_URL;
    delete process.env.HOLO_SOAK_BASE_URL;
    delete process.env.PLATFORM_URL;
    process.env.HOLO_DEPLOYMENT_VERIFICATION_PATH = resolve(
      R3_C03_EVIDENCE,
      `missing-deployment-verification-${RUN}.json`
    );
    const noEnv = await resolveDeployedTargetIdentity(networkBaseUrl);
    expect(noEnv.identity).toBeNull();
    expect(noEnv.error ?? '').toMatch(/MISSING_DEPLOYMENT_ENV/);
    if (saved.HOLO_PRODUCTION_BASE_URL) {
      process.env.HOLO_PRODUCTION_BASE_URL = saved.HOLO_PRODUCTION_BASE_URL;
    }
    process.env.HOLO_VERIFY_BASE_URL = saved.HOLO_VERIFY_BASE_URL;
    if (saved.HOLO_SOAK_BASE_URL) process.env.HOLO_SOAK_BASE_URL = saved.HOLO_SOAK_BASE_URL;
    if (saved.PLATFORM_URL) process.env.PLATFORM_URL = saved.PLATFORM_URL;
    if (saved.HOLO_DEPLOYMENT_VERIFICATION_PATH) {
      process.env.HOLO_DEPLOYMENT_VERIFICATION_PATH = saved.HOLO_DEPLOYMENT_VERIFICATION_PATH;
    } else {
      delete process.env.HOLO_DEPLOYMENT_VERIFICATION_PATH;
    }

    writeFileSync(
      resolve(R3_C03_EVIDENCE, 'deployed-identity.json'),
      `${JSON.stringify({ bound, noEnv_error: noEnv.error }, null, 2)}\n`,
      'utf8'
    );
  }, 30_000);

  it('R3-C03: payloadCorrespondsToPostgres requires SELECT match not shape', () => {
    const seeds = {
      documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subscriptionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      researchSessionId: '',
      improvementId: '',
      assimilationSessionId: '',
      toolId: '',
      shopSessionId: '',
      profileId: '',
      runId: 'corr',
    };
    expect(
      payloadCorrespondsToPostgres(
        'get_document',
        { documentId: seeds.documentId, title: 'A', content: 'body' },
        { documentId: seeds.documentId, title: 'A', content: 'body' },
        seeds
      )
    ).toBe(true);
    expect(
      payloadCorrespondsToPostgres(
        'get_document',
        { documentId: seeds.documentId, title: 'forged', content: 'x' },
        { documentId: seeds.documentId, title: 'A', content: 'body' },
        seeds
      )
    ).toBe(false);
    // Empty FTS both sides — correspondence holds
    expect(
      payloadCorrespondsToPostgres(
        'search_fts',
        { results: [], totalResults: 0 },
        { results: [], totalResults: 0 },
        seeds
      )
    ).toBe(true);
  });

  it('R2-H02: resolveVerifyToolSeeds returns non-sentinel holocron_nonprod ids', async () => {
    const result = await resolveVerifyToolSeeds({ databaseUrl: DATABASE_URL });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seeds.documentId).not.toBe('00000000-0000-4000-8000-000000000001');
    expect(result.seeds.subscriptionId).not.toBe('00000000-0000-4000-8000-000000000002');
    writeFileSync(
      resolve(R2_H02_EVIDENCE, 'verify-tool-seeds.json'),
      `${JSON.stringify(result.seeds, null, 2)}\n`,
      'utf8'
    );
  });

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

  it('TC-5/AC-3/H-02/R2-C03: verify-reads full catalog/export parity vs immutable baseline', async () => {
    setMigrationReadOnlyEnv('1');
    // Point at committed fixtures (immutable — not live-authored).
    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: IMMUTABLE_ETL_FIXTURE,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      databaseUrl: DATABASE_URL,
    });
    evidence('tc-verify-reads.json', report);
    mkdirSync(H02_EVIDENCE, { recursive: true });
    mkdirSync(C03_EVIDENCE, { recursive: true });
    writeFileSync(
      resolve(H02_EVIDENCE, 'verify-reads-green.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    writeFileSync(
      resolve(C03_EVIDENCE, 'verify-reads-green.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    expect(report.tablesTotal).toBeGreaterThanOrEqual(4);
    expect(report.tablesTotal).toBe(Object.keys(report.perTableCounts).length);
    expect(report.tablesTotal).toBe(Object.keys(report.baselineCounts).length);
    expect(report.catalog_table_count).toBe(report.tablesTotal);
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
    // R2-C03: baseline_hash is export archive digest, not report self-hash
    expect(report.baseline_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.baseline_hash).toBe(report.exportArchiveHash);
    expect(report.baseline_hash).not.toBe(report.report_sha256);
    expect(report.baseline_path).toContain('cutover-parity.json');
    expect(report.baseline_source).toMatch(/export-catalog|parity/i);
    expect(report.etl_run_id.length).toBeGreaterThan(0);
    expect(report.exportArchiveHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.parity_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.export_dir.length).toBeGreaterThan(0);
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
      parityHash?: string;
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
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
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
    // R2-C03: rewritten caller counts vs immutable parity are rejected even if live matches parity
    expect(
      report.mismatches.some(
        (m) =>
          (m.includes('live=') && m.includes('baseline=')) ||
          /rewritten|provenance|truncated/i.test(m)
      )
    ).toBe(true);
  }, 60_000);

  it('R2-C03/AC-2: truncated one-table caller report fails closed (incomplete-set)', async () => {
    setMigrationReadOnlyEnv('1');
    const frozen = JSON.parse(readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8')) as {
      exportArchiveHash: string;
      parityHash?: string;
      loadedByTable: Record<string, number>;
      runId: string;
    };
    const truncPath = resolve(C03_EVIDENCE, 'truncated-one-table.json');
    mkdirSync(C03_EVIDENCE, { recursive: true });
    writeFileSync(
      truncPath,
      `${JSON.stringify(
        {
          ok: true,
          runId: 'r2-c03-truncated',
          unexplainedVariance: 0,
          exportArchiveHash: frozen.exportArchiveHash,
          parityHash: frozen.parityHash,
          exportRelPath: 'services/platform/tests/fixtures/export-sample',
          parityRelPath:
            'services/platform/tests/fixtures/sprint29/immutable-export-catalog/cutover-parity.json',
          loadedByTable: { documents: frozen.loadedByTable.documents },
          reconcile: { ok: true, unexplainedVariance: 0 },
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: truncPath,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      databaseUrl: DATABASE_URL,
    });
    writeFileSync(
      resolve(C03_EVIDENCE, 'verify-reads-truncated.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
    expect(report.mismatches.some((m) => /truncated|incomplete-set/i.test(m))).toBe(true);
    // Authority set remains full catalog/export expected count (not caller length)
    expect(report.tablesTotal).toBeGreaterThanOrEqual(4);
    expect(report.catalog_table_count).toBe(report.tablesTotal);
  }, 60_000);

  it('R2-C03/AC-3: rewritten mutable report fails archive/parity provenance binding', async () => {
    setMigrationReadOnlyEnv('1');
    const frozen = JSON.parse(readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8')) as {
      exportArchiveHash: string;
      parityHash?: string;
      loadedByTable: Record<string, number>;
    };
    const rewrittenPath = resolve(C03_EVIDENCE, 'rewritten-mutable.json');
    mkdirSync(C03_EVIDENCE, { recursive: true });
    const loaded = { ...frozen.loadedByTable };
    loaded.documents = (loaded.documents ?? 0) + 999;
    writeFileSync(
      rewrittenPath,
      `${JSON.stringify(
        {
          ok: true,
          runId: 'r2-c03-rewritten',
          unexplainedVariance: 0,
          exportArchiveHash: frozen.exportArchiveHash,
          parityHash: frozen.parityHash,
          exportRelPath: 'services/platform/tests/fixtures/export-sample',
          parityRelPath:
            'services/platform/tests/fixtures/sprint29/immutable-export-catalog/cutover-parity.json',
          loadedByTable: loaded,
          reconcile: { ok: true, unexplainedVariance: 0 },
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: rewrittenPath,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      databaseUrl: DATABASE_URL,
    });
    writeFileSync(
      resolve(C03_EVIDENCE, 'verify-reads-rewritten.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    expect(report.ok).toBe(false);
    expect(
      report.mismatches.some((m) => /hash|archive|provenance|catalog|rewritten/i.test(m))
    ).toBe(true);
  }, 60_000);

  it('R2-C03: freestanding fake exportArchiveHash without on-disk archive bind fails', async () => {
    setMigrationReadOnlyEnv('1');
    const fakePath = resolve(C03_EVIDENCE, 'fake-archive-hash.json');
    mkdirSync(C03_EVIDENCE, { recursive: true });
    writeFileSync(
      fakePath,
      `${JSON.stringify(
        {
          ok: true,
          runId: 'r2-c03-fake-hash',
          unexplainedVariance: 0,
          exportArchiveHash: 'a'.repeat(64),
          loadedByTable: { documents: baselineCounts.documents },
          reconcile: { ok: true, unexplainedVariance: 0 },
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: fakePath,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      databaseUrl: DATABASE_URL,
    });
    writeFileSync(
      resolve(C03_EVIDENCE, 'verify-reads-fake-hash.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    expect(report.ok).toBe(false);
    expect(report.mismatches.some((m) => /hash|archive|provenance/i.test(m))).toBe(true);
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

  // ── AC-4 / TC-6 / H-01 / R2-H03 network article vs immutable pre-freeze ───

  it('TC-6/AC-4 H-01 R2-H03: network GET /article/:token matches immutable pre-freeze baseline', async () => {
    setMigrationReadOnlyEnv('1');
    process.env.DATABASE_URL = DATABASE_URL;
    // Baseline must already exist and be read-only during verify (no rewrite).
    const sealed = loadArticleBaseline(articleBaselinePath);
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) throw new Error(sealed.error.message);
    expect(sealed.baseline.phase).toBe('pre-freeze');
    expect(sealed.baseline.sha256).toHaveLength(64);
    expect(sealed.baseline.byteLength).toBeGreaterThan(0);

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
    writeFileSync(
      resolve(H03_EVIDENCE, 'tc-verify-article.json'),
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
    // Equality is to the pre-freeze sealed hash — not a same-run SUT rewrite.
    expect(report.baselineSha256).toBe(sealed.baseline.sha256);
    expect(report.baselineByteLength).toBe(sealed.baseline.byteLength);

    // Network fetch cross-check (not in-process app.request as sole oracle)
    const res = await fetch(`${networkBaseUrl}/article/${shareToken}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = createHash('sha256').update(buf).digest('hex');
    expect(res.status).toBe(200);
    expect(sha).toBe(report.baselineSha256);
  }, 60_000);

  it('R2-H03/AC-3: missing baseline fails closed (no SUT auto-author)', async () => {
    setMigrationReadOnlyEnv('1');
    process.env.DATABASE_URL = DATABASE_URL;
    const missing = resolve(H03_EVIDENCE, 'missing-article-baseline.json');
    const report = await runVerifyArticle({
      cwd: REPO_ROOT,
      baselinePath: missing,
      databaseUrl: DATABASE_URL,
      baseUrl: networkBaseUrl,
    });
    writeFileSync(
      resolve(H03_EVIDENCE, 'tc-verify-article-missing.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    expect(report.ok).toBe(false);
    expect(report.match).toBe(false);
    expect(report.transport).toBe('network');
    expect(report.error ?? '').toMatch(/BASELINE_MISSING/);
    // Must not have invented a baseline file from the SUT
    expect(existsSync(missing)).toBe(false);
  }, 30_000);

  it('R2-H03/AC-4 article-negative: divergent baseline sha yields match false', async () => {
    setMigrationReadOnlyEnv('1');
    process.env.DATABASE_URL = DATABASE_URL;
    const sealed = loadArticleBaseline(articleBaselinePath);
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) throw new Error(sealed.error.message);
    const mutatedPath = resolve(H03_EVIDENCE, 'article-baseline-mutated.json');
    writeFileSync(
      mutatedPath,
      `${JSON.stringify(
        {
          ...sealed.baseline,
          // Flip first nibble so sha differs while remaining 64-hex
          sha256: sealed.baseline.sha256.replace(/^[0-9a-f]/, (c) => (c === '0' ? '1' : '0')),
          path: mutatedPath,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const report = await runVerifyArticle({
      cwd: REPO_ROOT,
      baselinePath: mutatedPath,
      databaseUrl: DATABASE_URL,
      baseUrl: networkBaseUrl,
    });
    writeFileSync(
      resolve(H03_EVIDENCE, 'tc-verify-article-mismatch.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    expect(report.ok).toBe(false);
    expect(report.match).toBe(false);
    expect(report.transport).toBe('network');
    expect(report.status).toBe(200);
    expect(report.sha256).not.toBe(report.baselineSha256);
  }, 30_000);

  it('R2-H03/AC-2 static: suite does not author baseline from post-fence SUT fetch', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'services/platform/tests/integration/sprint29-soak-flip.test.ts'),
      'utf8'
    );
    // Anti-pattern: fetch(`${networkBaseUrl}/article/...`) then writeFileSync article-baseline
    expect(src).toMatch(/capturePreFreezeArticleBaseline/);
    expect(src).toMatch(/IMMUTABLE_ARTICLE_BASELINE_FIXTURE/);
    // The historical self-author block must be gone (baselineRes + writeFileSync of article-baseline from network child)
    expect(src).not.toMatch(/baselineRes\s*=\s*await\s+fetch\(`\$\{networkBaseUrl\}\/article/);
    writeFileSync(
      resolve(H03_EVIDENCE, 'tc-static-no-sut-self-author.json'),
      `${JSON.stringify(
        {
          ok: true,
          observed_status: 'PASS',
          observed_count: 1,
          uses_capturePreFreezeArticleBaseline: true,
          uses_immutable_fixture: true,
          no_baselineRes_from_networkBaseUrl: true,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  });

  // ── AC-6 / TC-8 / TC-9 ────────────────────────────────────────────────────

  it('TC-8/9 AC-6: verify-soak fails closed without deployed Zero write-fence proof', async () => {
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
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      baselinePath: articleBaselinePath,
      reportPath: resolve(EVIDENCE, 'verify-soak-report.json'),
      baseUrl: networkBaseUrl,
      zeroBaseUrl: '',
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
    expect(report.zeroWritePath.status).toBe('MISSING');
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
    expect(report.overall.ok).toBe(false);
    expect(report.ok).toBe(false);
  }, 600_000);
});
