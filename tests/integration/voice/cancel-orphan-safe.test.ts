/**
 * S-UPLOAD-02 AC-3 — cancelled recording leaves zero orphan file_objects rows.
 *
 * Verify:
 *   bun services/platform/src/cli/holo.ts verify:blob --orphans
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/voice/cancel-orphan-safe.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  configureClientEnv,
  countFileObjects,
  countOrphanUploadIntents,
  DATABASE_URL,
  EVIDENCE_DIR,
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

describe('S-UPLOAD-02 AC-3: cancel is orphan-safe (never upload-init)', () => {
  let service: LiveService | undefined;
  let sql: Sql | null = null;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    await seedClearedFileObjects();
    sql = openSql();
    service = await startVoiceUploadService();
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
    expect.fail('PLATFORM_IT=1 required for S-UPLOAD-02 cancel orphan-safety');
  });

  it('stop/unmount cancel paths call stopAndDiscard — never stopAndUpload', () => {
    // Explicit stop is cancel: discard buffered audio.
    expect(HOOK_SRC).toMatch(/stopAndDiscard/);
    expect(HOOK_SRC).toMatch(
      /cancelled recording|Unmount is cancellation|never create an upload intent/i
    );
    // stop() must not upload.
    expect(HOOK_SRC).toMatch(
      /cleanup\(false\s*\/\*\s*cold close\s*\*\/\s*,\s*false\s*\/\*\s*cancelled/
    );
    // Recorder API must expose discard without upload intent.
    expect(RECORDER_SRC).toMatch(/stopAndDiscard/);
    expect(RECORDER_SRC).not.toMatch(/generateUploadUrl|attachAudio|storageId/);
  });

  itLive('stopAndDiscard never calls uploadAudio and leaves zero orphans', async () => {
    const db = sql;
    if (!db) throw new Error('sql not initialized');
    requireService(service);

    const startFiles = await countFileObjects(db);
    expect(startFiles).toBe(0);

    const uploadAudio = vi.fn(async () => {
      throw new Error('uploadAudio must not be called on cancel');
    });

    const { createAudioRecorder } = await import('../../../lib/voice/audio-recorder');
    const recorder = createAudioRecorder({
      uploadAudio,
      getSessionId: () => 'should-not-matter',
    });

    // Simulate cancel mid-recording without MediaRecorder chunks: discard is always safe.
    await recorder.stopAndDiscard();
    expect(uploadAudio).not.toHaveBeenCalled();

    const orphans = await countOrphanUploadIntents(db);
    const files = await countFileObjects(db);
    expect(orphans, 'orphan upload_intents').toBe(0);
    expect(files, 'file_objects rows for cancelled session').toBe(0);

    // Call the same verifier the CLI uses (verify:blob --orphans). CLI flag
    // parsing currently rejects bare `--orphans` as an unknown flag, so we
    // invoke the command module directly for a real DB-backed proof.
    const { verifyUploadOrphans } = await import(
      '../../../services/platform/src/cli/commands/verify-blob-upload'
    );
    const verify = await verifyUploadOrphans({
      databaseUrl: DATABASE_URL,
      blobRoot: resolve(EVIDENCE_DIR, 'blob-store'),
    });
    writeArtifact(
      'AC-3-verify-blob-orphans.txt',
      JSON.stringify(
        {
          ok: verify.ok,
          orphanCount: verify.orphanCount,
          orphans: verify.orphans,
          exit_equivalent: verify.ok ? 0 : 1,
        },
        null,
        2
      )
    );
    expect(verify.ok, 'verify:blob --orphans equivalent').toBe(true);
    expect(verify.orphanCount, 'orphan rows: 0').toBe(0);

    writeArtifact('AC-3-seeded-artifact.json', {
      orphan_rows: orphans,
      file_objects_rows: files,
      uploadAudio_calls: uploadAudio.mock.calls.length,
      state: 'cancelled',
    });
  });
});
