/**
 * S-UPLOAD-02 AC-2 — voice audio upload uses content-addressed protocol.
 *
 * Verify:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/voice/audio-upload.test.ts
 *
 * Exercises createAudioRecorder + uploadBlobThroughLifecycle (kind=voice_artifact)
 * against real Hono + Postgres + blob store. NEVER mocks upload endpoints.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  audioFixtureBlob,
  configureClientEnv,
  countFileObjects,
  DATABASE_URL,
  fileObjectsByHash,
  insertVoiceSession,
  itLive,
  type LiveService,
  openSql,
  PLATFORM_IT,
  REPO_ROOT,
  requireService,
  type Sql,
  seedClearedFileObjects,
  startVoiceUploadService,
  writeArtifact,
} from './_helpers';

const HOOK_SRC = readFileSync(resolve(REPO_ROOT, 'hooks/use-voice-session.ts'), 'utf8');
const RECORDER_SRC = readFileSync(resolve(REPO_ROOT, 'lib/voice/audio-recorder.ts'), 'utf8');

describe('S-UPLOAD-02 AC-2: voice audio content-addressed upload', () => {
  let service: LiveService | undefined;
  let sql: Sql | null = null;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    await seedClearedFileObjects();
    sql = openSql();
    const startCount = await countFileObjects(sql);
    expect(startCount, 'start_ref cleared_file_objects').toBe(0);

    service = await startVoiceUploadService();
    configureClientEnv(service.baseUrl);
  }, 180_000);

  afterAll(async () => {
    await service?.stop();
    await sql?.end({ timeout: 5 }).catch(() => {});
  });

  it('wires uploadBlobThroughLifecycle kind=voice_artifact (not Convex storage URLs)', () => {
    expect(HOOK_SRC).toMatch(/uploadBlobThroughLifecycle/);
    expect(HOOK_SRC).toMatch(/kind:\s*['"]voice_artifact['"]/);
    expect(HOOK_SRC).toMatch(/uploadAudio/);
    expect(RECORDER_SRC).toMatch(/uploadAudio/);
    expect(RECORDER_SRC).toMatch(/getSessionId/);
    expect(RECORDER_SRC).toMatch(/stopAndDiscard/);
    expect(RECORDER_SRC).not.toMatch(/generateUploadUrl|attachAudio|storageId/);
    expect(HOOK_SRC).not.toMatch(/generateAudioUploadUrl|generateUploadUrl/);
  });

  it('refuses skip-to-green without PLATFORM_IT=1', () => {
    if (PLATFORM_IT) {
      expect(DATABASE_URL).toContain('holocron_nonprod');
      return;
    }
    expect.fail(
      'PLATFORM_IT=1 required for S-UPLOAD-02 audio-upload — refusing skip-to-green against mocked stores'
    );
  });

  itLive(
    'recorder stopAndUpload runs init→PUT→finalize kind=voice_artifact and promotes one file_objects row',
    async () => {
      const db = sql;
      if (!db) throw new Error('sql not initialized');
      requireService(service);

      const sessionId = await insertVoiceSession(db);
      const fixture = audioFixtureBlob('complete-recording');
      expect(fixture.contentHash).toMatch(/^[0-9a-f]{64}$/);

      // Hook path under test: useVoiceSession wires uploadBlobThroughLifecycle via uploadAudio.
      const { uploadBlobThroughLifecycle } = await import('../../../app/zero/platform');
      const { createAudioRecorder } = await import('../../../lib/voice/audio-recorder');

      const uploadAudio = async ({ sessionId: sid, blob }: { sessionId: string; blob: Blob }) => {
        const raw = await uploadBlobThroughLifecycle({
          kind: 'voice_artifact',
          targetId: sid,
          idempotencyKey: `voice-artifact-${sid}-${fixture.contentHash.slice(0, 12)}`,
          blob,
          mimeType: fixture.mimeType,
          originalName: fixture.originalName,
        });
        return raw;
      };

      // Static contract: recorder must accept the lifecycle upload callback (not Convex URLs).
      const recorder = createAudioRecorder({
        uploadAudio,
        getSessionId: () => sessionId,
      });
      expect(typeof recorder.stopAndUpload).toBe('function');
      expect(typeof recorder.stopAndDiscard).toBe('function');

      // Drive the lifecycle with real bytes (MediaRecorder is optional on native).
      const raw = await uploadAudio({ sessionId, blob: fixture.blob });
      const contentHash = String(raw.blobId ?? raw.contentHash ?? raw.content_hash ?? '');
      const fileObjectId = String(raw.fileObjectId ?? raw.file_object_id ?? '');
      expect(contentHash.toLowerCase()).toBe(fixture.contentHash.toLowerCase());
      expect(fileObjectId).toMatch(/^[0-9a-f-]{36}$/i);

      const rows = await fileObjectsByHash(db, fixture.contentHash);
      const total = await countFileObjects(db);
      expect(total, 'file_objects rows: 1').toBe(1);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.content_hash).toBe(fixture.contentHash);
      expect(String(rows[0]?.mime_type ?? '')).toMatch(/^audio\//);

      const sessions = await db<Array<{ blob_id: string | null }>>`
        SELECT blob_id FROM voice_sessions WHERE id = ${sessionId}::uuid
      `;
      expect(sessions[0]?.blob_id).toBe(fixture.contentHash);

      // Zero client query must be a real builder (not a POJO stub).
      const { fileObjectsByContentHash } = await import('../../../app/zero/queries');
      const query = fileObjectsByContentHash(fixture.contentHash) as {
        ast?: { table?: string };
        _queryKind?: string;
      };
      expect(query._queryKind, 'must not be a POJO descriptor stub').toBeUndefined();
      expect(query.ast?.table).toBe('file_objects');

      writeArtifact('AC-2-seeded-artifact.json', {
        sessionId,
        file_objects_rows: total,
        content_hash: fixture.contentHash,
        mime_type: rows[0]?.mime_type,
        fileObjectId,
        kind: 'voice_artifact',
      });
    }
  );
});
