/**
 * S-UPLOAD-02 AC-2 — voice audio upload uses content-addressed protocol.
 *
 * Verify:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/voice/audio-upload.test.ts
 *
 * Drives createAudioRecorder.start → ondataavailable chunk → stopAndUpload with a
 * live uploadAudio callback (uploadBlobThroughLifecycle kind=voice_artifact)
 * against real Hono + Postgres + blob store. NEVER mocks upload endpoints.
 * MediaRecorder is stubbed only as a browser API unavailable in Node.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  sha256,
  startVoiceUploadService,
  writeArtifact,
} from './_helpers';

const HOOK_SRC = readFileSync(resolve(REPO_ROOT, 'hooks/use-voice-session.ts'), 'utf8');
const RECORDER_SRC = readFileSync(resolve(REPO_ROOT, 'lib/voice/audio-recorder.ts'), 'utf8');

/** MediaRecorder stand-in — same pattern as tests/lib/voice/audio-recorder.test.ts */
interface MockRecorderInstance {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  state: string;
  ondataavailable: ((event: BlobEvent) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
}

const recorderInstances: MockRecorderInstance[] = [];

function createMockRecorder(): MockRecorderInstance {
  const instance: MockRecorderInstance = {
    start: vi.fn(),
    stop: vi.fn(),
    state: 'inactive',
    ondataavailable: null,
    onstop: null,
    onerror: null,
  };
  instance.start.mockImplementation(() => {
    instance.state = 'recording';
  });
  instance.stop.mockImplementation(() => {
    instance.state = 'inactive';
    setTimeout(() => instance.onstop?.(), 0);
  });
  recorderInstances.push(instance);
  return instance;
}

const MockMediaRecorder = vi.fn(function (this: unknown) {
  return createMockRecorder();
});
vi.stubGlobal('MediaRecorder', MockMediaRecorder);

function lastRecorder(): MockRecorderInstance {
  const instance = recorderInstances[recorderInstances.length - 1];
  if (!instance) throw new Error('no MediaRecorder instance');
  return instance;
}

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

  beforeEach(() => {
    recorderInstances.length = 0;
    MockMediaRecorder.mockClear();
    MockMediaRecorder.mockImplementation(function (this: unknown) {
      return createMockRecorder();
    });
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

      const { uploadBlobThroughLifecycle } = await import('../../../app/zero/platform');
      const { createAudioRecorder } = await import('../../../lib/voice/audio-recorder');

      let uploadCalls = 0;
      let uploadedHash = '';
      let uploadError: unknown = null;
      let uploadRaw: Record<string, unknown> | null = null;
      const uploadAudio = async ({ sessionId: sid, blob }: { sessionId: string; blob: Blob }) => {
        uploadCalls += 1;
        const bytes = Buffer.from(await blob.arrayBuffer());
        uploadedHash = sha256(bytes);
        try {
          // Fixture bytes are ID3-tagged audio/mpeg; MediaRecorder wraps chunks as
          // audio/webm by type only. Declare the content-true mime so finalize's
          // hash/length/mime check matches detectMimeFromBuffer.
          const raw = (await uploadBlobThroughLifecycle({
            kind: 'voice_artifact',
            targetId: sid,
            idempotencyKey: `voice-artifact-${sid}-${uploadedHash.slice(0, 12)}`,
            blob,
            mimeType: fixture.mimeType,
            originalName: fixture.originalName,
          })) as Record<string, unknown>;
          uploadRaw = raw;
          return raw;
        } catch (err) {
          uploadError = err;
          throw err;
        }
      };

      const recorder = createAudioRecorder({
        uploadAudio,
        getSessionId: () => sessionId,
      });
      expect(typeof recorder.stopAndUpload).toBe('function');
      expect(typeof recorder.stopAndDiscard).toBe('function');

      // Drive product path: start → chunk → stopAndUpload (not a direct uploadAudio call).
      const mockStream = { getTracks: () => [] } as unknown as MediaStream;
      recorder.start(mockStream);
      expect(MockMediaRecorder).toHaveBeenCalledTimes(1);
      const mr = lastRecorder();
      expect(mr.state).toBe('recording');

      // Buffer real audio bytes as MediaRecorder would.
      expect(fixture.blob.size, 'fixture blob must be non-empty').toBeGreaterThan(0);
      mr.ondataavailable?.({ data: fixture.blob } as BlobEvent);

      await recorder.stopAndUpload();

      expect(uploadError, `upload must not fail: ${String(uploadError)}`).toBeNull();
      expect(uploadCalls, 'stopAndUpload must invoke uploadAudio once').toBe(1);
      expect(uploadedHash).toMatch(/^[0-9a-f]{64}$/);
      expect(uploadRaw, 'lifecycle must return a body').toBeTruthy();

      const rows = await fileObjectsByHash(db, uploadedHash);
      const total = await countFileObjects(db);
      expect(total, 'file_objects rows: 1').toBe(1);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.content_hash).toBe(uploadedHash);
      expect(String(rows[0]?.mime_type ?? '')).toMatch(/^audio\//);

      const sessions = await db<Array<{ blob_id: string | null }>>`
        SELECT blob_id FROM voice_sessions WHERE id = ${sessionId}::uuid
      `;
      expect(sessions[0]?.blob_id).toBe(uploadedHash);

      // Zero client query must be a real builder (not a POJO stub).
      const { fileObjectsByContentHash } = await import('../../../app/zero/queries');
      const query = fileObjectsByContentHash(uploadedHash) as {
        ast?: { table?: string };
        _queryKind?: string;
      };
      expect(query._queryKind, 'must not be a POJO descriptor stub').toBeUndefined();
      expect(query.ast?.table).toBe('file_objects');

      writeArtifact('AC-2-seeded-artifact.json', {
        sessionId,
        file_objects_rows: total,
        content_hash: uploadedHash,
        mime_type: rows[0]?.mime_type,
        kind: 'voice_artifact',
        path: 'createAudioRecorder.start→chunk→stopAndUpload',
        uploadAudio_calls: uploadCalls,
      });
    }
  );
});
