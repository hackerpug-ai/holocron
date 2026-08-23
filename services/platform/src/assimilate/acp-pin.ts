/**
 * Hardcoded ACP leaf for this slice. Caller parameters come later;
 * keep the pin in one module so that change is a schema add, not a rewrite.
 */
export const ASSIMILATE_ACP = {
  harness: 'opencode',
  provider: 'deepseek',
  model: 'deepseek/deepseek-v4-flash',
} as const;

export type AssimilateAcpPin = typeof ASSIMILATE_ACP;
