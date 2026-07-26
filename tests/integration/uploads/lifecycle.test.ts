/**
 * S-UPLOAD-01 AC-1 [PRIMARY] — image upload attaches idempotently with SHA-256 verification.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/lifecycle.test.ts
 *
 * Exercises the client upload lifecycle (hooks/use-image-upload) against real
 * Hono + Postgres + blob store. NEVER mocks file_objects or upload endpoints.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  configureClientEnv,
  countFileObjects,
  DATABASE_URL,
  E2E_IMPROVEMENT_OPEN_ID,
  EVIDENCE_DIR,
  ensureFixtureJpg,
  fileObjectsByHash,
  itLive,
  type LiveService,
  openSql,
  PLATFORM_IT,
  requireService,
  type Sql,
  seedClearedFileObjects,
  startUploadService,
  writeArtifact,
} from './_helpers';

describe('S-UPLOAD-01 AC-1: image upload lifecycle (content-addressed)', () => {
  let service: LiveService | undefined;
  let sql: Sql | null = null;
  let fixtureHash = '';
  let fixtureBytes: Buffer;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const fixture = ensureFixtureJpg();
    fixtureHash = fixture.contentHash;
    fixtureBytes = fixture.bytes;
    expect(fixtureHash).toMatch(/^[0-9a-f]{64}$/);

    await seedClearedFileObjects();
    sql = openSql();
    const startCount = await countFileObjects(sql);
    expect(startCount, 'start_ref cleared_file_objects').toBe(0);

    service = await startUploadService();
    configureClientEnv(service.baseUrl);
  }, 180_000);

  afterAll(async () => {
    await service?.stop();
    await sql?.end({ timeout: 5 }).catch(() => {});
  });

  it('refuses skip-to-green without PLATFORM_IT=1', () => {
    if (PLATFORM_IT) {
      expect(DATABASE_URL).toContain('holocron_nonprod');
      return;
    }
    expect.fail(
      'PLATFORM_IT=1 required for S-UPLOAD-01 lifecycle — refusing skip-to-green against mocked stores'
    );
  });

  itLive(
    'upload-init → PUT → finalize creates exactly one file_objects row matching fixture SHA-256 and reaches success',
    async () => {
      const db = sql;
      if (!db) throw new Error('sql not initialized');
      const svc = requireService(service);

      // Client lifecycle under test — must live in hooks/use-image-upload.
      const { reduceImageUpload, initialImageUploadState, uploadImprovementImage } = await import(
        '../../../hooks/use-image-upload'
      );

      let state = initialImageUploadState();
      state = reduceImageUpload(state, {
        type: 'attach',
        uri: `file://${EVIDENCE_DIR}/test-fixture.jpg`,
        dimensions: { width: 800, height: 600 },
      });
      expect(state.phase).toBe('preview');

      state = reduceImageUpload(state, { type: 'start_upload' });
      expect(state.phase).toBe('uploading');

      const blob = new Blob(
        [
          fixtureBytes.buffer.slice(
            fixtureBytes.byteOffset,
            fixtureBytes.byteOffset + fixtureBytes.byteLength
          ),
        ],
        { type: 'image/jpeg' }
      );

      const result = await uploadImprovementImage({
        targetId: E2E_IMPROVEMENT_OPEN_ID,
        idempotencyKey: `s-upload-01-lifecycle-${Date.now()}`,
        blob,
        mimeType: 'image/jpeg',
        originalName: 'test-fixture.jpg',
      });

      state = reduceImageUpload(state, { type: 'finalize_success', result });
      expect(state.phase).toBe('success');
      expect(state.phase).not.toBe('uploading');

      const rows = await fileObjectsByHash(db, fixtureHash);
      const total = await countFileObjects(db);

      expect(total, 'file_objects rows: 1').toBe(1);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.content_hash).toBe(fixtureHash);
      expect(rows[0]?.content_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.contentHash).toBe(fixtureHash);
      expect(result.fileObjectId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(result.blobId).toBe(fixtureHash);

      // "Zero-synced" surface: CAS row is durable in Postgres zero_pub member file_objects.
      // Client query helper must export a content-hash lookup for reconciliation.
      const { fileObjectsByContentHash } = await import('../../../app/zero/queries');
      expect(typeof fileObjectsByContentHash).toBe('function');
      const query = fileObjectsByContentHash(fixtureHash);
      expect(query).toBeTruthy();

      writeArtifact('AC-1-seeded-artifact.json', {
        artifact_type: 'db_query',
        start_ref: 'cleared_file_objects',
        baseUrl: svc.baseUrl,
        file_objects_rows: total,
        content_hash: rows[0]?.content_hash,
        fileObjectId: result.fileObjectId,
        blobId: result.blobId,
        uploadId: result.uploadId,
        phase: state.phase,
      });
    },
    240_000
  );
});
