/**
 * Walk a real `convex export` directory: per-table documents.jsonl row counts + `_storage/` blobs.
 * Counts and digests are computed from bytes/rows on disk — never hard-coded.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface ExportTable {
  name: string;
  path: string;
  rowCount: number;
  /** Field names observed across sample rows (union). */
  fields: string[];
  /** Storage id values observed for storage-bearing fields. */
  storageIdsByField: Record<string, string[]>;
}

export interface NativeStorageMetadata {
  legacyId: string;
  sha256: string;
  bytes: number;
  contentType: string | null;
  internalId: string | null;
  metadataPath: string;
}

export interface ExportBlob {
  legacyId: string;
  path: string;
  fileName: string;
  bytes: number;
  sha256: string;
  mime: string;
}

interface MimeDetection {
  mime: string;
  confident: boolean;
}

export interface ConvexExport {
  root: string;
  tables: Record<string, ExportTable>;
  storageBlobs: ExportBlob[];
  systemDirs: string[];
  storageMetadata: Record<string, NativeStorageMetadata>;
  hasNativeStorageMetadata: boolean;
}

const SYSTEM_DIR_PREFIX = '_';
const NATIVE_STORAGE_METADATA_FILE = 'documents.jsonl';

function normalizeMime(value: string): string {
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function detectMime(bytes: Buffer, filename: string): MimeDetection {
  const normalizedName = filename.toLowerCase();

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', confident: true };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { mime: 'image/png', confident: true };
  }
  if (bytes.length >= 6) {
    const header = bytes.slice(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') {
      return { mime: 'image/gif', confident: true };
    }
  }
  if (
    bytes.length >= 12 &&
    bytes.slice(0, 4).toString('ascii') === 'RIFF' &&
    bytes.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', confident: true };
  }
  if (bytes.length >= 5 && bytes.slice(0, 5).toString('ascii') === '%PDF-') {
    return { mime: 'application/pdf', confident: true };
  }
  if (
    bytes.length >= 12 &&
    bytes.slice(0, 4).toString('ascii') === 'RIFF' &&
    bytes.slice(8, 12).toString('ascii') === 'WAVE'
  ) {
    return { mime: 'audio/wav', confident: true };
  }
  if (bytes.length >= 4 && bytes.slice(0, 4).toString('ascii') === 'fLaC') {
    return { mime: 'audio/flac', confident: true };
  }
  if (bytes.length >= 3 && bytes.slice(0, 3).toString('ascii') === 'ID3') {
    return { mime: 'audio/mpeg', confident: true };
  }

  if (normalizedName.endsWith('.mp3')) return { mime: 'audio/mpeg', confident: true };
  if (normalizedName.endsWith('.wav')) return { mime: 'audio/wav', confident: true };
  if (normalizedName.endsWith('.pdf')) return { mime: 'application/pdf', confident: true };
  if (normalizedName.endsWith('.txt')) return { mime: 'text/plain', confident: true };
  if (normalizedName.endsWith('.json') || normalizedName.endsWith('.jsonl')) {
    return { mime: 'application/json', confident: true };
  }

  // Fixture text blobs + generic printable ASCII (+ tab/LF/CR)
  let printable = true;
  for (const byte of bytes) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    if (byte < 0x20 || byte > 0x7e) {
      printable = false;
      break;
    }
  }
  if (printable) return { mime: 'text/plain', confident: true };
  return { mime: 'application/octet-stream', confident: false };
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function decodeBase64Sha256(base64Sha256: string, context: string): string {
  const bytes = Buffer.from(base64Sha256, 'base64');
  if (bytes.length !== 32) {
    throw new Error(
      `export-reader: ${context} sha256 must be base64-encoded 32-byte digest (got ${bytes.length} bytes)`
    );
  }
  const normalizedInput = base64Sha256.replace(/=+$/u, '');
  const normalizedDecoded = bytes.toString('base64').replace(/=+$/u, '');
  if (normalizedInput !== normalizedDecoded) {
    throw new Error(`export-reader: ${context} sha256 is not valid base64`);
  }
  return bytes.toString('hex');
}

function parseNativeStorageMetadata(path: string): Record<string, NativeStorageMetadata> {
  const metadata: Record<string, NativeStorageMetadata> = {};
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const [index, line] of lines.entries()) {
    const parsed = JSON.parse(line) as {
      _id?: unknown;
      sha256?: unknown;
      size?: unknown;
      contentType?: unknown;
      internalId?: unknown;
    };
    const legacyId = typeof parsed._id === 'string' ? parsed._id.trim() : '';
    if (!legacyId) {
      throw new Error(`export-reader: _storage metadata row ${index} missing _id`);
    }
    if (metadata[legacyId]) {
      throw new Error(`export-reader: duplicate _storage metadata entry for ${legacyId}`);
    }
    if (typeof parsed.sha256 !== 'string' || parsed.sha256.trim().length === 0) {
      throw new Error(`export-reader: _storage metadata row ${legacyId} missing sha256`);
    }
    const bytes = Number(parsed.size);
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error(`export-reader: _storage metadata row ${legacyId} has invalid size`);
    }
    if (parsed.contentType != null && typeof parsed.contentType !== 'string') {
      throw new Error(`export-reader: _storage metadata row ${legacyId} has invalid contentType`);
    }
    if (parsed.internalId != null && typeof parsed.internalId !== 'string') {
      throw new Error(`export-reader: _storage metadata row ${legacyId} has invalid internalId`);
    }

    metadata[legacyId] = {
      legacyId,
      sha256: decodeBase64Sha256(parsed.sha256, `_storage metadata row ${legacyId}`),
      bytes,
      contentType: typeof parsed.contentType === 'string' ? parsed.contentType : null,
      internalId: typeof parsed.internalId === 'string' ? parsed.internalId : null,
      metadataPath: path,
    };
  }

  return metadata;
}

