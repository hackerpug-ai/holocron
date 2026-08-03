/** Sprint 14 reconciliation report: source counts vs loaded target counts + FK/blob summaries. */

import { createHash } from 'node:crypto';
import { runBlobVerify } from '../blob/verify.ts';
import { collectStorageLegacyIdsByRef } from '../catalog/assets.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { runFkAudit } from './fk-audit.ts';
import { loadLatestRunContext } from './latest-run.ts';

export interface EtlReconcileTableRow {
  table: string;
  targetTable: string | null;
  sourceCount: number;
  sourceChecksum: string;
  sourceSampleLegacyIds: string[];
  loadedCount: number;
  expectedTarget: number;
  expectedTargetFormula: string;
  variance: number;
  disposition: string;
  approvalId: string;
  approvedException: boolean;
  approvedExceptionId: string | null;
  catalogChecksumOrSample: string;
  unexplained: boolean;
}

export interface EtlReconcileStorageRefRow {
  storageRef: string;
  target: string | null;
  sourceObjectCount: number;
  sourceChecksum: string;
  sourceSampleLegacyIds: string[];
  retainedLoadedCount: number;
  retainedExpectedCount: number;
  expectedTargetFormula: string;
  variance: number;
  disposition: string;
  approvalId: string;
  approvedException: boolean;
  approvedExceptionId: string | null;
  catalogChecksumOrSample: string | null;
  unexplained: boolean;
}

