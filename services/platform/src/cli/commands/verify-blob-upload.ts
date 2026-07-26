import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BlobStore, defaultBlobRoot } from '../../blob/store.ts';
import { sha256Hex } from '../../blob/utils.ts';
import { createSql } from '../../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../db/connection.ts';

type BlobVerifyOptions = { databaseUrl?: string; blobRoot?: string };

function resolveFixturePath(): string {
  return (
    process.env.HOLO_UPLOAD_FIXTURE_PATH ??
    resolve(process.cwd(), 'tests/fixtures/test-fixture.jpg')
  );
}

/** Read the seeded fixture SHA-256 from disk — never hard-code the digest. */
function fixtureSha256(): { path: string; sha256: string | null } {
  const path = resolveFixturePath();
  if (!existsSync(path)) return { path, sha256: null };
  return { path, sha256: sha256Hex(readFileSync(path)) };
}

/** Verify the post-upload CAS row and its bytes, never a hard-coded count/hash. */
export async function verifyLastUploadedBlob(options?: BlobVerifyOptions) {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'verify:blob --last',
  });
  const sql = createSql(databaseUrl);
  const store = new BlobStore(options?.blobRoot ?? defaultBlobRoot());
  try {
    const rows = await sql<
      Array<{
        id: string;
        content_hash: string;
        mime_type: string | null;
        byte_size: number | null;
        storage_path: string | null;
        created_at: string;
      }>
    >`
      SELECT id::text AS id, content_hash, mime_type, byte_size, storage_path, created_at::text AS created_at
      FROM file_objects
      ORDER BY created_at DESC, id DESC
    `;
    const row = rows[0];
    const fixture = fixtureSha256();
    const storedPath = row?.content_hash ? store.resolvePath(row.content_hash) : '';
    const bytes = row && existsSync(storedPath) ? readFileSync(storedPath) : null;
    const actualSha256 = bytes ? sha256Hex(bytes) : null;
    // Fail-closed: require exactly one row, CAS bytes match content_hash, and
    // content_hash matches the seeded fixture SHA-256 read from disk.
    const ok =
      rows.length === 1 &&
      row != null &&
      bytes != null &&
      fixture.sha256 != null &&
      row.content_hash === actualSha256 &&
      (row.byte_size == null || row.byte_size === bytes.byteLength) &&
      row.storage_path != null &&
      fixture.sha256 === row.content_hash;
    return {
      ok,
      rowCount: rows.length,
      fixtureSha256: fixture.sha256,
      fixturePath: fixture.path,
      fixtureChecked: fixture.sha256 != null,
      row: row
        ? {
            id: row.id,
            contentHash: row.content_hash,
            actualSha256,
            byteSize: row.byte_size,
            actualByteSize: bytes?.byteLength ?? null,
            mimeType: row.mime_type,
            storagePath: row.storage_path,
            createdAt: row.created_at,
          }
        : null,
      reason: !row
        ? 'file_objects is empty'
        : rows.length !== 1
          ? `expected exactly one file_objects row, found ${rows.length}`
          : fixture.sha256 == null
            ? `seeded fixture missing at ${fixture.path} (set HOLO_UPLOAD_FIXTURE_PATH)`
            : bytes == null
              ? 'content-addressed blob is missing from storage'
              : row.content_hash !== actualSha256
                ? 'stored bytes do not match content_hash'
                : fixture.sha256 !== row.content_hash
                  ? 'uploaded hash does not match seeded fixture'
                  : row.storage_path == null
                    ? 'storage_path is missing'
                    : null,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Verify that no non-finalized upload intent can represent an orphan. */
export async function verifyUploadOrphans(options?: BlobVerifyOptions) {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'verify:blob --orphans',
  });
  const sql = createSql(databaseUrl);
  try {
    const rows = await sql<
      Array<{
        id: string;
        kind: string;
        target_id: string;
        status: string;
        staged_path: string | null;
        created_at: string;
      }>
    >`
      SELECT id::text AS id, kind, target_id::text AS target_id, status, staged_path,
             created_at::text AS created_at
      FROM upload_intents
      WHERE status <> 'finalized'
      ORDER BY created_at ASC, id ASC
    `;
    return { ok: rows.length === 0, orphanCount: rows.length, orphans: rows };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
