/**
 * Per-field content digests + defaulted-column inventory for ETL reconcile (S31-CX-03 / R22).
 *
 * Compares archive source values (after the same coerce + id-remap path as load) against
 * loaded Postgres columns so null-coercion / default-substitution / post-load corruption
 * cannot hide behind row-count variance 0.
 */
import { createHash } from 'node:crypto';
import type { CatalogFieldEntry, CatalogTableEntry } from '../catalog/catalog-loader.ts';
import type { Sql } from '../db/client.ts';
import type { ParsedExportRow } from './archive.ts';
import {
  type ColumnInfo,
  loadTableColumns,
  quoteIdent,
  resolveTargetColumnName,
  type TableColumns,
} from './metadata.ts';
import { coerceForColumn } from './transform.ts';

const SKIP_FIELD_DISPOSITIONS = new Set(['drop', 'archive', 'regenerate']);
const SKIP_TABLE_DISPOSITIONS = new Set(['drop', 'archive', 'regenerate']);

export interface FieldDigestMismatch {
  table: string;
  field: string;
  targetColumn: string;
  mismatchCount: number;
  sourceDigest: string;
  loadedDigest: string;
  sampleLegacyIds: string[];
}

export interface DefaultedColumnEntry {
  table: string;
  column: string;
  count: number;
}

export interface EmptySourceTableEntry {
  table: string;
  reason: 'EMPTY_SOURCE_TABLE';
  disposition: string;
}

