/**
 * S-UPLOAD-04 AC-3 — content_hash unique index enforces SHA-256 idempotency.
 *
 * Proves `file_objects_content_hash_uidx` rejects a raw duplicate INSERT (23505)
 * and that the CAS finalize path keeps file_objects rows: 1 for identical bytes.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/unique-constraint.test.ts
 */
import { randomUUID } from 'node:crypto';
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

const EVIDENCE_DIR = '.tmp/S-UPLOAD-04';

describe('S-UPLOAD-04 AC-3: file_objects_content_hash_uidx enforces uniqueness', () => {
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
    expect(fixtureHash).toMatch(/^[0-9a-f]{64}$/);

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
      idempotencyKey: `s-upload-04-uidx-seed-${Date.now()}`,
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
    expect.fail(
      'PLATFORM_IT=1 required for S-UPLOAD-04 unique-constraint — refusing skip-to-green'
    );
  });

  itLive(
    'raw INSERT with duplicate content_hash is rejected by file_objects_content_hash_uidx',
    async () => {
      const db = sql;
      if (!db) throw new Error('sql not initialized');

      const duplicateId = randomUUID();
      let rejected = false;
      let pgCode: string | undefined;
      let pgConstraint: string | undefined;
      let errorMessage = '';

      try {
        await db`
          INSERT INTO file_objects (
            id,
            content_hash,
            mime_type,
            byte_size,
            storage_path,
            original_name
          ) VALUES (
            ${duplicateId}::uuid,
            ${fixtureHash},
            'image/jpeg',
            ${fixtureBytes.byteLength},
            ${`dup/${fixtureHash}`},
            'duplicate-probe.jpg'
          )
        `;
      } catch (err) {
        rejected = true;
        const e = err as {
          code?: string;
          constraint_name?: string;
          constraint?: string;
          message?: string;
        };
        pgCode = e.code;
        pgConstraint = e.constraint_name ?? e.constraint;
        errorMessage = e.message ?? String(err);
      }

      const rows = await fileObjectsByHash(db, fixtureHash);
      const total = await countFileObjects(db);

      expect(rejected, 'duplicate INSERT must throw').toBe(true);
      expect(pgCode, 'Postgres unique_violation').toBe('23505');
      expect(
        `${pgConstraint ?? ''} ${errorMessage}`.toLowerCase(),
        'constraint name must reference content_hash uidx'
      ).toMatch(/file_objects_content_hash_uidx|content_hash/);
      expect(total, 'file_objects rows must remain 1').toBe(1);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(firstFileObjectId);

      writeArtifact('AC-3-unique-constraint.json', {
        artifact_type: 'db_query',
        start_ref: 'seeded_fixture_jpg',
        content_hash: fixtureHash,
        firstFileObjectId,
        attemptedDuplicateId: duplicateId,
        rejected,
        pgCode,
        pgConstraint: pgConstraint ?? null,
        errorMessage,
        file_objects_rows: total,
        evidence_dir: EVIDENCE_DIR,
      });
    },
    60_000
  );

  itLive(
    'finalize of identical bytes returns existing fileObjectId (CAS idempotent; rows stay 1)',
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
        idempotencyKey: `s-upload-04-uidx-finalize-${Date.now()}`,
        blob,
        mimeType: 'image/jpeg',
        originalName: 'test-fixture.jpg',
      });

      const rows = await fileObjectsByHash(db, fixtureHash);
      const total = await countFileObjects(db);

      expect(total, 'file_objects rows must remain 1 after finalize replay').toBe(1);
      expect(rows).toHaveLength(1);
      expect(second.fileObjectId).toBe(firstFileObjectId);
      expect(second.contentHash).toBe(fixtureHash);

      writeArtifact('AC-3-finalize-idempotent.json', {
        artifact_type: 'db_query',
        baseUrl: svc.baseUrl,
        firstFileObjectId,
        secondFileObjectId: second.fileObjectId,
        content_hash: fixtureHash,
        file_objects_rows: total,
      });
    },
    240_000
  );
});
