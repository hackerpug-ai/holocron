/** Authoritative upload init/PUT/finalize service for Sprint 14. */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { open, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { upsertFileObject as upsertSharedFileObject } from '../blob/file-objects.ts';
import { BlobStore, defaultBlobRoot } from '../blob/store.ts';
import { detectMimeFromBuffer, isSha256Hex, sha256Hex } from '../blob/utils.ts';
import { createSql, type Sql, type TransactionSql, toSqlJsonValue } from '../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../db/connection.ts';
import { deterministicUuidV7 } from '../etl/deterministic-uuidv7.ts';

const UploadInitSchema = z.object({
  kind: z.enum(['improvement_image', 'voice_artifact']),
  targetId: z.string().uuid(),
  idempotencyKey: z.string().min(1),
  sha256: z.string().length(64),
  byteLength: z.number().int().positive().max(25_000_000),
  mimeType: z.string().min(1),
  originalName: z.string().min(1).optional(),
});

export type UploadInitInput = z.infer<typeof UploadInitSchema>;

type UploadByteChunk = Uint8Array | ArrayBuffer | Buffer;
type UploadByteSource =
  | ReadableStream<Uint8Array>
  | AsyncIterable<UploadByteChunk>
  | Iterable<UploadByteChunk>
  | null;

export class UploadServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UploadServiceError';
    this.status = status;
  }
}

function stagingRoot(blobRoot = defaultBlobRoot()): string {
  return resolve(blobRoot, '_staging');
}

type UploadIntentMutationRow = {
  declared_byte_length: number;
  status: string;
  expires_at: string | Date | null;
};

function assertUploadMutableState(uploadId: string, row: UploadIntentMutationRow): void {
  if (row.expires_at && new Date(String(row.expires_at)).valueOf() < Date.now()) {
    throw new UploadServiceError(410, `upload intent expired: ${uploadId}`);
  }
  if (row.status === 'finalized') {
    throw new UploadServiceError(409, `upload intent already finalized: ${uploadId}`);
  }
  if (row.status === 'rejected') {
    throw new UploadServiceError(409, `upload intent already rejected: ${uploadId}`);
  }
  if (!['initiated', 'uploaded'].includes(row.status)) {
    throw new UploadServiceError(
      409,
      `upload intent not mutable from status ${row.status}: ${uploadId}`
    );
  }
}

async function loadUploadIntentForPut(
  sql: Sql,
  uploadId: string
): Promise<UploadIntentMutationRow> {
  const rows = await sql<Array<UploadIntentMutationRow>>`
    SELECT declared_byte_length, status, expires_at
    FROM upload_intents
    WHERE id = ${uploadId}::uuid
  `;
  const row = rows[0];
  if (!row) {
    throw new UploadServiceError(404, `unknown upload id: ${uploadId}`);
  }
  assertUploadMutableState(uploadId, row);
  return row;
}

function parseContentLength(
  contentLength: string | number | null | undefined,
  uploadId: string
): number | null {
  if (contentLength == null || contentLength === '') {
    return null;
  }
  const parsed =
    typeof contentLength === 'number' ? contentLength : Number.parseInt(contentLength, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new UploadServiceError(400, `invalid Content-Length header for ${uploadId}`);
  }
  return parsed;
}

function toUint8Array(chunk: UploadByteChunk, uploadId: string): Uint8Array {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }
  throw new UploadServiceError(400, `unsupported upload chunk for ${uploadId}`);
}

async function* readUploadSource(
  source: UploadByteSource,
  uploadId: string
): AsyncGenerator<Uint8Array> {
  if (!source) {
    return;
  }

  if (typeof (source as ReadableStream<Uint8Array>).getReader === 'function') {
    const reader = (source as ReadableStream<Uint8Array>).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        yield toUint8Array(value, uploadId);
      }
    } finally {
      // Bun's server-side Request reader can throw on releaseLock() after EOF;
      // letting the reader fall out of scope is sufficient for this one-shot PUT.
    }
    return;
  }

  if (typeof (source as AsyncIterable<UploadByteChunk>)[Symbol.asyncIterator] === 'function') {
    for await (const chunk of source as AsyncIterable<UploadByteChunk>) {
      yield toUint8Array(chunk, uploadId);
    }
    return;
  }

  if (typeof (source as Iterable<UploadByteChunk>)[Symbol.iterator] === 'function') {
    for (const chunk of source as Iterable<UploadByteChunk>) {
      yield toUint8Array(chunk, uploadId);
    }
    return;
  }

  throw new UploadServiceError(400, `unsupported upload body for ${uploadId}`);
}

