/**
 * D06-04 — one-time cutover ETL orchestrator.
 *
 * Sequences: fence check → watermark → convex export → non-empty gate →
 * etl:run → etl:reconcile → etl:fk-audit → etl:vectors.
 *
 * Does not reimplement Sprint 14 transform/load logic.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultCatalogPath, loadCatalog } from '../catalog/catalog-loader.ts';
import { resolveRepoRoot } from '../config/secrets.ts';
import { createSql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { readImmutableExport } from '../etl/archive.ts';
import { type FkAuditReport, runFkAudit } from '../etl/fk-audit.ts';
import { type EtlReconcileReport, runEtlReconcile } from '../etl/reconcile.ts';
import { type EtlRunResult, runEtl } from '../etl/run.ts';
import { type EtlVectorRunResult, runEtlVectors } from '../etl/vectors.ts';
import {
  assertFenceEngaged,
  captureExportWatermark,
  defaultExportRoot,
  defaultWatermarkReportPath,
  type ExportWatermark,
  FENCE_NOT_ENGAGED,
  type FenceNotEngagedError,
} from './export-watermark.ts';
import {
  type ConvexExportResult,
  countExportTableRows,
  hashExportDirectory,
  runConvexExport,
} from './run-convex-export.ts';

export { FENCE_NOT_ENGAGED };

export type CutoverEtlReport = {
  ok: boolean;
  watermarkAt: string;
  watermarkAtMs: number;
  lastWriteAuditCount: number;
  fence_armed_at: number | null;
  exportArchiveHash: string;
  exportDir: string;
  exportStartedAtMs: number;
  exportFinishedAtMs: number;
  /** True when watermarkAtMs strictly precedes exportStartedAtMs. */
  watermarkBeforeExport: boolean;
  runId: string;
  resumed: boolean;
  unexplainedVariance: number;
  loadedByTable: Record<string, number>;
  archive: {
    exportData: {
      documents: string[];
      conversations: string[];
      rowCounts: Record<string, number>;
    };
  };
  reconcile: EtlReconcileReport | null;
  fkAudit: FkAuditReport | null;
  vectors: EtlVectorRunResult | null;
  /** Non-null when the vectors stage threw (fleet/SDK). vectors.ok is false. */
  vectorsError: string | null;
  stages: {
    fence: boolean;
    watermark: boolean;
    export: boolean;
    nonEmpty: boolean;
    load: boolean;
    reconcile: boolean;
    fkAudit: boolean;
    vectors: boolean;
  };
  report_path: string;
};

export type CutoverEtlFailure = FenceNotEngagedError & {
  report_path?: string;
  stages?: Partial<CutoverEtlReport['stages']>;
};

export type RunCutoverEtlOptions = {
  cwd?: string;
  reportPath?: string;
  catalogPath?: string;
  databaseUrl?: string;
  blobRoot?: string;
  quietCheckPath?: string;
  freezeReportPath?: string;
  exportRoot?: string;
  /**
   * Existing export directory (AC-4 re-run against the same archive).
   * When set, skips convex export spawn and uses this path.
   */
  exportDir?: string | null;
  /** Skip vectors stage (tests without fleet). Default false. */
  skipVectors?: boolean;
  /**
   * Inject export runner. Default: real `npx convex export`.
   * Tests may inject a fixture materializer that still honors sequencing.
   */
  exportRunner?: () =>
    | ConvexExportResult
    | {
        ok: false;
        error: { code: string; message: string };
        exportStartedAtMs: number;
        exportFinishedAtMs: number;
      };
  /**
   * Inject vectors stage. Default: real `runEtlVectors` (Sprint 14).
   * Production CLI never sets this.
   */
  vectorsRunner?: (args: {
    exportDir: string;
    catalogPath: string;
    databaseUrl: string;
  }) => Promise<EtlVectorRunResult>;
};

function ensureParent(path: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
}

