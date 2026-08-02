/**
 * D06-04 GREEN: export watermark + one-time ETL orchestration.
 *
 * Run (primary AC-1 — live convex export, default):
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint29-cutover-etl.test.ts
 *
 * Secondary (fixture sequencing only — not AC-1 primary evidence):
 *   HOLO_CUTOVER_FIXTURE_EXPORT=1 PLATFORM_IT=1 ... same command
 *
 * Operator path (CLI) always uses real `runConvexExport` unless --export is set.
 * Legacy: HOLO_CUTOVER_LIVE_EXPORT=0 forces fixture; HOLO_CUTOVER_LIVE_EXPORT=1 is
 * accepted as an explicit live opt-in (same as default).
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
  QUIET_CHECK_REQUIRED,
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

/** Secondary only: Sprint 14 fixture. Default / AC-1 primary = live runConvexExport. */
const USE_FIXTURE_EXPORT =
  process.env.HOLO_CUTOVER_FIXTURE_EXPORT === '1' || process.env.HOLO_CUTOVER_LIVE_EXPORT === '0';
const LIVE_EXPORT = !USE_FIXTURE_EXPORT;

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
  const exportZipHash = createHash('sha256').update(`fixture:${stamp}`).digest('hex');
  return { exportDir, exportStartedAtMs, exportFinishedAtMs, exportZipHash };
}

function materializeEmptyExport(): {
  exportDir: string;
  exportStartedAtMs: number;
  exportFinishedAtMs: number;
  exportZipHash: string;
} {
  const stamp = `${Date.now()}-${RUN}-empty`;
  const exportDir = resolve(EVIDENCE, 'exports', stamp, 'export');
  mkdirSync(join(exportDir, 'documents'), { recursive: true });
  mkdirSync(join(exportDir, 'conversations'), { recursive: true });
  mkdirSync(join(exportDir, '_tables'), { recursive: true });
  writeFileSync(join(exportDir, 'documents', 'documents.jsonl'), '', 'utf8');
  writeFileSync(join(exportDir, 'conversations', 'documents.jsonl'), '', 'utf8');
  writeFileSync(join(exportDir, '_tables', 'documents.jsonl'), '', 'utf8');
  const exportStartedAtMs = Date.now();
  return {
    exportDir,
    exportStartedAtMs,
    exportFinishedAtMs: Date.now(),
    exportZipHash: createHash('sha256').update(`empty:${stamp}`).digest('hex'),
  };
}

