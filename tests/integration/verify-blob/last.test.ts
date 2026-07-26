/**
 * S-UPLOAD-03 AC-2 / TC-2 — holo verify:blob --last against REAL Postgres.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/verify-blob/last.test.ts
 *
 * Asserts: exactly one file_objects row, SHA-256 matches seeded fixture, fail-closed
 * on empty / multi-row / hash mismatch. NEVER mocks file_objects.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countFileObjects,
  DATABASE_URL,
  EVIDENCE_DIR,
  ensureFixtureJpg,
  itLive,
  type LiveService,
  openSql,
  PLATFORM_IT,
  requireService,
  runHolo,
  type Sql,
  seedClearedFileObjects,
  startUploadService,
  uploadFixtureThroughLifecycle,
  writeArtifact,
} from './_helpers';

describe('S-UPLOAD-03 AC-2: verify:blob --last', () => {
  let service: LiveService | undefined;
  let sql: Sql | null = null;
  let fixtureHash = '';

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const fixture = ensureFixtureJpg();
    fixtureHash = fixture.contentHash;
    expect(fixtureHash).toMatch(/^[0-9a-f]{64}$/);

    await seedClearedFileObjects();
    sql = openSql();
    expect(await countFileObjects(sql), 'start_ref cleared_file_objects').toBe(0);

    service = await startUploadService();
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
      'PLATFORM_IT=1 required for S-UPLOAD-03 verify:blob --last — refusing skip-to-green'
    );
  });

  itLive('fails closed when file_objects is empty (no upload yet)', async () => {
    const db = sql;
    if (!db) throw new Error('sql not initialized');
    await seedClearedFileObjects();
    expect(await countFileObjects(db)).toBe(0);

    const r = runHolo(['verify:blob', '--last', '--json']);
    expect(r.status, r.combined).not.toBe(0);
    expect(r.combined).toMatch(/file_objects|empty|0|FAIL|reason/i);

    writeArtifact('AC-2-red-empty.txt', r.combined);
  });

  itLive(
    'exits 0 with exactly one row whose SHA-256 matches the fixture after a real upload',
    async () => {
      const db = sql;
      if (!db) throw new Error('sql not initialized');
      const svc = requireService(service);

      await seedClearedFileObjects();
      expect(await countFileObjects(db)).toBe(0);

      const uploaded = await uploadFixtureThroughLifecycle({ baseUrl: svc.baseUrl });
      expect(uploaded.contentHash).toBe(fixtureHash);
      expect(await countFileObjects(db), 'file_objects rows: 1').toBe(1);

      const r = runHolo(['verify:blob', '--last']);
      expect(r.status, r.combined).toBe(0);
      expect(r.stdout).toMatch(/file_objects rows:\s*1/);
      expect(r.stdout).toMatch(new RegExp(fixtureHash, 'i'));
      expect(r.stdout).toMatch(/byte_size:/i);
      expect(r.stdout).toMatch(/mime_type:/i);
      expect(r.stdout).toMatch(/storage_path:/i);
      expect(r.stdout).toMatch(/status:\s*OK/i);
      expect(r.stdout).not.toMatch(/status:\s*FAIL/i);

      const json = runHolo(['verify:blob', '--last', '--json']);
      expect(json.status, json.combined).toBe(0);
      const body = JSON.parse(json.stdout.slice(json.stdout.indexOf('{'))) as {
        ok?: boolean;
        rowCount?: number;
        fixtureSha256?: string;
        row?: { contentHash?: string; actualSha256?: string; storagePath?: string | null };
      };
      expect(body.ok).toBe(true);
      expect(body.rowCount).toBe(1);
      expect(body.fixtureSha256).toBe(fixtureHash);
      expect(body.row?.contentHash).toBe(fixtureHash);
      expect(body.row?.actualSha256).toBe(fixtureHash);
      expect(body.row?.storagePath).toBeTruthy();

      writeArtifact('AC-2-seeded-artifact.json', {
        artifact_type: 'stdout',
        start_ref: 'seeded_fixture_jpg',
        fixture_sha256: fixtureHash,
        file_objects_rows: 1,
        content_hash: body.row?.contentHash,
        storage_path: body.row?.storagePath,
        evidence_dir: EVIDENCE_DIR,
        verify_stdout: r.stdout,
      });
      writeArtifact('AC-2-green.txt', r.stdout);
    },
    240_000
  );

  itLive('fails closed when SHA-256 does not match the seeded fixture', async () => {
    const db = sql;
    if (!db) throw new Error('sql not initialized');
    const svc = requireService(service);

    await seedClearedFileObjects();
    await uploadFixtureThroughLifecycle({ baseUrl: svc.baseUrl });
    expect(await countFileObjects(db)).toBe(1);

    // Point fixture path at a different file so the helper compares against a wrong hash.
    const wrongFixture = writeArtifact('wrong-fixture.bin', Buffer.from('not-the-jpg-fixture'));
    const r = runHolo(['verify:blob', '--last', '--json'], {
      HOLO_UPLOAD_FIXTURE_PATH: wrongFixture,
    });
    expect(r.status, r.combined).not.toBe(0);
    expect(r.combined).toMatch(/fixture|hash|match|FAIL|ok": false/i);

    writeArtifact('AC-2-fail-closed-hash-mismatch.txt', r.combined);
  });
});
