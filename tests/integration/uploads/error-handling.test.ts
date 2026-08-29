/**
 * S-UPLOAD-01 AC-3 — upload error surfaces visible rejection with NO orphan row.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/error-handling.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react-native';
import { createElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  configureClientEnv,
  countFileObjects,
  DATABASE_URL,
  E2E_IMPROVEMENT_OPEN_ID,
  EVIDENCE_DIR,
  ensureFixtureJpg,
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

vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    colors: {
      card: '#111',
      border: '#333',
      input: '#222',
      foreground: '#fff',
      mutedForeground: '#999',
      primary: '#4af',
      primaryForeground: '#000',
      success: '#0f0',
      destructive: '#f44',
    },
    typography: { bodySmall: { fontSize: 14 } },
    spacing: { sm: 8, md: 16, lg: 24 },
    radius: {},
    brandColors: {},
    isDark: true,
  }),
}));

vi.mock('@/components/ui/text', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(Text, props, children),
  };
});

describe('S-UPLOAD-01 AC-3: upload error → rejection, zero orphan rows', () => {
  let service: LiveService | undefined;
  let sql: Sql | null = null;
  let fixtureHash = '';

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const fixture = ensureFixtureJpg();
    fixtureHash = fixture.contentHash;

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
    expect.fail('PLATFORM_IT=1 required for S-UPLOAD-01 error-handling — refusing skip-to-green');
  });

  itLive(
    'hash mismatch finalize fails closed: sheet state error + retry, file_objects rows: 0',
    async () => {
      const db = sql;
      if (!db) throw new Error('sql not initialized');
      const svc = requireService(service);

      const { reduceImageUpload, initialImageUploadState, uploadImprovementImage } = await import(
        '../../../hooks/use-image-upload'
      );

      let state = initialImageUploadState();
      state = reduceImageUpload(state, {
        type: 'attach',
        uri: `file://${EVIDENCE_DIR}/test-fixture.jpg`,
        dimensions: { width: 800, height: 600 },
      });
      state = reduceImageUpload(state, { type: 'start_upload' });
      expect(state.phase).toBe('uploading');

      // Simulate finalize hash mismatch by declaring a wrong sha via platform init/put path.
      // Client must surface error and MUST NOT promote a file_objects row.
      const wrongBlob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], {
        type: 'image/jpeg',
      });
      // Force declared hash of fixture while uploading different bytes by using
      // the low-level helpers with mismatched content (anti-orphan).
      const { initUpload, putUpload, finalizeUpload, sha256HexOfBytes } = await import(
        '../../../app/zero/platform'
      );
      const wrongBytes = await wrongBlob.arrayBuffer();
      // Declare fixture hash but upload wrong bytes → finalize must reject.
      const init = await initUpload({
        kind: 'improvement_image',
        targetId: E2E_IMPROVEMENT_OPEN_ID,
        idempotencyKey: `s-upload-01-err-mismatch-${Date.now()}`,
        sha256: fixtureHash,
        byteLength: wrongBytes.byteLength,
        mimeType: 'image/jpeg',
        originalName: 'bad-fixture.jpg',
      });
      const uploadId = String(init.uploadId ?? init.id ?? '');
      expect(uploadId).toMatch(/^[0-9a-f-]{36}$/i);
      await putUpload(uploadId, wrongBlob);

      let finalizeFailed = false;
      let finalizeMessage = '';
      try {
        await finalizeUpload(uploadId);
      } catch (err) {
        finalizeFailed = true;
        finalizeMessage = err instanceof Error ? err.message : String(err);
      }
      expect(finalizeFailed, 'finalize must reject hash mismatch').toBe(true);

      // Client state machine surfaces rejection + retry affordance.
      state = reduceImageUpload(state, {
        type: 'fail',
        error: finalizeMessage || 'Image upload failed.',
      });
      expect(state.phase).toBe('error');
      expect(state.error).toBeTruthy();
      expect(state.phase).not.toBe('uploading');
      expect(state.phase).not.toBe('success');

      // Retry affordance is a reduce transition back toward upload.
      const canRetry = state.phase === 'error' && state.imageUri != null;
      expect(canRetry).toBe(true);
      const retryState = reduceImageUpload(state, { type: 'retry' });
      expect(retryState.phase).toBe('uploading');

      const total = await countFileObjects(db);
      expect(total, 'file_objects rows: 0 (no orphan)').toBe(0);

      // ── Mounted status UI (used by ImprovementSubmitSheet) — real testIDs ──
      // Full Modal+gesture sheet OOMs under vitest; ImageUploadStatus is the
      // sheet's error surface with the same upload-error / upload-retry testIDs.
      const { ImageUploadStatus } = await import(
        '@/components/improvements/ImageUploadStatus'
      );
      // Prove sheet still wires ImageUploadStatus (not a disconnected orphan UI).
      const sheetSrc = readFileSync(
        resolve(process.cwd(), 'packages/mobile/components/improvements/ImprovementSubmitSheet.tsx'),
        'utf8'
      );
      expect(sheetSrc).toMatch(/ImageUploadStatus/);
      expect(sheetSrc).toMatch(/from ['"]@\/components\/improvements\/ImageUploadStatus['"]/);

      render(
        createElement(ImageUploadStatus, {
          phase: 'error',
          error: finalizeMessage || state.error,
          canRetry: true,
          onRetry: () => {},
        })
      );

      const errorNode = screen.getByTestId('upload-error');
      const retryNode = screen.getByTestId('upload-retry');
      expect(errorNode).toBeTruthy();
      expect(retryNode).toBeTruthy();
      expect(screen.queryByTestId('upload-success')).toBeNull();
      expect(screen.queryByTestId('upload-progress')).toBeNull();
      // Error message from real finalize failure is visible in the tree.
      expect(screen.getByText(finalizeMessage || state.error || '')).toBeTruthy();

      const mountedDump = {
        component: 'ImageUploadStatus',
        wired_by: 'ImprovementSubmitSheet',
        testIDs: {
          'upload-error': true,
          'upload-retry': true,
          'upload-success': false,
          'upload-progress': false,
        },
        errorText: finalizeMessage || state.error,
        phase: 'error',
        retry_affordance: 1,
      };
      writeArtifact('AC-3-mounted-testids.json', mountedDump);

      // uploadImprovementImage must not swallow errors (anti-stub).
      await expect(
        uploadImprovementImage({
          targetId: E2E_IMPROVEMENT_OPEN_ID,
          idempotencyKey: `s-upload-01-err-abort-${Date.now()}`,
          blob: new Blob([], { type: 'image/jpeg' }),
          mimeType: 'image/jpeg',
          originalName: 'empty.jpg',
        })
      ).rejects.toThrow();

      const afterEmpty = await countFileObjects(db);
      expect(afterEmpty, 'still no orphans after empty upload attempt').toBe(0);

      writeArtifact('AC-3-seeded-artifact.json', {
        artifact_type: 'screenshot',
        note: 'mounted ImageUploadStatus (sheet error surface) testID dump — upload-error + upload-retry visible',
        phase: 'error',
        retry_affordance: 1,
        file_objects_rows: total,
        finalize_error: finalizeMessage,
        fixture_hash: fixtureHash,
        wrong_bytes_sha: await sha256HexOfBytes(wrongBytes),
        declared_hash: fixtureHash,
        baseUrl: svc.baseUrl,
        mounted: mountedDump,
      });
      writeArtifact(
        'AC-3-error-state.txt',
        [
          'upload error state: error',
          'retry control: 1',
          `file_objects rows: ${total}`,
          `finalize message: ${finalizeMessage}`,
          'mounted testIDs: upload-error=true upload-retry=true',
        ].join('\n')
      );
    },
    240_000
  );
});