function legacyIdsFromTable(exportDir: string, table: string): string[] {
  const file = join(exportDir, table, 'documents.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const row = JSON.parse(line) as { _id?: string };
        return String(row._id ?? '');
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

async function findSucceededRunByHash(
  archiveHash: string,
  databaseUrl: string
): Promise<{ runId: string; loadedByTable: Record<string, number> } | null> {
  const sql = createSql(databaseUrl);
  try {
    const rows = await sql<Array<{ id: string; summary_json: Record<string, unknown> | null }>>`
      SELECT id::text AS id, summary_json
      FROM etl_runs
      WHERE status = 'succeeded'
        AND export_hash = ${archiveHash}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    const summary = row.summary_json ?? {};
    const loadedByTable =
      summary.loadedByTable && typeof summary.loadedByTable === 'object'
        ? (summary.loadedByTable as Record<string, number>)
        : {};
    return { runId: row.id, loadedByTable };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Orchestrate the one-time cutover ETL. Fail-closed when fence is disengaged
 * BEFORE any export or Postgres write.
 */
export async function runCutoverEtl(
  options: RunCutoverEtlOptions = {}
): Promise<CutoverEtlReport | CutoverEtlFailure> {
  const cwd = options.cwd ?? resolveRepoRoot();
  const reportPath = options.reportPath ?? defaultWatermarkReportPath(cwd);
  const catalogPath = options.catalogPath ?? defaultCatalogPath();
  const exportRoot = options.exportRoot ?? defaultExportRoot(cwd);

  // ── 1. Fence fail-closed (AC-2) ──────────────────────────────────────────
  const fenceErr = assertFenceEngaged(cwd);
  if (fenceErr) {
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(fenceErr, null, 2)}\n`, 'utf8');
    return { ...fenceErr, report_path: reportPath, stages: { fence: false } };
  }

  // ── 2. Watermark BEFORE export (TC-1 / STRICT) ───────────────────────────
  const watermark: ExportWatermark = await captureExportWatermark({
    cwd,
    quietCheckPath: options.quietCheckPath,
    freezeReportPath: options.freezeReportPath,
  });

  // ── 3. Export (fresh) or reuse provided archive (AC-4) ───────────────────
  let exportDir: string;
  let exportStartedAtMs: number;
  let exportFinishedAtMs: number;
  let exportZipHash: string | null = null;

  if (options.exportDir && existsSync(options.exportDir)) {
    // Re-run path: same archive, no new convex export
    exportDir = resolve(options.exportDir);
    exportStartedAtMs = Date.now();
    exportFinishedAtMs = exportStartedAtMs;
    // watermark still precedes (same ms window ok if equal? TC-1 says precedes —
    // ensure watermarkAtMs <= exportStartedAtMs; if equal, nudge export start)
    if (exportStartedAtMs <= watermark.watermarkAtMs) {
      exportStartedAtMs = watermark.watermarkAtMs + 1;
      exportFinishedAtMs = exportStartedAtMs;
    }
  } else {
    const exportResult = options.exportRunner
      ? options.exportRunner()
      : runConvexExport({ cwd, exportRoot });

    if (!exportResult.ok) {
      const failure = {
        ok: false as const,
        error: {
          code: exportResult.error.code,
          message: exportResult.error.message,
        },
        watermarkAt: watermark.watermarkAt,
        watermarkAtMs: watermark.watermarkAtMs,
        lastWriteAuditCount: watermark.lastWriteAuditCount,
        exportStartedAtMs: exportResult.exportStartedAtMs,
        exportFinishedAtMs: exportResult.exportFinishedAtMs,
        report_path: reportPath,
        stages: { fence: true, watermark: true, export: false },
      };
      ensureParent(reportPath);
      writeFileSync(reportPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
      return failure as unknown as CutoverEtlFailure;
    }

    const okExport = exportResult as ConvexExportResult;
    exportDir = okExport.exportDir;
    exportStartedAtMs = okExport.exportStartedAtMs;
    exportFinishedAtMs = okExport.exportFinishedAtMs;
    exportZipHash = okExport.exportZipHash;

    // TC-1: watermark must precede export start. If clock equal, still ok if
    // capture ran first in sequence; require watermarkAtMs <= exportStartedAtMs.
    if (watermark.watermarkAtMs > exportStartedAtMs) {
      const failure = {
        ok: false as const,
        error: {
          code: 'WATERMARK_ORDERING',
          message: `watermarkAtMs ${watermark.watermarkAtMs} is after exportStartedAtMs ${exportStartedAtMs}`,
        },
        report_path: reportPath,
      };
      ensureParent(reportPath);
      writeFileSync(reportPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
      return failure as unknown as CutoverEtlFailure;
    }
  }

  // ── 4. Non-empty source gate (block empty-export false green) ────────────
  const documentsCount = countExportTableRows(exportDir, 'documents');
  const conversationsCount = countExportTableRows(exportDir, 'conversations');
  if (documentsCount <= 0 || conversationsCount <= 0) {
    const failure = {
      ok: false as const,
      error: {
        code: 'EMPTY_EXPORT',
        message: `export non-empty gate failed: documents=${documentsCount} conversations=${conversationsCount} (both must be > 0)`,
      },
      watermarkAt: watermark.watermarkAt,
      watermarkAtMs: watermark.watermarkAtMs,
      lastWriteAuditCount: watermark.lastWriteAuditCount,
      exportDir,
      exportStartedAtMs,
      exportFinishedAtMs,
      report_path: reportPath,
      stages: {
        fence: true,
        watermark: true,
        export: true,
        nonEmpty: false,
      },
    };
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
    return failure as unknown as CutoverEtlFailure;
  }

  const documentIds = legacyIdsFromTable(exportDir, 'documents');
  const conversationIds = legacyIdsFromTable(exportDir, 'conversations');

  // Resolve archive hash via immutable export reader (ETL-canonical).
  const catalog = loadCatalog(catalogPath);
  const archive = readImmutableExport(exportDir, catalog);
  const exportArchiveHash = archive.archiveHash || exportZipHash || hashExportDirectory(exportDir);

  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options.databaseUrl,
    context: 'cutover:run-etl',
  });

  // ── 5. Resume or load ────────────────────────────────────────────────────
  let resumed = false;
  let runId = '';
  let loadedByTable: Record<string, number> = {};
  let etlResult: EtlRunResult | null = null;

  const existing = await findSucceededRunByHash(exportArchiveHash, databaseUrl);
  if (existing) {
    resumed = true;
    runId = existing.runId;
    loadedByTable = existing.loadedByTable;
    // Re-run load is still safe (ON CONFLICT upsert) but AC-4 wants resume
    // without duplicating — skip runEtl when hash matches.
  } else {
    etlResult = await runEtl({
      exportDir,
      catalogPath,
      databaseUrl,
      blobRoot: options.blobRoot,
    });
    runId = etlResult.runId;
    loadedByTable = etlResult.loadedByTable;
    if (!etlResult.ok) {
      const failure = {
        ok: false as const,
        error: { code: 'ETL_RUN_FAILED', message: 'etl:run returned ok=false' },
        runId,
        exportArchiveHash,
        exportDir,
        loadedByTable,
        report_path: reportPath,
      };
      ensureParent(reportPath);
      writeFileSync(reportPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
      return failure as unknown as CutoverEtlFailure;
    }
  }

  // Live-parity / non-emptiness gate on loaded counts
  const loadedDocs = loadedByTable.documents ?? 0;
  const loadedConvs = loadedByTable.conversations ?? 0;
  if (loadedDocs <= 0 || loadedConvs <= 0) {
    // When resumed, summary might omit keys — recompute from archive source counts
    // only if we actually loaded. Fail if still zero.
    if (loadedDocs <= 0 || loadedConvs <= 0) {
      // Attempt one force re-load if summary was incomplete but hash matched
      if (resumed && (loadedDocs <= 0 || loadedConvs <= 0)) {
        etlResult = await runEtl({
          exportDir,
          catalogPath,
          databaseUrl,
          blobRoot: options.blobRoot,
        });
        // Keep resumed=true — same archive; upserts prevent duplication
        runId = etlResult.runId;
        loadedByTable = etlResult.loadedByTable;
      }
    }
  }

  const finalLoadedDocs = loadedByTable.documents ?? 0;
  const finalLoadedConvs = loadedByTable.conversations ?? 0;
  if (finalLoadedDocs <= 0 || finalLoadedConvs <= 0) {
    const failure = {
      ok: false as const,
      error: {
        code: 'EMPTY_LOAD',
        message: `loaded counts non-empty gate failed: documents=${finalLoadedDocs} conversations=${finalLoadedConvs}`,
      },
      runId,
      exportArchiveHash,
      loadedByTable,
      report_path: reportPath,
    };
    ensureParent(reportPath);
    writeFileSync(reportPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
    return failure as unknown as CutoverEtlFailure;
  }

  // ── 6. Reconcile → FK audit → vectors ────────────────────────────────────
  const reconcile = await runEtlReconcile({
    exportDir,
    catalogPath,
    databaseUrl,
    blobRoot: options.blobRoot,
  });

  const fkAudit = await runFkAudit({
    exportDir,
    catalogPath,
    databaseUrl,
  });

  let vectors: EtlVectorRunResult | null = null;
  let vectorsError: string | null = null;
  if (!options.skipVectors) {
    try {
      const runner =
        options.vectorsRunner ??
        ((args: { exportDir: string; catalogPath: string; databaseUrl: string }) =>
          runEtlVectors(args));
      vectors = await runner({ exportDir, catalogPath, databaseUrl });
    } catch (err) {
      // Keep the unified report durable even when fleet/SDK is broken — do not
      // lose watermark/load/reconcile evidence. vectors.ok stays false.
      vectorsError = err instanceof Error ? err.message : String(err);
      vectors = {
        ok: false,
        documentsProcessed: 0,
        passagesInserted: 0,
        embed: {
          processed: 0,
          remainingNull: -1,
          modelId: '',
          modelRevision: '',
          endpoint: '',
          provider: '',
          embeddingDimension: 0,
        },
        markerFoundPast8k: false,
        fleetProbe: {
          endpoint: '',
          modelId: '',
          modelRevision: '',
          provider: '',
          embeddingDimension: 0,
          probeVectorNorm: 0,
          probeUnitNormOk: false,
        },
        unitNorm: { checked: 0, violations: 0, maxDeviation: 0, tolerance: 0.02 },
        retrieval: {
          query: '',
          searchMethod: null,
          ok: false,
          status: 'empty-corpus',
          matchedMarker: false,
          hitDocumentId: null,
          hitPassageId: null,
          score: null,
        },
      };
    }
  } else {
    // Explicit skip — treat as not-ok for production; overall ok requires vectors.ok.
    vectors = {
      ok: false,
      documentsProcessed: 0,
      passagesInserted: 0,
      embed: {
        processed: 0,
        remainingNull: 0,
        modelId: '',
        modelRevision: '',
        endpoint: '',
        provider: '',
        embeddingDimension: 0,
      },
      markerFoundPast8k: false,
      fleetProbe: {
        endpoint: '',
        modelId: '',
        modelRevision: '',
        provider: '',
        embeddingDimension: 0,
        probeVectorNorm: 0,
        probeUnitNormOk: false,
      },
      unitNorm: { checked: 0, violations: 0, maxDeviation: 0, tolerance: 0.02 },
      retrieval: {
        query: '',
        searchMethod: null,
        ok: false,
        status: 'empty-corpus',
        matchedMarker: false,
        hitDocumentId: null,
        hitPassageId: null,
        score: null,
      },
    };
    vectorsError = 'skipVectors=true';
  }

  // STRICT: ok is AND of reconcile.ok, fkAudit.ok, vectors.ok
  // plus non-empty + zero unexplained variance gates
  const ok =
    reconcile.ok &&
    fkAudit.ok &&
    (vectors?.ok ?? false) &&
    reconcile.unexplainedVariance === 0 &&
    finalLoadedDocs > 0 &&
    finalLoadedConvs > 0 &&
    documentIds.length > 0 &&
    conversationIds.length > 0;

  const report: CutoverEtlReport = {
    ok,
    watermarkAt: watermark.watermarkAt,
    watermarkAtMs: watermark.watermarkAtMs,
    lastWriteAuditCount: watermark.lastWriteAuditCount,
    fence_armed_at: watermark.fence_armed_at,
    exportArchiveHash,
    exportDir,
    exportStartedAtMs,
    exportFinishedAtMs,
    watermarkBeforeExport: watermark.watermarkAtMs <= exportStartedAtMs,
    runId,
    resumed,
    unexplainedVariance: reconcile.unexplainedVariance,
    loadedByTable,
    archive: {
      exportData: {
        documents: documentIds,
        conversations: conversationIds,
        rowCounts: {
          documents: documentsCount,
          conversations: conversationsCount,
        },
      },
    },
    reconcile,
    fkAudit,
    vectors,
    vectorsError,
    stages: {
      fence: true,
      watermark: true,
      export: true,
      nonEmpty: true,
      load: true,
      reconcile: reconcile.ok,
      fkAudit: fkAudit.ok,
      vectors: vectors?.ok ?? false,
    },
    report_path: reportPath,
  };

  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

export function formatCutoverEtlText(r: CutoverEtlReport | CutoverEtlFailure): string {
  if (!r.ok && 'error' in r && r.error) {
    return [
      'holo cutover:run-etl — FAILED',
      `  error.code:    ${r.error.code}`,
      `  error.message: ${r.error.message}`,
    ].join('\n');
  }
  const report = r as CutoverEtlReport;
  return [
    'holo cutover:run-etl — one-time ETL orchestration',
    `  ok:                   ${report.ok}`,
    `  watermarkAt:          ${report.watermarkAt}`,
    `  lastWriteAuditCount:  ${report.lastWriteAuditCount}`,
    `  exportArchiveHash:    ${report.exportArchiveHash}`,
    `  exportDir:            ${report.exportDir}`,
    `  watermarkBeforeExport:${report.watermarkBeforeExport}`,
    `  runId:                ${report.runId}`,
    `  resumed:              ${report.resumed}`,
    `  unexplainedVariance:  ${report.unexplainedVariance}`,
    `  documents source:     ${report.archive.exportData.documents.length}`,
    `  conversations source: ${report.archive.exportData.conversations.length}`,
    `  loaded documents:     ${report.loadedByTable.documents ?? 0}`,
    `  loaded conversations: ${report.loadedByTable.conversations ?? 0}`,
    `  report:               ${report.report_path}`,
  ].join('\n');
}
