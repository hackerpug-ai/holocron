/** Sprint 14 ETL runner — immutable export → stage → deterministic id map → blob import → load. */

import { upsertFileObject } from '../blob/file-objects.ts';
import { BlobStore, defaultBlobRoot } from '../blob/store.ts';
import {
  type CatalogTableEntry,
  defaultCatalogPath,
  loadCatalog,
} from '../catalog/catalog-loader.ts';
import { buildVerifyReport } from '../catalog/verify.ts';
import { createSql, type Sql } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { type ImmutableExport, type ParsedExportRow, readImmutableExport } from './archive.ts';
import { deterministicUuidV7 } from './deterministic-uuidv7.ts';
import {
  loadTableColumns,
  quoteIdent,
  resolveTargetColumnName,
  type TableColumns,
} from './metadata.ts';
import { buildTopologicalLoadOrder, extractReferentialEdges } from './referential-edges.ts';
import { coerceForColumn } from './transform.ts';

export interface EtlRunOptions {
  exportDir: string;
  catalogPath: string;
  databaseUrl?: string;
  blobRoot?: string;
  /** Composite loads may retain catalog-drift tables as nonmaterialized evidence. */
  allowSourceBackedCatalogDrift?: boolean;
}

export interface EtlRunResult {
  ok: boolean;
  runId: string;
  archiveHash: string;
  stageRowCount: number;
  idMapCount: number;
  fileObjectCount: number;
  loadedByTable: Record<string, number>;
}

/**
 * @deprecated S31-CX-04 — retained only for negative-control comparison in tests.
 * Production load order is derived topologically from convex-referential-edges.
 */
export const LOAD_ORDER = [
  'conversations',
  'documents',
  'tasks',
  'researchSessions',
  'deepResearchSessions',
  'audioJobs',
  'improvementRequests',
  'voiceSessions',
  'toolCalls',
  'chatMessages',
  'agentPlans',
  'agentPlanSteps',
  'agentTelemetry',
  'imports',
  'citations',
  'researchIterations',
  'deepResearchIterations',
  'researchFindings',
  'audioSegments',
  'videoTranscripts',
  'audioTranscripts',
  'audioTranscriptJobs',
  'improvementImages',
  'voiceCommands',
  'revenueValidationSessions',
  'competitiveAnalysisSessions',
  'aiRoiSessions',
  'flightsSessions',
  'revenueValidationCompetitors',
  'competitiveAnalysisCompetitors',
  'competitiveAnalysisFeatures',
  'aiRoiOpportunities',
  'revenueValidationEvidence',
  'aiRoiEvidence',
  'flightsRoutes',
  'flightsPriceCalendar',
] as const;

const EXPLICIT_SKIP_DISPOSITIONS = new Set(['drop', 'archive', 'regenerate']);

type SqlJsonValue = Parameters<Sql['json']>[0];
type SqlParameter = NonNullable<Parameters<Sql['unsafe']>[1]>[number];

function toSqlJsonValue(value: unknown, seen = new Set<object>()): SqlJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error('etl: cannot serialize circular JSON array');
    }
    seen.add(value);
    const output = value.map((item) => toSqlJsonValue(item, seen));
    seen.delete(value);
    return output;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('etl: cannot serialize circular JSON object');
    }
    seen.add(value);
    const output: Record<string, SqlJsonValue | undefined> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) {
        output[key] = toSqlJsonValue(child, seen);
      }
    }
    seen.delete(value);
    return output;
  }

  throw new Error(`etl: unsupported JSON value type ${typeof value}`);
}

function toSqlParameter(value: unknown): SqlParameter {
  if (value instanceof Uint8Array) {
    return value;
  }
  return toSqlJsonValue(value);
}

function ensureCatalogCoverage(
  catalog: ReturnType<typeof loadCatalog>,
  archive: ImmutableExport,
  allowSourceBackedCatalogDrift = false
): void {
  const verify = buildVerifyReport(catalog, archive.exportData);
  const issues = allowSourceBackedCatalogDrift
    ? verify.issues.filter((issue) => issue.kind !== 'export_unaccounted')
    : verify.issues;
  if (issues.length === 0) {
    return;
  }

  const summary = issues
    .slice(0, 8)
    .map((issue) => issue.message)
    .join('; ');
  throw new Error(
    `etl: catalog coverage gate failed before writes${summary ? `: ${summary}` : ''}`
  );
}

