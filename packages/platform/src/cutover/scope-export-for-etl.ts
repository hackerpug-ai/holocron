/**
 * D06-04 — scope a real `convex export` tree to the Sprint 14 catalog surface
 * so existing ETL modules can load without reimplementing transform logic.
 *
 * Live deployments routinely contain:
 *   - extra tables not yet catalogued (e.g. migrationFenceAudit)
 *   - storage blobs not referenced by the 6 catalog storage_refs
 *
 * This helper materializes a *fresh* catalog-scoped copy (never mutates the
 * raw export). The raw zip/dir remains primary evidence of live export.
 */
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { collectCatalogStorageLegacyIds } from '../catalog/assets.ts';
import type { SourceCatalog } from '../catalog/catalog-loader.ts';
import { readExport } from '../catalog/export-reader.ts';
import { documentStatusValues, lifecycleStatusValues, workStatusValues } from '../db/enums.ts';
import {
  EXPORT_PROVENANCE_SIDECAR,
  type ExportProvenance,
  requireExportProvenance,
  writeExportProvenance,
} from '../etl/archive.ts';
import { normalizeStatus } from '../etl/transform.ts';

/** Union used by Sprint 14 coerceForColumn status gate. */
const STATUS_UNION = new Set<string>([
  ...documentStatusValues,
  ...lifecycleStatusValues,
  ...workStatusValues,
]);

const LIFECYCLE = new Set(lifecycleStatusValues);
const WORK = new Set(workStatusValues);
const DOC = new Set(documentStatusValues);

/** Per-table CHECK constraints that are stricter than the transform union. */
const TABLE_STATUS_VOCAB: Record<string, ReadonlySet<string>> = {
  documents: DOC,
  toolbeltTools: LIFECYCLE,
  shopSessions: LIFECYCLE,
  shopListings: LIFECYCLE,
  assimilationSessions: LIFECYCLE,
  assimilationIterations: LIFECYCLE,
  whatsNewReports: LIFECYCLE,
  whatsNewWorkflows: LIFECYCLE,
  researchSessions: LIFECYCLE,
  deepResearchSessions: LIFECYCLE,
  researchIterations: LIFECYCLE,
  deepResearchIterations: LIFECYCLE,
  improvementRequests: LIFECYCLE,
  rateLimitTracking: LIFECYCLE,
  subscriptionSources: LIFECYCLE,
  subscriptionContent: LIFECYCLE,
  subscriptionLinks: LIFECYCLE,
  subscriptionFilters: LIFECYCLE,
  tasks: WORK,
  toolCalls: WORK,
  agentPlans: WORK,
  agentPlanSteps: WORK,
  audioJobs: WORK,
  audioSegments: WORK,
  transcriptJobs: WORK,
  audioTranscriptJobs: WORK,
  executionPlans: WORK,
  chatMessages: WORK,
  revenueValidationSessions: LIFECYCLE,
  competitiveAnalysisSessions: LIFECYCLE,
  aiRoiSessions: LIFECYCLE,
  flightsSessions: LIFECYCLE,
};

/** Live Convex → target enum aliases (normalized keys). */
const STATUS_ALIASES: Record<string, string> = {
  complete: 'completed',
  done: 'completed',
  finished: 'completed',
  suggested: 'draft',
  investigation: 'in_progress',
  design: 'draft',
  closed_poc: 'archived',
  audit_complete: 'completed',
  accepted: 'approved',
  draft_plan_rev2: 'draft',
  ready_to_publish: 'ready',
  error: 'failed',
  processing: 'in_progress',
  in_progress: 'in_progress',
  timed_out: 'failed',
  timeout: 'failed',
  no_captions: 'failed',
  closed: 'archived',
  open: 'active',
  discovered: 'active',
};

/**
 * Remap a live status into a value accepted by ETL coerce + table CHECK.
 * Prefers table-specific vocab; falls back to union, then draft/pending.
 */