export interface EtlReconcileReport {
  ok: boolean;
  unexplainedVariance: number;
  tableUnexplainedVariance: number;
  storageRefUnexplainedVariance: number;
  tables: EtlReconcileTableRow[];
  storageRefs: EtlReconcileStorageRefRow[];
  fkAudit: {
    orphans: number;
    checkedRelationships: number;
  };
  blobVerify: {
    retainedCount: number;
    parityFailures: number;
  };
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function evaluateExpectedTargetFormula(
  surface: string,
  formula: string,
  counts: { sourceCount: number; sourceObjectCount?: number }
): number {
  const normalized = formula.trim().replace(/^["']|["']$/g, '');
  switch (normalized) {
    case 'count(source)':
    case 'source_count':
    case 'count(*)':
      return counts.sourceCount;
    case 'count(source_objects)':
      if (counts.sourceObjectCount === undefined) {
        throw new Error(
          `etl: unsupported expected_target_formula '${formula}' for ${surface}: source_objects unavailable`
        );
      }
      return counts.sourceObjectCount;
    case '0':
      return 0;
    default:
      if (/^\d+$/.test(normalized)) {
        return Number(normalized);
      }
      throw new Error(`etl: unsupported expected_target_formula '${formula}' for ${surface}`);
  }
}

export async function runEtlReconcile(options?: {
  databaseUrl?: string;
  exportDir?: string | null;
  catalogPath?: string;
  blobRoot?: string;
}): Promise<EtlReconcileReport> {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'etl:reconcile',
  });
  const ctx = await loadLatestRunContext({
    databaseUrl,
    exportDir: options?.exportDir,
    catalogPath: options?.catalogPath,
  });
  const { sql, archive, catalog } = ctx;
  try {
    const archiveRowsByTable = new Map<string, typeof archive.rows>();
    for (const row of archive.rows) {
      const bucket = archiveRowsByTable.get(row.sourceTable) ?? [];
      bucket.push(row);
      archiveRowsByTable.set(row.sourceTable, bucket);
    }

    const tableRows: EtlReconcileTableRow[] = [];
    let tableUnexplainedVariance = 0;

    for (const [table, entry] of Object.entries(catalog.tables)) {
      if (!entry.approval?.trim()) {
        throw new Error(`etl: catalog table ${table} missing approval id`);
      }
      if (!entry.checksum_or_sample?.trim()) {
        throw new Error(`etl: catalog table ${table} missing checksum_or_sample evidence`);
      }

      const sourceRows = archiveRowsByTable.get(table) ?? [];
      const sourceCount = sourceRows.length;
      const sourceChecksum = sha256Text(
        sourceRows.map((row) => `${row.legacyId}:${row.rowHash}`).join('\n')
      );
      const sourceSampleLegacyIds = sourceRows.slice(0, 3).map((row) => row.legacyId);
      const expectedTarget = evaluateExpectedTargetFormula(
        `table ${table}`,
        entry.expected_target_formula,
        {
          sourceCount,
        }
      );

      let loadedCount = 0;
      if (entry.target) {
        const result = await sql.unsafe<Array<{ count: string }>>(
          `
            SELECT count(*)::text AS count
            FROM "${entry.target.replace(/"/g, '""')}" t
            JOIN convex_id_map m ON t.id::text = m.new_id
            WHERE m.table_name = $1
          `,
          [table]
        );
        loadedCount = Number(result[0]?.count ?? 0);
      }

      const variance = loadedCount - expectedTarget;
      const unexplained = variance !== 0;
      if (unexplained) {
        tableUnexplainedVariance += Math.abs(variance);
      }

      tableRows.push({
        table,
        targetTable: entry.target,
        sourceCount,
        sourceChecksum,
        sourceSampleLegacyIds,
        loadedCount,
        expectedTarget,
        expectedTargetFormula: entry.expected_target_formula,
        variance,
        disposition: entry.disposition,
        approvalId: entry.approval,
        approvedException: entry.disposition !== 'preserve',
        approvedExceptionId: entry.disposition !== 'preserve' ? entry.approval : null,
        catalogChecksumOrSample: entry.checksum_or_sample,
        unexplained,
      });
    }

    const blobByLegacyId = new Map(
      archive.exportData.storageBlobs.map((blob) => [blob.legacyId, blob] as const)
    );
    const storageLegacyIdsByRef = collectStorageLegacyIdsByRef(catalog, archive.exportData);
    const storageRefRows: EtlReconcileStorageRefRow[] = [];
    let storageRefUnexplainedVariance = 0;

    for (const [storageRef, entry] of Object.entries(catalog.storage_refs)) {
      if (!entry.approval?.trim()) {
        throw new Error(`etl: catalog storage ref ${storageRef} missing approval id`);
      }
      if (entry.disposition !== 'drop' && !entry.checksum_or_sample?.trim()) {
        throw new Error(
          `etl: catalog storage ref ${storageRef} missing checksum_or_sample evidence`
        );
      }

      const sourceLegacyIds = [...(storageLegacyIdsByRef[storageRef] ?? [])].sort();
      const sourceObjectCount = sourceLegacyIds.length;
      const sourceChecksum = sha256Text(
        sourceLegacyIds
          .map((legacyId) => {
            const blob = blobByLegacyId.get(legacyId);
            return `${legacyId}:${blob?.sha256 ?? 'missing'}:${blob?.bytes ?? 'missing'}`;
          })
          .join('\n')
      );
      const sourceSampleLegacyIds = sourceLegacyIds.slice(0, 3);
      const retainedExpectedCount = evaluateExpectedTargetFormula(
        `storage ref ${storageRef}`,
        entry.expected_target_formula,
        {
          sourceCount: sourceObjectCount,
          sourceObjectCount,
        }
      );

      let retainedLoadedCount = 0;
      if (sourceLegacyIds.length > 0) {
        const result = await sql<{ count: string }[]>`
          SELECT count(*)::text AS count
          FROM file_objects
          WHERE legacy_convex_id = ANY(${sourceLegacyIds})
             OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(
                 COALESCE(file_objects.metadata_json->'legacyIds', '[]'::jsonb)
               ) AS legacy_ids(legacy_id)
               WHERE legacy_ids.legacy_id = ANY(${sourceLegacyIds})
             )
        `;
        retainedLoadedCount = Number(result[0]?.count ?? 0);
      }

      const variance = retainedLoadedCount - retainedExpectedCount;
      const unexplained = variance !== 0;
      if (unexplained) {
        storageRefUnexplainedVariance += Math.abs(variance);
      }

      storageRefRows.push({
        storageRef,
        target: entry.target,
        sourceObjectCount,
        sourceChecksum,
        sourceSampleLegacyIds,
        retainedLoadedCount,
        retainedExpectedCount,
        expectedTargetFormula: entry.expected_target_formula,
        variance,
        disposition: entry.disposition,
        approvalId: entry.approval,
        approvedException: entry.disposition !== 'preserve',
        approvedExceptionId: entry.disposition !== 'preserve' ? entry.approval : null,
        catalogChecksumOrSample: entry.checksum_or_sample,
        unexplained,
      });
    }

    const fkAudit = await runFkAudit({
      databaseUrl,
      exportDir: options?.exportDir,
      catalogPath: options?.catalogPath,
    });
    const blobVerify = await runBlobVerify({
      databaseUrl,
      exportDir: options?.exportDir,
      catalogPath: options?.catalogPath,
      blobRoot: options?.blobRoot,
    });

    return {
      ok:
        tableUnexplainedVariance === 0 &&
        storageRefUnexplainedVariance === 0 &&
        fkAudit.orphans === 0 &&
        blobVerify.parityFailures === 0,
      unexplainedVariance: tableUnexplainedVariance + storageRefUnexplainedVariance,
      tableUnexplainedVariance,
      storageRefUnexplainedVariance,
      tables: tableRows.sort((a, b) => a.table.localeCompare(b.table)),
      storageRefs: storageRefRows.sort((a, b) => a.storageRef.localeCompare(b.storageRef)),
      fkAudit: {
        orphans: fkAudit.orphans,
        checkedRelationships: fkAudit.checkedRelationships,
      },
      blobVerify: {
        retainedCount: blobVerify.retainedCount,
        parityFailures: blobVerify.parityFailures,
      },
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
