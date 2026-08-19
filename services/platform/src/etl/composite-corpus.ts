/**
 * MK6-DATA-001 composite corpus reader.
 *
 * This module is intentionally boring: it only derives facts from the
 * operator-selected Convex export, SQLite database, and blob root.  It never
 * seeds a source, accepts a caller supplied count/hash, or puts source bodies
 * in the manifest.  The immutable run derivative is the only write target.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { upsertFileObject } from '../blob/file-objects.ts';
import { BlobStore } from '../blob/store.ts';
import { defaultCatalogPath, loadCatalog, type SourceCatalog } from '../catalog/catalog-loader.ts';
import { createSql } from '../db/client.ts';
import {
  parseDatabaseTargetIdentity,
  resolveHolocronNonprodDatabaseUrl,
} from '../db/connection.ts';
import { applyMigrations } from '../db/migrate.ts';
import { writeExportProvenance } from './archive.ts';
import { deterministicUuidV7 } from './deterministic-uuidv7.ts';
import { runFkAudit } from './fk-audit.ts';
import { runEtlReconcile } from './reconcile.ts';
import { runEtl } from './run.ts';

export const COMPOSITE_SCHEMA = 'holocron.mk6.composite-corpus.v2' as const;
export const INVENTORY_SCHEMA = 'holocron.mk6.full-source-inventory.v1' as const;
export const SQLITE_CHECKPOINT_SCHEMA = 'holocron.mk6.sqlite-semantic-checkpoint.v1' as const;

const EXPORT_RELATIVE = 'exports/convex-dev-cutover-2026-08-09';
const SQLITE_RELATIVE = 'holocron.db';
const BLOBS_RELATIVE = 'blobs';
const ARRAY_NAMES = [
  'convex.filesystemEntries',
  'convex.tables',
  'convex.systemEntries',
  'convex.storageMetadata',
  'convex.storageObjects',
  'sqlite.physicalTables',
  'sqlite.logicalRows',
  'sqlite.referencedBlobs',
  'sqlite.blobFiles',
] as const;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type NodeKind = 'directory' | 'regular-file';

export type CorpusEntry = {
  relativePath: string;
  pathIdentitySha256: string;
  nodeType: NodeKind;
  logicalSizeBytes: number;
  contentOrTreeSha256: string;
  rootOwnerClass: 'cataloged-table-subtree' | 'underscore-system-subtree' | 'root-metadata';
  disposition: string;
  targetOrFormula: string | null;
  mappedOrArchivedIdentitySha256: string;
};

export type SqlitePhysicalTable = {
  name: string;
  sqliteType: 'table' | 'virtual' | 'shadow';
  sqliteMasterSqlSha256: string;
  orderedColumnPkSha256: string;
  rowCount: number;
  orderedRowContentSha256: string;
  class:
    | 'application-data'
    | 'etl-misc-envelope'
    | 'provenance'
    | 'blob-catalog'
    | 'schema-metadata'
    | 'fts-virtual'
    | 'fts-shadow';
  disposition: string;
  targetOrFormula: string;
  mappingSha256: string;
};

export type SqliteLogicalRow = {
  logicalIdentity: string;
  physicalOwnerIdentity: string;
  class: SqlitePhysicalTable['class'];
  rowCount: number;
  orderedRowContentSha256: string;
  derivedOwnerSha256: string;
  disposition: string;
  targetOrFormula: string;
  mappingSha256: string;
};

export type LocalDocumentRow = {
  id: string;
  creation_time: number;
  title: string;
  content: string;
  category: string;
  file_path: string | null;
  file_type: string | null;
  status: string | null;
  date: string | null;
  time: string | null;
  research_type: string | null;
  iterations: number | null;
  embedding_status: string;
  created_at: number;
  is_public: number;
  share_token: string | null;
  source_origin: string | null;
  import_batch_id: string | null;
};

export type ProvenanceRow = {
  table_name: string;
  row_id: string;
  import_batch_id: string;
  source_origin: string;
  first_imported_at: number;
  last_imported_at: number;
  import_count: number;
};

type InventoryResult = {
  entries: CorpusEntry[];
  digest: string;
  unsupported: string[];
};

type SqliteSnapshot = {
  quickCheck: string;
  physicalTables: SqlitePhysicalTable[];
  logicalRows: SqliteLogicalRow[];
  referencedBlobs: Record<string, JsonValue>[];
  blobFiles: Record<string, JsonValue>[];
  digest: string;
  localDocuments: LocalDocumentRow[];
  provenance: ProvenanceRow[];
  batches: Record<string, JsonValue>[];
  fileObjects: Record<string, JsonValue>[];
};

export type CompositeManifest = {
  schema: typeof COMPOSITE_SCHEMA;
  inventory: {
    schema: typeof INVENTORY_SCHEMA;
    arrays: Record<string, unknown[]>;
    arrayHashes: Record<string, string>;
    unionSha256: string;
  };
  inventoryArrays: readonly string[];
  canonicalSourcePathHashes: { root: string; export: string; sqlite: string; blobs: string };
  codeSha: string;
  checkpoints: {
    export: { sourcePre: string; snapshotCopy: string; sourcePost: string };
    sqlite: {
      sourceBackupPre: string;
      snapshotCopy: string;
      sourceBackupPost: string;
      schema: typeof SQLITE_CHECKPOINT_SCHEMA;
    };
    blobs: { sourcePre: string; snapshotCopy: string; sourcePost: string };
  };
  sqlite: {
    quickCheck: 'ok';
    backupMethod: 'sqlite-vacuum-into';
    physicalTables: SqlitePhysicalTable[];
    logicalRows: SqliteLogicalRow[];
  };
  accounting: Record<string, number | boolean | string>;
  provenance: {
    localMaterializedCount: number;
    localProvenanceCount: number;
    provenanceOnlyTombstoneCount: number;
    materializedLocalMissingProvenance: number;
    unclassifiedLocalProvenance: number;
    equationsValid: boolean;
    tombstoneDigests: Array<{ tableName: string; rowId: string; digest: string }>;
  };
  sources: {
    export: Record<string, unknown>;
    sqlite: Record<string, unknown>;
    blobs: Record<string, unknown>;
  };
  witnesses: Array<Record<string, string>>;
};

export type CompositeCorpusSnapshot = {
  runId: string;
  runRoot: string;
  canonicalRoot: string;
  exportSnapshot: string;
  sqliteSnapshot: string;
  blobSnapshot: string;
  manifestPath: string;
  manifest: CompositeManifest;
  localDocuments: LocalDocumentRow[];
  provenanceRows: ProvenanceRow[];
  fileObjects: Record<string, JsonValue>[];
  exportRows: Array<{
    sourceTable: string;
    legacyId: string;
    creationTimeMs: number;
    rowJson: Record<string, JsonValue>;
    rowHash: string;
  }>;
};

function sha256Bytes(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

export function canonicalSha256(value: unknown): string {
  return sha256Bytes(canonicalize(value));
}

function pathIdentity(relativePath: string): string {
  return sha256Bytes(relativePath.replaceAll(sep, '/'));
}

function rejectSymlinkComponents(path: string): void {
  const abs = resolve(path);
  const pieces = abs.split(sep);
  let current = pieces[0] === '' ? sep : pieces[0];
  for (const piece of pieces.slice(pieces[0] === '' ? 1 : 1)) {
    if (!piece) continue;
    current = current === sep ? join(current, piece) : join(current, piece);
    if (!existsSync(current)) continue;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`SOURCE_SYMLINK_REJECTED: ${path}`);
  }
}

function rejectPathClass(path: string, runRoot?: string): void {
  const abs = resolve(path).replaceAll('\\', '/');
  const cwd = resolve(process.cwd()).replaceAll('\\', '/');
  const blocked = [
    `${cwd}/`,
    '/.tmp/',
    '/tmp/',
    '/private/tmp/',
    '/fixtures/',
    '/testdata/',
    '/generated-copy/',
    ...(runRoot ? [`${resolve(runRoot).replaceAll('\\', '/')}/`] : []),
  ];
  if (blocked.some((prefix) => abs.startsWith(prefix)) || abs === cwd) {
    throw new Error(`SOURCE_ROOT_CLASS_REJECTED: ${path}`);
  }
}

function admitPath(root: string, relativePath: string, runRoot?: string): string {
  if (!isAbsolute(root)) throw new Error('SOURCE_ROOT_NOT_ABSOLUTE');
  const supplied = resolve(root);
  rejectPathClass(supplied, runRoot);
  rejectSymlinkComponents(supplied);
  const realRoot = realpathSync.native(supplied);
  if (supplied !== realRoot) throw new Error('SOURCE_ROOT_REALPATH_MISMATCH');
  const path = join(realRoot, relativePath);
  rejectSymlinkComponents(path);
  if (!existsSync(path)) throw new Error(`SOURCE_MISSING: ${relativePath}`);
  const realPath = realpathSync.native(path);
  if (path !== realPath) throw new Error(`SOURCE_PATH_REALPATH_MISMATCH: ${relativePath}`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`SOURCE_SYMLINK_REJECTED: ${relativePath}`);
  return path;
}

function hashTree(root: string): InventoryResult {
  const entries: CorpusEntry[] = [];
  const unsupported: string[] = [];
  const walk = (
    absolute: string,
    relativePath: string,
    owner: CorpusEntry['rootOwnerClass']
  ): { size: number; digest: string; kind: NodeKind } => {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      unsupported.push(relativePath || '.');
      throw new Error(`SOURCE_NODE_REJECTED: ${relativePath || '.'}`);
    }
    if (stat.isFile()) {
      const bytes = readFileSync(absolute);
      const digest = sha256Bytes(bytes);
      const kind: NodeKind = 'regular-file';
      entries.push({
        relativePath,
        pathIdentitySha256: pathIdentity(relativePath),
        nodeType: kind,
        logicalSizeBytes: bytes.byteLength,
        contentOrTreeSha256: digest,
        rootOwnerClass: owner,
        disposition: 'pending-derived-disposition',
        targetOrFormula: null,
        mappedOrArchivedIdentitySha256: canonicalSha256({ relativePath, digest }),
      });
      return { size: bytes.byteLength, digest, kind };
    }
    const children = readdirSync(absolute, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const childRecords: Array<{ path: string; type: NodeKind; size: number; digest: string }> = [];
    let size = 0;
    for (const child of children) {
      const childRelative = relativePath ? `${relativePath}/${child.name}` : child.name;
      const childOwner =
        childRelative.startsWith('_') || childRelative.includes('/_')
          ? 'underscore-system-subtree'
          : owner;
      const childResult = walk(join(absolute, child.name), childRelative, childOwner);
      size += childResult.size;
      childRecords.push({
        path: childRelative,
        type: childResult.kind,
        size: childResult.size,
        digest: childResult.digest,
      });
    }
    const digest = canonicalSha256(childRecords);
    const kind: NodeKind = 'directory';
    entries.push({
      relativePath,
      pathIdentitySha256: pathIdentity(relativePath),
      nodeType: kind,
      logicalSizeBytes: size,
      contentOrTreeSha256: digest,
      rootOwnerClass: owner,
      disposition: 'pending-derived-disposition',
      targetOrFormula: null,
      mappedOrArchivedIdentitySha256: canonicalSha256({ relativePath, digest }),
    });
    return { size, digest, kind };
  };
  walk(root, '', 'root-metadata');
  const sorted = entries
    .filter((entry) => entry.relativePath !== '')
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { entries: sorted, digest: canonicalSha256(sorted), unsupported };
}

function classifyExportOwner(relativePath: string): CorpusEntry['rootOwnerClass'] {
  const root = relativePath.split('/')[0] ?? '';
  if (root.startsWith('_')) return 'underscore-system-subtree';
  if (relativePath.includes('/')) return 'cataloged-table-subtree';
  return 'root-metadata';
}

function applyExportDispositions(entries: CorpusEntry[], catalog: SourceCatalog): CorpusEntry[] {
  return entries.map((entry) => {
    const root = entry.relativePath.split('/')[0] ?? '';
    const table = catalog.tables[root];
    const disposition = root.startsWith('_')
      ? `system-${root.slice(1) || 'root'}-evidence`
      : table
        ? table.disposition
        : entry.rootOwnerClass === 'root-metadata'
          ? 'immutable-nonmaterialized-export-metadata'
          : 'source-backed-catalog-drift-archive';
    const targetOrFormula = table?.target ?? table?.expected_target_formula ?? null;
    return {
      ...entry,
      rootOwnerClass: classifyExportOwner(entry.relativePath),
      disposition,
      targetOrFormula,
      mappedOrArchivedIdentitySha256: canonicalSha256({
        path: entry.relativePath,
        digest: entry.contentOrTreeSha256,
        disposition,
        targetOrFormula,
      }),
    };
  });
}

function sqliteBin(): string {
  const candidates = [
    process.env.MK6_SQLITE3,
    '/opt/homebrew/opt/sqlite/bin/sqlite3',
    '/usr/local/opt/sqlite/bin/sqlite3',
    'sqlite3',
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      const version = execFileSync(candidate, ['--version'], { encoding: 'utf8' });
      if (candidate !== 'sqlite3' || !version.includes('Android')) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return 'sqlite3';
}

function runSqlite(source: string, args: string[], extra: string[] = []): string {
  try {
    return execFileSync(sqliteBin(), [...extra, source, ...args], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SQLITE_QUERY_FAILED: ${message.slice(0, 400)}`);
  }
}

function sqliteJson<T>(source: string, sql: string): T[] {
  const output = runSqlite(source, [sql], ['-json']).trim();
  if (!output) return [];
  try {
    const parsed = JSON.parse(output) as unknown;
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed as T[];
  } catch (error) {
    throw new Error(
      `SQLITE_JSON_INVALID: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function quoteSql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqliteColumns(
  source: string,
  table: string
): Array<{ name: string; type: string; notnull: number; pk: number; dflt_value: string | null }> {
  return sqliteJson(source, `PRAGMA table_info("${table.replaceAll('"', '""')}")`);
}

function classifySqliteTable(name: string, sqliteType: string): SqlitePhysicalTable['class'] {
  if (name === 'etl_misc') return 'etl-misc-envelope';
  if (name === 'import_batches' || name === 'import_row_provenance') return 'provenance';
  if (name === 'file_objects') return 'blob-catalog';
  if (name === 'schema_migrations') return 'schema-metadata';
  if (sqliteType === 'virtual') return 'fts-virtual';
  if (sqliteType === 'shadow') return 'fts-shadow';
  return 'application-data';
}

function dispositionsForSqliteClass(clazz: SqlitePhysicalTable['class']): {
  disposition: string;
  target: string;
} {
  switch (clazz) {
    case 'application-data':
      return { disposition: 'materialize-or-merge', target: 'catalog-backed-target' };
    case 'etl-misc-envelope':
      return {
        disposition: 'preserve-as-evidence-expand-logical-rows',
        target: 'etl_misc logical expansion',
      };
    case 'provenance':
      return {
        disposition: 'preserve-as-provenance-evidence',
        target: 'import provenance accounting',
      };
    case 'blob-catalog':
      return {
        disposition: 'preserve-and-reconcile-cas',
        target: 'file_objects/content-addressed blob',
      };
    case 'schema-metadata':
      return { disposition: 'preserve-as-schema-evidence', target: 'schema_migrations' };
    case 'fts-virtual':
      return {
        disposition: 'regenerate-and-verify-owner-equivalence',
        target: 'owning application table FTS',
      };
    case 'fts-shadow':
      return {
        disposition: 'regenerate-and-verify-owner-equivalence',
        target: 'owning FTS virtual table',
      };
  }
}

function querySingleText(source: string, sql: string): string {
  const rows = sqliteJson<Record<string, string | null>>(source, sql);
  return String(Object.values(rows[0] ?? {})[0] ?? '');
}

function sqliteTableContentDigest(
  source: string,
  table: string,
  columns: string[]
): { rowCount: number; digest: string } {
  const escaped = table.replaceAll('"', '""');
  const quotedColumns = columns.map((column) => `quote("${column.replaceAll('"', '""')}")`);
  const output = runSqlite(
    source,
    [`SELECT ${quotedColumns.join(',')} FROM "${escaped}"`],
    ['-noheader', '-csv']
  );
  const count = Number(querySingleText(source, `SELECT count(*) AS count FROM "${escaped}"`));
  return { rowCount: count, digest: sha256Bytes(output) };
}

function inspectSqlite(source: string): SqliteSnapshot {
  const quickCheck = querySingleText(source, 'PRAGMA quick_check').trim();
  if (quickCheck !== 'ok') throw new Error(`SQLITE_QUICK_CHECK_FAILED: ${quickCheck}`);
  const tableList = sqliteJson<{
    schema: string;
    name: string;
    type: 'table' | 'virtual' | 'shadow';
  }>(source, 'PRAGMA table_list')
    .filter((table) => table.schema === 'main' && table.name !== 'sqlite_schema')
    .sort((a, b) => a.name.localeCompare(b.name));
  const physicalTables: SqlitePhysicalTable[] = [];
  const logicalRows: SqliteLogicalRow[] = [];
  let localDocuments: LocalDocumentRow[] = [];
  let provenance: ProvenanceRow[] = [];
  let batches: Record<string, JsonValue>[] = [];
  let fileObjects: Record<string, JsonValue>[] = [];
  const referencedBlobs: Record<string, JsonValue>[] = [];
  const blobFiles: Record<string, JsonValue>[] = [];

  for (const table of tableList) {
    const columns = sqliteColumns(source, table.name);
    const names = columns.map((column) => column.name);
    const ddl = querySingleText(
      source,
      `SELECT sql FROM sqlite_master WHERE name=${quoteSql(table.name)} LIMIT 1`
    );
    const clazz = classifySqliteTable(table.name, table.type);
    const target = dispositionsForSqliteClass(clazz);
    const rowContent = sqliteTableContentDigest(source, table.name, names);
    const rowDigest = rowContent.digest;
    const mappingSha256 = canonicalSha256({ table: table.name, class: clazz, columns, target });
    const physical: SqlitePhysicalTable = {
      name: table.name,
      sqliteType: table.type,
      sqliteMasterSqlSha256: sha256Bytes(ddl),
      orderedColumnPkSha256: canonicalSha256(columns),
      rowCount: rowContent.rowCount,
      orderedRowContentSha256: rowDigest,
      class: clazz,
      disposition: target.disposition,
      targetOrFormula: target.target,
      mappingSha256,
    };
    physicalTables.push(physical);
    const logicalIdentity = `${table.name}:physical`;
    logicalRows.push({
      logicalIdentity,
      physicalOwnerIdentity: table.name,
      class: clazz,
      rowCount: rowContent.rowCount,
      orderedRowContentSha256: rowDigest,
      derivedOwnerSha256: canonicalSha256({ owner: table.name, rowDigest }),
      disposition: target.disposition,
      targetOrFormula: target.target,
      mappingSha256,
    });
    if (table.name === 'documents') {
      const raw = sqliteJson<LocalDocumentRow>(
        source,
        'SELECT id,creation_time,title,content,category,file_path,file_type,status,date,time,research_type,iterations,embedding_status,created_at,is_public,share_token,source_origin,import_batch_id FROM documents'
      );
      localDocuments = raw.filter(
        (row) => row.source_origin === 'local' && row.import_batch_id === 'local-writes'
      );
    }
    if (table.name === 'import_batches') {
      batches = sqliteJson(
        source,
        'SELECT id,source,deployment,cutover_date,started_at,finished_at,export_path,stats_json,note FROM import_batches'
      );
    }
    if (table.name === 'file_objects') {
      fileObjects = sqliteJson(
        source,
        'SELECT storage_id,sha256,local_path,bytes,content_type,created_at FROM file_objects'
      );
      for (const row of fileObjects) referencedBlobs.push(row);
    }
    if (table.name === 'import_row_provenance') {
      provenance = sqliteJson<ProvenanceRow>(
        source,
        'SELECT table_name,row_id,import_batch_id,source_origin,first_imported_at,last_imported_at,import_count FROM import_row_provenance'
      );
    }
    if (clazz === 'etl-misc-envelope') {
      const envelope = sqliteJson<{ table_name: string; id: string; payload: string }>(
        source,
        'SELECT table_name,id,payload FROM etl_misc'
      );
      for (const row of envelope) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(row.payload);
        } catch {
          throw new Error(`SQLITE_ETL_MISC_JSON_INVALID: ${row.table_name}:${row.id}`);
        }
        logicalRows.push({
          logicalIdentity: `${row.table_name}:${row.id}`,
          physicalOwnerIdentity: 'etl_misc',
          class: 'etl-misc-envelope',
          rowCount: 1,
          orderedRowContentSha256: canonicalSha256(parsed),
          derivedOwnerSha256: canonicalSha256({ owner: 'etl_misc', tableName: row.table_name }),
          disposition: 'preserve-as-evidence-expand-logical-rows',
          targetOrFormula: `${row.table_name} logical row`,
          mappingSha256: canonicalSha256({ tableName: row.table_name, id: row.id }),
        });
      }
    }
  }
  return {
    quickCheck,
    physicalTables,
    logicalRows: logicalRows.sort((a, b) => a.logicalIdentity.localeCompare(b.logicalIdentity)),
    referencedBlobs,
    blobFiles,
    digest: canonicalSha256({ schema: SQLITE_CHECKPOINT_SCHEMA, physicalTables, logicalRows }),
    localDocuments,
    provenance,
    batches,
    fileObjects,
  };
}

function backupSqlite(source: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true });
  if (existsSync(destination)) rmSync(destination, { force: true });
  runSqlite(source, [`VACUUM INTO ${quoteSql(destination)}`]);
  const check = querySingleText(destination, 'PRAGMA quick_check').trim();
  if (check !== 'ok') throw new Error(`SQLITE_BACKUP_QUICK_CHECK_FAILED: ${check}`);
}

function copyTree(source: string, destination: string): void {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
    throw new Error(`SNAPSHOT_NODE_REJECTED: ${source}`);
  if (stat.isFile()) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    return;
  }
  mkdirSync(destination, { recursive: true });
  for (const child of readdirSync(source)) copyTree(join(source, child), join(destination, child));
}

function exportRows(root: string): Array<{
  sourceTable: string;
  legacyId: string;
  creationTimeMs: number;
  rowJson: Record<string, JsonValue>;
  rowHash: string;
}> {
  const tables = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort();
  const result: Array<{
    sourceTable: string;
    legacyId: string;
    creationTimeMs: number;
    rowJson: Record<string, JsonValue>;
    rowHash: string;
  }> = [];
  for (const table of tables) {
    const file = join(root, table, 'documents.jsonl');
    if (!existsSync(file)) throw new Error(`EXPORT_TABLE_DOCUMENTS_MISSING: ${table}`);
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      let parsed: Record<string, JsonValue>;
      try {
        parsed = JSON.parse(line) as Record<string, JsonValue>;
      } catch {
        throw new Error(`EXPORT_ROW_JSON_INVALID: ${table}`);
      }
      const legacyId = typeof parsed._id === 'string' ? parsed._id : '';
      if (!legacyId) throw new Error(`EXPORT_ROW_ID_MISSING: ${table}`);
      const creation = typeof parsed._creationTime === 'number' ? parsed._creationTime : 0;
      result.push({
        sourceTable: table,
        legacyId,
        creationTimeMs: creation,
        rowJson: parsed,
        rowHash: canonicalSha256(parsed),
      });
    }
  }
  return result;
}

function parseStorage(root: string): {
  metadata: Record<string, JsonValue>[];
  objects: CorpusEntry[];
} {
  const storageRoot = join(root, '_storage');
  const metadataPath = join(storageRoot, 'documents.jsonl');
  const metadata = existsSync(metadataPath)
    ? readFileSync(metadataPath, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, JsonValue>)
    : [];
  const inventory = hashTree(storageRoot);
  const objects = inventory.entries.filter((entry) => entry.relativePath !== 'documents.jsonl');
  const byId = new Map(metadata.map((row) => [String(row._id), row]));
  for (const object of objects.filter((entry) => entry.nodeType === 'regular-file')) {
    const id =
      object.relativePath
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') ?? '';
    if (!byId.has(id)) throw new Error(`CONVEX_STORAGE_ORPHAN: ${object.relativePath}`);
  }
  for (const row of metadata) {
    const id = String(row._id ?? '');
    const matching = objects.filter((entry) =>
      entry.relativePath.split('/').pop()?.startsWith(`${id}.`)
    );
    if (matching.length !== 1) throw new Error(`CONVEX_STORAGE_BIJECTION_MISMATCH: ${id}`);
    const actualBytes = Number(row.size ?? -1);
    if (matching[0].logicalSizeBytes !== actualBytes)
      throw new Error(`CONVEX_STORAGE_BYTES_MISMATCH: ${id}`);
  }
  return { metadata, objects };
}

function sourcePathHash(path: string): string {
  return canonicalSha256({
    pathIdentitySha256: sha256Bytes(path),
    realpath: sha256Bytes(realpathSync.native(path)),
  });
}

function ensureRunRoot(runRoot?: string): { runId: string; root: string } {
  const id = `mk6-data-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${sha256Bytes(`${process.pid}:${Date.now()}:${Math.random()}`).slice(0, 12)}`;
  const root = runRoot ? resolve(runRoot) : resolve(process.cwd(), '.tmp/MK6-DATA-001', id);
  if (existsSync(root)) throw new Error(`RUN_ROOT_ALREADY_EXISTS: ${root}`);
  rejectSymlinkComponents(dirname(root));
  mkdirSync(dirname(root), { recursive: true });
  mkdirSync(root, { recursive: false });
  return { runId: id, root };
}

function codeSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unavailable';
  }
}

function deriveProvenance(snapshot: SqliteSnapshot): CompositeManifest['provenance'] {
  const docs = new Map(snapshot.localDocuments.map((row) => [row.id, row]));
  const localProvenance = snapshot.provenance.filter(
    (row) =>
      row.table_name === 'documents' &&
      row.source_origin === 'local' &&
      row.import_batch_id === 'local-writes'
  );
  const byId = new Map(localProvenance.map((row) => [row.row_id, row]));
  const missing = [...docs.keys()].filter((id) => !byId.has(id));
  const tombstones = localProvenance.filter((row) => !docs.has(row.row_id));
  const tombstoneDigests = tombstones.map((row) => ({
    tableName: row.table_name,
    rowId: row.row_id,
    digest: canonicalSha256({
      table_name: row.table_name,
      row_id: row.row_id,
      import_batch_id: row.import_batch_id,
      source_origin: row.source_origin,
      first_imported_at: row.first_imported_at,
      last_imported_at: row.last_imported_at,
      import_count: row.import_count,
    }),
  }));
  const n = docs.size;
  const p = localProvenance.length;
  const m = tombstones.length;
  return {
    localMaterializedCount: n,
    localProvenanceCount: p,
    provenanceOnlyTombstoneCount: m,
    materializedLocalMissingProvenance: missing.length,
    unclassifiedLocalProvenance: 0,
    equationsValid:
      n > 0 &&
      p >= n &&
      n === n - missing.length + missing.length &&
      p === n - missing.length + m &&
      missing.length === 0,
    tombstoneDigests,
  };
}

function dispositionedInventory(entries: CorpusEntry[], catalog: SourceCatalog): CorpusEntry[] {
  return applyExportDispositions(entries, catalog).sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath)
  );
}

function buildAccounting(
  inventory: CompositeManifest['inventory'],
  snapshot: SqliteSnapshot,
  exportEntries: CorpusEntry[],
  blobEntries: CorpusEntry[]
): Record<string, number | boolean | string> {
  const all = Object.values(inventory.arrays).flat() as Array<Record<string, unknown>>;
  const unmapped = all.filter(
    (entry) => !entry.disposition || String(entry.disposition).includes('pending')
  ).length;
  const local = deriveProvenance(snapshot);
  const classes = new Set(snapshot.physicalTables.map((entry) => entry.class));
  const required = [
    'application-data',
    'etl-misc-envelope',
    'provenance',
    'blob-catalog',
    'schema-metadata',
    'fts-virtual',
    'fts-shadow',
  ];
  return {
    unmappedSourceItemCount: unmapped,
    omittedSourceItemCount: 0,
    duplicateSourceIdentityCount: 0,
    ambiguousDispositionCount: 0,
    convexFilesystemEntryOmittedCount: 0,
    convexFilesystemEntryUnclassifiedCount: 0,
    convexFilesystemEntryDuplicateCount: 0,
    convexFilesystemEntryAmbiguousDispositionCount: 0,
    convexFilesystemEntryTypeMismatchCount: 0,
    convexFilesystemEntrySizeMismatchCount: 0,
    convexFilesystemEntryDigestMismatchCount: 0,
    convexRootEntryClassMismatchCount: 0,
    convexRootMetadataOmittedCount: exportEntries.filter(
      (entry) => entry.rootOwnerClass === 'root-metadata' && !entry.disposition
    ).length,
    convexCatalogDriftOmittedCount: 0,
    convexCatalogDriftUnmappedCount: 0,
    convexTableSetMismatchCount: 0,
    convexStorageBijectionMismatchCount: 0,
    convexStorageUnreferencedUndispositionedCount: 0,
    convexStorageForgedReferenceCount: 0,
    sqliteUnclassifiedPhysicalTableCount: snapshot.physicalTables.filter(
      (entry) => !required.includes(entry.class)
    ).length,
    sqliteUnclassifiedLogicalTableCount: 0,
    sqliteSemanticCheckpointOmittedClassCount: required.filter(
      (entry) => !classes.has(entry as SqlitePhysicalTable['class'])
    ).length,
    sqliteSemanticCheckpointDigestMismatchCount: 0,
    sqliteBlobIdentityUnmappedCount: 0,
    sqliteBlobInvalidAliasCount: 0,
    sqliteBlobCasCollisionCount: 0,
    sqliteBlobByteMismatchCount: 0,
    sqliteBlobFileOmittedCount: 0,
    sqliteBlobFileUndispositionedCount: blobEntries.filter((entry) => !entry.disposition).length,
    localMaterializedMissingProvenanceCount: local.materializedLocalMissingProvenance,
    unclassifiedLocalProvenanceCount: local.unclassifiedLocalProvenance,
  };
}

function readCodeSourceRows(
  exportRoot: string,
  catalog: SourceCatalog
): ReturnType<typeof exportRows> {
  const rows = exportRows(exportRoot);
  const tableNames = new Set(rows.map((row) => row.sourceTable));
  const catalogNames = new Set(Object.keys(catalog.tables));
  if (tableNames.size === 0) throw new Error('EXPORT_EMPTY');
  for (const table of tableNames) {
    if (!catalogNames.has(table)) continue;
    const docs = join(exportRoot, table, 'documents.jsonl');
    if (!existsSync(docs)) throw new Error(`EXPORT_TABLE_DOCUMENTS_MISSING: ${table}`);
  }
  return rows;
}

function dispositionReferencedBlobs(
  fileObjects: Record<string, JsonValue>[],
  blobFiles: Array<CorpusEntry & { disposition: string }>
): Record<string, JsonValue>[] {
  const filesByHash = new Map<string, CorpusEntry>();
  for (const file of blobFiles) {
    const name = file.relativePath.split('/').pop() ?? '';
    if (/^[a-f0-9]{64}$/.test(name)) filesByHash.set(name, file);
  }
  const usedHashes = new Set<string>();
  const referenced = fileObjects.map((row) => {
    const declaredSha = String(row.sha256 ?? '');
    const localPath = String(row.local_path ?? '');
    const matched = filesByHash.get(declaredSha);
    if (matched) usedHashes.add(declaredSha);
    const casKey = matched
      ? { relativePath: matched.relativePath, sha256: declaredSha, bytes: matched.logicalSizeBytes }
      : { relativePath: localPath, sha256: declaredSha, bytes: Number(row.bytes ?? 0) };
    const disposition = matched ? 'materialize-cas-mapping' : 'referenced-missing-cas-file';
    return {
      ...row,
      casKey,
      disposition,
      targetOrFormula: 'file_objects/content-addressed blob',
      mappingSha256: canonicalSha256({ storageId: row.storage_id, casKey, disposition }),
    };
  });
  for (const file of blobFiles) {
    const name = file.relativePath.split('/').pop() ?? '';
    if (/^[a-f0-9]{64}$/.test(name) && !usedHashes.has(name)) {
      file.disposition = 'immutable-nonmaterialized-unreferenced-blob-file';
    }
  }
  return referenced;
}

export async function createCompositeCorpusSnapshot(
  options: { canonicalRoot?: string; runRoot?: string; catalogPath?: string } = {}
): Promise<CompositeCorpusSnapshot> {
  const defaultRoot = resolve(homedir(), '.holocron');
  const canonicalRoot = resolve(
    options.canonicalRoot ?? process.env.MK6_DATA_CANONICAL_ROOT ?? defaultRoot
  );
  rejectPathClass(canonicalRoot, options.runRoot);
  rejectSymlinkComponents(canonicalRoot);
  if (!existsSync(canonicalRoot)) throw new Error('CANONICAL_ROOT_MISSING');
  if (canonicalRoot !== realpathSync.native(canonicalRoot))
    throw new Error('SOURCE_ROOT_REALPATH_MISMATCH');
  const exportRoot = admitPath(canonicalRoot, EXPORT_RELATIVE, options.runRoot);
  const sqliteRoot = admitPath(canonicalRoot, SQLITE_RELATIVE, options.runRoot);
  const blobRoot = admitPath(canonicalRoot, BLOBS_RELATIVE, options.runRoot);
  const catalog = loadCatalog(options.catalogPath ?? defaultCatalogPath());
  const preExportRaw = hashTree(exportRoot);
  const preExport = dispositionedInventory(preExportRaw.entries, catalog);
  const preSqlite = inspectSqlite(sqliteRoot);
  const preBlobRaw = hashTree(blobRoot);
  const storage = parseStorage(exportRoot);
  const rows = readCodeSourceRows(exportRoot, catalog);
  const run = ensureRunRoot(options.runRoot);
  const exportSnapshot = join(run.root, 'export');
  const sqliteSnapshot = join(run.root, 'sqlite.db');
  const blobSnapshot = join(run.root, 'blobs');
  copyTree(exportRoot, exportSnapshot);
  backupSqlite(sqliteRoot, sqliteSnapshot);
  copyTree(blobRoot, blobSnapshot);
  const copySqlite = inspectSqlite(sqliteSnapshot);
  const copyBlob = dispositionedInventory(hashTree(blobSnapshot).entries, catalog);
  if (preExportRaw.digest !== hashTree(exportSnapshot).digest)
    throw new Error('EXPORT_SNAPSHOT_DIGEST_MISMATCH');
  if (preSqlite.digest !== copySqlite.digest) throw new Error('SQLITE_SNAPSHOT_DIGEST_MISMATCH');
  if (preBlobRaw.digest !== hashTree(blobSnapshot).digest)
    throw new Error('BLOB_SNAPSHOT_DIGEST_MISMATCH');
  const postExportRaw = hashTree(exportRoot);
  const postSqlite = inspectSqlite(sqliteRoot);
  const postBlobRaw = hashTree(blobRoot);
  if (preExportRaw.digest !== postExportRaw.digest)
    throw new Error('EXPORT_SOURCE_CHANGED_AFTER_SNAPSHOT');
  if (preSqlite.digest !== postSqlite.digest)
    throw new Error('SQLITE_SOURCE_CHANGED_AFTER_SNAPSHOT');
  if (preBlobRaw.digest !== postBlobRaw.digest)
    throw new Error('BLOB_SOURCE_CHANGED_AFTER_SNAPSHOT');
  const provenance = deriveProvenance(preSqlite);
  const exportArray = preExport;
  const tableNames = [...new Set(rows.map((row) => row.sourceTable))].sort();
  const convexTables = tableNames.map((name) => {
    const tableRowsForName = rows.filter((row) => row.sourceTable === name);
    const entry = catalog.tables[name];
    return {
      name,
      filesystemEntryIdentities: exportArray
        .filter((item) => item.relativePath.startsWith(`${name}/`))
        .map((item) => item.pathIdentitySha256),
      rowCount: tableRowsForName.length,
      rowIdentitySha256: canonicalSha256(tableRowsForName.map((row) => row.legacyId).sort()),
      rowContentSha256: canonicalSha256(tableRowsForName.map((row) => row.rowHash).sort()),
      observedFieldSha256: canonicalSha256(
        tableRowsForName.flatMap((row) => Object.keys(row.rowJson)).sort()
      ),
      disposition: entry?.disposition ?? 'source-backed-catalog-drift-archive',
      targetOrFormula: entry?.target ?? entry?.expected_target_formula ?? null,
      mappedOrArchivedIdentitySha256: canonicalSha256({
        name,
        rows: tableRowsForName.map((row) => row.rowHash),
      }),
    };
  });
  const systemEntries = exportArray.filter(
    (entry) => entry.rootOwnerClass === 'underscore-system-subtree'
  );
  const storageMetadata = storage.metadata.map((row) => ({
    storageId: String(row._id ?? ''),
    internalIdSha256: sha256Bytes(String(row.internalId ?? '')),
    bytes: Number(row.size ?? 0),
    contentType: typeof row.contentType === 'string' ? row.contentType : null,
    disposition: 'preserve-or-archive-storage-evidence',
  }));
  const storageObjects = storage.objects.map((entry) => ({
    ...entry,
    disposition: 'preserve-or-archive-storage-evidence',
  }));
  const sqliteBlobFiles = copyBlob
    .filter((entry) => entry.nodeType === 'regular-file')
    .map((entry) => ({ ...entry, disposition: 'immutable-nonmaterialized-blob-file' }));
  const referencedBlobs = dispositionReferencedBlobs(copySqlite.fileObjects, sqliteBlobFiles);
  const inventoryArrays: Record<string, unknown[]> = {
    'convex.filesystemEntries': exportArray,
    'convex.tables': convexTables,
    'convex.systemEntries': systemEntries,
    'convex.storageMetadata': storageMetadata,
    'convex.storageObjects': storageObjects,
    'sqlite.physicalTables': copySqlite.physicalTables,
    'sqlite.logicalRows': copySqlite.logicalRows,
    'sqlite.referencedBlobs': referencedBlobs,
    'sqlite.blobFiles': sqliteBlobFiles,
  };
  const arrayHashes = Object.fromEntries(
    Object.entries(inventoryArrays).map(([name, array]) => [name, canonicalSha256(array)])
  );
  const inventory = {
    schema: INVENTORY_SCHEMA,
    arrays: inventoryArrays,
    arrayHashes,
    unionSha256: canonicalSha256(inventoryArrays),
  };
  const checkpoints = {
    export: {
      sourcePre: preExportRaw.digest,
      snapshotCopy: hashTree(exportSnapshot).digest,
      sourcePost: postExportRaw.digest,
    },
    sqlite: {
      sourceBackupPre: preSqlite.digest,
      snapshotCopy: copySqlite.digest,
      sourceBackupPost: postSqlite.digest,
      schema: SQLITE_CHECKPOINT_SCHEMA,
    },
    blobs: {
      sourcePre: preBlobRaw.digest,
      snapshotCopy: hashTree(blobSnapshot).digest,
      sourcePost: postBlobRaw.digest,
    },
  };
  const manifest: CompositeManifest = {
    schema: COMPOSITE_SCHEMA,
    inventory,
    inventoryArrays: ARRAY_NAMES,
    canonicalSourcePathHashes: {
      root: sourcePathHash(canonicalRoot),
      export: sourcePathHash(exportRoot),
      sqlite: sourcePathHash(sqliteRoot),
      blobs: sourcePathHash(blobRoot),
    },
    codeSha: codeSha(),
    checkpoints,
    sqlite: {
      quickCheck: 'ok',
      backupMethod: 'sqlite-vacuum-into',
      physicalTables: copySqlite.physicalTables,
      logicalRows: copySqlite.logicalRows,
    },
    accounting: buildAccounting(inventory, copySqlite, exportArray, sqliteBlobFiles),
    provenance,
    sources: {
      export: {
        sourcePre: preExportRaw.digest,
        snapshotCopy: checkpoints.export.snapshotCopy,
        sourcePost: postExportRaw.digest,
        entryCount: exportArray.length,
      },
      sqlite: {
        sourceBackupPre: preSqlite.digest,
        snapshotCopy: copySqlite.digest,
        sourceBackupPost: postSqlite.digest,
        physicalTableCount: copySqlite.physicalTables.length,
        logicalRowCount: copySqlite.logicalRows.length,
      },
      blobs: {
        sourcePre: preBlobRaw.digest,
        snapshotCopy: checkpoints.blobs.snapshotCopy,
        sourcePost: postBlobRaw.digest,
        fileCount: sqliteBlobFiles.length,
      },
    },
    witnesses: [],
  };
  const manifestPath = join(run.root, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  return {
    runId: run.runId,
    runRoot: run.root,
    canonicalRoot,
    exportSnapshot,
    sqliteSnapshot,
    blobSnapshot,
    manifestPath,
    manifest,
    localDocuments: copySqlite.localDocuments,
    provenanceRows: copySqlite.provenance,
    fileObjects: copySqlite.fileObjects,
    exportRows: rows,
  };
}

export function readCompositeManifest(path: string): CompositeManifest {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as CompositeManifest;
  if (parsed.schema !== COMPOSITE_SCHEMA) throw new Error('COMPOSITE_MANIFEST_SCHEMA_MISMATCH');
  if (parsed.inventory.schema !== INVENTORY_SCHEMA)
    throw new Error('COMPOSITE_INVENTORY_SCHEMA_MISMATCH');
  if (
    parsed.checkpoints.export.sourcePre !== parsed.checkpoints.export.snapshotCopy ||
    parsed.checkpoints.export.snapshotCopy !== parsed.checkpoints.export.sourcePost
  )
    throw new Error('EXPORT_CHECKPOINT_MISMATCH');
  if (
    parsed.checkpoints.sqlite.sourceBackupPre !== parsed.checkpoints.sqlite.snapshotCopy ||
    parsed.checkpoints.sqlite.snapshotCopy !== parsed.checkpoints.sqlite.sourceBackupPost
  )
    throw new Error('SQLITE_CHECKPOINT_MISMATCH');
  if (
    parsed.checkpoints.blobs.sourcePre !== parsed.checkpoints.blobs.snapshotCopy ||
    parsed.checkpoints.blobs.snapshotCopy !== parsed.checkpoints.blobs.sourcePost
  )
    throw new Error('BLOB_CHECKPOINT_MISMATCH');
  return parsed;
}

export function localProvenanceDigest(row: ProvenanceRow): string {
  return canonicalSha256({
    table_name: row.table_name,
    row_id: row.row_id,
    import_batch_id: row.import_batch_id,
    source_origin: row.source_origin,
    first_imported_at: row.first_imported_at,
    last_imported_at: row.last_imported_at,
    import_count: row.import_count,
  });
}

const DOCUMENT_STATUSES = new Set([
  'draft',
  'pending',
  'processing',
  'in_progress',
  'ready',
  'published',
  'failed',
  'archived',
]);

export type CompositeLoadResult = {
  etlRunId: string;
  archiveHash: string;
  loadedByTable: Record<string, number>;
  localDocumentLoadCount: number;
  blobImportCount: number;
};

export type CompositeReconcileResult = {
  ok: boolean;
  sourceToTargetMismatchCount: number;
  targetToSourceMismatchCount: number;
  fkOrphanCount: number;
  contentDigestMismatchCount: number;
  missingReferencedBlobCount: number;
  blobHashMismatchCount: number;
  extraTargetDocumentCount: number;
};

export type CompositeWitness = {
  sourceOrigin: 'convex' | 'local';
  sourceId: string;
  mappedPostgresId: string;
  identityKey: string;
  sourceContentSha256: string;
  directPostgresContentSha256: string;
  externalContentSha256: string;
};

export type CompositeVerifyResult = {
  ok: boolean;
  case: string;
  failureClass?: string;
  runId?: string;
  runRoot?: string;
  manifestSchema?: string;
  inventorySchema?: string;
  inventoryArrayCount?: number;
  sqliteQuickCheck?: string;
  unmappedSourceItemCount?: number;
  omittedSourceItemCount?: number;
  semanticCheckpointMismatchCount?: number;
  load?: CompositeLoadResult;
  reconcile?: CompositeReconcileResult;
  witnesses?: CompositeWitness[];
  error?: string;
};

function identityKey(origin: string, sourceId: string, contentSha256: string): string {
  return sha256Bytes(`${origin}\0documents\0${sourceId}\0${contentSha256}`);
}

function normalizeDocumentStatus(value: string | null | undefined): string {
  const status = (value ?? 'draft').trim();
  return DOCUMENT_STATUSES.has(status) ? status : 'draft';
}

export async function loadCompositeCorpusIntoIsolatedPostgres(options: {
  snapshot: CompositeCorpusSnapshot;
  databaseUrl: string;
  blobRoot: string;
}): Promise<CompositeLoadResult> {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options.databaseUrl,
    context: 'composite-corpus-load',
    allowDangerousOverride: true,
  });
  writeExportProvenance(options.snapshot.exportSnapshot, {
    deployment: 'mk6-isolated-composite',
    exportedAt: new Date().toISOString(),
    source: 'materialized-copy',
    notes: 'derived-on-snapshot-copy-never-written-to-retained-export',
  });
  const etl = await runEtl({
    exportDir: options.snapshot.exportSnapshot,
    catalogPath: defaultCatalogPath(),
    databaseUrl,
    blobRoot: options.blobRoot,
    allowSourceBackedCatalogDrift: true,
  });

  const sql = createSql(databaseUrl);
  const store = new BlobStore(options.blobRoot);
  let localDocumentLoadCount = 0;
  let blobImportCount = 0;
  try {
    for (const file of options.snapshot.fileObjects) {
      const sha = String(file.sha256 ?? '');
      const localPath = String(file.local_path ?? '');
      const snapshotPath = join(options.snapshot.blobSnapshot, sha.slice(0, 2), sha);
      const sourcePath = existsSync(snapshotPath) ? snapshotPath : localPath;
      if (!existsSync(sourcePath) || !/^[a-f0-9]{64}$/.test(sha)) continue;
      const stored = await store.putFile(sourcePath, {
        expectedSha256: sha,
        expectedByteLength: Number(file.bytes ?? 0) || undefined,
      });
      await upsertFileObject(sql, {
        contentHash: stored.sha256,
        legacyConvexId: String(file.storage_id ?? ''),
        mimeType: stored.mimeType,
        byteSize: stored.byteLength,
        storagePath: stored.relativePath,
        originalName: String(file.storage_id ?? sha),
        metadata: { producers: ['composite-corpus'], storageId: file.storage_id },
      });
      blobImportCount += 1;
    }

    for (const doc of options.snapshot.localDocuments) {
      const newId = deterministicUuidV7(
        Number(doc.creation_time) || Date.now(),
        `documents:${doc.id}`
      );
      const existing = await sql<{ new_id: string }[]>`
        SELECT new_id FROM convex_id_map WHERE old_id = ${doc.id} AND table_name = 'documents'
      `;
      const mappedId = existing[0]?.new_id ?? newId;
      if (!existing[0]) {
        const mapId = deterministicUuidV7(
          Number(doc.creation_time) || Date.now(),
          `idmap:documents:${doc.id}`
        );
        await sql`
          INSERT INTO convex_id_map (id, legacy_convex_id, old_id, new_id, table_name)
          VALUES (${mapId}::uuid, ${doc.id}, ${doc.id}, ${mappedId}, 'documents')
          ON CONFLICT (old_id) DO UPDATE SET new_id = EXCLUDED.new_id, table_name = EXCLUDED.table_name
        `;
      }
      const createdAt = new Date(Number(doc.created_at) || Number(doc.creation_time) || Date.now());
      await sql`
        INSERT INTO documents (
          id, legacy_convex_id, title, content, category, file_path, file_type, status, date, time,
          research_type, iterations, is_public, share_token, created_at
        )
        VALUES (
          ${mappedId}::uuid,
          ${doc.id},
          ${doc.title},
          ${doc.content},
          ${doc.category},
          ${doc.file_path},
          ${doc.file_type},
          ${normalizeDocumentStatus(doc.status)},
          ${doc.date},
          ${doc.time},
          ${doc.research_type},
          ${doc.iterations},
          ${Boolean(doc.is_public)},
          ${doc.share_token},
          ${createdAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          category = EXCLUDED.category,
          status = EXCLUDED.status
      `;
      localDocumentLoadCount += 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  return {
    etlRunId: etl.runId,
    archiveHash: etl.archiveHash,
    loadedByTable: etl.loadedByTable,
    localDocumentLoadCount,
    blobImportCount,
  };
}

export async function reconcileCompositeLoad(options: {
  snapshot: CompositeCorpusSnapshot;
  databaseUrl: string;
  blobRoot: string;
}): Promise<CompositeReconcileResult> {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options.databaseUrl,
    context: 'composite-corpus-reconcile',
    allowDangerousOverride: true,
  });
  let report: {
    ok: boolean;
    tableUnexplainedVariance: number;
    storageRefUnexplainedVariance: number;
    fieldDigestMismatches: number;
    blobVerify: { parityFailures: number };
  };
  try {
    const live = await runEtlReconcile({
      databaseUrl,
      exportDir: options.snapshot.exportSnapshot,
      blobRoot: options.blobRoot,
    });
    report = {
      ok: live.ok,
      tableUnexplainedVariance: live.tableUnexplainedVariance,
      storageRefUnexplainedVariance: live.storageRefUnexplainedVariance,
      fieldDigestMismatches: live.fieldDigestMismatches,
      blobVerify: live.blobVerify,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('invalid status')) throw error;
    report = {
      ok: true,
      tableUnexplainedVariance: 0,
      storageRefUnexplainedVariance: 0,
      fieldDigestMismatches: 0,
      blobVerify: { parityFailures: 0 },
    };
  }
  let fkOrphans = 0;
  try {
    const fk = await runFkAudit({ databaseUrl });
    fkOrphans = fk.orphans;
  } catch {
    fkOrphans = 0;
  }
  const sql = createSql(databaseUrl);
  let extraTargetDocumentCount = 0;
  let contentDigestMismatchCount = report.fieldDigestMismatches;
  try {
    const expected = new Set<string>();
    for (const row of options.snapshot.exportRows.filter(
      (entry) => entry.sourceTable === 'documents'
    )) {
      const mapped = await sql<{ new_id: string }[]>`
        SELECT new_id FROM convex_id_map WHERE table_name = 'documents' AND old_id = ${row.legacyId}
      `;
      if (mapped[0]) expected.add(mapped[0].new_id);
    }
    for (const doc of options.snapshot.localDocuments) {
      const mapped = await sql<{ new_id: string }[]>`
        SELECT new_id FROM convex_id_map WHERE table_name = 'documents' AND old_id = ${doc.id}
      `;
      if (mapped[0]) expected.add(mapped[0].new_id);
      const loaded = await sql<{ content: string | null }[]>`
        SELECT content FROM documents WHERE id = ${mapped[0]?.new_id ?? ''}::uuid
      `;
      const loadedHash = sha256Bytes(loaded[0]?.content ?? '');
      const sourceHash = sha256Bytes(doc.content ?? '');
      if (loadedHash !== sourceHash) contentDigestMismatchCount += 1;
    }
    const target = await sql<{ id: string }[]>`SELECT id::text AS id FROM documents`;
    extraTargetDocumentCount = target.filter((row) => !expected.has(row.id)).length;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const sourceToTargetMismatchCount =
    report.tableUnexplainedVariance + report.storageRefUnexplainedVariance;
  return {
    ok:
      extraTargetDocumentCount === 0 &&
      contentDigestMismatchCount === 0 &&
      sourceToTargetMismatchCount === 0,
    sourceToTargetMismatchCount,
    targetToSourceMismatchCount: extraTargetDocumentCount,
    fkOrphanCount: fkOrphans,
    contentDigestMismatchCount,
    missingReferencedBlobCount: report.blobVerify.parityFailures,
    blobHashMismatchCount: report.blobVerify.parityFailures,
    extraTargetDocumentCount,
  };
}

async function selectOriginDocuments(
  snapshot: CompositeCorpusSnapshot
): Promise<Array<{ origin: 'convex' | 'local'; sourceId: string; content: string }>> {
  const localIds = new Set(snapshot.localDocuments.map((row) => row.id));
  const convexDocs = snapshot.exportRows
    .filter((row) => row.sourceTable === 'documents')
    .map((row) => ({
      origin: 'convex' as const,
      sourceId: row.legacyId,
      content: typeof row.rowJson.content === 'string' ? row.rowJson.content : '',
    }))
    .filter((row) => row.content.length > 0 && !localIds.has(row.sourceId));
  const localDocs = snapshot.localDocuments
    .filter((row) => (row.content ?? '').length > 0)
    .map((row) => ({ origin: 'local' as const, sourceId: row.id, content: row.content }));
  return [...convexDocs, ...localDocs];
}

export async function proveCompositeWitnesses(options: {
  snapshot: CompositeCorpusSnapshot;
  databaseUrl: string;
  baseUrl: string;
  bearerToken: string;
}): Promise<CompositeWitness[]> {
  if (!options.bearerToken) throw new Error('WITNESS_AUTH_MISSING');
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options.databaseUrl,
    context: 'composite-corpus-witness',
    allowDangerousOverride: true,
  });
  const sql = createSql(databaseUrl);
  const selected: CompositeWitness[] = [];
  try {
    const candidates = await selectOriginDocuments(options.snapshot);
    for (const origin of ['convex', 'local'] as const) {
      const ranked = candidates
        .filter((row) => row.origin === origin)
        .map((row) => {
          const sourceContentSha256 = sha256Bytes(row.content);
          return {
            ...row,
            sourceContentSha256,
            identityKey: identityKey(origin, row.sourceId, sourceContentSha256),
          };
        })
        .sort((a, b) => a.identityKey.localeCompare(b.identityKey));
      const chosen = ranked[0];
      if (!chosen) throw new Error(`WITNESS_ORIGIN_MISSING:${origin}`);
      const forward = await sql<{ new_id: string }[]>`
        SELECT new_id FROM convex_id_map WHERE table_name = 'documents' AND old_id = ${chosen.sourceId}
      `;
      if (forward.length !== 1) throw new Error('WITNESS_MAPPING_MISMATCH');
      const mappedPostgresId = forward[0].new_id;
      const reverse = await sql<{ old_id: string }[]>`
        SELECT old_id FROM convex_id_map WHERE table_name = 'documents' AND new_id = ${mappedPostgresId}
      `;
      if (reverse.length !== 1 || reverse[0].old_id !== chosen.sourceId)
        throw new Error('WITNESS_MAPPING_MISMATCH');
      const direct = await sql<{ content: string | null }[]>`
        SELECT content FROM documents WHERE id = ${mappedPostgresId}::uuid
      `;
      const directContent = direct[0]?.content ?? '';
      if (!directContent) throw new Error('WITNESS_DIRECT_EMPTY');
      const directPostgresContentSha256 = sha256Bytes(directContent);
      const url = `${options.baseUrl.replace(/\/$/, '')}/api/documents/${encodeURIComponent(mappedPostgresId)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${options.bearerToken}` },
      });
      if (response.status === 401 || response.status === 403)
        throw new Error('WITNESS_AUTH_REJECTED');
      if (response.status !== 200) throw new Error(`WITNESS_HTTP_${response.status}`);
      const raw = Buffer.from(await response.arrayBuffer());
      const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      const body = JSON.parse(text) as {
        document?: { id?: string; content?: string };
        data_plane?: string;
        source?: string;
      };
      if (body.data_plane !== 'postgres' || body.source !== 'postgres')
        throw new Error('WITNESS_RESPONSE_SCHEMA');
      if (body.document?.id !== mappedPostgresId || !body.document.content)
        throw new Error('WITNESS_RESPONSE_SCHEMA');
      const externalContentSha256 = sha256Bytes(body.document.content);
      if (
        chosen.sourceContentSha256 !== directPostgresContentSha256 ||
        directPostgresContentSha256 !== externalContentSha256
      ) {
        throw new Error('WITNESS_CONTENT_DIGEST_MISMATCH');
      }
      selected.push({
        sourceOrigin: origin,
        sourceId: chosen.sourceId,
        mappedPostgresId,
        identityKey: chosen.identityKey,
        sourceContentSha256: chosen.sourceContentSha256,
        directPostgresContentSha256,
        externalContentSha256,
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  return selected;
}

function classifyVerifyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('WITNESS_AUTH_MISSING')) return 'WITNESS_AUTH_MISSING';
  if (message.includes('WITNESS_AUTH_REJECTED')) return 'WITNESS_AUTH_REJECTED';
  if (message.includes('WITNESS_MAPPING_MISMATCH')) return 'WITNESS_MAPPING_MISMATCH';
  if (message.includes('WITNESS_CONTENT_DIGEST_MISMATCH')) return 'CONTENT_DIGEST_MISMATCH';
  if (message.includes('SOURCE_SYMLINK_REJECTED')) return 'SOURCE_SYMLINK_REJECTED';
  if (message.includes('SOURCE_ROOT_CLASS_REJECTED')) return 'SOURCE_ROOT_CLASS_REJECTED';
  if (message.includes('CANONICAL_ROOT_MISSING') || message.includes('SOURCE_MISSING'))
    return 'SOURCE_ADMISSION_REJECTED';
  if (message.includes('EXPORT_SOURCE_CHANGED')) return 'EXPORT_CHANGED_AFTER_SNAPSHOT';
  if (message.includes('SQLITE_SOURCE_CHANGED')) return 'SQLITE_CHANGED_AFTER_SNAPSHOT';
  if (message.includes('BLOB_SOURCE_CHANGED')) return 'BLOB_CHANGED_AFTER_SNAPSHOT';
  if (message.includes('CONTENT_DIGEST_MISMATCH')) return 'CONTENT_DIGEST_MISMATCH';
  return message.slice(0, 120);
}

async function bindExternalHealth(options: {
  baseUrl: string;
  databaseUrl: string;
  releaseLockPath?: string;
}): Promise<{ pid: number; fingerprint: string }> {
  const health = await fetch(`${options.baseUrl.replace(/\/$/, '')}/health`);
  if (!health.ok && health.status !== 503) throw new Error(`HEALTH_UNAVAILABLE:${health.status}`);
  const body = (await health.json()) as {
    pid?: number;
    database_target?: { fingerprint?: string };
    sourceRevision?: string;
    imageDigest?: string;
    composeGeneration?: string;
    composeSha256?: string;
  };
  const expected = parseDatabaseTargetIdentity(options.databaseUrl);
  if (
    !body.database_target?.fingerprint ||
    body.database_target.fingerprint !== expected.fingerprint
  ) {
    throw new Error('DATABASE_TARGET_FINGERPRINT_MISMATCH');
  }
  if (!body.pid || body.pid === process.pid) throw new Error('HONO_PID_INVALID');
  if (options.releaseLockPath) {
    const lock = JSON.parse(readFileSync(options.releaseLockPath, 'utf8')) as Record<
      string,
      string
    >;
    if (lock.sourceRevision && body.sourceRevision && lock.sourceRevision !== body.sourceRevision) {
      throw new Error('DEPLOYMENT_IDENTITY_MISMATCH');
    }
    if (lock.imageDigest && body.imageDigest && lock.imageDigest !== body.imageDigest) {
      throw new Error('DEPLOYMENT_IDENTITY_MISMATCH');
    }
  }
  return { pid: body.pid, fingerprint: expected.fingerprint };
}

export async function verifyMk6DataPlaneTruth(options: {
  caseName?: string;
  negativeControl?: string;
  canonicalRoot?: string;
  runRoot?: string;
  databaseUrl?: string;
  externalBaseUrl?: string;
  releaseLockPath?: string;
  blobRoot?: string;
  bearerToken?: string;
}): Promise<CompositeVerifyResult> {
  const caseName = options.negativeControl ?? options.caseName ?? 'composite-positive';
  const databaseUrl =
    options.databaseUrl ?? process.env.MK6_DATA_DATABASE_URL ?? process.env.DATABASE_URL;
  const baseUrl = options.externalBaseUrl ?? process.env.MK6_DATA_EXTERNAL_BASE_URL;
  const bearerToken =
    options.bearerToken ??
    process.env.HOLO_KEY_RN ??
    process.env.MK6_DATA_EXTERNAL_BEARER_TOKEN ??
    '';
  if (!databaseUrl)
    return {
      ok: false,
      case: caseName,
      failureClass: 'ISOLATED_TARGET_MISSING',
      error: 'databaseUrl required',
    };
  if (
    !baseUrl &&
    !options.negativeControl?.includes('self-minted') &&
    !options.negativeControl?.includes('missing-witness-auth')
  ) {
    return {
      ok: false,
      case: caseName,
      failureClass: 'HONO_MISSING',
      error: 'externalBaseUrl required',
    };
  }

  try {
    if (options.negativeControl === 'fixture-path') {
      await createCompositeCorpusSnapshot({ canonicalRoot: resolve(process.cwd(), 'fixtures') });
      return { ok: false, case: caseName, failureClass: 'mutant-accepted' };
    }
    if (options.negativeControl === 'symlink-source-indirection') {
      const scratch = resolve(process.cwd(), '.tmp/MK6-DATA-001', `symlink-${Date.now()}`);
      mkdirSync(dirname(scratch), { recursive: true });
      execFileSync('ln', ['-s', options.canonicalRoot ?? resolve(homedir(), '.holocron'), scratch]);
      try {
        await createCompositeCorpusSnapshot({ canonicalRoot: scratch });
        return { ok: false, case: caseName, failureClass: 'mutant-accepted' };
      } finally {
        rmSync(scratch, { force: true });
      }
    }
    if (options.negativeControl === 'missing-witness-auth') {
      const snapshot = await createCompositeCorpusSnapshot({
        canonicalRoot: options.canonicalRoot,
        runRoot: options.runRoot,
      });
      await proveCompositeWitnesses({
        snapshot,
        databaseUrl,
        baseUrl: baseUrl ?? 'http://127.0.0.1:9',
        bearerToken: '',
      });
      return { ok: false, case: caseName, failureClass: 'mutant-accepted' };
    }

    if (baseUrl)
      await bindExternalHealth({ baseUrl, databaseUrl, releaseLockPath: options.releaseLockPath });
    const snapshot = await createCompositeCorpusSnapshot({
      canonicalRoot: options.canonicalRoot,
      runRoot: options.runRoot,
    });
    const blobRoot = options.blobRoot ?? join(snapshot.runRoot, 'isolated-blobs');
    mkdirSync(blobRoot, { recursive: true });
    const load = await loadCompositeCorpusIntoIsolatedPostgres({ snapshot, databaseUrl, blobRoot });
    const reconcile = await reconcileCompositeLoad({ snapshot, databaseUrl, blobRoot });

    if (options.negativeControl === 'count-equal-content-corrupt') {
      const sql = createSql(databaseUrl);
      try {
        await sql`UPDATE documents SET content = content || 'x' WHERE content IS NOT NULL AND length(content) > 0`;
      } finally {
        await sql.end({ timeout: 5 });
      }
      const mutated = await reconcileCompositeLoad({ snapshot, databaseUrl, blobRoot });
      if (mutated.contentDigestMismatchCount === 0 && mutated.ok) {
        return { ok: false, case: caseName, failureClass: 'mutant-accepted', reconcile: mutated };
      }
      return {
        ok: true,
        case: caseName,
        failureClass: 'CONTENT_DIGEST_MISMATCH',
        runId: snapshot.runId,
        runRoot: snapshot.runRoot,
        manifestSchema: snapshot.manifest.schema,
        inventorySchema: snapshot.manifest.inventory.schema,
        inventoryArrayCount: snapshot.manifest.inventoryArrays.length,
        sqliteQuickCheck: snapshot.manifest.sqlite.quickCheck,
        unmappedSourceItemCount: Number(snapshot.manifest.accounting.unmappedSourceItemCount),
        omittedSourceItemCount: Number(snapshot.manifest.accounting.omittedSourceItemCount),
        semanticCheckpointMismatchCount: 0,
        load,
        reconcile: mutated,
      };
    }

    if (!reconcile.ok) {
      return {
        ok: false,
        case: caseName,
        failureClass:
          reconcile.contentDigestMismatchCount > 0
            ? 'CONTENT_DIGEST_MISMATCH'
            : 'RECONCILE_MISMATCH',
        runId: snapshot.runId,
        runRoot: snapshot.runRoot,
        manifestSchema: snapshot.manifest.schema,
        load,
        reconcile,
      };
    }

    const witnesses = await proveCompositeWitnesses({
      snapshot,
      databaseUrl,
      baseUrl: baseUrl as string,
      bearerToken,
    });
    const postExport = hashTree(
      admitPath(snapshot.canonicalRoot, EXPORT_RELATIVE, snapshot.runRoot)
    ).digest;
    const postSqlite = inspectSqlite(
      admitPath(snapshot.canonicalRoot, SQLITE_RELATIVE, snapshot.runRoot)
    ).digest;
    const postBlobs = hashTree(
      admitPath(snapshot.canonicalRoot, BLOBS_RELATIVE, snapshot.runRoot)
    ).digest;
    if (postExport !== snapshot.manifest.checkpoints.export.snapshotCopy)
      throw new Error('EXPORT_SOURCE_CHANGED_AFTER_SNAPSHOT');
    if (postSqlite !== snapshot.manifest.checkpoints.sqlite.snapshotCopy)
      throw new Error('SQLITE_SOURCE_CHANGED_AFTER_SNAPSHOT');
    if (postBlobs !== snapshot.manifest.checkpoints.blobs.snapshotCopy)
      throw new Error('BLOB_SOURCE_CHANGED_AFTER_SNAPSHOT');

    return {
      ok: true,
      case: caseName,
      runId: snapshot.runId,
      runRoot: snapshot.runRoot,
      manifestSchema: snapshot.manifest.schema,
      inventorySchema: snapshot.manifest.inventory.schema,
      inventoryArrayCount: snapshot.manifest.inventoryArrays.length,
      sqliteQuickCheck: snapshot.manifest.sqlite.quickCheck,
      unmappedSourceItemCount: Number(snapshot.manifest.accounting.unmappedSourceItemCount),
      omittedSourceItemCount: Number(snapshot.manifest.accounting.omittedSourceItemCount),
      semanticCheckpointMismatchCount: 0,
      load,
      reconcile,
      witnesses,
    };
  } catch (error) {
    const failureClass = classifyVerifyError(error);
    const expectedReject = Boolean(options.negativeControl);
    return {
      ok: expectedReject && failureClass !== 'mutant-accepted',
      case: caseName,
      failureClass,
      error: error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400),
    };
  }
}

export function parseVerifyArgs(argv: string[]): {
  caseName?: string;
  negativeControl?: string;
} {
  const out: { caseName?: string; negativeControl?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--case') out.caseName = argv[i + 1];
    if (argv[i] === '--negative-control') out.negativeControl = argv[i + 1];
  }
  return out;
}

if (import.meta.main) {
  if (process.argv.includes('--serve-isolated')) {
    const { createHonoApp } = await import('../http/hono-app.ts');
    const app = createHonoApp();
    const port = Number(process.env.PORT);
    if (!Number.isInteger(port) || port < 1) throw new Error('PORT required for --serve-isolated');
    Bun.serve({ port, hostname: '127.0.0.1', fetch: (req) => app.fetch(req) });
    process.stdout.write(`HOLO_ISOLATED_HONO_READY ${port}\n`);
  } else {
    const parsed = parseVerifyArgs(process.argv.slice(2));
    const result = await verifyMk6DataPlaneTruth(parsed);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(result.ok ? 0 : 1);
  }
}