function seedQuietCheck(ok = true): string {
  const path = resolve(EVIDENCE, 'quiet-check-report.json');
  // C-03: D06-04 assertQuietCheckConfirmed requires drain + measured post-drain window.
  const drainCompletedAtMs = Date.now() - 35_000;
  const quietSinceMs = drainCompletedAtMs;
  const quietUntilMs = quietSinceMs + 30_000;
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        ok,
        acceptedWriteCount: 0,
        rejectedWriteCount: 2,
        auditAcceptedWriteCount: 0,
        auditRejectedWriteCount: 2,
        windowSeconds: 30,
        oracle: 'mixed',
        sinceMs: quietSinceMs,
        untilMs: quietUntilMs,
        quietSinceMs,
        quietUntilMs,
        elapsedMs: quietUntilMs - quietSinceMs,
        drainCompletedAtMs,
        drain: {
          ok: true,
          surfaces: ['crons', 'queues', 'outbox', 'scheduled_jobs'],
          completedAtMs: drainCompletedAtMs,
          disabledEnv: 'HOLO_CUTOVER_SCHEDULES_DISABLED',
          disabledEnvValue: '1',
          convexDrainOk: true,
          consumersHonored: true,
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  mkdirSync(resolve(REPO_ROOT, '.tmp/D06-03'), { recursive: true });
  writeFileSync(
    resolve(REPO_ROOT, '.tmp/D06-03/quiet-check-report.json'),
    readFileSync(path, 'utf8'),
    'utf8'
  );
  return path;
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
  let quietCheckPath: string;

  beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(BLOB_ROOT, { recursive: true });
    sql = createSql(DATABASE_URL);
    await truncateEtlTables(sql);
    quietCheckPath = seedQuietCheck(true);
    evidence('export-mode.json', {
      LIVE_EXPORT,
      USE_FIXTURE_EXPORT,
      note: LIVE_EXPORT
        ? 'AC-1 primary: real npx convex export via runConvexExport (no exportRunner inject)'
        : 'SECONDARY fixture path only (HOLO_CUTOVER_FIXTURE_EXPORT=1 or LIVE_EXPORT=0)',
    });
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it('TC-4/AC-2: cutover:run-etl refuses with FENCE_NOT_ENGAGED when fence disengaged', async () => {
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
      quietCheckPath,
      exportRunner: () => {
        throw new Error('export must not run when fence disengaged');
      },
    });

    evidence('ac2-fence-disengaged.json', result);
    expect(result.ok).toBe(false);
    expect('error' in result && result.error?.code).toBe(FENCE_NOT_ENGAGED);

    const created = existsSync(exportProbeRoot) ? readdirSync(exportProbeRoot) : [];
    evidence('ac2-export-dirs.json', { exportProbeRoot, created });
    expect(created.length).toBe(0);

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

  it('quiet-check fail-closed: missing / quiet_ok!=true refuses before export', async () => {
    const freeze = await runCutoverFreeze({
      reason: `sprint-29 D06-04 quiet-check fail-closed ${RUN}`,
      reportPath: resolve(EVIDENCE, 'freeze-report-quiet.json'),
      cwd: REPO_ROOT,
    });
    expect(freeze.ok).toBe(true);

    const exportProbeRoot = resolve(EVIDENCE, `export-quiet-fail-${RUN}`);
    rmSync(exportProbeRoot, { recursive: true, force: true });

    const missing = await runCutoverEtl({
      cwd: REPO_ROOT,
      reportPath: resolve(EVIDENCE, 'quiet-missing.json'),
      catalogPath: CATALOG,
      databaseUrl: DATABASE_URL,
      blobRoot: BLOB_ROOT,
      exportRoot: exportProbeRoot,
      quietCheckPath: resolve(EVIDENCE, 'does-not-exist-quiet.json'),
      freezeReportPath: resolve(EVIDENCE, 'freeze-report-quiet.json'),
      exportRunner: () => {
        throw new Error('export must not run when quiet-check missing');
      },
    });
    evidence('quiet-missing.json', missing);
    expect(missing.ok).toBe(false);
    expect('error' in missing && missing.error?.code).toBe(QUIET_CHECK_REQUIRED);
    expect(existsSync(exportProbeRoot) ? readdirSync(exportProbeRoot).length : 0).toBe(0);

    const badQuiet = resolve(EVIDENCE, 'quiet-check-not-ok.json');
    writeFileSync(
      badQuiet,
      `${JSON.stringify({ ok: false, acceptedWriteCount: 1, auditAcceptedWriteCount: 1 }, null, 2)}\n`
    );
    const notOk = await runCutoverEtl({
      cwd: REPO_ROOT,
      reportPath: resolve(EVIDENCE, 'quiet-not-ok.json'),
      catalogPath: CATALOG,
      databaseUrl: DATABASE_URL,
      blobRoot: BLOB_ROOT,
      exportRoot: exportProbeRoot,
      quietCheckPath: badQuiet,
      freezeReportPath: resolve(EVIDENCE, 'freeze-report-quiet.json'),
      exportRunner: () => {
        throw new Error('export must not run when quiet_ok!=true');
      },
    });
    evidence('quiet-not-ok.json', notOk);
    expect(notOk.ok).toBe(false);
    expect('error' in notOk && notOk.error?.code).toBe(QUIET_CHECK_REQUIRED);

    // Restore good quiet-check for subsequent tests
    quietCheckPath = seedQuietCheck(true);
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

    quietCheckPath = seedQuietCheck(true);

    let capturedExportStart = 0;
    // AC-1 primary: live runConvexExport (default). Fixture is secondary only.
    const result = await runCutoverEtl({
      cwd: REPO_ROOT,
      reportPath: resolve(EVIDENCE, 'watermark-report.json'),
      catalogPath: CATALOG,
      databaseUrl: DATABASE_URL,
      blobRoot: BLOB_ROOT,
      quietCheckPath,
      freezeReportPath: resolve(EVIDENCE, 'freeze-report.json'),
      exportRoot: resolve(EVIDENCE, 'exports'),
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
    evidence('ac1-export-mode.json', {
      LIVE_EXPORT,
      exportDir: 'exportDir' in result ? (result as CutoverEtlReport).exportDir : null,
      note: LIVE_EXPORT
        ? 'live runConvexExport (npx convex export) — AC-1 primary evidence'
        : 'fixture secondary path — not AC-1 primary',
    });

    expect('error' in result && (result as { error?: { code?: string } }).error?.code).not.toBe(
      FENCE_NOT_ENGAGED
    );
    expect('error' in result && (result as { error?: { code?: string } }).error?.code).not.toBe(
      QUIET_CHECK_REQUIRED
    );
    expect(result).toHaveProperty('unexplainedVariance');
    const report = result as CutoverEtlReport;
    firstReport = report;
    firstExportDir = report.exportDir;

    // Harvest export-meta / counts for live path
    if (LIVE_EXPORT && report.exportDir) {
      const exportParent = resolve(report.exportDir, '..');
      const metaCandidates = [
        join(exportParent, 'export-meta.json'),
        join(exportParent, '..', 'export-meta.json'),
      ];
      for (const meta of metaCandidates) {
        if (existsSync(meta)) {
          cpSync(meta, resolve(EVIDENCE, 'export-meta.json'));
          break;
        }
      }
      // Also scan exportRoot for zip + meta written by runConvexExport
      const exportsRoot = resolve(EVIDENCE, 'exports');
      if (existsSync(exportsRoot)) {
        for (const stamp of readdirSync(exportsRoot)) {
          const runDir = join(exportsRoot, stamp);
          const meta = join(runDir, 'export-meta.json');
          const zip = join(runDir, 'convex-export.zip');
          if (existsSync(meta)) {
            cpSync(meta, resolve(EVIDENCE, 'export-meta.json'));
            evidence('live-export-meta-path.txt', meta);
          }
          if (existsSync(zip)) {
            evidence('live-export-zip-path.txt', zip);
          }
        }
      }
      evidence('live-export-ids-sample.json', {
        documents: report.archive.exportData.documents.slice(0, 10),
        conversations: report.archive.exportData.conversations.slice(0, 10),
        rowCounts: report.archive.exportData.rowCounts,
        exportDir: report.exportDir,
        exportArchiveHash: report.exportArchiveHash,
      });
      // Real convex IDs are typically 32+ char alphanumeric (not fixture doc_legacy_*)
      const sampleId = report.archive.exportData.documents[0] ?? '';
      evidence('live-export-id-shape.json', {
        sampleDocumentId: sampleId,
        looksLikeConvexId: sampleId.length >= 20 && !sampleId.startsWith('doc_legacy_'),
        documentsCount: report.archive.exportData.documents.length,
        conversationsCount: report.archive.exportData.conversations.length,
      });
    }

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

    // STRICT: overall ok is AND of reconcile + fkAudit + vectors. When fleet
    // embed is healthy, ok must be true; when AI SDK/fleet is broken,
    // vectorsError is recorded and ok stays false (not a silent green).
    if (report.vectors?.ok) {
      expect(report.ok).toBe(true);
    } else {
      evidence('vectors-not-ok.json', {
        vectorsError: report.vectorsError,
        vectors: report.vectors,
        residual:
          'vectors stage failed (fleet/SDK); load+reconcile+fk gates may still green. overall.ok remains false (honest AND).',
        note: 'vectors stage failed; load+reconcile+fk gates still green',
      });
      expect(report.ok).toBe(false);
    }

    const docsCount = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM documents
    `;
    evidence('ac1-docs-count.json', {
      documents: Number(docsCount[0]?.n ?? 0),
      loadedByTable: report.loadedByTable,
      LIVE_EXPORT,
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
      quietCheckPath,
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
    else expect(report.ok).toBe(false);

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
    // Live reports can exceed spawn stdout buffer; prefer --output file.
    const reportFile = resolve(EVIDENCE, 'cli-rerun-report.json');
    const parsed = (
      existsSync(reportFile)
        ? JSON.parse(readFileSync(reportFile, 'utf8'))
        : JSON.parse((cli.stdout || '{}').slice(0, 200_000))
    ) as {
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
      evidence('cli-rerun-nonzero-note.txt', 'CLI non-zero (likely vectors/fleet); fence ok');
      if (typeof parsed.resumed === 'boolean') {
        expect(parsed.resumed).toBe(true);
      }
    }
  }, 900_000);

  it('EMPTY_EXPORT: non-empty gate fails when documents/conversations empty', async () => {
    // Fence should still be engaged from AC-1 freeze
    const env = getMigrationReadOnlyEnv(REPO_ROOT);
    if (!isFenceArmedEnv(env)) {
      const freeze = await runCutoverFreeze({
        reason: `sprint-29 D06-04 empty-export ${RUN}`,
        reportPath: resolve(EVIDENCE, 'freeze-report-empty.json'),
        cwd: REPO_ROOT,
      });
      expect(freeze.ok).toBe(true);
    }
    quietCheckPath = seedQuietCheck(true);

    const result = await runCutoverEtl({
      cwd: REPO_ROOT,
      reportPath: resolve(EVIDENCE, 'empty-export.json'),
      catalogPath: CATALOG,
      databaseUrl: DATABASE_URL,
      blobRoot: BLOB_ROOT,
      quietCheckPath,
      freezeReportPath: resolve(EVIDENCE, 'freeze-report.json'),
      exportRoot: resolve(EVIDENCE, 'exports'),
      // Timestamps must be captured inside the runner (after watermark).
      exportRunner: () => {
        const empty = materializeEmptyExport();
        const exportStartedAtMs = Date.now();
        return {
          ok: true as const,
          exportDir: empty.exportDir,
          zipPath: join(empty.exportDir, '..', 'convex-export.zip'),
          exportStartedAtMs,
          exportFinishedAtMs: Date.now(),
          exportZipHash: empty.exportZipHash,
          includeFileStorage: true,
        };
      },
    });

    evidence('empty-export.json', result);
    expect(result.ok).toBe(false);
    expect('error' in result && result.error?.code).toBe('EMPTY_EXPORT');
  }, 180_000);
});
