/** Sprint 14 retained-manifest verification + representative Range read probe. */
import { readFileSync } from 'node:fs';
import { loadLatestRunContext } from '../etl/latest-run.ts';
import { createHonoApp } from '../http/hono-app.ts';
import { BlobStore, defaultBlobRoot } from './store.ts';
import { sha256Hex } from './utils.ts';

export interface BlobVerifyObject {
  legacyId: string;
  ok: boolean;
  blobId: string;
  fileObjectId: string | null;
  expectedSha256: string;
  actualSha256: string | null;
  expectedBytes: number;
  actualBytes: number | null;
  expectedMime: string;
  actualMime: string | null;
}

export interface BlobVerifyReport {
  ok: boolean;
  retainedCount: number;
  parityFailures: number;
  objects: BlobVerifyObject[];
  rangeProbe: {
    status: number;
    exact: boolean;
    contentRange: string | null;
  };
}

export async function runBlobVerify(options?: {
  databaseUrl?: string;
  exportDir?: string | null;
  catalogPath?: string;
  blobRoot?: string;
}): Promise<BlobVerifyReport> {
  const ctx = await loadLatestRunContext({
    databaseUrl: options?.databaseUrl,
    exportDir: options?.exportDir,
    catalogPath: options?.catalogPath,
  });
  const { sql, archive } = ctx;
  const store = new BlobStore(options?.blobRoot ?? defaultBlobRoot());
  try {
    const objects: BlobVerifyObject[] = [];
    for (const object of archive.assetInventory.objects) {
      const rows = await sql<
        Array<{
          id: string;
          content_hash: string | null;
          mime_type: string | null;
          byte_size: number | null;
          storage_path: string | null;
        }>
      >`
        SELECT id::text AS id, content_hash, mime_type, byte_size, storage_path
        FROM file_objects
        WHERE legacy_convex_id = ${object.legacy_id}
           OR content_hash = ${object.sha256}
      `;
      const row = rows[0] ?? null;
      let actualSha256: string | null = null;
      let actualBytes: number | null = null;
      let actualMime: string | null = null;
      const fileObjectId: string | null = row?.id ?? null;

      if (row?.content_hash && store.exists(row.content_hash)) {
        const bytes = readFileSync(store.resolvePath(row.content_hash));
        actualSha256 = sha256Hex(bytes);
        actualBytes = bytes.length;
        actualMime = row.mime_type ?? null;
      }

      const ok =
        actualSha256 === object.sha256 &&
        actualBytes === object.bytes &&
        (row?.mime_type ?? null) === object.mime &&
        row?.storage_path != null;

      objects.push({
        legacyId: object.legacy_id,
        ok,
        blobId: object.sha256,
        fileObjectId,
        expectedSha256: object.sha256,
        actualSha256,
        expectedBytes: object.bytes,
        actualBytes,
        expectedMime: object.mime,
        actualMime,
      });
    }

    const sample = archive.assetInventory.objects[0] ?? null;
    let rangeProbe: BlobVerifyReport['rangeProbe'] = {
      status: 0,
      exact: false,
      contentRange: null,
    };
    if (sample) {
      const app = createHonoApp({
        keys: {
          rn: process.env.HOLO_KEY_RN ?? process.env.RN_API_KEY ?? 'rn-test',
          mcp: process.env.HOLO_KEY_MCP ?? process.env.MCP_API_KEY ?? 'mcp-test',
          control: process.env.HOLO_KEY_CONTROL ?? process.env.CONTROL_API_KEY ?? 'ctl-test',
        },
      });
      const full = await app.request(`/blobs/${sample.sha256}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.HOLO_KEY_RN ?? process.env.RN_API_KEY ?? 'rn-test'}`,
        },
      });
      const fullBytes = Buffer.from(await full.arrayBuffer());
      const range = await app.request(`/blobs/${sample.sha256}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.HOLO_KEY_RN ?? process.env.RN_API_KEY ?? 'rn-test'}`,
          Range: 'bytes=0-7',
        },
      });
      const rangeBytes = Buffer.from(await range.arrayBuffer());
      rangeProbe = {
        status: range.status,
        exact:
          full.status === 200 &&
          sha256Hex(fullBytes) === sample.sha256 &&
          rangeBytes.equals(fullBytes.subarray(0, 8)),
        contentRange: range.headers.get('content-range'),
      };
    }

    const parityFailures = objects.filter((object) => !object.ok).length;
    return {
      ok: parityFailures === 0 && rangeProbe.status === 206 && rangeProbe.exact,
      retainedCount: objects.length,
      parityFailures,
      objects,
      rangeProbe,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
