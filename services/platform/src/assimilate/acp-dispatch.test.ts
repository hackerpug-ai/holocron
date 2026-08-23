import { describe, expect, it } from 'vitest';
import { acpSpawn, assertAcpReady } from './acp-dispatch.ts';
import { AssimilateError } from './errors.ts';

describe('assertAcpReady', () => {
  it('fails closed when DEEPSEEK_API_KEY is missing', () => {
    const prevKey = process.env.DEEPSEEK_API_KEY;
    const prevBin = process.env.OPENCODE_BIN;
    delete process.env.DEEPSEEK_API_KEY;
    process.env.OPENCODE_BIN = '/usr/bin/true';
    try {
      expect(() => assertAcpReady()).toThrow(AssimilateError);
      try {
        assertAcpReady();
      } catch (err) {
        expect((err as AssimilateError).code).toBe('ASSIMILATE_DEEPSEEK_KEY_MISSING');
      }
    } finally {
      if (prevKey === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = prevKey;
      if (prevBin === undefined) delete process.env.OPENCODE_BIN;
      else process.env.OPENCODE_BIN = prevBin;
    }
  });
});

describe('acpSpawn', () => {
  it('unsets postgres credentials before execing opencode acp', () => {
    const prevBin = process.env.OPENCODE_BIN;
    process.env.OPENCODE_BIN = '/usr/local/bin/opencode';
    try {
      const spawn = acpSpawn();
      expect(spawn.command).toBe('/bin/sh');
      expect(spawn.args[0]).toBe('-ec');
      expect(spawn.args[1]).toContain('unset DATABASE_URL');
      expect(spawn.args[1]).toContain('PGPASSWORD');
      expect(spawn.args.at(-1)).toBe('/usr/local/bin/opencode');
    } finally {
      if (prevBin === undefined) delete process.env.OPENCODE_BIN;
      else process.env.OPENCODE_BIN = prevBin;
    }
  });
});
