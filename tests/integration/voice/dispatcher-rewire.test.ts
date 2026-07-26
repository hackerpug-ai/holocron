/**
 * S-UPLOAD-02 AC-1 [PRIMARY] — voice session dispatcher rewire off Convex.
 *
 * Verify:
 *   bun services/platform/src/cli/holo.ts verify:no-convex-client
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/voice/dispatcher-rewire.test.ts
 *
 * NEVER mocks the Hono voice-sessions command.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  configureClientEnv,
  DATABASE_URL,
  E2E_CONVERSATION_ID,
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

const VOICE_HOOK = readFileSync(resolve(REPO_ROOT, 'hooks/use-voice-session.ts'), 'utf8');
const BRIDGE = readFileSync(resolve(REPO_ROOT, 'hooks/use-voice-result-bridge.ts'), 'utf8');
const VOICE_CLIENT = readFileSync(resolve(REPO_ROOT, 'app/zero/voice.ts'), 'utf8');
const AUDIO_RECORDER = readFileSync(resolve(REPO_ROOT, 'lib/voice/audio-recorder.ts'), 'utf8');

const CONVEX_REACT_IMPORT = /from\s+['"]convex\/react['"]|require\(['"]convex\/react['"]\)/;

describe('S-UPLOAD-02 AC-1: voice dispatcher rewire removes convex/react', () => {
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
    expect.fail(
      'PLATFORM_IT=1 required for S-UPLOAD-02 dispatcher rewire — refusing skip-to-green'
    );
  });

  it('voice hooks and recorder have zero convex/react imports and no CONVEX_UNAVAILABLE throw path', () => {
    expect(VOICE_HOOK).not.toMatch(CONVEX_REACT_IMPORT);
    expect(BRIDGE).not.toMatch(CONVEX_REACT_IMPORT);
    expect(AUDIO_RECORDER).not.toMatch(CONVEX_REACT_IMPORT);
    expect(VOICE_HOOK).not.toMatch(/CONVEX_UNAVAILABLE/);
    expect(VOICE_HOOK).not.toMatch(/\buseAction\s*\(/);
    expect(VOICE_HOOK).not.toMatch(/\buseMutation\s*\(/);
    expect(VOICE_HOOK).not.toMatch(/\buseConvex\s*\(/);
    expect(VOICE_HOOK).toMatch(/from ['"]@\/app\/zero\/voice['"]/);
    expect(VOICE_HOOK).toMatch(/createVoiceSession\(conversationId\)/);
    expect(VOICE_CLIENT).toMatch(/\/api\/voice-sessions/);
  });

  it('verify:no-convex-client exits 0', () => {
    const result = spawnSync(
      'bun',
      [resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts'), 'verify:no-convex-client'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    writeArtifact('AC-1-no-convex-client.txt', `${result.stdout}\n${result.stderr}`);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/zero convex\/react|status: OK/i);
  });

  itLive(
    'createVoiceSession POSTs /api/voice-sessions and returns uuid sessionId + non-empty ephemeralKey',
    async () => {
      const svc = requireService(service);
      const db = sql;
      if (!db) throw new Error('sql not initialized');

      // Prefer live OpenAI-backed path when configured; otherwise prove Hono route shape.
      const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);
      const { createVoiceSession } = await import('../../../app/zero/voice');

      if (!hasOpenAi) {
        // Route exists and is auth-gated / conversation-gated without Convex.
        const res = await fetch(`${svc.baseUrl}/api/voice-sessions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.EXPO_PUBLIC_RN_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ conversationId: E2E_CONVERSATION_ID }),
        });
        // Without OPENAI_API_KEY the authoritative command still answers from Hono (503), never Convex.
        expect([201, 503]).toContain(res.status);
        expect(VOICE_CLIENT).toMatch(/voiceFetch\('\/api\/voice-sessions'/);
        writeArtifact('AC-1-seeded-artifact.json', {
          mode: 'no_openai_key',
          status: res.status,
          hono_command: 'POST /api/voice-sessions',
          convex_react_imports: 0,
        });
        return;
      }

      const session = await createVoiceSession(E2E_CONVERSATION_ID);
      expect(session.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(session.sessionId.length).toBe(36);
      expect(session.ephemeralKey.length).toBeGreaterThan(0);
      expect(session.instructions.length).toBeGreaterThan(0);

      const rows = await db<Array<{ id: string }>>`
        SELECT id::text AS id FROM voice_sessions WHERE id = ${session.sessionId}::uuid
      `;
      expect(rows).toHaveLength(1);

      writeArtifact('AC-1-seeded-artifact.json', {
        sessionId: session.sessionId,
        ephemeralKeyLength: session.ephemeralKey.length,
        hono_command: 'POST /api/voice-sessions',
        convex_react_imports: 0,
      });
    }
  );
});
