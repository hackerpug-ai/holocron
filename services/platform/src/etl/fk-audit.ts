/** Sprint 14 FK / NULL audit over migrated legacy-id relationships. */

import type { Sql } from '../db/client.ts';
import { loadLatestRunContext } from './latest-run.ts';
import { loadTableColumns, resolveTargetColumnName, type TableColumns } from './metadata.ts';

export interface FkAuditIssue {
  table: string;
  legacyId: string;
  column: string;
  expected: string;
  actual: string | null;
  reason: 'missing_id_map' | 'mismatch';
}

export interface FkAuditReport {
  ok: boolean;
  orphans: number;
  checkedRelationships: number;
  enforcedForeignKeys: number;
  issues: FkAuditIssue[];
}

async function getColumnsCached(
  sql: Sql,
  cache: Map<string, TableColumns>,
  tableName: string
): Promise<TableColumns> {
  const cached = cache.get(tableName);
  if (cached) return cached;
  const loaded = await loadTableColumns(sql, tableName);
  cache.set(tableName, loaded);
  return loaded;
}

async function fetchActualValue(
  sql: Sql,
  tableName: string,
  column: string,
  rowId: string
): Promise<string | null> {
  const rows = await sql.unsafe<Array<{ value: string | null }>>(
    `SELECT "${column.replace(/"/g, '""')}"::text AS value FROM "${tableName.replace(/"/g, '""')}" WHERE "id" = $1::uuid`,
    [rowId]
  );
  return rows[0]?.value ?? null;
}

export async function runFkAudit(options?: {
  databaseUrl?: string;
  exportDir?: string | null;
  catalogPath?: string;
  sql?: Sql;
}): Promise<FkAuditReport> {
  if (options?.sql) {
    throw new Error('runFkAudit does not accept caller-owned sql yet');
  }
  const ctx = await loadLatestRunContext({
    databaseUrl: options?.databaseUrl,
    exportDir: options?.exportDir,
    catalogPath: options?.catalogPath,
  });
  const { sql, catalog, archive } = ctx;
  try {
    const mapRows = await sql<Array<{ old_id: string; new_id: string }>>`
      SELECT old_id, new_id FROM convex_id_map
    `;
    const idMap = new Map(mapRows.map((row) => [row.old_id, row.new_id]));
    const sourceLegacyIds = new Set(archive.rows.map((row) => row.legacyId));
    const columnCache = new Map<string, TableColumns>();
    const issues: FkAuditIssue[] = [];
    let checkedRelationships = 0;

    for (const row of archive.rows) {
      const entry = catalog.tables[row.sourceTable];
      if (!entry?.target) continue;
      const rowId = idMap.get(row.legacyId);
      if (!rowId) {
        issues.push({
          table: entry.target,
          legacyId: row.legacyId,
          column: 'id',
          expected: row.legacyId,
          actual: null,
          reason: 'missing_id_map',
        });
        continue;
      }
      const columns = await getColumnsCached(sql, columnCache, entry.target);

      for (const [sourceField, fieldEntry] of Object.entries(entry.fields)) {
        const rawValue = row.rowJson[sourceField];
        if (sourceField === '_id' || sourceField === '_creationTime') continue;
        if (typeof rawValue !== 'string' || rawValue.length === 0) continue;
        if (!fieldEntry.target || fieldEntry.target.startsWith('content_addressed_blobs.')) {
          continue;
        }

        const [, rawTargetColumn] = fieldEntry.target.split('.', 2);
        if (!rawTargetColumn) {
          throw new Error(
            `etl: malformed target for ${row.sourceTable}.${sourceField}: ${fieldEntry.target}`
          );
        }
        const resolvedColumn = resolveTargetColumnName(columns, rawTargetColumn, sourceField);
        if (!resolvedColumn || resolvedColumn === 'legacy_convex_id') continue;

        const column = columns.get(resolvedColumn);
        const isUuidColumn = column?.udtName === 'uuid' || column?.dataType === 'uuid';
        const nameLooksLikeReference =
          sourceField.endsWith('Id') ||
          rawTargetColumn.endsWith('Id') ||
          rawTargetColumn.endsWith('_id') ||
          resolvedColumn.endsWith('Id') ||
          resolvedColumn.endsWith('_id');
        const refersToKnownLegacyId = sourceLegacyIds.has(rawValue) || idMap.has(rawValue);
        const looksLikeLegacyReference =
          ((fieldEntry.fk_rewrites as unknown[])?.length ?? 0) > 0 ||
          (nameLooksLikeReference && (isUuidColumn || refersToKnownLegacyId));
        if (!looksLikeLegacyReference) continue;

        checkedRelationships += 1;
        const expected = idMap.get(rawValue);
        if (!expected) {
          issues.push({
            table: entry.target,
            legacyId: row.legacyId,
            column: resolvedColumn,
            expected: rawValue,
            actual: null,
            reason: 'missing_id_map',
          });
          continue;
        }

        const actual = await fetchActualValue(sql, entry.target, resolvedColumn, rowId);
        if (actual !== expected) {
          issues.push({
            table: entry.target,
            legacyId: row.legacyId,
            column: resolvedColumn,
            expected,
            actual,
            reason: 'mismatch',
          });
        }
      }
    }

    const fkRows = await sql<Array<{ count: string }>>`
      SELECT count(*)::text AS count
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY'
    `;
    const enforcedForeignKeys = Number(fkRows[0]?.count ?? 0);

    return {
      ok: issues.length === 0,
      orphans: issues.length,
      checkedRelationships,
      enforcedForeignKeys,
      issues,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