export function remapStatusForEtl(table: string, value: unknown): string {
  const normalized = normalizeStatus(value);
  const tableVocab = TABLE_STATUS_VOCAB[table];
  const allowed = tableVocab ?? STATUS_UNION;

  if (allowed.has(normalized)) return normalized;

  let candidate = STATUS_ALIASES[normalized] ?? normalized;

  // documents: map complete-like / work statuses into documentStatusValues
  if (table === 'documents') {
    if (candidate === 'completed' || candidate === 'complete' || candidate === 'approved') {
      candidate = 'ready';
    } else if (candidate === 'active') {
      candidate = 'published';
    } else if (candidate === 'failed' || candidate === 'cancelled' || candidate === 'canceled') {
      candidate = 'failed';
    }
  }

  if (allowed.has(candidate)) return candidate;
  if (!tableVocab && STATUS_UNION.has(candidate)) return candidate;

  // Safe defaults present in the relevant vocab
  if (allowed.has('draft')) return 'draft';
  if (allowed.has('pending')) return 'pending';
  if (allowed.has('failed')) return 'failed';
  return [...allowed][0] ?? 'draft';
}

function rewriteTableDocumentsJsonl(srcFile: string, dstFile: string, table: string): void {
  if (!existsSync(srcFile)) {
    writeFileSync(dstFile, '', 'utf8');
    return;
  }
  const out: string[] = [];
  for (const line of readFileSync(srcFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as Record<string, unknown>;
      if ('status' in row && row.status != null) {
        row.status = remapStatusForEtl(table, row.status);
      }
      out.push(JSON.stringify(row));
    } catch {
      out.push(trimmed);
    }
  }
  writeFileSync(dstFile, out.length ? `${out.join('\n')}\n` : '', 'utf8');
}

export type ScopeExportResult = {
  /** Catalog-scoped export directory (ETL-ready). */
  exportDir: string;
  /** Original (raw) export directory that was scoped. */
  sourceExportDir: string;
  tablesKept: string[];
  tablesDropped: string[];
  blobsKept: number;
  blobsDropped: number;
};

function listStorageBlobFiles(storageDir: string): string[] {
  if (!existsSync(storageDir) || !statSync(storageDir).isDirectory()) return [];
  return readdirSync(storageDir).filter((name) => {
    if (name === 'documents.jsonl') return false;
    const full = join(storageDir, name);
    return statSync(full).isFile();
  });
}

/**
 * Strip Convex storage filename extensions to recover the storage legacy id.
 * Live exports write `kg….mpga` / `kg….txt`; fixture uses bare ids or prefixed names.
 */
export function storageFilenameToLegacyId(filename: string): string {
  // Native convex export: <storageId>.<ext>
  const dot = filename.indexOf('.');
  if (dot > 0) return filename.slice(0, dot);
  return filename;
}

/**
 * Materialize a catalog-scoped copy of a real convex export for ETL load.
 */
