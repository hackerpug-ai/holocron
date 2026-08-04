/** Shared helpers for reading the latest successful ETL run. */
import { loadCatalog, type SourceCatalog } from '../catalog/catalog-loader.ts';
import { createSql, type Sql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { type ImmutableExport, readImmutableExport } from './archive.ts';

export interface LatestRunContext {
  sql: Sql;
  databaseUrl: string;
  catalog: SourceCatalog;
  archive: ImmutableExport;
  runId: string;
  runSummary: Record<string, unknown> | null;
}

export async function loadLatestRunContext(options?: {
  databaseUrl?: string;
  catalogPath?: string;
  exportDir?: string | null;
}): Promise<LatestRunContext> {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'etl runtime',
  });
  const sql = createSql(databaseUrl);
  try {
    const rows = await sql<
      Array<{
        id: string;
        export_root: string;
        catalog_path: string;
        summary_json: Record<string, unknown> | null;
      }>
    >`
      SELECT id::text AS id, export_root, catalog_path, summary_json
      FROM etl_runs
      WHERE status = 'succeeded'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const latest = rows[0];
    if (!latest) {
      throw new Error('etl: no successful etl_runs row found; run etl:run first');
    }
    const catalogPath = options?.catalogPath ?? latest.catalog_path;
    const exportDir = options?.exportDir ?? latest.export_root;
    const catalog = loadCatalog(catalogPath);
    const archive = readImmutableExport(exportDir, catalog);
    return {
      sql,
      databaseUrl,
      catalog,
      archive,
      runId: latest.id,
      runSummary: latest.summary_json,
    };
  } catch (error) {
    await sql.end({ timeout: 5 });
    throw error;
  }
}
