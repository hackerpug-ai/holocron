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

export interface ExportBlob {
  legacyId: string;
  path: string;
  bytes: number;
  sha256: string;
  mime: string;
}

export interface ConvexExport {
  root: string;
  tables: Record<string, ExportTable>;
  storageBlobs: ExportBlob[];
  systemDirs: string[];
}

const SYSTEM_DIR_PREFIX = '_';

function detectMime(bytes: Buffer, filename: string): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.length >= 4 && bytes.slice(0, 4).toString('ascii') === 'fLaC') {
    return 'audio/flac';
  }
  if (bytes.length >= 3 && bytes.slice(0, 3).toString('ascii') === 'ID3') {
    return 'audio/mpeg';
  }
  if (filename.endsWith('.mp3')) return 'audio/mpeg';
  if (filename.endsWith('.json') || filename.endsWith('.jsonl')) return 'application/json';
  // Fixture text blobs + generic printable ASCII (+ tab/LF/CR)
  const asText = bytes.toString('utf8');
  let printable = true;
  for (let i = 0; i < asText.length; i++) {
    const code = asText.charCodeAt(i);
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    if (code < 0x20 || code > 0x7e) {
      printable = false;
      break;
    }
  }
  if (printable) return 'text/plain';
  return 'application/octet-stream';
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
  if (existsSync(storageDir) && statSync(storageDir).isDirectory()) {
    for (const file of readdirSync(storageDir)) {
      const p = join(storageDir, file);
      if (!statSync(p).isFile()) continue;
      const bytesBuf = readFileSync(p);
      const sha256 = createHash('sha256').update(bytesBuf).digest('hex');
      storageBlobs.push({
        legacyId: file,
        path: p,
        bytes: bytesBuf.length,
        sha256,
        mime: detectMime(bytesBuf, file),
      });
    }
  }

  return { root, tables, storageBlobs, systemDirs };
}

export function listExportTableNames(exp: ConvexExport): string[] {
  return Object.keys(exp.tables).sort();
}