export interface FieldDigestReport {
  fieldDigestMismatches: number;
  fieldDigestMismatchDetails: FieldDigestMismatch[];
  defaulted_column: DefaultedColumnEntry[];
  emptySourceTables: EmptySourceTableEntry[];
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(',')}}`;
}

/** Canonical string form for digest equality (source expected vs loaded). */
export function canonicalizeDigestValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    // Normalize integer-valued floats so 1 and 1.0 compare equal.
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? 'null' : value.toISOString();
  }
  if (typeof value === 'string') {
    // postgres.js may surface timestamptz as ISO strings.
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
    }
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value) || typeof value === 'object') {
    return stableJson(value);
  }
  return String(value);
}

function mapMaybeLegacyId(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === 'string') {
    return idMap.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? (idMap.get(item) ?? item) : item));
  }
  return value;
}

export function isRetainedCatalogTable(entry: CatalogTableEntry): boolean {
  return !SKIP_TABLE_DISPOSITIONS.has(entry.disposition) && Boolean(entry.target?.trim());
}

/**
 * Catalog-approved emptiness: formula is literal 0, or table is not retained.
 * Retained tables with count(source) and 0 archive rows fail closed (EMPTY_SOURCE_TABLE).
 */
export function isApprovedEmptySource(entry: CatalogTableEntry): boolean {
  if (!isRetainedCatalogTable(entry)) return true;
  const normalized = entry.expected_target_formula.trim().replace(/^["']|["']$/g, '');
  return normalized === '0';
}

type ComparableField = {
  sourceField: string;
  targetColumn: string;
  fieldEntry: CatalogFieldEntry;
  column: ColumnInfo;
};

function listComparableFields(entry: CatalogTableEntry, columns: TableColumns): ComparableField[] {
  const out: ComparableField[] = [];
  for (const [sourceField, fieldEntry] of Object.entries(entry.fields)) {
    if (SKIP_FIELD_DISPOSITIONS.has(fieldEntry.disposition)) continue;
    if (!fieldEntry.target) continue;
    // Load path skips these and sets legacy_convex_id / timestamps separately
    // (mapMaybeLegacyId would incorrectly rewrite _id → uuid).
    if (sourceField === '_id' || sourceField === '_creationTime' || sourceField === 'embedding') {
      continue;
    }

    const [targetTable, rawTargetColumn] = fieldEntry.target.split('.', 2);
    if (!targetTable || !rawTargetColumn) continue;
    if (targetTable === 'content_addressed_blobs') continue;
    if (entry.target && targetTable !== entry.target) continue;

    const resolved = resolveTargetColumnName(columns, rawTargetColumn, sourceField);
    if (!resolved) continue;
    const column = columns.get(resolved);
    if (!column) continue;
    if (column.udtName === 'vector') continue;
    // Generated / system columns not written by ETL.
    if (resolved === 'search_vector' || resolved === 'id') continue;

    out.push({
      sourceField,
      targetColumn: resolved,
      fieldEntry,
      column,
    });
  }
  return out;
}

function expectSourceValue(
  sourceValue: unknown,
  column: ColumnInfo,
  targetColumn: string,
  sourceField: string,
  idMap: Map<string, string>
): { kind: 'value'; value: unknown } | { kind: 'defaulted' } | { kind: 'skip' } {
  if (sourceValue === undefined) {
    // Field absent from archive row — load omits the column (DB default may apply).
    if (column.hasDefault) return { kind: 'defaulted' };
    return { kind: 'skip' };
  }

  const mapped = mapMaybeLegacyId(sourceValue, idMap);
  const coerced = coerceForColumn(mapped, column, {
    isStatus: targetColumn === 'status',
    forbidVectorCopy: sourceField === 'embedding',
  });

  if (coerced === undefined) return { kind: 'skip' };
  if (coerced === null && !column.isNullable && column.hasDefault) {
    return { kind: 'defaulted' };
  }
  return { kind: 'value', value: coerced };
}

async function loadIdMap(sql: Sql): Promise<Map<string, string>> {
  const rows = await sql<Array<{ old_id: string; new_id: string }>>`
    SELECT old_id, new_id::text AS new_id
    FROM convex_id_map
  `;
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.old_id, row.new_id);
  }
  return map;
}

async function loadTargetFieldValues(
  sql: Sql,
  targetTable: string,
  sourceTable: string,
  sourceLegacyIds: string[],
  columns: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const byLegacy = new Map<string, Record<string, unknown>>();
  if (sourceLegacyIds.length === 0 || columns.length === 0) return byLegacy;

  const uniqueCols = [...new Set(columns)];
  const selectList = uniqueCols
    .map((col) => `t.${quoteIdent(col)} AS ${quoteIdent(col)}`)
    .join(', ');
  const result = await sql.unsafe<Array<Record<string, unknown>>>(
    `
      SELECT m.old_id AS "__legacy_id", ${selectList}
      FROM ${quoteIdent(targetTable)} t
      JOIN convex_id_map m ON t.id::text = m.new_id
      WHERE m.table_name = $1
        AND m.old_id = ANY($2::text[])
    `,
    [sourceTable, sourceLegacyIds]
  );

  for (const row of result) {
    const legacyId = String(row.__legacy_id ?? '');
    if (!legacyId) continue;
    const values: Record<string, unknown> = {};
    for (const col of uniqueCols) {
      values[col] = row[col];
    }
    byLegacy.set(legacyId, values);
  }
  return byLegacy;
}

/**
 * Compute field digests, defaulted-column inventory, and empty retained source tables.
 *
 * EMPTY_SOURCE_TABLE fires only when the archive lists the table (file present) with 0 rows
 * for a retained, non-approved-empty catalog entry — not when the table is absent from the export.
 */
export async function computeFieldDigestReport(options: {
  sql: Sql;
  catalogTables: Record<string, CatalogTableEntry>;
  archiveRowsByTable: Map<string, ParsedExportRow[]>;
  /** Tables present in the export surface (_tables list / on-disk dirs). */
  listedArchiveTables: ReadonlySet<string> | readonly string[];
}): Promise<FieldDigestReport> {
  const { sql, catalogTables, archiveRowsByTable } = options;
  const listed =
    options.listedArchiveTables instanceof Set
      ? options.listedArchiveTables
      : new Set(options.listedArchiveTables);
  const idMap = await loadIdMap(sql);
  const columnCache = new Map<string, TableColumns>();

  const mismatches: FieldDigestMismatch[] = [];
  const defaultedMap = new Map<string, DefaultedColumnEntry>();
  const emptySourceTables: EmptySourceTableEntry[] = [];

  const getColumns = async (target: string): Promise<TableColumns> => {
    const cached = columnCache.get(target);
    if (cached) return cached;
    const loaded = await loadTableColumns(sql, target);
    columnCache.set(target, loaded);
    return loaded;
  };

  for (const [table, entry] of Object.entries(catalogTables)) {
    const sourceRows = archiveRowsByTable.get(table) ?? [];
    const tablePresentInArchive = listed.has(table);

    if (sourceRows.length === 0) {
      // Fail closed only when the archive file surface includes the table with 0 rows.
      if (tablePresentInArchive && isRetainedCatalogTable(entry) && !isApprovedEmptySource(entry)) {
        emptySourceTables.push({
          table,
          reason: 'EMPTY_SOURCE_TABLE',
          disposition: entry.disposition,
        });
      }
      continue;
    }

    if (!isRetainedCatalogTable(entry) || !entry.target) continue;

    const columns = await getColumns(entry.target);
    const comparable = listComparableFields(entry, columns);
    if (comparable.length === 0) continue;

    const sourceLegacyIds = sourceRows.map((row) => row.legacyId);
    const loadedByLegacy = await loadTargetFieldValues(
      sql,
      entry.target,
      table,
      sourceLegacyIds,
      comparable.map((c) => c.targetColumn)
    );

    for (const field of comparable) {
      const sourceLines: string[] = [];
      const loadedLines: string[] = [];
      const mismatchLegacyIds: string[] = [];
      let mismatchCount = 0;

      for (const row of sourceRows) {
        const sourceValue = row.rowJson[field.sourceField];
        const expected = expectSourceValue(
          sourceValue,
          field.column,
          field.targetColumn,
          field.sourceField,
          idMap
        );

        if (expected.kind === 'defaulted') {
          const key = `${table}.${field.targetColumn}`;
          const existing = defaultedMap.get(key);
          if (existing) existing.count += 1;
          else {
            defaultedMap.set(key, {
              table,
              column: field.targetColumn,
              count: 1,
            });
          }
          // Default substitution is reported, not a digest mismatch.
          continue;
        }
        if (expected.kind === 'skip') continue;

        const expectedCanon = canonicalizeDigestValue(expected.value);
        sourceLines.push(`${row.legacyId}\t${expectedCanon}`);

        const loadedRow = loadedByLegacy.get(row.legacyId);
        const loadedValue = loadedRow ? loadedRow[field.targetColumn] : undefined;
        const loadedCanon = canonicalizeDigestValue(loadedValue ?? null);
        loadedLines.push(`${row.legacyId}\t${loadedCanon}`);

        if (expectedCanon !== loadedCanon) {
          mismatchCount += 1;
          if (mismatchLegacyIds.length < 5) mismatchLegacyIds.push(row.legacyId);
        }
      }

      if (mismatchCount > 0) {
        sourceLines.sort();
        loadedLines.sort();
        mismatches.push({
          table,
          field: field.sourceField,
          targetColumn: field.targetColumn,
          mismatchCount,
          sourceDigest: sha256Text(sourceLines.join('\n')),
          loadedDigest: sha256Text(loadedLines.join('\n')),
          sampleLegacyIds: mismatchLegacyIds,
        });
      }
    }
  }

  return {
    fieldDigestMismatches: mismatches.length,
    fieldDigestMismatchDetails: mismatches.sort(
      (a, b) => a.table.localeCompare(b.table) || a.field.localeCompare(b.field)
    ),
    defaulted_column: [...defaultedMap.values()].sort(
      (a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column)
    ),
    emptySourceTables: emptySourceTables.sort((a, b) => a.table.localeCompare(b.table)),
  };
}
