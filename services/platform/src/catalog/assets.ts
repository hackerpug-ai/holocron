/**
 * Per-object asset inventory for retained Convex storage blobs.
 * SHA-256 / byte length / MIME computed from on-disk bytes.
 */
import type { SourceCatalog } from './catalog-loader';
import type { ConvexExport, ExportBlob } from './export-reader';

export interface AssetRow {
  legacy_id: string;
  sha256: string;
  bytes: number;
  mime: string;
  target: string;
  disposition: string;
  source_ref: string | null;
  retention: 'retain' | 'drop';
  path: string;
}

export interface AssetInventory {
  objects: AssetRow[];
  retained_count: number;
  dropped_storage_refs: string[];
  ok: boolean;
}

export interface CatalogStorageLegacyId {
  sourceRef: string;
  retention: 'retain' | 'drop';
  disposition: string;
}

function contentAddressedTarget(sha256: string): string {
  return `cas://sha256/${sha256}`;
}

/** Resolve which storage field refs are retained vs dropped from the catalog. */
export function retainedStorageRefs(catalog: SourceCatalog): string[] {
  return Object.entries(catalog.storage_refs)
    .filter(([, v]) => v.disposition !== 'drop')
    .map(([k]) => k);
}

export function droppedStorageRefs(catalog: SourceCatalog): string[] {
  return Object.entries(catalog.storage_refs)
    .filter(([, v]) => v.disposition === 'drop')
    .map(([k]) => k);
}

export function collectStorageLegacyIdsByRef(
  catalog: SourceCatalog,
  exp: ConvexExport
): Record<string, string[]> {
  const idsByRef: Record<string, string[]> = {};
  for (const ref of Object.keys(catalog.storage_refs)) {
    const [table, field] = ref.split('.');
    if (!table || !field) {
      throw new Error(`invalid catalog storage ref: ${ref}`);
    }
    const exportTable = exp.tables[table];
    idsByRef[ref] = [...new Set(exportTable?.storageIdsByField[field] ?? [])].sort();
  }
  return idsByRef;
}

function registerCatalogStorageLegacyId(
  map: Map<string, CatalogStorageLegacyId>,
  legacyId: string,
  next: CatalogStorageLegacyId
): void {
  const current = map.get(legacyId);
  if (
    current &&
    (current.sourceRef !== next.sourceRef ||
      current.retention !== next.retention ||
      current.disposition !== next.disposition)
  ) {
    throw new Error(
      `catalog storage blob ${legacyId} is mapped to multiple storage refs: ${current.sourceRef} and ${next.sourceRef}`
    );
  }
  map.set(legacyId, next);
}

export function collectCatalogStorageLegacyIds(
  catalog: SourceCatalog,
  exp: ConvexExport
): Map<string, CatalogStorageLegacyId> {
  const idsByRef = collectStorageLegacyIdsByRef(catalog, exp);
  const map = new Map<string, CatalogStorageLegacyId>();
  for (const [ref, entry] of Object.entries(catalog.storage_refs)) {
    const retention = entry.disposition === 'drop' ? 'drop' : 'retain';
    for (const legacyId of idsByRef[ref] ?? []) {
      registerCatalogStorageLegacyId(map, legacyId, {
        sourceRef: ref,
        retention,
        disposition: entry.disposition,
      });
    }
  }
  return map;
}

/**
 * Collect legacy storage IDs referenced by retained storage-bearing table fields
 * in the export's documents.jsonl rows.
 */
export function collectRetainedStorageLegacyIds(
  catalog: SourceCatalog,
  exp: ConvexExport
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [legacyId, entry] of collectCatalogStorageLegacyIds(catalog, exp)) {
    if (entry.retention !== 'retain') continue;
    map.set(legacyId, entry.sourceRef);
  }
  return map;
}

export function collectDroppedStorageLegacyIds(
  catalog: SourceCatalog,
  exp: ConvexExport
): Set<string> {
  const droppedIds = new Set<string>();
  for (const [legacyId, entry] of collectCatalogStorageLegacyIds(catalog, exp)) {
    if (entry.retention === 'drop') {
      droppedIds.add(legacyId);
    }
  }
  return droppedIds;
}

export function buildAssetInventory(catalog: SourceCatalog, exp: ConvexExport): AssetInventory {
  const dropped = droppedStorageRefs(catalog);
  const retainedIds = collectRetainedStorageLegacyIds(catalog, exp);
  const accountedIds = collectCatalogStorageLegacyIds(catalog, exp);
  const droppedIds = collectDroppedStorageLegacyIds(catalog, exp);

  const objects: AssetRow[] = [];
  const blobById = new Map<string, ExportBlob>();
  for (const blob of exp.storageBlobs) blobById.set(blob.legacyId, blob);

  const seen = new Set<string>();

  for (const [legacyId, sourceRef] of retainedIds) {
    const blob = blobById.get(legacyId);
    if (!blob) {
      throw new Error(
        `catalog retained storage ref ${sourceRef} is missing required blob ${legacyId} in export _storage`
      );
    }
    if (seen.has(legacyId)) continue;
    seen.add(legacyId);
    const disposition = catalog.storage_refs[sourceRef]?.disposition ?? 'preserve';
    objects.push({
      legacy_id: legacyId,
      sha256: blob.sha256,
      bytes: blob.bytes,
      mime: blob.mime,
      target: contentAddressedTarget(blob.sha256),
      disposition,
      source_ref: sourceRef,
      retention: 'retain',
      path: blob.path,
    });
  }

  for (const blob of exp.storageBlobs) {
    const accounted = accountedIds.get(blob.legacyId);
    if (!accounted) {
      throw new Error(
        `catalog storage blob ${blob.legacyId} is not represented by an approved retained or dropped storage ref`
      );
    }
    if (seen.has(blob.legacyId) || droppedIds.has(blob.legacyId)) {
      continue;
    }
    throw new Error(
      `catalog retained storage blob ${blob.legacyId} was not emitted for ${accounted.sourceRef}`
    );
  }

  return {
    objects: objects.sort((a, b) => a.legacy_id.localeCompare(b.legacy_id)),
    retained_count: objects.length,
    dropped_storage_refs: dropped,
    ok: true,
  };
}

export function formatAssetsText(inv: AssetInventory): string {
  const lines: string[] = [
    '# catalog:assets',
    `retained_objects: ${inv.retained_count}`,
    `dropped_storage_refs: ${inv.dropped_storage_refs.join(', ') || '(none)'}`,
    '',
  ];
  for (const object of inv.objects) {
    lines.push(
      `${object.legacy_id} sha256=${object.sha256} bytes=${object.bytes} mime=${object.mime} target=${object.target} disposition=${object.disposition} ref=${object.source_ref ?? 'unknown'}`
    );
  }
  return lines.join('\n');
}