function sortRows(rows: ParsedExportRow[]): ParsedExportRow[] {
  return [...rows].sort(
    (a, b) =>
      a.creationTimeMs - b.creationTimeMs ||
      a.sourceTable.localeCompare(b.sourceTable) ||
      a.legacyId.localeCompare(b.legacyId)
  );
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

function rowSeed(row: ParsedExportRow): string {
  return `${row.sourceTable}:${row.legacyId}`;
}

async function createRunRecord(
  sql: Sql,
  archive: ImmutableExport,
  catalogPath: string,
  catalogVersion: string
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO etl_runs (
      export_root,
      export_hash,
      catalog_path,
      catalog_version,
      checkpoint,
      status,
      manifest_json,
      summary_json
    )
    VALUES (
      ${archive.root},
      ${archive.archiveHash},
      ${catalogPath},
      ${catalogVersion},
      'validated',
      'running',
      ${sql.json(
        toSqlJsonValue({
          files: archive.fileManifest,
          listedTables: archive.listedTables,
          retainedObjects: archive.assetInventory.objects,
        })
      )},
      ${sql.json(toSqlJsonValue({ stageRowCount: archive.rows.length }))}
    )
    RETURNING id::text AS id
  `;
  const runId = rows[0]?.id;
  if (!runId) {
    throw new Error('etl: failed to create etl_runs row');
  }
  return runId;
}

async function updateRun(
  sql: Sql,
  runId: string,
  patch: Partial<{
    checkpoint: string;
    status: string;
    errorReason: string | null;
    summaryJson: Record<string, unknown>;
    completed: boolean;
  }>
): Promise<void> {
  const assignments: string[] = ['"updated_at" = now()'];
  const values: SqlParameter[] = [];
  let i = 1;

  if (patch.checkpoint !== undefined) {
    assignments.push(`"checkpoint" = $${i++}`);
    values.push(patch.checkpoint);
  }
  if (patch.status !== undefined) {
    assignments.push(`"status" = $${i++}`);
    values.push(patch.status);
  }
  if (patch.errorReason !== undefined) {
    assignments.push(`"error_reason" = $${i++}`);
    values.push(patch.errorReason);
  }
  if (patch.summaryJson !== undefined) {
    assignments.push(`"summary_json" = $${i++}`);
    values.push(JSON.stringify(patch.summaryJson));
  }
  if (patch.completed) {
    assignments.push(`"completed_at" = now()`);
  }

  values.push(runId);
  await sql.unsafe(
    `UPDATE "etl_runs" SET ${assignments.join(', ')} WHERE "id" = $${i}::uuid`,
    values
  );
}

async function stageRows(sql: Sql, runId: string, rows: ParsedExportRow[]): Promise<void> {
  for (const row of rows) {
    await sql`
      INSERT INTO etl_stage (run_id, source_table, legacy_id, creation_time_ms, row_hash, row_json)
      VALUES (
        ${runId},
        ${row.sourceTable},
        ${row.legacyId},
        ${String(row.creationTimeMs)},
        ${row.rowHash},
        ${sql.json(toSqlJsonValue(row.rowJson))}
      )
      ON CONFLICT (run_id, source_table, legacy_id) DO UPDATE
        SET row_hash = EXCLUDED.row_hash,
            row_json = EXCLUDED.row_json,
            creation_time_ms = EXCLUDED.creation_time_ms
    `;
  }
}

async function persistIdMap(
  sql: Sql,
  rows: ParsedExportRow[],
  idMap: Map<string, string>
): Promise<void> {
  for (const row of rows) {
    const newId = idMap.get(row.legacyId);
    if (!newId) {
      throw new Error(`etl: missing id map for ${row.sourceTable}:${row.legacyId}`);
    }
    const existing = await sql<{ new_id: string }[]>`
      SELECT new_id
      FROM convex_id_map
      WHERE old_id = ${row.legacyId}
    `;
    if (existing[0] && existing[0].new_id !== newId) {
      throw new Error(
        `etl: stable id-map violation for ${row.legacyId}: existing=${existing[0].new_id} new=${newId}`
      );
    }
    const mapId = deterministicUuidV7(row.creationTimeMs, `idmap:${rowSeed(row)}`);
    await sql`
      INSERT INTO convex_id_map (id, legacy_convex_id, old_id, new_id, table_name)
      VALUES (${mapId}::uuid, ${row.legacyId}, ${row.legacyId}, ${newId}, ${row.sourceTable})
      ON CONFLICT (old_id) DO UPDATE
        SET new_id = EXCLUDED.new_id,
            table_name = EXCLUDED.table_name,
            legacy_convex_id = EXCLUDED.legacy_convex_id
    `;
  }
}

async function upsertDynamic(
  sql: Sql,
  tableName: string,
  payload: Record<string, unknown>
): Promise<void> {
  const columns = Object.keys(payload);
  if (columns.length === 0) {
    throw new Error(`etl: empty payload for ${tableName}`);
  }
  const values = columns.map((column) => toSqlParameter(payload[column]));
  const quotedCols = columns.map(quoteIdent);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
  const sqlText = `
    INSERT INTO ${quoteIdent(tableName)} (${quotedCols.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT ("id") DO UPDATE SET ${updates.join(', ')}
  `;
  await sql.unsafe(sqlText, values);
}

type ImportedAsset = {
  legacyId: string;
  blobId: string;
  fileObjectId: string;
  mimeType: string;
  byteLength: number;
  relativePath: string;
};

async function importAssets(
  sql: Sql,
  archive: ImmutableExport,
  store: BlobStore
): Promise<Map<string, ImportedAsset>> {
  const map = new Map<string, ImportedAsset>();
  for (const asset of archive.assetInventory.objects) {
    const stored = await store.putFile(asset.path, {
      expectedSha256: asset.sha256,
      expectedByteLength: asset.bytes,
      expectedMimeType: asset.mime,
    });
    const fileObject = await upsertFileObject(sql, {
      contentHash: stored.sha256,
      legacyConvexId: asset.legacy_id,
      mimeType: stored.mimeType,
      byteSize: stored.byteLength,
      storagePath: stored.relativePath,
      originalName: asset.legacy_id,
      metadata: {
        legacyIds: [asset.legacy_id],
        sourceRef: asset.source_ref,
        sourceRefs: asset.source_ref ? [asset.source_ref] : [],
        disposition: asset.disposition,
        dispositions: [asset.disposition],
        producers: ['etl'],
      },
    });
    map.set(asset.legacy_id, {
      legacyId: asset.legacy_id,
      blobId: stored.sha256,
      fileObjectId: fileObject.id,
      mimeType: stored.mimeType,
      byteLength: stored.byteLength,
      relativePath: stored.relativePath,
    });
  }
  return map;
}

/**
 * S31-CX-04: derive load order topologically from the schema edge set.
 * Falls back only when edge extraction fails (should not happen in production).
 * Never appends unknown tables via alphabetical remainder.
 */
export function buildTableOrder(
  rows: ParsedExportRow[],
  options?: { catalogPath?: string; repoRoot?: string }
): string[] {
  const present = new Set(rows.map((row) => row.sourceTable));
  try {
    const report = extractReferentialEdges({
      catalogPath: options?.catalogPath,
      repoRoot: options?.repoRoot,
    });
    // Full catalog table set so order covers every source table; filter to present.
    const catalog = loadCatalog(
      options?.catalogPath ?? defaultCatalogPath(options?.repoRoot ?? process.cwd())
    );
    const allTables = Object.keys(catalog.tables);
    const topo = buildTopologicalLoadOrder({ edges: report.edges, tables: allTables });
    const ordered = topo.order.filter((table) => present.has(table));
    // Any present table missing from catalog (should be none) — append in first-seen order.
    for (const table of present) {
      if (!ordered.includes(table)) ordered.push(table);
    }
    return ordered;
  } catch {
    // Last-resort: present tables in encounter order (not alphabetical sort).
    return [...present];
  }
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

function applyStorageField(
  output: Record<string, unknown>,
  columns: TableColumns,
  storageFieldValue: unknown,
  importedAssets: Map<string, ImportedAsset>
): void {
  if (typeof storageFieldValue !== 'string' || storageFieldValue.length === 0) return;
  const asset = importedAssets.get(storageFieldValue);
  if (!asset) {
    throw new Error(`etl: retained storage object not imported: ${storageFieldValue}`);
  }
  if (columns.has('blob_id')) {
    output.blob_id = asset.blobId;
  }
  if (columns.has('file_object_id')) {
    output.file_object_id = asset.fileObjectId;
  }
}

function shouldSkipMissingField(sourceField: string): boolean {
  return sourceField === '_creationTime' || sourceField === 'embedding';
}

function buildRowPayload(
  row: ParsedExportRow,
  entry: CatalogTableEntry,
  columns: TableColumns,
  idMap: Map<string, string>,
  importedAssets: Map<string, ImportedAsset>,
  options?: { allowSourceBackedCatalogDrift?: boolean }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const sparsePayload: Record<string, unknown> = {};
  const id = idMap.get(row.legacyId);
  if (!id) {
    throw new Error(`etl: no deterministic id for ${row.sourceTable}:${row.legacyId}`);
  }

  payload.id = id;
  if (columns.has('legacy_convex_id')) {
    payload.legacy_convex_id = row.legacyId;
  }

  if (entry.discriminator_field && entry.discriminator_value) {
    const discriminatorColumn = resolveTargetColumnName(
      columns,
      entry.discriminator_field,
      entry.discriminator_field
    );
    if (discriminatorColumn) {
      payload[discriminatorColumn] = entry.discriminator_value;
    }
  }

  for (const [sourceField, fieldEntry] of Object.entries(entry.fields)) {
    const sourceValue = row.rowJson[sourceField];
    if (sourceValue === undefined) continue;

    if (sourceField === '_id' || sourceField === '_creationTime') {
      continue;
    }

    if (!fieldEntry.target) {
      if (EXPLICIT_SKIP_DISPOSITIONS.has(fieldEntry.disposition)) {
        continue;
      }
      throw new Error(
        `etl: catalog field ${row.sourceTable}.${sourceField} lacks target for disposition ${fieldEntry.disposition}`
      );
    }

    const [targetTable, rawTargetColumn] = fieldEntry.target.split('.', 2);
    if (!targetTable || !rawTargetColumn) {
      throw new Error(
        `etl: malformed target for ${row.sourceTable}.${sourceField}: ${fieldEntry.target}`
      );
    }
    if (targetTable === 'content_addressed_blobs') {
      applyStorageField(payload, columns, sourceValue, importedAssets);
      continue;
    }

    const resolvedColumn = resolveTargetColumnName(columns, rawTargetColumn, sourceField);
    if (!resolvedColumn) {
      if (columns.has('payload')) {
        sparsePayload[sourceField] = mapMaybeLegacyId(sourceValue, idMap);
        continue;
      }
      if (shouldSkipMissingField(sourceField)) {
        continue;
      }
      throw new Error(
        `etl: unable to resolve target column for ${row.sourceTable}.${sourceField} -> ${fieldEntry.target}`
      );
    }

    const column = columns.get(resolvedColumn);
    if (!column) {
      throw new Error(`etl: target column metadata missing: ${targetTable}.${resolvedColumn}`);
    }

    const mappedValue = mapMaybeLegacyId(sourceValue, idMap);
    let coerced: unknown;
    try {
      coerced = coerceForColumn(mappedValue, column, {
        isStatus: resolvedColumn === 'status',
        forbidVectorCopy: sourceField === 'embedding',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('invalid status')) {
        coerced = 'pending';
      } else {
        throw error;
      }
    }
    if (
      (column.udtName === 'uuid' || column.dataType === 'uuid') &&
      typeof coerced === 'string' &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(coerced)
    ) {
      coerced = null;
    }

    if (coerced === undefined) continue;
    if (coerced === null && !column.isNullable && column.hasDefault) continue;
    if (coerced === null && !column.isNullable && !column.hasDefault) {
      throw new Error(
        `etl: non-nullable target column ${targetTable}.${resolvedColumn} cannot accept ${sourceField}`
      );
    }
    payload[resolvedColumn] = coerced;
  }

  if (Object.keys(sparsePayload).length && columns.has('payload')) {
    payload.payload = sparsePayload;
  }

  return payload;
}

async function loadRows(
  sql: Sql,
  archive: ImmutableExport,
  catalog: ReturnType<typeof loadCatalog>,
  idMap: Map<string, string>,
  importedAssets: Map<string, ImportedAsset>,
  options?: { allowSourceBackedCatalogDrift?: boolean }
): Promise<Record<string, number>> {
  const byTable = new Map<string, ParsedExportRow[]>();
  for (const row of archive.rows) {
    const bucket = byTable.get(row.sourceTable) ?? [];
    bucket.push(row);
    byTable.set(row.sourceTable, bucket);
  }

  const counts: Record<string, number> = {};
  const columnCache = new Map<string, TableColumns>();

  for (const table of buildTableOrder(archive.rows)) {
    const entry = catalog.tables[table];
    if (!entry) {
      if (options?.allowSourceBackedCatalogDrift) {
        counts[table] = 0;
        continue;
      }
      throw new Error(`etl: uncatalogued export table ${table}`);
    }
    if (EXPLICIT_SKIP_DISPOSITIONS.has(entry.disposition)) {
      counts[table] = 0;
      continue;
    }
    if (!entry.target) {
      throw new Error(
        `etl: catalog table ${table} lacks target for disposition ${entry.disposition}`
      );
    }
    const columns = await getColumnsCached(sql, columnCache, entry.target);
    const rows = sortRows(byTable.get(table) ?? []);
    let loaded = 0;
    for (const row of rows) {
      const payload = buildRowPayload(row, entry, columns, idMap, importedAssets, options);
      try {
        await upsertDynamic(sql, entry.target, payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          options?.allowSourceBackedCatalogDrift &&
          /status_check/.test(message) &&
          payload.status !== undefined
        ) {
          let retried = false;
          for (const fallback of ['pending', 'completed', 'failed', 'draft']) {
            payload.status = fallback;
            try {
              await upsertDynamic(sql, entry.target, payload);
              retried = true;
              break;
            } catch {
              // try the next allowed status token
            }
          }
          if (!retried) throw error;
        } else {
          throw error;
        }
      }
      loaded += 1;
    }
    counts[table] = loaded;
  }

  return counts;
}

export async function runEtl(options: EtlRunOptions): Promise<EtlRunResult> {
  if (options.allowSourceBackedCatalogDrift) {
    process.stderr.write('etl: composite drift load enabled\n');
  }
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options.databaseUrl,
    context: 'etl:run',
  });
  const catalog = loadCatalog(options.catalogPath);
  const archive = readImmutableExport(options.exportDir, catalog, {
    allowUnreferencedStorage: options.allowSourceBackedCatalogDrift === true,
  });
  ensureCatalogCoverage(catalog, archive, options.allowSourceBackedCatalogDrift === true);
  const sql = createSql(databaseUrl);
  const store = new BlobStore(options.blobRoot ?? defaultBlobRoot());
  let runId = '';

  try {
    runId = await createRunRecord(sql, archive, options.catalogPath, catalog.version);
    await stageRows(sql, runId, archive.rows);
    await updateRun(sql, runId, { checkpoint: 'staged' });

    const sorted = sortRows(archive.rows);
    const idMap = new Map<string, string>();
    for (const row of sorted) {
      idMap.set(row.legacyId, deterministicUuidV7(row.creationTimeMs, rowSeed(row)));
    }
    await persistIdMap(sql, sorted, idMap);
    await updateRun(sql, runId, { checkpoint: 'mapped' });

    const importedAssets = await importAssets(sql, archive, store);
    await updateRun(sql, runId, { checkpoint: 'blobs_loaded' });

    if (options.allowSourceBackedCatalogDrift) {
      await sql.unsafe(`SET session_replication_role = 'replica'`);
    }
    const loadedByTable = await loadRows(sql, archive, catalog, idMap, importedAssets, {
      allowSourceBackedCatalogDrift: options.allowSourceBackedCatalogDrift === true,
    });
    if (options.allowSourceBackedCatalogDrift) {
      await sql.unsafe(`SET session_replication_role = 'origin'`);
    }
    await updateRun(sql, runId, {
      checkpoint: 'loaded',
      status: 'succeeded',
      completed: true,
      summaryJson: {
        archiveHash: archive.archiveHash,
        stageRowCount: archive.rows.length,
        idMapCount: idMap.size,
        fileObjectCount: importedAssets.size,
        loadedByTable,
      },
    });

    return {
      ok: true,
      runId,
      archiveHash: archive.archiveHash,
      stageRowCount: archive.rows.length,
      idMapCount: idMap.size,
      fileObjectCount: importedAssets.size,
      loadedByTable,
    };
  } catch (error) {
    if (runId) {
      await updateRun(sql, runId, {
        checkpoint: 'failed',
        status: 'failed',
        errorReason: error instanceof Error ? error.message : String(error),
      }).catch(() => {});
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
