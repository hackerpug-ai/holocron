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

/**
 * Collect legacy storage IDs referenced by retained storage-bearing table fields
 * in the export's documents.jsonl rows.
 */
function retainedLegacyIdsFromExport(
  catalog: SourceCatalog,
  exp: ConvexExport
): Map<string, string> {
  const map = new Map<string, string>(); // legacyId -> source_ref
  for (const [ref, entry] of Object.entries(catalog.storage_refs)) {
    if (entry.disposition === 'drop') continue;
    const [table, field] = ref.split('.');
    const exportTable = exp.tables[table];
    if (!exportTable) continue;
    const ids = exportTable.storageIdsByField[field] ?? [];
    for (const id of ids) {
      map.set(id, ref);
    }
  }
  return map;
}

export function buildAssetInventory(catalog: SourceCatalog, exp: ConvexExport): AssetInventory {
  const dropped = droppedStorageRefs(catalog);
  const retainedIds = retainedLegacyIdsFromExport(catalog, exp);

  // Also map drop-disposition field refs so we can exclude temporary blobs
  const droppedIds = new Set<string>();
  for (const ref of dropped) {
    const [table, field] = ref.split('.');
    const exportTable = exp.tables[table];
    if (!exportTable) continue;
    for (const id of exportTable.storageIdsByField[field] ?? []) {
      droppedIds.add(id);
    }
  }

  const objects: AssetRow[] = [];
  const blobById = new Map<string, ExportBlob>();
  for (const b of exp.storageBlobs) blobById.set(b.legacyId, b);

  // Prefer inventory of blobs that are retained via catalog field refs.
  // If a retained ref points at a blob, include it. Also include any blob that
  // is not exclusively referenced by a dropped field.
  const seen = new Set<string>();

  for (const [legacyId, sourceRef] of retainedIds) {
    const blob = blobById.get(legacyId);
    if (!blob) continue;
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

  // Include remaining blobs not marked dropped (content-addressed inventory completeness)
  for (const blob of exp.storageBlobs) {
    if (seen.has(blob.legacyId)) continue;
    if (droppedIds.has(blob.legacyId)) {
      // temporary/deleted — exclude from retained inventory but record nothing
      continue;
    }
    // Unreferenced non-dropped blob — still inventory as retain with unknown ref
    seen.add(blob.legacyId);
    objects.push({
      legacy_id: blob.legacyId,
      sha256: blob.sha256,
      bytes: blob.bytes,
      mime: blob.mime,
      target: contentAddressedTarget(blob.sha256),
      disposition: 'preserve',
      source_ref: null,
      retention: 'retain',
      path: blob.path,
    });
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
  for (const o of inv.objects) {
    lines.push(
      `${o.legacy_id} sha256=${o.sha256} bytes=${o.bytes} mime=${o.mime} target=${o.target} disposition=${o.disposition} ref=${o.source_ref ?? 'unknown'}`
    );
  }
  return lines.join('\n');
}
