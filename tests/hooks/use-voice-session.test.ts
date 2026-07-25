/**
 * Zero voice-session boundary — static cold-boot contracts.
 *
 * Voice must not import convex/react so chat cold-boots under ZeroProvider only.
 * No mocked Convex client (TESTING-HIERARCHY: mocked tests banned).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const VOICE_SRC = readFileSync(join(REPO_ROOT, 'hooks', 'use-voice-session.ts'), 'utf8');
const BRIDGE_SRC = readFileSync(join(REPO_ROOT, 'hooks', 'use-voice-result-bridge.ts'), 'utf8');
const VOICE_CLIENT_SRC = readFileSync(join(REPO_ROOT, 'app', 'zero', 'voice.ts'), 'utf8');
const HONO_SRC = readFileSync(
  join(REPO_ROOT, 'services', 'platform', 'src', 'http', 'hono-app.ts'),
  'utf8'
);

const CONVEX_REACT_IMPORT = /from\s+['"]convex\/react['"]|require\(['"]convex\/react['"]\)/;

describe('useVoiceSession Zero cold-boot', () => {
  it('does not import convex/react', () => {
    expect(VOICE_SRC).not.toMatch(CONVEX_REACT_IMPORT);
    expect(BRIDGE_SRC).not.toMatch(CONVEX_REACT_IMPORT);
  });

  it('does not call useConvex / useAction / useMutation / useQuery', () => {
    expect(VOICE_SRC).not.toMatch(/\buseConvex\s*\(/);
    expect(VOICE_SRC).not.toMatch(/\buseAction\s*\(/);
    expect(VOICE_SRC).not.toMatch(/\buseMutation\s*\(/);
    expect(VOICE_SRC).not.toMatch(/\buseQuery\s*\(/);
    expect(BRIDGE_SRC).not.toMatch(/\buseConvex\s*\(/);
    expect(BRIDGE_SRC).not.toMatch(/\buseQuery\s*\(/);
  });

  it('uses the protected platform voice-session boundary', () => {
    expect(VOICE_SRC).toMatch(/from ['"]@\/app\/zero\/voice['"]/);
    expect(VOICE_SRC).toMatch(/createVoiceSession\(conversationId\)/);
    expect(VOICE_SRC).not.toMatch(/voiceEnabled = false/);
    expect(VOICE_CLIENT_SRC).toMatch(/voiceFetch\('\/api\/voice-sessions'/);
    expect(HONO_SRC).toMatch(/app\.post\('\/api\/voice-sessions'/);
    expect(HONO_SRC).toMatch(/OPENAI_API_KEY/);
    expect(HONO_SRC).not.toMatch(/EXPO_PUBLIC.*OPENAI_API_KEY/);
  });

  it('bridge is a pure no-op with empty body (no Convex API imports)', () => {
    expect(BRIDGE_SRC).toMatch(/No-op|pure no-op/i);
    expect(BRIDGE_SRC).not.toMatch(/@\/convex\/_generated\/api/);
    expect(BRIDGE_SRC).not.toMatch(/convex\.watchQuery|watchQuery\s*\(/);
  });

  it('exports start / stop / prewarm consumer API', () => {
    expect(VOICE_SRC).toMatch(/export function useVoiceSession/);
    expect(VOICE_SRC).toMatch(/start:/);
    expect(VOICE_SRC).toMatch(/stop:/);
    expect(VOICE_SRC).toMatch(/prewarm:/);
  });

  it('sends the required realtime type on warm session updates', () => {
    expect(VOICE_SRC).toMatch(/type: 'session\.update'[\s\S]*type: 'realtime'/);
  });
});
