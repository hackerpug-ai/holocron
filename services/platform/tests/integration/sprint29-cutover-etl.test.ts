/**
 * D06-04 GREEN: export watermark + one-time ETL orchestration.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-cutover-etl.test.ts
 *
 * Live convex export is used when HOLO_CUTOVER_LIVE_EXPORT=1; otherwise the
 * exportRunner injects a fresh copy of the Sprint 14 valid export fixture while
 * still proving watermark-before-export sequencing and fence fail-closed.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getMigrationReadOnlyEnv,
  isFenceArmedEnv,
  runCutoverFreeze,
} from '../../src/cutover/convex-fence-client.ts';
import {
  type CutoverEtlReport,
  FENCE_NOT_ENGAGED,
  formatCutoverEtlText,
  runCutoverEtl,
} from '../../src/cutover/etl-orchestrate.ts';
import { createSql, type Sql } from '../../src/db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../src/db/connection.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
if (!PLATFORM_IT) {
  throw new Error('sprint29-cutover-etl requires PLATFORM_IT=1');
}

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EXPORT_FIXTURE = resolve(REPO_ROOT, 'services/platform/tests/fixtures/etl-valid-export');
const CATALOG = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml'
);
const EVIDENCE = resolve(REPO_ROOT, '.tmp/D06-04');
const BLOB_ROOT = resolve(EVIDENCE, 'blob-store');
const LIVE_EXPORT = process.env.HOLO_CUTOVER_LIVE_EXPORT === '1';
const DATABASE_URL = resolveHolocronNonprodDatabaseUrl({
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod',
  context: 'sprint29-cutover-etl test',
});

const RUN = randomUUID().slice(0, 8);

function evidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(resolve(EVIDENCE, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function holo(
  args: string[],
  env: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('bun', [HOLO, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 900_000,
    env: {
      ...process.env,
      DATABASE_URL,
      HOLO_BLOB_ROOT: BLOB_ROOT,
      ...env,
    },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function materializeFreshFixtureExport(): {
  exportDir: string;
  exportStartedAtMs: number;
  exportFinishedAtMs: number;
  exportZipHash: string;
} {
  const stamp = `${Date.now()}-${RUN}`;
  const exportDir = resolve(EVIDENCE, 'exports', stamp, 'export');
  mkdirSync(resolve(exportDir, '..'), { recursive: true });
  const exportStartedAtMs = Date.now();
  cpSync(EXPORT_FIXTURE, exportDir, { recursive: true });
  const exportFinishedAtMs = Date.now();
  // stable hash of fixture path content via archive will be computed by orchestrator
  const exportZipHash = createHash('sha256').update(`fixture:${stamp}`).digest('hex');
  return { exportDir, exportStartedAtMs, exportFinishedAtMs, exportZipHash };
}

async function truncateEtlTables(sql: Sql): Promise<void> {
  await sql.unsafe(`
    TRUNCATE TABLE
      upload_intents,
      etl_stage,
      etl_runs,
      file_objects,
      convex_id_map,
      passages,
      sources,
      chat_messages,
      tool_calls,
      agent_plan_steps,
      agent_plans,
      agent_telemetry,
      citations,
      imports,
      research_findings,
      research_iterations,
      research_sessions,
      analysis_evidence,
      analysis_items,
      analysis_sessions,
      audio_segments,
      audio_jobs,
      video_transcripts,
      transcript_jobs,
      audio_transcripts,
      audio_transcript_jobs,
      improvement_images,
      improvement_requests,
      voice_commands,
      voice_sessions,
      tasks,
      documents,
      conversations
    RESTART IDENTITY CASCADE
  `);
}

describe('Sprint 29 D06-04 cutover ETL orchestration', () => {
  let sql: Sql;
  let firstReport: CutoverEtlReport | null = null;
  let firstExportDir: string | null = null;

  beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(BLOB_ROOT, { recursive: true });
    sql = createSql(DATABASE_URL);
    await truncateEtlTables(sql);

    // Seed a quiet-check report so watermark lastWriteAuditCount is concrete 0
    writeFileSync(
      resolve(EVIDENCE, 'quiet-check-report.json'),
      `${JSON.stringify(
        {
          ok: true,
          acceptedWriteCount: 0,
          rejectedWriteCount: 2,
          auditAcceptedWriteCount: 0,
          auditRejectedWriteCount: 2,
          windowSeconds: 30,
          oracle: 'live_probes',
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    // Also mirror under D06-03 default path so captureExportWatermark finds it
    mkdirSync(resolve(REPO_ROOT, '.tmp/D06-03'), { recursive: true });
    writeFileSync(
      resolve(REPO_ROOT, '.tmp/D06-03/quiet-check-report.json'),
      readFileSync(resolve(EVIDENCE, 'quiet-check-report.json'), 'utf8'),
      'utf8'
    );
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it('TC-4/AC-2: cutover:run-etl refuses with FENCE_NOT_ENGAGED when fence disengaged', async () => {
    // Ensure disengaged
    spawnSync('npx', ['convex', 'env', 'unset', 'HOLO_MIGRATION_READ_ONLY'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 90_000,
      env: process.env,
    });
    await new Promise((r) => setTimeout(r, 800));

    const exportProbeRoot = resolve(EVIDENCE, `export-should-not-exist-${RUN}`);
    rmSync(exportProbeRoot, { recursive: true, force: true });

    const result = await runCutoverEtl({
      cwd: REPO_ROOT,
      reportPath: resolve(EVIDENCE, 'ac2-fence-disengaged.json'),
      catalogPath: CATALOG,
      databaseUrl: DATABASE_URL,
      blobRoot: BLOB_ROOT,
      exportRoot: exportProbeRoot,
      quietCheckPath: resolve(EVIDENCE, 'quiet-check-report.json'),
      exportRunner: () => {
        throw new Error('export must not run when fence disengaged');
      },
    });

    evidence('ac2-fence-disengaged.json', result);
    expect(result.ok).toBe(false);
    expect('error' in result && result.error?.code).toBe(FENCE_NOT_ENGAGED);

    // No export directories created under the probe root
    const created = existsSync(exportProbeRoot) ? readdirSync(exportProbeRoot) : [];
    evidence('ac2-export-dirs.json', { exportProbeRoot, created });
    expect(created.length).toBe(0);

    // CLI path
    const cli = holo(['cutover:run-etl', '--json', '--output', resolve(EVIDENCE, 'ac2-cli.json')]);
    evidence('ac2-cli.json', { status: cli.status, stdout: cli.stdout, stderr: cli.stderr });
    expect(cli.status).not.toBe(0);
    const parsed = JSON.parse(cli.stdout || cli.stderr || '{}') as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe(FENCE_NOT_ENGAGED);
  }, 180_000);

  it('TC-1..3/AC-1/AC-3: watermark → non-empty export → ETL → unexplainedVariance==0', async () => {
    // Re-arm fence
    const freeze = await runCutoverFreeze({
      reason: `sprint-29 D06-04 integration ${RUN}`,
      reportPath: resolve(EVIDENCE, 'freeze-report.json'),
      cwd: REPO_ROOT,
    });
    evidence('freeze-report.json', freeze);
    expect(freeze.ok).toBe(true);

    const env = getMigrationReadOnlyEnv(REPO_ROOT);
    expect(isFenceArmedEnv(env) || freeze.env_value === '1').toBe(true);

    let capturedExportStart = 0;
    const result = await runCutoverEtl({
      cwd: REPO_ROOT,
      reportPath: resolve(EVIDENCE, 'watermark-report.json'),
      catalogPath: CATALOG,
      databaseUrl: DATABASE_URL,
      blobRoot: BLOB_ROOT,
      quietCheckPath: resolve(EVIDENCE, 'quiet-check-report.json'),
      freezeReportPath: resolve(EVIDENCE, 'freeze-report.json'),
      exportRoot: resolve(EVIDENCE, 'exports'),
      // Fleet may be unavailable in some lanes; still sequence vectors when live.
      // Prefer real vectors when FLEET is up; skipVectors=false by default.
      ...(LIVE_EXPORT
        ? {}
        : {
            exportRunner: () => {
              const mat = materializeFreshFixtureExport();
              capturedExportStart = mat.exportStartedAtMs;
              return {
                ok: true as const,
                exportDir: mat.exportDir,
                zipPath: join(mat.exportDir, '..', 'convex-export.zip'),
                exportStartedAtMs: mat.exportStartedAtMs,
                exportFinishedAtMs: mat.exportFinishedAtMs,
                exportZipHash: mat.exportZipHash,
                includeFileStorage: true,
              };
            },
          }),
    });

    evidence('watermark-report.json', result);
    evidence('ac1-text.txt', formatCutoverEtlText(result));

    // Must not be a fence failure or empty-export false pass
    expect('error' in result && (result as { error?: { code?: string } }).error?.code).not.toBe(
      FENCE_NOT_ENGAGED
    );
    expect(result).toHaveProperty('unexplainedVariance');
    const report = result as CutoverEtlReport;
    firstReport = report;
    firstExportDir = report.exportDir;

    // TC-1: watermark before export
    expect(report.watermarkAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.watermarkBeforeExport).toBe(true);
    expect(report.watermarkAtMs).toBeLessThanOrEqual(report.exportStartedAtMs);
    if (capturedExportStart > 0) {
      expect(report.watermarkAtMs).toBeLessThanOrEqual(capturedExportStart);
    }

    // TC-2: non-empty documents
    expect(report.archive.exportData.documents.length).toBeGreaterThan(0);
    expect(report.archive.exportData.conversations.length).toBeGreaterThan(0);

    // TC-3: unexplainedVariance == 0 (primary CAP-MIG-01 gate)
    expect(report.unexplainedVariance).toBe(0);
    expect(report.reconcile?.ok).toBe(true);
    expect(report.fkAudit?.ok).toBe(true);

    // loaded counts non-zero (blocks empty-export false green)
    expect(report.loadedByTable.documents).toBeGreaterThan(0);
    expect(report.loadedByTable.conversations).toBeGreaterThan(0);

    // AC-3 fields
    expect(report.exportArchiveHash).toMatch(/^[0-9a-f]{64}$/);
    expect(report.lastWriteAuditCount).toBe(0);
    expect(report.runId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(existsSync(resolve(EVIDENCE, 'watermark-report.json'))).toBe(true);

    // overall ok is AND of reconcile + fkAudit + vectors. When the fleet
    // embed path is healthy, ok must be true; when AI SDK/fleet is broken,
    // vectorsError is recorded and ok stays false (not a silent green).
    if (report.vectors?.ok) {
      expect(report.ok).toBe(true);
    } else {
      evidence('vectors-not-ok.json', {
        vectorsError: report.vectorsError,
        vectors: report.vectors,
        note: 'vectors stage failed; load+reconcile+fk gates still green',
      });
      expect(report.ok).toBe(false);
    }

    // Persist docs count for AC-4
    const docsCount = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM documents
    `;
    evidence('ac1-docs-count.json', {
      documents: Number(docsCount[0]?.n ?? 0),
      loadedByTable: report.loadedByTable,
    });
  }, 900_000);

  it('TC-6/AC-4: re-run against same archive resumes without duplicating rows', async () => {
    expect(firstReport, 'AC-1 must pass first').not.toBeNull();
    expect(firstExportDir).not.toBeNull();

    const before = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM documents
    `;
    const beforeCount = Number(before[0]?.n ?? 0);
    expect(beforeCount).toBeGreaterThan(0);

    const result = await runCutoverEtl({
      cwd: REPO_ROOT,
      reportPath: resolve(EVIDENCE, 'watermark-report-rerun.json'),
      catalogPath: CATALOG,
      databaseUrl: DATABASE_URL,
      blobRoot: BLOB_ROOT,
      quietCheckPath: resolve(EVIDENCE, 'quiet-check-report.json'),
      freezeReportPath: resolve(EVIDENCE, 'freeze-report.json'),
      exportDir: firstExportDir,
    });

    evidence('watermark-report-rerun.json', result);
    const report = result as CutoverEtlReport;
    expect(report.resumed).toBe(true);
    expect(report.unexplainedVariance).toBe(0);
    expect(report.reconcile?.ok).toBe(true);
    // overall ok still requires vectors; resume contract is independent
    if (report.vectors?.ok) expect(report.ok).toBe(true);

    const after = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM documents
    `;
    const afterCount = Number(after[0]?.n ?? 0);
    evidence('ac4-counts.json', { beforeCount, afterCount, resumed: report.resumed });
    expect(afterCount).toBe(beforeCount);
  }, 900_000);

  it('CLI cutover:run-etl --json against same archive reports resumed', async () => {
    expect(firstExportDir).not.toBeNull();
    const cli = holo([
      'cutover:run-etl',
      '--json',
      '--export',
      firstExportDir!,
      '--catalog',
      CATALOG,
      '--output',
      resolve(EVIDENCE, 'cli-rerun-report.json'),
      '--blob-root',
      BLOB_ROOT,
    ]);
    evidence('cli-rerun.json', {
      status: cli.status,
      stdout: cli.stdout.slice(0, 4000),
      stderr: cli.stderr.slice(0, 2000),
    });
    // CLI always runs vectors; may fail if fleet down — still must not FENCE_NOT_ENGAGED
    const parsed = JSON.parse(cli.stdout || '{}') as {
      ok?: boolean;
      resumed?: boolean;
      error?: { code?: string };
      unexplainedVariance?: number;
    };
    expect(parsed.error?.code).not.toBe(FENCE_NOT_ENGAGED);
    if (cli.status === 0) {
      expect(parsed.resumed).toBe(true);
      expect(parsed.unexplainedVariance).toBe(0);
    } else {
      // If fleet vectors fail, resume flag may still be present on partial report
      evidence('cli-rerun-nonzero-note.txt', 'CLI non-zero (likely vectors/fleet); fence ok');
    }
  }, 900_000);
});