export function scopeExportForEtl(options: {
  sourceExportDir: string;
  destExportDir: string;
  catalog: SourceCatalog;
}): ScopeExportResult {
  const source = resolve(options.sourceExportDir);
  const dest = resolve(options.destExportDir);
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new Error(`scopeExportForEtl: source export missing: ${source}`);
  }
  mkdirSync(dest, { recursive: true });

  const catalogTables = new Set(Object.keys(options.catalog.tables));
  const systemExcluded = new Set(options.catalog.system_exclusions.map((e) => e.name));

  // Discover domain table dirs in source (exclude _* system dirs)
  const sourceDirs = readdirSync(source, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort();

  const tablesKept: string[] = [];
  const tablesDropped: string[] = [];

  for (const name of sourceDirs) {
    if (catalogTables.has(name)) {
      tablesKept.push(name);
      const srcTable = join(source, name);
      const dstTable = join(dest, name);
      mkdirSync(dstTable, { recursive: true });
      const docs = join(srcTable, 'documents.jsonl');
      // Rewrite rows so live status enums map into Postgres CHECK / ETL coerce vocab.
      rewriteTableDocumentsJsonl(docs, join(dstTable, 'documents.jsonl'), name);
    } else if (systemExcluded.has(name)) {
      // Explicitly dropped/archived residue — omit from scoped surface
      tablesDropped.push(name);
    } else {
      tablesDropped.push(name);
    }
  }

  tablesKept.sort();

  // Rewrite _tables/documents.jsonl to match kept domain tables only
  // (do not invent empty dirs for catalog tables absent from the live export —
  // Sprint 14 fixtures already omit many catalog tables and still pass ETL).
  mkdirSync(join(dest, '_tables'), { recursive: true });
  writeFileSync(
    join(dest, '_tables', 'documents.jsonl'),
    `${tablesKept.map((name) => JSON.stringify({ name })).join('\n')}${tablesKept.length ? '\n' : ''}`,
    'utf8'
  );

  // Resolve which storage legacy IDs the catalog accounts for from *kept* tables.
  // Read the partial dest first so storageIdsByField only sees catalog tables.
  const partialExp = readExport(dest);
  const accounted = collectCatalogStorageLegacyIds(options.catalog, partialExp);
  const keepIds = new Set(accounted.keys());

  const srcStorage = join(source, '_storage');
  let blobsKept = 0;
  let blobsDropped = 0;
  /** Content-address collapse: alias non-canonical storage ids → canonical. */
  const storageIdAliases = new Map<string, string>();

  if (existsSync(srcStorage) && keepIds.size > 0) {
    const dstStorage = join(dest, '_storage');
    mkdirSync(dstStorage, { recursive: true });

    // Group accounted blobs by content hash so CAS load/reconcile counts match.
    // Live deployments often store identical transcript bytes under many storage ids;
    // Sprint 14 blob store content-addresses them into one file_object row.
    type BlobPick = { legacyId: string; file: string; sha256: string; bytes: number };
    const bySha = new Map<string, BlobPick[]>();
    for (const file of listStorageBlobFiles(srcStorage)) {
      const legacyId = storageFilenameToLegacyId(file);
      if (!keepIds.has(legacyId)) {
        blobsDropped += 1;
        continue;
      }
      const bytes = readFileSync(join(srcStorage, file));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const list = bySha.get(sha256) ?? [];
      list.push({ legacyId, file, sha256, bytes: bytes.length });
      bySha.set(sha256, list);
    }

    const canonicalIds = new Set<string>();
    for (const group of bySha.values()) {
      group.sort((a, b) => a.legacyId.localeCompare(b.legacyId));
      const canonical = group[0]!;
      canonicalIds.add(canonical.legacyId);
      for (const extra of group.slice(1)) {
        storageIdAliases.set(extra.legacyId, canonical.legacyId);
      }
      cpSync(join(srcStorage, canonical.file), join(dstStorage, canonical.file));
      blobsKept += 1;
      blobsDropped += group.length - 1;
    }

    // Filter native _storage/documents.jsonl metadata to canonical ids only
    const srcMeta = join(srcStorage, 'documents.jsonl');
    if (existsSync(srcMeta)) {
      const keptLines: string[] = [];
      for (const line of readFileSync(srcMeta, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const row = JSON.parse(trimmed) as { _id?: string };
          const id = String(row._id ?? '');
          if (id && canonicalIds.has(id)) keptLines.push(trimmed);
        } catch {
          // drop unparseable
        }
      }
      writeFileSync(
        join(dstStorage, 'documents.jsonl'),
        keptLines.length ? `${keptLines.join('\n')}\n` : '',
        'utf8'
      );
    }

    // Rewrite table rows so storage field refs point at the canonical CAS id.
    if (storageIdAliases.size > 0) {
      const storageFields = new Set(
        Object.keys(options.catalog.storage_refs)
          .map((ref) => ref.split('.')[1]!)
          .filter(Boolean)
      );
      for (const f of ['storageId', 'audioStorageId', 'imageStorageId', 'fileStorageId']) {
        storageFields.add(f);
      }
      for (const table of tablesKept) {
        const docsPath = join(dest, table, 'documents.jsonl');
        if (!existsSync(docsPath)) continue;
        const lines = readFileSync(docsPath, 'utf8').split('\n');
        const out: string[] = [];
        let changed = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const row = JSON.parse(trimmed) as Record<string, unknown>;
            for (const field of storageFields) {
              const v = row[field];
              if (typeof v === 'string' && storageIdAliases.has(v)) {
                row[field] = storageIdAliases.get(v);
                changed = true;
              }
            }
            out.push(JSON.stringify(row));
          } catch {
            out.push(trimmed);
          }
        }
        if (changed) {
          writeFileSync(docsPath, out.length ? `${out.join('\n')}\n` : '', 'utf8');
        }
      }
    }
  } else if (existsSync(srcStorage)) {
    blobsDropped = listStorageBlobFiles(srcStorage).length;
  }

  // Prefer native metadata; if source used custom _blob_meta, filter it too
  const srcBlobMeta = join(source, '_blob_meta.json');
  if (existsSync(srcBlobMeta) && keepIds.size > 0) {
    try {
      const parsed = JSON.parse(readFileSync(srcBlobMeta, 'utf8')) as Record<string, unknown>;
      const filtered: Record<string, unknown> = {};
      for (const [id, val] of Object.entries(parsed)) {
        if (storageIdAliases.has(id)) continue; // non-canonical
        if (keepIds.has(id)) filtered[id] = val;
      }
      if (Object.keys(filtered).length > 0) {
        writeFileSync(join(dest, '_blob_meta.json'), `${JSON.stringify(filtered, null, 2)}\n`);
      }
    } catch {
      // ignore corrupt meta — native path may still work
    }
  }

  // Side-car: record what we scoped for evidence
  writeFileSync(
    join(dest, '..', 'scope-meta.json'),
    `${JSON.stringify(
      {
        sourceExportDir: source,
        exportDir: dest,
        tablesKept,
        tablesDropped,
        blobsKept,
        blobsDropped,
        storageIdAliases: Object.fromEntries(storageIdAliases),
        accountedBlobIds: [...keepIds].sort(),
      },
      null,
      2
    )}\n`
  );

  // S31-CX-02: scoped copy must carry a provenance sidecar (copy parent or mint).
  let parentProvenance: ExportProvenance | null = null;
  try {
    if (existsSync(join(source, EXPORT_PROVENANCE_SIDECAR))) {
      parentProvenance = requireExportProvenance(source);
    }
  } catch {
    parentProvenance = null;
  }
  const now = Date.now();
  writeExportProvenance(dest, {
    deployment: parentProvenance?.deployment ?? 'scoped-export-unknown-deployment',
    exportedAt: parentProvenance?.exportedAt ?? new Date(now).toISOString(),
    exportStartedAtMs: parentProvenance?.exportStartedAtMs ?? now,
    exportFinishedAtMs: parentProvenance?.exportFinishedAtMs ?? now,
    includeFileStorage: parentProvenance?.includeFileStorage,
    exportZipHash: parentProvenance?.exportZipHash,
    source: 'scoped-copy',
    notes: parentProvenance
      ? `scoped from ${source} (parent source=${parentProvenance.source ?? 'unknown'})`
      : `scoped from ${source} (no parent provenance)`,
  });

  return {
    exportDir: dest,
    sourceExportDir: source,
    tablesKept,
    tablesDropped,
    blobsKept,
    blobsDropped,
  };
}

