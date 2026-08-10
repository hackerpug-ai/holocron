import { describe, expect, it } from 'vitest';
import { TOOL_NAMES } from '@/lib/voice/tool-definitions';

describe('Voice tool surface', () => {
  // Voice-only tools that must remain after platform cutover
  const VOICE_ONLY = ['navigate_app'];

  it('voice tool names are non-empty unique strings', () => {
    expect(TOOL_NAMES.length).toBeGreaterThan(0);
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
    for (const name of TOOL_NAMES) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('voice-only tools exist', () => {
    for (const toolName of VOICE_ONLY) {
      expect(TOOL_NAMES, `Missing voice-only tool: ${toolName}`).toContain(toolName);
    }
  });

  it('create_plan remains excluded from voice', () => {
    expect(TOOL_NAMES).not.toContain('create_plan');
  });
});
