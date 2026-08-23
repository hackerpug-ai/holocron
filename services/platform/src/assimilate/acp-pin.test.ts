import { describe, expect, it } from 'vitest';
import { ASSIMILATE_ACP } from './acp-pin.ts';

describe('ASSIMILATE_ACP pin', () => {
  it('hardcodes opencode + deepseek + deepseek-v4-flash', () => {
    expect(ASSIMILATE_ACP).toEqual({
      harness: 'opencode',
      provider: 'deepseek',
      model: 'deepseek/deepseek-v4-flash',
    });
  });
});
