/**
 * S31-CX-02 — verify retained ETL archive provenance + content hash.
 *
 * Agent-safe surface:
 *  - Validates export dir + required provenance sidecar (fail-closed AC-2)
 *  - Recomputes on-disk archiveHash and optionally compares to etl_runs.export_hash (AC-3)
 *  - Does NOT invoke live `convex export` (AC-1 is operator-only; see runbook)
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultCatalogPath, loadCatalog } from '../catalog/catalog-loader.ts';
import { createSql } from '../db/client.ts';
import {
  computeArchiveHash,
  EXPORT_PROVENANCE_SIDECAR,
  type ExportProvenance,
  exportProvenancePath,
  readImmutableExport,
  requireExportProvenance,
} from './archive.ts';

export type ArchiveProvenanceReport = {
  ok: boolean;
  exportDir: string;
  provenancePath: string;
  provenancePresent: boolean;
  provenance: ExportProvenance | null;
  archiveHash: string | null;
  /** 64-hex etl_runs.export_hash when queried / supplied. */
  expectedExportHash: string | null;
  hashMatch: boolean | null;
  etlRunId: string | null;
  etlExportRoot: string | null;
  tableCount: number | null;
  rowCount: number | null;
  documentsRows: number | null;
  message: string;
  /** True when AC-3 DB compare was skipped (no PLATFORM_IT / no row / no --expected-hash). */
  hashCompareSkipped: boolean;
  hashCompareSkipReason: string | null;
  errors: string[];
};

export type VerifyArchiveProvenanceOptions = {
  exportDir: string;
  catalogPath?: string;
  /** Explicit expected hash (overrides DB lookup). */
  expectedExportHash?: string | null;
  /**
   * When true (default), attempt SELECT export_hash FROM etl_runs for this
   * export_root / matching hash when DATABASE_URL is set.
   */
  queryEtlRuns?: boolean;
  databaseUrl?: string | null;
  /**
   * When true, only require provenance + compute hash (no full catalog/blob
   * validation). Default false — full readImmutableExport path.
   */
  provenanceOnly?: boolean;
};

const HEX64 = /^[a-f0-9]{64}$/i;

function isHex64(value: string): boolean {
  return HEX64.test(value);
}

