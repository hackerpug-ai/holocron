/** Immutable Convex export reader + validator for Sprint 14 ETL. */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  buildAssetInventory,
  collectCatalogStorageLegacyIds,
  collectRetainedStorageLegacyIds,
} from '../catalog/assets.ts';
import type { SourceCatalog } from '../catalog/catalog-loader.ts';
import { type ConvexExport, readExport } from '../catalog/export-reader.ts';

export interface ParsedExportRow {
  sourceTable: string;
  legacyId: string;
  creationTimeMs: number;
  rowJson: Record<string, unknown>;
  rowHash: string;
}

export interface ImmutableExport {
  root: string;
  exportData: ConvexExport;
  rows: ParsedExportRow[];
  archiveHash: string;
  assetInventory: ReturnType<typeof buildAssetInventory>;
  listedTables: string[];
  fileManifest: Array<{ path: string; sha256: string; bytes: number }>;
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function sha256Bytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function listAllFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function readTableList(root: string): string[] {
  const file = join(root, '_tables', 'documents.jsonl');
  if (!existsSync(file)) {
    throw new Error(`etl export missing required _tables/documents.jsonl: ${file}`);
  }
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const names: string[] = [];
  for (const line of lines) {
    const parsed = JSON.parse(line) as { name?: string };
    if (!parsed.name) {
      throw new Error(`etl export table list entry missing name: ${line}`);
    }
    names.push(parsed.name);
  }
  return names;
}

function parseTableRows(root: string, table: string): ParsedExportRow[] {
  const file = join(root, table, 'documents.jsonl');
  if (!existsSync(file)) {
    throw new Error(`etl export missing documents.jsonl for table ${table}: ${file}`);
  }
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line, index) => {
    const row = JSON.parse(line) as Record<string, unknown>;
    const legacyId = String(row._id ?? '');
    if (!legacyId) {
      throw new Error(`etl export ${table}[${index}] missing _id`);
    }
    const creationTimeMs = Number(row._creationTime ?? row.createdAt ?? 0);
    if (!Number.isFinite(creationTimeMs)) {
      throw new Error(`etl export ${table}[${index}] has invalid _creationTime`);
    }
    return {
      sourceTable: table,
      legacyId,
      creationTimeMs,
      rowJson: row,
      rowHash: sha256Text(line),
    };
  });
}

function validateTableSurface(root: string, listedTables: string[]): void {
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort();
  const listed = [...listedTables].sort();
  const dirsOnly = dirs.filter((name) => !listed.includes(name));
  const listedOnly = listed.filter((name) => !dirs.includes(name));
  if (dirsOnly.length || listedOnly.length) {
    throw new Error(
      `etl export table surface mismatch: extra_dirs=${dirsOnly.join(',') || '(none)'} missing_dirs=${listedOnly.join(',') || '(none)'}`
    );
  }
}

function validateBlobMeta(root: string, exp: ConvexExport, catalog: SourceCatalog): void {
  const storageDir = join(root, '_storage');
  const hasStorage = existsSync(storageDir) && statSync(storageDir).isDirectory();
  const metaFile = join(root, '_blob_meta.json');
  const retainedIds = collectRetainedStorageLegacyIds(catalog, exp);
  const accountedIds = collectCatalogStorageLegacyIds(catalog, exp);
  const requiresStorageArtifacts = retainedIds.size > 0 || exp.storageBlobs.length > 0;

  if (!hasStorage) {
    if (requiresStorageArtifacts) {
      throw new Error(`etl export missing required _storage directory: ${storageDir}`);
    }
    return;
  }

  if (!existsSync(metaFile)) {
    throw new Error(`etl export missing required _blob_meta.json: ${metaFile}`);
  }

  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Record<
    string,
    { sha256?: string; bytes?: number; ref?: string }
  >;
  const blobIds = new Set(exp.storageBlobs.map((blob) => blob.legacyId));

  for (const [legacyId, sourceRef] of retainedIds) {
    if (!blobIds.has(legacyId)) {
      throw new Error(
        `etl export retained storage ref ${sourceRef} missing required blob ${legacyId} in _storage`
      );
    }
    if (!meta[legacyId]) {
      throw new Error(
        `etl export retained storage ref ${sourceRef} missing _blob_meta entry for ${legacyId}`
      );
    }
  }

  for (const [legacyId, declared] of Object.entries(meta)) {
    if (!blobIds.has(legacyId)) {
      throw new Error(`etl export _blob_meta entry ${legacyId} does not have a matching blob file`);
    }
    const accounted = accountedIds.get(legacyId);
    if (!accounted) {
      throw new Error(
        `etl export blob ${legacyId} is not represented by an approved retained or dropped catalog storage ref`
      );
    }
    if (declared.ref && declared.ref !== accounted.sourceRef) {
      throw new Error(
        `etl export blob ${legacyId} _blob_meta ref ${declared.ref} does not match catalog storage ref ${accounted.sourceRef}`
      );
    }
  }

  for (const blob of exp.storageBlobs) {
    const accounted = accountedIds.get(blob.legacyId);
    if (!accounted) {
      throw new Error(
        `etl export blob ${blob.legacyId} is not represented by an approved retained or dropped catalog storage ref`
      );
    }
    const declared = meta[blob.legacyId];
    if (!declared) {
      throw new Error(`etl export blob ${blob.legacyId} missing from _blob_meta.json`);
    }
    if (declared.sha256 !== blob.sha256) {
      throw new Error(
        `etl export blob sha mismatch for ${blob.legacyId}: expected ${declared.sha256}, got ${blob.sha256}`
      );
    }
    if (declared.bytes !== blob.bytes) {
      throw new Error(
        `etl export blob byte-length mismatch for ${blob.legacyId}: expected ${declared.bytes}, got ${blob.bytes}`
      );
    }
  }
}

export function readImmutableExport(exportDir: string, catalog: SourceCatalog): ImmutableExport {
  const root = resolve(exportDir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`etl export directory does not exist: ${root}`);
  }

  const listedTables = readTableList(root);
  validateTableSurface(root, listedTables);

  const exportData = readExport(root);
  validateBlobMeta(root, exportData, catalog);

  const rows = listedTables.flatMap((table) => parseTableRows(root, table));
  const assetInventory = buildAssetInventory(catalog, exportData);
  const fileManifest = listAllFiles(root).map((file) => {
    const bytes = readFileSync(file);
    return {
      path: relative(root, file),
      sha256: sha256Bytes(bytes),
      bytes: bytes.length,
    };
  });
  const archiveHash = sha256Text(
    fileManifest.map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`).join('\n')
  );

  return {
    root,
    exportData,
    rows,
    archiveHash,
    assetInventory,
    listedTables,
    fileManifest,
  };
}