/**
 * When the export is already catalog-clean (fixture), return it unchanged.
 * Otherwise materialize a scoped copy under destParent.
 */
export function ensureCatalogScopedExport(options: {
  sourceExportDir: string;
  destParent: string;
  catalog: SourceCatalog;
  /** Force scope even if already clean (default false — auto-detect). */
  force?: boolean;
}): ScopeExportResult {
  const source = resolve(options.sourceExportDir);
  // Auto-detect: if verify would pass, skip copy for fixture path speed.
  if (!options.force) {
    try {
      const exp = readExport(source);
      const catalogSet = new Set(Object.keys(options.catalog.tables));
      const systemExcluded = new Set(options.catalog.system_exclusions.map((e) => e.name));
      let dirty = false;
      for (const tname of Object.keys(exp.tables)) {
        if (!catalogSet.has(tname) && !systemExcluded.has(tname)) {
          dirty = true;
          break;
        }
      }
      if (!dirty) {
        const accounted = collectCatalogStorageLegacyIds(options.catalog, exp);
        for (const blob of exp.storageBlobs) {
          if (!accounted.has(blob.legacyId)) {
            dirty = true;
            break;
          }
        }
      }
      if (!dirty) {
        return {
          exportDir: source,
          sourceExportDir: source,
          tablesKept: Object.keys(exp.tables).sort(),
          tablesDropped: [],
          blobsKept: exp.storageBlobs.length,
          blobsDropped: 0,
        };
      }
    } catch {
      // Fall through to force scope
    }
  }

  const stamp = `${Date.now()}-scoped`;
  const destExportDir = resolve(options.destParent, stamp, 'export');
  mkdirSync(resolve(destExportDir, '..'), { recursive: true });
  return scopeExportForEtl({
    sourceExportDir: source,
    destExportDir,
    catalog: options.catalog,
  });
}

/** Best-effort: find sibling export-meta next to a raw export dir. */
export function findSiblingExportMeta(exportDir: string): string | null {
  const candidates = [
    join(exportDir, '..', 'export-meta.json'),
    join(exportDir, 'export-meta.json'),
    join(exportDir, '..', '..', 'export-meta.json'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // basename stamp folder search not needed
  void basename;
  return null;
}