function resolveNativeStorageEntry(
  fileName: string,
  metadata: Record<string, NativeStorageMetadata>
): NativeStorageMetadata | null {
  const exact = metadata[fileName];
  if (exact) return exact;
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const stripped = fileName.slice(0, lastDot);
  return metadata[stripped] ?? null;
}

function countJsonl(path: string): {
  rowCount: number;
  fields: Set<string>;
  storageIdsByField: Record<string, string[]>;
} {
  const fields = new Set<string>();
  const storageIdsByField: Record<string, string[]> = {};
  if (!existsSync(path)) {
    return { rowCount: 0, fields, storageIdsByField };
  }
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      for (const key of Object.keys(row)) {
        fields.add(key);
        if (
          (key === 'storageId' ||
            key.endsWith('StorageId') ||
            key.toLowerCase().includes('storage')) &&
          typeof row[key] === 'string' &&
          (row[key] as string).length > 0
        ) {
          storageIdsByField[key] ??= [];
          storageIdsByField[key].push(row[key] as string);
        }
      }
    } catch {
      // count the line as a row even if parse fails — still a source record
      fields.add('_unparsed');
    }
  }
  return { rowCount: lines.length, fields, storageIdsByField };
}

export function readExport(exportDir: string): ConvexExport {
  const root = resolve(exportDir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`export-reader: export directory does not exist: ${root}`);
  }

  const entries = readdirSync(root, { withFileTypes: true });
  const tables: Record<string, ExportTable> = {};
  const systemDirs: string[] = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const name = ent.name;
    if (name.startsWith(SYSTEM_DIR_PREFIX)) {
      systemDirs.push(name);
      continue;
    }
    const tablePath = join(root, name);
    const docs = join(tablePath, 'documents.jsonl');
    const { rowCount, fields, storageIdsByField } = countJsonl(docs);
    tables[name] = {
      name,
      path: tablePath,
      rowCount,
      fields: [...fields].sort(),
      storageIdsByField,
    };
  }

  const storageBlobs: ExportBlob[] = [];
  const storageDir = join(root, '_storage');
  let storageMetadata: Record<string, NativeStorageMetadata> = {};
  let hasNativeStorageMetadata = false;

  if (existsSync(storageDir) && statSync(storageDir).isDirectory()) {
    const storageMetadataPath = join(storageDir, NATIVE_STORAGE_METADATA_FILE);
    hasNativeStorageMetadata =
      existsSync(storageMetadataPath) && statSync(storageMetadataPath).isFile();
    storageMetadata = hasNativeStorageMetadata
      ? parseNativeStorageMetadata(storageMetadataPath)
      : {};
    const matchedStorageMetadataIds = new Set<string>();

    for (const file of readdirSync(storageDir).sort()) {
      const p = join(storageDir, file);
      if (!statSync(p).isFile()) continue;
      if (file === NATIVE_STORAGE_METADATA_FILE) continue;

      const bytesBuf = readFileSync(p);
      const sha256 = sha256Hex(bytesBuf);
      const detectedMime = detectMime(bytesBuf, file);
      const nativeEntry = hasNativeStorageMetadata
        ? resolveNativeStorageEntry(file, storageMetadata)
        : null;

      if (hasNativeStorageMetadata) {
        if (!nativeEntry) {
          throw new Error(
            `export-reader: storage file ${file} does not match any _storage/documents.jsonl metadata entry`
          );
        }
        if (matchedStorageMetadataIds.has(nativeEntry.legacyId)) {
          throw new Error(
            `export-reader: _storage metadata entry ${nativeEntry.legacyId} matched multiple files`
          );
        }
        matchedStorageMetadataIds.add(nativeEntry.legacyId);
        if (nativeEntry.sha256 !== sha256) {
          throw new Error(
            `export-reader: storage file ${file} sha mismatch for ${nativeEntry.legacyId}: expected ${nativeEntry.sha256}, got ${sha256}`
          );
        }
        if (nativeEntry.bytes !== bytesBuf.length) {
          throw new Error(
            `export-reader: storage file ${file} byte-length mismatch for ${nativeEntry.legacyId}: expected ${nativeEntry.bytes}, got ${bytesBuf.length}`
          );
        }
        if (
          nativeEntry.contentType &&
          detectedMime.confident &&
          normalizeMime(nativeEntry.contentType) !== detectedMime.mime
        ) {
          throw new Error(
            `export-reader: storage file ${file} content-type mismatch for ${nativeEntry.legacyId}: declared ${nativeEntry.contentType}, detected ${detectedMime.mime}`
          );
        }
      }

      storageBlobs.push({
        legacyId: nativeEntry?.legacyId ?? file,
        path: p,
        fileName: file,
        bytes: bytesBuf.length,
        sha256,
        mime: nativeEntry?.contentType ?? detectedMime.mime,
      });
    }

    if (hasNativeStorageMetadata) {
      for (const legacyId of Object.keys(storageMetadata)) {
        if (matchedStorageMetadataIds.has(legacyId)) continue;
        throw new Error(
          `export-reader: _storage metadata entry ${legacyId} does not have a matching blob file`
        );
      }
    }
  }

  return { root, tables, storageBlobs, systemDirs, storageMetadata, hasNativeStorageMetadata };
}

export function listExportTableNames(exp: ConvexExport): string[] {
  return Object.keys(exp.tables).sort();
}