async function persistUploadedStaging(
  sql: Sql,
  uploadId: string,
  stagedPath: string,
  stagedByteLength: number
): Promise<void> {
  const rows = await sql<Array<UploadIntentMutationRow>>`
    UPDATE upload_intents
    SET staged_path = ${stagedPath},
        staged_byte_length = ${stagedByteLength},
        status = 'uploaded',
        updated_at = now()
    WHERE id = ${uploadId}::uuid
      AND status IN ('initiated', 'uploaded')
      AND (expires_at IS NULL OR expires_at >= now())
    RETURNING declared_byte_length, status, expires_at
  `;
  if (rows[0]) {
    return;
  }
  await loadUploadIntentForPut(sql, uploadId);
  throw new UploadServiceError(409, `upload intent state changed during PUT: ${uploadId}`);
}

export async function prepareUploadPut(
  uploadId: string,
  options?: { databaseUrl?: string }
): Promise<{ ok: true; uploadId: string; declaredByteLength: number; status: string }> {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'upload:put',
  });
  const sql = createSql(databaseUrl);
  try {
    const row = await loadUploadIntentForPut(sql, uploadId);
    return {
      ok: true,
      uploadId,
      declaredByteLength: row.declared_byte_length,
      status: row.status,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function ensureTargetExists(sql: Sql, kind: UploadInitInput['kind'], targetId: string) {
  const table = kind === 'improvement_image' ? 'improvement_requests' : 'voice_sessions';
  const rows = await sql.unsafe<Array<{ id: string }>>(
    `SELECT id::text AS id FROM "${table}" WHERE "id" = $1::uuid`,
    [targetId]
  );
  if (!rows[0]?.id) {
    throw new UploadServiceError(404, `upload target not found: ${kind}:${targetId}`);
  }
}

function normalizedIntent(body: UploadInitInput) {
  return {
    kind: body.kind,
    targetId: body.targetId,
    idempotencyKey: body.idempotencyKey,
    sha256: body.sha256.toLowerCase(),
    byteLength: body.byteLength,
    mimeType: body.mimeType,
    originalName: body.originalName ?? null,
  };
}

export async function initUploadIntent(input: unknown, options?: { databaseUrl?: string }) {
  const body = UploadInitSchema.parse(input);
  if (!isSha256Hex(body.sha256)) {
    throw new UploadServiceError(422, 'declared sha256 must be 64 hex chars');
  }
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'upload:init',
  });
  const sql = createSql(databaseUrl);
  try {
    await ensureTargetExists(sql, body.kind, body.targetId);
    const normalized = normalizedIntent(body);
    const existing = await sql<Array<Record<string, unknown>>>`
      SELECT id::text AS id, kind, target_id, idempotency_key, declared_sha256, declared_byte_length,
             declared_mime_type, original_name, status, result_json
      FROM upload_intents
      WHERE idempotency_key = ${body.idempotencyKey}
    `;
    const row = existing[0];
    if (row) {
      const same =
        row.kind === normalized.kind &&
        row.target_id === normalized.targetId &&
        row.idempotency_key === normalized.idempotencyKey &&
        row.declared_sha256 === normalized.sha256 &&
        row.declared_byte_length === normalized.byteLength &&
        row.declared_mime_type === normalized.mimeType &&
        (row.original_name ?? null) === normalized.originalName;
      if (!same) {
        throw new UploadServiceError(409, `idempotency key conflict: ${body.idempotencyKey}`);
      }
      return {
        ok: true,
        uploadId: String(row.id),
        status: String(row.status),
        replay: true,
      };
    }

    const inserted = await sql<{ id: string; status: string }[]>`
      INSERT INTO upload_intents (
        idempotency_key,
        kind,
        target_id,
        declared_sha256,
        declared_byte_length,
        declared_mime_type,
        original_name,
        status,
        expires_at
      )
      VALUES (
        ${normalized.idempotencyKey},
        ${normalized.kind},
        ${normalized.targetId},
        ${normalized.sha256},
        ${normalized.byteLength},
        ${normalized.mimeType},
        ${normalized.originalName},
        'initiated',
        now() + interval '1 hour'
      )
      RETURNING id::text AS id, status
    `;
    return {
      ok: true,
      uploadId: inserted[0]?.id ?? '',
      status: inserted[0]?.status ?? 'initiated',
      replay: false,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function putUploadStream(
  uploadId: string,
  source: UploadByteSource,
  options?: {
    databaseUrl?: string;
    blobRoot?: string;
    contentLength?: string | number | null;
  }
) {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'upload:put',
  });
  const sql = createSql(databaseUrl);
  const parsedContentLength = parseContentLength(options?.contentLength, uploadId);
  try {
    const row = await loadUploadIntentForPut(sql, uploadId);
    if (parsedContentLength != null && parsedContentLength > row.declared_byte_length) {
      throw new UploadServiceError(
        413,
        `upload exceeds declared byte length ${row.declared_byte_length} via Content-Length ${parsedContentLength}`
      );
    }

    const root = stagingRoot(options?.blobRoot ?? defaultBlobRoot());
    mkdirSync(root, { recursive: true });
    const finalPath = join(root, `${uploadId}.upload`);
    const tempPath = join(root, `.${uploadId}.${process.pid}.${Date.now()}.upload.tmp`);
    const file = await open(tempPath, 'wx');
    let total = 0;

    try {
      for await (const chunk of readUploadSource(source, uploadId)) {
        total += chunk.byteLength;
        if (total > row.declared_byte_length) {
          throw new UploadServiceError(
            413,
            `upload exceeds declared byte length ${row.declared_byte_length}`
          );
        }
        await file.write(chunk);
      }
      if (typeof (file as { sync?: () => Promise<void> }).sync === 'function') {
        await (file as { sync: () => Promise<void> }).sync();
      } else if (typeof (file as { datasync?: () => Promise<void> }).datasync === 'function') {
        await (file as { datasync: () => Promise<void> }).datasync();
      }
    } catch (error) {
      await file.close().catch(() => undefined);
      rmSync(tempPath, { force: true });
      throw error;
    }

    await file.close().catch(() => undefined);

    if (parsedContentLength != null && total !== parsedContentLength) {
      rmSync(tempPath, { force: true });
      throw new UploadServiceError(
        400,
        `upload Content-Length ${parsedContentLength} did not match received bytes ${total}`
      );
    }
    if (total !== row.declared_byte_length) {
      rmSync(tempPath, { force: true });
      throw new UploadServiceError(
        422,
        `upload byte count ${total} did not match declared byte length ${row.declared_byte_length}`
      );
    }

    await rename(tempPath, finalPath);
    const stagedSize = statSync(finalPath).size;
    if (stagedSize !== total) {
      rmSync(finalPath, { force: true });
      throw new UploadServiceError(
        500,
        `upload staging byte count mismatch for ${uploadId}: expected ${total}, got ${stagedSize}`
      );
    }

    try {
      await persistUploadedStaging(sql, uploadId, finalPath, total);
    } catch (error) {
      rmSync(finalPath, { force: true });
      throw error;
    }

    return {
      ok: true,
      uploadId,
      stagedByteLength: total,
      attached: false,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function putUploadBytes(
  uploadId: string,
  bytes: Buffer,
  options?: { databaseUrl?: string; blobRoot?: string }
) {
  return putUploadStream(uploadId, [bytes], {
    databaseUrl: options?.databaseUrl,
    blobRoot: options?.blobRoot,
    contentLength: bytes.length,
  });
}

async function attachUpload(
  sql: Sql | TransactionSql,
  kind: string,
  targetId: string,
  blobId: string,
  fileObjectId: string
) {
  if (kind === 'improvement_image') {
    const attachmentId = deterministicUuidV7(0, `improvement-image:${targetId}:${blobId}`);
    await sql`
      INSERT INTO improvement_images (id, request_id, blob_id, file_object_id, caption)
      VALUES (${attachmentId}::uuid, ${targetId}::uuid, ${blobId}, ${fileObjectId}::uuid, NULL)
      ON CONFLICT (id) DO UPDATE
        SET blob_id = EXCLUDED.blob_id,
            file_object_id = EXCLUDED.file_object_id
    `;
    return attachmentId;
  }
  if (kind === 'voice_artifact') {
    await sql`
      UPDATE voice_sessions
      SET blob_id = ${blobId}, updated_at = now()
      WHERE id = ${targetId}::uuid
    `;
    return targetId;
  }
  throw new UploadServiceError(422, `unsupported upload kind: ${kind}`);
}

export async function finalizeUploadIntent(
  uploadId: string,
  options?: { databaseUrl?: string; blobRoot?: string }
) {
  const databaseUrl = resolveHolocronNonprodDatabaseUrl({
    databaseUrl: options?.databaseUrl,
    context: 'upload:finalize',
  });
  const sql = createSql(databaseUrl);
  const store = new BlobStore(options?.blobRoot ?? defaultBlobRoot());
  try {
    const rows = await sql<Array<Record<string, unknown>>>`
      SELECT id::text AS id,
             kind,
             target_id,
             declared_sha256,
             declared_byte_length,
             declared_mime_type,
             staged_path,
             status,
             result_json,
             expires_at
      FROM upload_intents
      WHERE id = ${uploadId}::uuid
    `;
    const row = rows[0];
    if (!row) {
      throw new UploadServiceError(404, `unknown upload id: ${uploadId}`);
    }
    if (row.status === 'finalized' && row.result_json) {
      return row.result_json;
    }
    if (row.expires_at && new Date(String(row.expires_at)).valueOf() < Date.now()) {
      throw new UploadServiceError(410, `upload intent expired: ${uploadId}`);
    }
    if (row.status === 'rejected') {
      throw new UploadServiceError(409, `upload intent already rejected: ${uploadId}`);
    }

    const stagedPath = String(row.staged_path ?? '');
    if (!stagedPath || !existsSync(stagedPath)) {
      throw new UploadServiceError(409, `upload bytes missing for ${uploadId}`);
    }

    const bytes = readFileSync(stagedPath);
    const actualSha256 = sha256Hex(bytes);
    const actualByteLength = bytes.length;
    const actualMimeType = detectMimeFromBuffer(bytes, stagedPath);
    if (
      actualSha256 !== String(row.declared_sha256) ||
      actualByteLength !== Number(row.declared_byte_length) ||
      actualMimeType !== String(row.declared_mime_type)
    ) {
      rmSync(stagedPath, { force: true });
      await sql`
        UPDATE upload_intents
        SET actual_sha256 = ${actualSha256},
            actual_byte_length = ${actualByteLength},
            actual_mime_type = ${actualMimeType},
            status = 'rejected',
            error_reason = ${`hash/length/mime mismatch for ${uploadId}`},
            updated_at = now()
        WHERE id = ${uploadId}::uuid
      `;
      throw new UploadServiceError(422, `hash/length/mime mismatch for ${uploadId}`);
    }

    const stored = await store.put(bytes, {
      expectedSha256: actualSha256,
      expectedByteLength: actualByteLength,
      expectedMimeType: actualMimeType,
      filename: stagedPath,
    });

    const result = await sql
      .begin(async (tx) => {
        const fileObject = await upsertSharedFileObject(tx, {
          contentHash: stored.sha256,
          mimeType: stored.mimeType,
          byteSize: stored.byteLength,
          storagePath: stored.relativePath,
          metadata: {
            source: 'upload',
            producers: ['upload'],
          },
        });
        const fileObjectId = fileObject.id;
        const kind = row.kind;
        const targetId = row.target_id;
        if (
          (kind !== 'improvement_image' && kind !== 'voice_artifact') ||
          typeof targetId !== 'string'
        ) {
          throw new UploadServiceError(422, `invalid persisted upload target for ${uploadId}`);
        }
        const attachmentId = await attachUpload(tx, kind, targetId, stored.sha256, fileObjectId);
        const payload = {
          ok: true,
          uploadId,
          kind: row.kind,
          targetId: row.target_id,
          blobId: stored.sha256,
          fileObjectId,
          attachmentId,
        };
        await tx`
        UPDATE upload_intents
        SET actual_sha256 = ${actualSha256},
            actual_byte_length = ${actualByteLength},
            actual_mime_type = ${actualMimeType},
            result_blob_id = ${stored.sha256},
            result_file_object_id = ${fileObjectId},
            result_json = ${tx.json(toSqlJsonValue(payload))},
            status = 'finalized',
            finalized_at = now(),
            updated_at = now()
        WHERE id = ${uploadId}::uuid
      `;
        return payload;
      })
      .catch(async (error) => {
        if (stored.created) {
          store.delete(stored.sha256);
        }
        throw error;
      });

    rmSync(stagedPath, { force: true });
    return result;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
