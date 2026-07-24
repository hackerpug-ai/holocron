/**
 * CAP-CUT-01: useVoiceSession / useVoiceResultBridge — static cold-boot contracts.
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

const CONVEX_REACT_IMPORT = /from\s+['"]convex\/react['"]|require\(['"]convex\/react['"]\)/;

describe('CAP-CUT-01: useVoiceSession Zero cold-boot', () => {
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

  it('gates voice when Convex client is unavailable', () => {
    expect(VOICE_SRC).toMatch(/Convex client unavailable|voice session disabled/i);
    expect(VOICE_SRC).toMatch(/voiceEnabled = false/);
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
});
