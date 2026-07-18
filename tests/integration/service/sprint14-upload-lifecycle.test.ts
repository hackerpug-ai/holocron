/**
 * Sprint 14 — authoritative upload init/PUT/finalize + blob route Range reads.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/sprint14-upload-lifecycle.test.ts
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../../services/platform/src/db/client';
import {
  DANGEROUS_PROD_DB_OVERRIDE_ENV,
  resolveHolocronNonprodDatabaseUrl,
} from '../../../services/platform/src/db/connection';
import {
  DEFAULT_KEYS,
  type LiveService,
  PLATFORM_IT,
  requireService,
  startLiveService,
} from './harness';

const itLive = PLATFORM_IT ? it : it.skip;
const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const HOLO = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EXPORT_FIXTURE = resolve(REPO_ROOT, 'services/platform/tests/fixtures/etl-valid-export');
const CATALOG = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml'
);
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/sprint-14-impl');
const BLOB_ROOT = resolve(EVIDENCE_DIR, 'upload-blob-store');
const IMAGE_PATH = resolve(EVIDENCE_DIR, 'upload-image.png');
const VOICE_PATH = resolve(EVIDENCE_DIR, 'upload-voice.mp3');
const DATABASE_URL = requireNonprodDatabaseUrl(
  process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod'
);

function requireNonprodDatabaseUrl(url: string): string {
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (databaseName !== 'holocron_nonprod') {
    throw new Error(
      `Sprint 14 upload lifecycle tests must target holocron_nonprod (got ${databaseName || '(empty)'})`
    );
  }
  return url;
}

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function runHolo(
  args: string[],
  env: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string } {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL,
    HOLO_BLOB_ROOT: BLOB_ROOT,
    ...env,
  };
  delete childEnv.DATABASE_URL_OWNER;
  const result = spawnSync('bun', [HOLO, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: childEnv,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function toBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function requireSql(client: Sql | null): Sql {
  if (!client) {
    throw new Error('Sprint 14 upload lifecycle SQL client was not initialized');
  }
  return client;
}

async function postJson(baseUrl: string, path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${DEFAULT_KEYS.rn}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    text,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

async function putFile(baseUrl: string, uploadId: string, bytes: Buffer) {
  const res = await fetch(`${baseUrl}/api/uploads/${uploadId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${DEFAULT_KEYS.rn}`,
      'content-type': 'application/octet-stream',
    },
    body: toBody(bytes),
  });
  const text = await res.text();
  return {
    status: res.status,
    text,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

async function getBlob(baseUrl: string, blobId: string, range?: string) {
  const res = await fetch(`${baseUrl}/blobs/${blobId}`, {
    headers: {
      Authorization: `Bearer ${DEFAULT_KEYS.rn}`,
      ...(range ? { Range: range } : {}),
    },
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  const text = bytes.toString('utf8');
  const contentType = res.headers.get('content-type') ?? '';
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    bytes,
    text,
    body:
      contentType.includes('application/json') && text
        ? (JSON.parse(text) as Record<string, unknown>)
        : null,
  };
}

describe('Sprint 14 upload lifecycle', () => {
  let service: LiveService | undefined;
  let sql: Sql | null = null;
  let improvementRequestId = '';
  let voiceSessionId = '';
  let imageBytes: Buffer;
  let voiceBytes: Buffer;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    rmSync(BLOB_ROOT, { recursive: true, force: true });

    const png = Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c6360600000000400010d0a2db40000000049454e44ae426082',
      'hex'
    );
    const mp3 = Buffer.concat([
      Buffer.from('49443304000000000021', 'hex'),
      Buffer.from('sprint-14-upload-voice'),
    ]);
    imageBytes = png;
    voiceBytes = mp3;
    writeFileSync(IMAGE_PATH, imageBytes);
    writeFileSync(VOICE_PATH, voiceBytes);

    const migrateEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL };
    delete migrateEnv.DATABASE_URL_OWNER;
    const migrate = spawnSync(
      'bun',
      ['services/platform/src/cli/holo.ts', 'db:migrate', '--json'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: migrateEnv,
      }
    );
    const migrateStdout = migrate.stdout ?? '';
    const migrateStderr = migrate.stderr ?? '';
    expect(migrate.status, `${migrateStdout}\n${migrateStderr}`).toBe(0);
    writeArtifact('upload-db-migrate.json', JSON.parse(migrateStdout));

    sql = createSql(DATABASE_URL);
    await sql.unsafe(`
      TRUNCATE TABLE
        upload_intents,
        file_objects,
        improvement_images,
        improvement_requests,
        voice_commands,
        voice_sessions,
        conversations
      RESTART IDENTITY CASCADE
    `);

    const conversation = await sql<{ id: string }[]>`
      INSERT INTO conversations (title)
      VALUES ('Upload fixture conversation')
      RETURNING id::text AS id
    `;
    const improvements = await sql<{ id: string }[]>`
      INSERT INTO improvement_requests (title, description, status)
      VALUES ('Upload fixture request', 'Seeded improvement request', 'in_progress')
      RETURNING id::text AS id
    `;
    const voices = await sql<{ id: string }[]>`
      INSERT INTO voice_sessions (conversation_id, metadata)
      VALUES (${conversation[0]?.id ?? null}, ${sql.json({ seeded: true })})
      RETURNING id::text AS id
    `;

    improvementRequestId = improvements[0]?.id ?? '';
    voiceSessionId = voices[0]?.id ?? '';
    expect(improvementRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(voiceSessionId).toMatch(/^[0-9a-f-]{36}$/i);

    service = await startLiveService({
      databaseUrl: DATABASE_URL,
      extraEnv: {
        HOLO_BLOB_ROOT: BLOB_ROOT,
      },
      readyTimeoutMs: 30_000,
    });
  }, 180_000);

  afterAll(async () => {
    await service?.stop();
    await sql?.end({ timeout: 5 }).catch(() => {});
  });

  it('runtime resolver ignores DATABASE_URL_OWNER and rejects production-like DATABASE_URL', () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousOwnerUrl = process.env.DATABASE_URL_OWNER;
    const previousDangerous = process.env[DANGEROUS_PROD_DB_OVERRIDE_ENV];

    process.env.DATABASE_URL = 'postgres://127.0.0.1:5432/holocron_nonprod';
    process.env.DATABASE_URL_OWNER = 'postgres://127.0.0.1:5432/holocron';
    delete process.env[DANGEROUS_PROD_DB_OVERRIDE_ENV];

    expect(resolveHolocronNonprodDatabaseUrl({ context: 'sprint14-upload-test' })).toContain(
      '/holocron_nonprod'
    );

    process.env.DATABASE_URL = 'postgres://127.0.0.1:5432/holocron';
    expect(() => resolveHolocronNonprodDatabaseUrl({ context: 'sprint14-upload-test' })).toThrow(
      /holocron_nonprod|production-like|non-nonprod/i
    );

    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousOwnerUrl === undefined) delete process.env.DATABASE_URL_OWNER;
    else process.env.DATABASE_URL_OWNER = previousOwnerUrl;
    if (previousDangerous === undefined) delete process.env[DANGEROUS_PROD_DB_OVERRIDE_ENV];
    else process.env[DANGEROUS_PROD_DB_OVERRIDE_ENV] = previousDangerous;
  });

  itLive(
    'ETL then image upload of identical bytes reuses the same file object id and serves exact Range bytes',
    async () => {
      const db = requireSql(sql);
      const svc = requireService(service);
      const etl = runHolo(['etl:run', '--export', EXPORT_FIXTURE, '--catalog', CATALOG, '--json']);
      expect(etl.status, `${etl.stdout}\n${etl.stderr}`).toBe(0);

      const etlAttachmentRows = await db<
        Array<{
          blob_id: string | null;
          file_object_id: string | null;
        }>
      >`
        SELECT blob_id, file_object_id
        FROM improvement_images
        WHERE legacy_convex_id = 'improvement_image_legacy_1'
      `;
      expect(etlAttachmentRows).toHaveLength(1);

      const etlFileObjectRows = await db<
        Array<{
          id: string;
          legacy_convex_id: string | null;
          metadata_json: string | null;
        }>
      >`
        SELECT id::text AS id, legacy_convex_id, metadata_json::text AS metadata_json
        FROM file_objects
        WHERE legacy_convex_id = 'storage_improvementImages_storageId'
      `;
      expect(etlFileObjectRows).toHaveLength(1);
      const etlFileObjectId = String(etlFileObjectRows[0]?.id ?? '');
      expect(etlFileObjectId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(etlAttachmentRows[0]?.blob_id).toBe(sha256(imageBytes));
      expect(etlAttachmentRows[0]?.file_object_id).toBe(etlFileObjectId);

      const initBody = {
        kind: 'improvement_image',
        targetId: improvementRequestId,
        idempotencyKey: 'upload-image-key-1',
        sha256: sha256(imageBytes),
        byteLength: imageBytes.length,
        mimeType: 'image/png',
        originalName: 'upload-image.png',
      };

      const init = await postJson(svc.baseUrl, '/api/uploads', initBody);
      expect(init.status, init.text).toBe(200);
      const uploadId = String(init.body?.uploadId ?? '');
      expect(uploadId).toMatch(/^[0-9a-f-]{36}$/i);

      const replay = await postJson(svc.baseUrl, '/api/uploads', initBody);
      expect(replay.status, replay.text).toBe(200);
      expect(replay.body?.uploadId).toBe(uploadId);

      const put = await putFile(svc.baseUrl, uploadId, imageBytes);
      expect(put.status, put.text).toBe(200);
      expect(put.body?.attached).toBe(false);

      const finalize = await postJson(svc.baseUrl, `/api/uploads/${uploadId}/finalize`, {});
      expect(finalize.status, finalize.text).toBe(200);
      expect(finalize.body?.ok).toBe(true);
      const blobId = String(finalize.body?.blobId ?? '');
      const fileObjectId = String(finalize.body?.fileObjectId ?? '');
      expect(blobId).toMatch(/^[0-9a-f]{64}$/i);
      expect(fileObjectId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(fileObjectId).toBe(etlFileObjectId);

      const finalizeReplay = await postJson(svc.baseUrl, `/api/uploads/${uploadId}/finalize`, {});
      expect(finalizeReplay.status, finalizeReplay.text).toBe(200);
      expect(finalizeReplay.body?.blobId).toBe(blobId);
      expect(finalizeReplay.body?.fileObjectId).toBe(fileObjectId);

      const dbImage = await db<
        Array<{
          blob_id: string | null;
          file_object_id: string | null;
        }>
      >`
        SELECT blob_id, file_object_id
        FROM improvement_images
        WHERE request_id = ${improvementRequestId}
      `;
      expect(dbImage).toHaveLength(1);
      expect(dbImage[0]?.blob_id).toBe(blobId);
      expect(dbImage[0]?.file_object_id).toBe(fileObjectId);

      const objectRows = await db<
        Array<{
          id: string;
          legacy_convex_id: string | null;
          metadata_json: string | null;
          count: string;
        }>
      >`
        SELECT
          id::text AS id,
          legacy_convex_id,
          metadata_json::text AS metadata_json,
          count(*) OVER ()::text AS count
        FROM file_objects
        WHERE content_hash = ${blobId}
      `;
      expect(Number(objectRows[0]?.count ?? 0)).toBe(1);
      expect(objectRows[0]?.id).toBe(etlFileObjectId);
      expect(objectRows[0]?.legacy_convex_id).toBe('storage_improvementImages_storageId');

      const metadata = JSON.parse(objectRows[0]?.metadata_json ?? '{}') as {
        legacyIds?: string[];
        producers?: string[];
      };
      expect(metadata.legacyIds ?? []).toContain('storage_improvementImages_storageId');
      expect(metadata.producers ?? []).toEqual(expect.arrayContaining(['etl', 'upload']));

      const dangling = await db<Array<{ count: string }>>`
        SELECT count(*)::text AS count
        FROM improvement_images AS ii
        LEFT JOIN file_objects AS fo
          ON fo.id::text = ii.file_object_id
        WHERE ii.blob_id = ${blobId}
          AND fo.id IS NULL
      `;
      expect(Number(dangling[0]?.count ?? 0)).toBe(0);

      const full = await getBlob(svc.baseUrl, blobId);
      expect(full.status).toBe(200);
      expect(full.headers['accept-ranges']).toBe('bytes');
      expect(full.bytes.equals(imageBytes)).toBe(true);

      const range = await getBlob(svc.baseUrl, blobId, 'bytes=0-7');
      expect(range.status).toBe(206);
      expect(range.headers['content-range']).toBe(`bytes 0-7/${imageBytes.length}`);
      expect(range.bytes.equals(imageBytes.subarray(0, 8))).toBe(true);

      writeArtifact('upload-image-green.json', {
        uploadId,
        blobId,
        fileObjectId,
        etlFileObjectId,
        fullStatus: full.status,
        rangeStatus: range.status,
        contentRange: range.headers['content-range'],
      });
    },
    240_000
  );

  itLive(
    'blob route rejects malformed ids without masking valid missing blobs',
    async () => {
      const svc = requireService(service);

      const malformed = await getBlob(svc.baseUrl, 'not-a-sha');
      expect(malformed.status, malformed.text).toBe(422);
      expect(malformed.headers['content-type']).toMatch(/application\/json/i);
      expect(malformed.body).toEqual(
        expect.objectContaining({
          error: 'invalid_request',
          message: expect.stringMatching(/64 hex chars|not-a-sha/i),
        })
      );

      const missing = await getBlob(svc.baseUrl, '0'.repeat(64));
      expect(missing.status, missing.text).toBe(404);
      expect(missing.headers['content-type']).toMatch(/application\/json/i);
      expect(missing.body).toEqual(
        expect.objectContaining({
          error: 'not_found',
          message: expect.stringMatching(/blob not found/i),
        })
      );

      writeArtifact('blob-route-invalid-id.json', {
        malformed: {
          status: malformed.status,
          headers: malformed.headers,
          body: malformed.body,
        },
        missing: {
          status: missing.status,
          headers: missing.headers,
          body: missing.body,
        },
      });
    },
    60_000
  );

  itLive(
    'voice upload succeeds and finalizes without orphan rows or objects',
    async () => {
      const db = requireSql(sql);
      const svc = requireService(service);
      const init = await postJson(svc.baseUrl, '/api/uploads', {
        kind: 'voice_artifact',
        targetId: voiceSessionId,
        idempotencyKey: 'upload-voice-key-1',
        sha256: sha256(voiceBytes),
        byteLength: voiceBytes.length,
        mimeType: 'audio/mpeg',
        originalName: 'upload-voice.mp3',
      });
      expect(init.status, init.text).toBe(200);
      const uploadId = String(init.body?.uploadId ?? '');

      const put = await putFile(svc.baseUrl, uploadId, voiceBytes);
      expect(put.status, put.text).toBe(200);

      const finalize = await postJson(svc.baseUrl, `/api/uploads/${uploadId}/finalize`, {});
      expect(finalize.status, finalize.text).toBe(200);
      const blobId = String(finalize.body?.blobId ?? '');

      const dbVoice = await db<Array<{ blob_id: string | null }>>`
        SELECT blob_id
        FROM voice_sessions
        WHERE id = ${voiceSessionId}::uuid
      `;
      expect(dbVoice[0]?.blob_id).toBe(blobId);

      const intents = await db<Array<{ status: string; result_blob_id: string | null }>>`
        SELECT status, result_blob_id
        FROM upload_intents
        WHERE id = ${uploadId}::uuid
      `;
      expect(intents[0]?.status).toBe('finalized');
      expect(intents[0]?.result_blob_id).toBe(blobId);

      writeArtifact('upload-voice-green.json', {
        uploadId,
        blobId,
        voiceSessionId,
        intent: intents[0],
      });
    },
    120_000
  );

  itLive(
    'oversize/undersize PUTs, expired/finalized/rejected state fences, conflicting idempotency, and hash mismatch fail closed',
    async () => {
      const db = requireSql(sql);
      const svc = requireService(service);
      const key = 'upload-negative-key-1';

      const invalidTargetInit = await postJson(svc.baseUrl, '/api/uploads', {
        kind: 'improvement_image',
        targetId: 'not-a-uuid',
        idempotencyKey: 'upload-negative-invalid-target',
        sha256: sha256(imageBytes),
        byteLength: imageBytes.length,
        mimeType: 'image/png',
        originalName: 'invalid-target.png',
      });
      expect(invalidTargetInit.status, invalidTargetInit.text).toBe(422);
      expect(invalidTargetInit.text).toMatch(/uuid|targetId|invalid/i);

      const firstInit = await postJson(svc.baseUrl, '/api/uploads', {
        kind: 'improvement_image',
        targetId: improvementRequestId,
        idempotencyKey: key,
        sha256: sha256(imageBytes),
        byteLength: imageBytes.length,
        mimeType: 'image/png',
        originalName: 'negative.png',
      });
      expect(firstInit.status, firstInit.text).toBe(200);
      const uploadId = String(firstInit.body?.uploadId ?? '');

      const conflicting = await postJson(svc.baseUrl, '/api/uploads', {
        kind: 'improvement_image',
        targetId: improvementRequestId,
        idempotencyKey: key,
        sha256: sha256(voiceBytes),
        byteLength: voiceBytes.length,
        mimeType: 'audio/mpeg',
        originalName: 'conflict.mp3',
      });
      expect(conflicting.status, conflicting.text).toBe(409);

      const put = await putFile(svc.baseUrl, uploadId, imageBytes);
      expect(put.status, put.text).toBe(200);

      await db`
        UPDATE upload_intents
        SET expires_at = now() - interval '1 hour'
        WHERE id = ${uploadId}::uuid
      `;
      const expiredPut = await putFile(svc.baseUrl, uploadId, imageBytes);
      expect(expiredPut.status, expiredPut.text).toBe(410);

      const expiredFinalize = await postJson(svc.baseUrl, `/api/uploads/${uploadId}/finalize`, {});
      expect(expiredFinalize.status, expiredFinalize.text).toBe(410);

      const oversizeInit = await postJson(svc.baseUrl, '/api/uploads', {
        kind: 'improvement_image',
        targetId: improvementRequestId,
        idempotencyKey: 'upload-negative-oversize',
        sha256: sha256(imageBytes),
        byteLength: imageBytes.length - 1,
        mimeType: 'image/png',
        originalName: 'oversize.png',
      });
      expect(oversizeInit.status, oversizeInit.text).toBe(200);
      const oversizeId = String(oversizeInit.body?.uploadId ?? '');
      const oversizePut = await putFile(svc.baseUrl, oversizeId, imageBytes);
      expect(oversizePut.status, oversizePut.text).toBe(413);
      expect(oversizePut.text).toMatch(/Content-Length|declared byte length|exceeds/i);

      const undersizeInit = await postJson(svc.baseUrl, '/api/uploads', {
        kind: 'improvement_image',
        targetId: improvementRequestId,
        idempotencyKey: 'upload-negative-undersize',
        sha256: sha256(imageBytes),
        byteLength: imageBytes.length + 1,
        mimeType: 'image/png',
        originalName: 'undersize.png',
      });
      expect(undersizeInit.status, undersizeInit.text).toBe(200);
      const undersizeId = String(undersizeInit.body?.uploadId ?? '');
      const undersizePut = await putFile(svc.baseUrl, undersizeId, imageBytes);
      expect(undersizePut.status, undersizePut.text).toBe(422);
      expect(undersizePut.text).toMatch(/byte count|declared byte length|did not match/i);

      const finalizeInit = await postJson(svc.baseUrl, '/api/uploads', {
        kind: 'voice_artifact',
        targetId: voiceSessionId,
        idempotencyKey: 'upload-negative-post-finalize',
        sha256: sha256(voiceBytes),
        byteLength: voiceBytes.length,
        mimeType: 'audio/mpeg',
        originalName: 'voice-finalize.mp3',
      });
      expect(finalizeInit.status, finalizeInit.text).toBe(200);
      const finalizeId = String(finalizeInit.body?.uploadId ?? '');
      const finalizePut = await putFile(svc.baseUrl, finalizeId, voiceBytes);
      expect(finalizePut.status, finalizePut.text).toBe(200);
      const finalized = await postJson(svc.baseUrl, `/api/uploads/${finalizeId}/finalize`, {});
      expect(finalized.status, finalized.text).toBe(200);
      const postFinalizePut = await putFile(svc.baseUrl, finalizeId, voiceBytes);
      expect(postFinalizePut.status, postFinalizePut.text).toBe(409);
      expect(postFinalizePut.text).toMatch(/already finalized|not mutable/i);

      const mismatchInit = await postJson(svc.baseUrl, '/api/uploads', {
        kind: 'voice_artifact',
        targetId: voiceSessionId,
        idempotencyKey: 'upload-negative-key-2',
        sha256: '0'.repeat(64),
        byteLength: voiceBytes.length,
        mimeType: 'audio/mpeg',
        originalName: 'bad.mp3',
      });
      expect(mismatchInit.status, mismatchInit.text).toBe(200);
      const mismatchId = String(mismatchInit.body?.uploadId ?? '');
      const mismatchPut = await putFile(svc.baseUrl, mismatchId, voiceBytes);
      expect(mismatchPut.status, mismatchPut.text).toBe(200);
      const mismatchFinalize = await postJson(
        svc.baseUrl,
        `/api/uploads/${mismatchId}/finalize`,
        {}
      );
      expect(mismatchFinalize.status, mismatchFinalize.text).toBe(422);
      expect(mismatchFinalize.text).toMatch(/hash|length|mime|mismatch/i);

      const rejectedPut = await putFile(svc.baseUrl, mismatchId, voiceBytes);
      expect(rejectedPut.status, rejectedPut.text).toBe(409);
      expect(rejectedPut.text).toMatch(/already rejected|not mutable/i);

      const noOrphan = await db<Array<{ count: string }>>`
        SELECT count(*)::text AS count
        FROM file_objects
        WHERE content_hash = ${'0'.repeat(64)}
      `;
      expect(Number(noOrphan[0]?.count ?? 0)).toBe(0);

      writeArtifact('upload-negative-red.json', {
        invalidTargetStatus: invalidTargetInit.status,
        invalidTargetBody: invalidTargetInit.text,
        conflictingStatus: conflicting.status,
        expiredPutStatus: expiredPut.status,
        expiredFinalizeStatus: expiredFinalize.status,
        oversizePutStatus: oversizePut.status,
        undersizePutStatus: undersizePut.status,
        postFinalizePutStatus: postFinalizePut.status,
        mismatchStatus: mismatchFinalize.status,
        mismatchBody: mismatchFinalize.text,
        rejectedPutStatus: rejectedPut.status,
      });
    },
    180_000
  );
});
