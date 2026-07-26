/**
 * S-UPLOAD-01 AC-2 — re-attaching the identical image is idempotent (no new row).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/idempotency.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  configureClientEnv,
  countFileObjects,
  DATABASE_URL,
  E2E_IMPROVEMENT_OPEN_ID,
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

describe('S-UPLOAD-01 AC-2: identical image re-attach is idempotent', () => {
  let service: LiveService | undefined;
  let sql: Sql | null = null;
  let fixtureHash = '';
  let fixtureBytes: Buffer;
  let firstFileObjectId = '';

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const fixture = ensureFixtureJpg();
    fixtureHash = fixture.contentHash;
    fixtureBytes = fixture.bytes;

    await seedClearedFileObjects();
    sql = openSql();
    service = await startUploadService();
    configureClientEnv(service.baseUrl);

    const { uploadImprovementImage } = await import('../../../hooks/use-image-upload');
    const blob = new Blob(
      [
        fixtureBytes.buffer.slice(
          fixtureBytes.byteOffset,
          fixtureBytes.byteOffset + fixtureBytes.byteLength
        ),
      ],
      { type: 'image/jpeg' }
    );
    const first = await uploadImprovementImage({
      targetId: E2E_IMPROVEMENT_OPEN_ID,
      idempotencyKey: `s-upload-01-idem-seed-${Date.now()}`,
      blob,
      mimeType: 'image/jpeg',
      originalName: 'test-fixture.jpg',
    });
    firstFileObjectId = first.fileObjectId;
    const startRows = await countFileObjects(sql);
    expect(startRows, 'start_ref seeded_fixture_jpg requires exactly 1 row').toBe(1);
  }, 240_000);

  afterAll(async () => {
    await service?.stop();
    await sql?.end({ timeout: 5 }).catch(() => {});
  });

  it('refuses skip-to-green without PLATFORM_IT=1', () => {
    if (PLATFORM_IT) {
      expect(DATABASE_URL).toContain('holocron_nonprod');
      return;
    }
    expect.fail('PLATFORM_IT=1 required for S-UPLOAD-01 idempotency — refusing skip-to-green');
  });

  itLive(
    're-upload of identical bytes returns the same fileObjectId and keeps file_objects rows: 1',
    async () => {
      const db = sql;
      if (!db) throw new Error('sql not initialized');
      const svc = requireService(service);
      const { uploadImprovementImage } = await import('../../../hooks/use-image-upload');

      const blob = new Blob(
        [
          fixtureBytes.buffer.slice(
            fixtureBytes.byteOffset,
            fixtureBytes.byteOffset + fixtureBytes.byteLength
          ),
        ],
        { type: 'image/jpeg' }
      );

      const second = await uploadImprovementImage({
        targetId: E2E_IMPROVEMENT_OPEN_ID,
        // Distinct upload intent key, same content bytes → CAS dedupe.
        idempotencyKey: `s-upload-01-idem-replay-${Date.now()}`,
        blob,
        mimeType: 'image/jpeg',
        originalName: 'test-fixture.jpg',
      });

      const rows = await fileObjectsByHash(db, fixtureHash);
      const total = await countFileObjects(db);

      expect(total, 'file_objects rows must remain 1').toBe(1);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.content_hash).toBe(fixtureHash);
      expect(second.fileObjectId).toBe(firstFileObjectId);
      expect(second.contentHash).toBe(fixtureHash);

      writeArtifact('AC-2-seeded-artifact.json', {
        artifact_type: 'db_query',
        start_ref: 'seeded_fixture_jpg',
        baseUrl: svc.baseUrl,
        firstFileObjectId,
        secondFileObjectId: second.fileObjectId,
        file_objects_rows: total,
        content_hash: fixtureHash,
      });
    },
    240_000
  );
});
