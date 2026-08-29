/**
 * S-UPLOAD-01 — reactive Zero observation of a content-addressed file_objects row.
 *
 * After upload finalize, the sheet/hook observes the CAS row via useQuery so the
 * attach is Zero-visible (content_hash unique index).
 */

import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { fileObjectsByContentHash } from '@/app/zero/queries';

export type FileObjectRow = {
  id: string;
  content_hash: string;
  mime_type?: string | null;
  byte_size?: number | null;
  storage_path?: string | null;
  original_name?: string | null;
  created_at?: number;
};

/**
 * Subscribe to the Zero-synced file_objects row for a SHA-256 content hash.
 * Pass null/undefined to disable the query (pre-finalize / no attach).
 */
export function useFileObjectByContentHash(contentHash: string | null | undefined) {
  const normalized =
    typeof contentHash === 'string' && /^[0-9a-f]{64}$/i.test(contentHash)
      ? contentHash.toLowerCase()
      : null;
  const [row, details] = useZeroQuery(
    normalized ? fileObjectsByContentHash(normalized) : undefined,
    { enabled: Boolean(normalized) }
  );

  return {
    row: (row as FileObjectRow | undefined) ?? undefined,
    details,
    isComplete: details?.type === 'complete',
    contentHash: normalized,
  };
}
