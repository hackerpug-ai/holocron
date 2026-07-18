/** Sprint 14 ETL runner — immutable export → stage → deterministic id map → blob import → load. */

import { upsertFileObject } from '../blob/file-objects.ts';
import { BlobStore, defaultBlobRoot } from '../blob/store.ts';
import { type CatalogTableEntry, loadCatalog } from '../catalog/catalog-loader.ts';
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
import { coerceForColumn } from './transform.ts';

export interface EtlRunOptions {
  exportDir: string;
  catalogPath: string;
  databaseUrl?: string;
  blobRoot?: string;
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

const LOAD_ORDER = [
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

function ensureCatalogCoverage(
  catalog: ReturnType<typeof loadCatalog>,
  archive: ImmutableExport
): void {
  const verify = buildVerifyReport(catalog, archive.exportData);
  if (verify.ok) {
    return;
  }

  const summary = verify.issues
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
      ${sql.json({
        files: archive.fileManifest,
        listedTables: archive.listedTables,
        retainedObjects: archive.assetInventory.objects,
      })},
      ${sql.json({ stageRowCount: archive.rows.length })}
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
  const values: unknown[] = [];
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
        ${sql.json(row.rowJson)}
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
  const values = columns.map((column) => payload[column]);
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

function buildTableOrder(rows: ParsedExportRow[]): string[] {
  const present = new Set(rows.map((row) => row.sourceTable));
  const ordered = LOAD_ORDER.filter((table) => present.has(table));
  const remainder = [...present].filter((table) => !ordered.includes(table as never)).sort();
  return [...ordered, ...remainder];
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
  importedAssets: Map<string, ImportedAsset>
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
    const coerced = coerceForColumn(mappedValue, column, {
      isStatus: resolvedColumn === 'status',
      forbidVectorCopy: sourceField === 'embedding',
    });

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
  importedAssets: Map<string, ImportedAsset>
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
      const payload = buildRowPayload(row, entry, columns, idMap, importedAssets);
      await upsertDynamic(sql, entry.target, payload);
      loaded += 1;
    }
    counts[table] = loaded;
  }

  return counts;
}

export async function runEtl(options: EtlRunOptions): Promise<EtlRunResult> {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options.databaseUrl,
    context: 'etl:run',
  });
  const catalog = loadCatalog(options.catalogPath);
  const archive = readImmutableExport(options.exportDir, catalog);
  ensureCatalogCoverage(catalog, archive);
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

    const loadedByTable = await loadRows(sql, archive, catalog, idMap, importedAssets);
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
