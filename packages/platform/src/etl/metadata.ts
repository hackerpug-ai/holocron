/** Runtime Postgres table metadata + identifier helpers for generic ETL loading. */
import type { Sql } from '../db/client.ts';

export interface ColumnInfo {
  name: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
  hasDefault: boolean;
}

export type TableColumns = Map<string, ColumnInfo>;

export function camelToSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/__/g, '_')
    .toLowerCase();
}

export function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function loadTableColumns(sql: Sql, tableName: string): Promise<TableColumns> {
  const rows = await sql<
    Array<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>
  >`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `;

  return new Map(
    rows.map((row) => [
      row.column_name,
      {
        name: row.column_name,
        dataType: row.data_type,
        udtName: row.udt_name,
        isNullable: row.is_nullable === 'YES',
        hasDefault: row.column_default !== null,
      } satisfies ColumnInfo,
    ])
  );
}

export function resolveTargetColumnName(
  columns: TableColumns,
  rawTargetColumn: string,
  sourceField: string
): string | null {
  if (columns.has(rawTargetColumn)) return rawTargetColumn;

  const snakeTarget = camelToSnake(rawTargetColumn);
  if (columns.has(snakeTarget)) return snakeTarget;

  const snakeSource = camelToSnake(sourceField);
  if (columns.has(snakeSource)) return snakeSource;

  if (rawTargetColumn === 'legacy_id' && columns.has('legacy_convex_id')) {
    return 'legacy_convex_id';
  }
  if (rawTargetColumn === 'created_at_convex') {
    return null;
  }

  return null;
}