async function lookupEtlRunHash(
  exportDir: string,
  archiveHash: string | null,
  databaseUrl: string
): Promise<{
  exportHash: string | null;
  runId: string | null;
  exportRoot: string | null;
  skipReason: string | null;
}> {
  const sql = createSql(databaseUrl);
  try {
    const root = resolve(exportDir);
    // Prefer exact export_root match, then matching export_hash for retained S29 path.
    const byRoot = await sql<
      {
        id: string;
        export_root: string;
        export_hash: string;
      }[]
    >`
      SELECT id::text AS id, export_root, export_hash
      FROM etl_runs
      WHERE export_root = ${root}
         OR export_root LIKE ${`${root}%`}
         OR ${root} LIKE (export_root || '%')
      ORDER BY completed_at DESC NULLS LAST, created_at DESC
      LIMIT 5
    `;
    if (byRoot.length > 0) {
      const row = byRoot[0]!;
      return {
        exportHash: row.export_hash,
        runId: row.id,
        exportRoot: row.export_root,
        skipReason: null,
      };
    }
    if (archiveHash && isHex64(archiveHash)) {
      const byHash = await sql<
        {
          id: string;
          export_root: string;
          export_hash: string;
        }[]
      >`
        SELECT id::text AS id, export_root, export_hash
        FROM etl_runs
        WHERE export_hash = ${archiveHash.toLowerCase()}
           OR lower(export_hash) = ${archiveHash.toLowerCase()}
        ORDER BY completed_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `;
      if (byHash.length > 0) {
        const row = byHash[0]!;
        return {
          exportHash: row.export_hash,
          runId: row.id,
          exportRoot: row.export_root,
          skipReason: null,
        };
      }
    }
    // Fall back: latest succeeded run (Sprint 29 retained path may use a different host path)
    const latest = await sql<
      {
        id: string;
        export_root: string;
        export_hash: string;
      }[]
    >`
      SELECT id::text AS id, export_root, export_hash
      FROM etl_runs
      WHERE status = 'succeeded' AND export_hash IS NOT NULL AND length(export_hash) = 64
      ORDER BY completed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `;
    if (latest.length > 0) {
      const row = latest[0]!;
      return {
        exportHash: row.export_hash,
        runId: row.id,
        exportRoot: row.export_root,
        skipReason: null,
      };
    }
    return {
      exportHash: null,
      runId: null,
      exportRoot: null,
      skipReason: 'no etl_runs row with export_hash found',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exportHash: null,
      runId: null,
      exportRoot: null,
      skipReason: `etl_runs query failed: ${msg}`,
    };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

/**
 * Validate retained export + provenance sidecar; optionally compare archiveHash
 * to etl_runs.export_hash. Never invokes live Convex export.
 */
export async function verifyArchiveProvenance(
  options: VerifyArchiveProvenanceOptions
): Promise<ArchiveProvenanceReport> {
  const exportDir = resolve(options.exportDir);
  const provenancePath = exportProvenancePath(exportDir);
  const errors: string[] = [];
  let provenance: ExportProvenance | null = null;
  let provenancePresent = false;
  let archiveHash: string | null = null;
  let tableCount: number | null = null;
  let rowCount: number | null = null;
  let documentsRows: number | null = null;

  if (!existsSync(exportDir) || !statSync(exportDir).isDirectory()) {
    errors.push(`export directory does not exist: ${exportDir}`);
    return {
      ok: false,
      exportDir,
      provenancePath,
      provenancePresent: false,
      provenance: null,
      archiveHash: null,
      expectedExportHash: options.expectedExportHash ?? null,
      hashMatch: null,
      etlRunId: null,
      etlExportRoot: null,
      tableCount: null,
      rowCount: null,
      documentsRows: null,
      message: `holo cutover:verify-archive-provenance — FAIL (export missing)`,
      hashCompareSkipped: true,
      hashCompareSkipReason: 'export directory missing',
      errors,
    };
  }

  try {
    provenance = requireExportProvenance(exportDir);
    provenancePresent = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    // Still attempt content hash for diagnostics (AC-3 tooling), but ok=false.
    try {
      archiveHash = computeArchiveHash(exportDir).archiveHash;
    } catch {
      // ignore
    }
    return {
      ok: false,
      exportDir,
      provenancePath,
      provenancePresent: false,
      provenance: null,
      archiveHash,
      expectedExportHash: options.expectedExportHash ?? null,
      hashMatch: null,
      etlRunId: null,
      etlExportRoot: null,
      tableCount: null,
      rowCount: null,
      documentsRows: null,
      message: `holo cutover:verify-archive-provenance — FAIL (provenance): ${msg}`,
      hashCompareSkipped: true,
      hashCompareSkipReason: 'provenance sidecar missing or invalid',
      errors,
    };
  }

  if (options.provenanceOnly) {
    const hashed = computeArchiveHash(exportDir);
    archiveHash = hashed.archiveHash;
  } else {
    try {
      const catalog = loadCatalog(options.catalogPath ?? defaultCatalogPath());
      const archive = readImmutableExport(exportDir, catalog);
      archiveHash = archive.archiveHash;
      tableCount = archive.listedTables.length;
      rowCount = archive.rows.length;
      documentsRows = archive.rows.filter((r) => r.sourceTable === 'documents').length;
      provenance = archive.provenance;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      try {
        archiveHash = computeArchiveHash(exportDir).archiveHash;
      } catch {
        // ignore
      }
      return {
        ok: false,
        exportDir,
        provenancePath,
        provenancePresent,
        provenance,
        archiveHash,
        expectedExportHash: options.expectedExportHash ?? null,
        hashMatch: null,
        etlRunId: null,
        etlExportRoot: null,
        tableCount,
        rowCount,
        documentsRows,
        message: `holo cutover:verify-archive-provenance — FAIL (archive): ${msg}`,
        hashCompareSkipped: true,
        hashCompareSkipReason: 'immutable export validation failed',
        errors,
      };
    }
  }

  let expectedExportHash: string | null =
    typeof options.expectedExportHash === 'string' && options.expectedExportHash.trim()
      ? options.expectedExportHash.trim().toLowerCase()
      : null;
  let etlRunId: string | null = null;
  let etlExportRoot: string | null = null;
  let hashCompareSkipped = false;
  let hashCompareSkipReason: string | null = null;

  const wantDb = options.queryEtlRuns !== false && !expectedExportHash;
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? null;

  if (wantDb) {
    if (!databaseUrl) {
      hashCompareSkipped = true;
      hashCompareSkipReason =
        'DATABASE_URL unset — pass --expected-hash or set PLATFORM_IT DATABASE_URL for etl_runs compare';
    } else {
      const looked = await lookupEtlRunHash(exportDir, archiveHash, databaseUrl);
      if (looked.exportHash) {
        expectedExportHash = looked.exportHash.toLowerCase();
        etlRunId = looked.runId;
        etlExportRoot = looked.exportRoot;
      } else {
        hashCompareSkipped = true;
        hashCompareSkipReason = looked.skipReason ?? 'no etl_runs export_hash';
      }
    }
  } else if (!expectedExportHash) {
    hashCompareSkipped = true;
    hashCompareSkipReason = 'no expected hash supplied and etl_runs query disabled';
  }

  let hashMatch: boolean | null = null;
  if (expectedExportHash && archiveHash) {
    if (!isHex64(expectedExportHash)) {
      errors.push(`expected export_hash is not 64 hex chars: ${expectedExportHash}`);
      hashMatch = false;
    } else {
      hashMatch = archiveHash.toLowerCase() === expectedExportHash.toLowerCase();
      if (!hashMatch) {
        errors.push(`archive hash mismatch: on-disk=${archiveHash} expected=${expectedExportHash}`);
      }
    }
  }

  // ok requires provenance present + no errors; hash match required only when compared
  const ok =
    provenancePresent &&
    errors.length === 0 &&
    (hashMatch === null || hashMatch === true) &&
    Boolean(archiveHash && isHex64(archiveHash));

  let message: string;
  if (ok && hashMatch === true) {
    message = `holo cutover:verify-archive-provenance — OK (hash match ${archiveHash!.slice(0, 12)}…)`;
  } else if (ok && hashCompareSkipped) {
    message = `holo cutover:verify-archive-provenance — OK (provenance + archive hash; hash compare skipped: ${hashCompareSkipReason})`;
  } else if (ok) {
    message = `holo cutover:verify-archive-provenance — OK (provenance + archive hash ${archiveHash!.slice(0, 12)}…)`;
  } else {
    message = `holo cutover:verify-archive-provenance — FAIL (${errors[0] ?? 'unknown'})`;
  }

  return {
    ok,
    exportDir,
    provenancePath,
    provenancePresent,
    provenance,
    archiveHash,
    expectedExportHash,
    hashMatch,
    etlRunId,
    etlExportRoot,
    tableCount,
    rowCount,
    documentsRows,
    message,
    hashCompareSkipped,
    hashCompareSkipReason,
    errors,
  };
}

export function formatArchiveProvenanceText(report: ArchiveProvenanceReport): string {
  const lines = [
    report.message,
    `  exportDir:          ${report.exportDir}`,
    `  provenancePath:     ${report.provenancePath}`,
    `  provenancePresent:  ${report.provenancePresent}`,
    `  sidecar:            ${EXPORT_PROVENANCE_SIDECAR}`,
  ];
  if (report.provenance) {
    lines.push(`  deployment:         ${report.provenance.deployment}`);
    lines.push(`  exportedAt:         ${report.provenance.exportedAt}`);
    if (report.provenance.source) lines.push(`  source:             ${report.provenance.source}`);
  }
  lines.push(`  archiveHash:        ${report.archiveHash ?? '(none)'}`);
  lines.push(`  expectedExportHash: ${report.expectedExportHash ?? '(none)'}`);
  lines.push(
    `  hashMatch:          ${report.hashMatch === null ? '(skipped)' : String(report.hashMatch)}`
  );
  if (report.etlRunId) lines.push(`  etlRunId:           ${report.etlRunId}`);
  if (report.etlExportRoot) lines.push(`  etlExportRoot:      ${report.etlExportRoot}`);
  if (report.tableCount != null) lines.push(`  tableCount:         ${report.tableCount}`);
  if (report.rowCount != null) lines.push(`  rowCount:           ${report.rowCount}`);
  if (report.documentsRows != null) lines.push(`  documentsRows:      ${report.documentsRows}`);
  if (report.hashCompareSkipped) {
    lines.push(`  hashCompareSkip:    ${report.hashCompareSkipReason ?? 'yes'}`);
  }
  for (const e of report.errors) lines.push(`  error: ${e}`);
  return lines.join('\n');
}
