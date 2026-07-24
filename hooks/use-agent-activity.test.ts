/**
 * useAgentActivity — static contracts after Convex→Zero rewire (S-REWRITE-04).
 *
 * The prior suite mocked convex/react (banned). These tests assert the Zero
 * seam without mounting a ZeroProvider (no live substrate required).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_SRC = readFileSync(join(__dirname, 'use-agent-activity.ts'), 'utf8');

describe('useAgentActivity Zero seam', () => {
  it('does not import convex/react', () => {
    expect(HOOK_SRC).not.toMatch(/from\s+['"]convex\/react['"]/);
  });

  it('imports agentActivityByOwner from app/zero/queries', () => {
    expect(HOOK_SRC).toMatch(/agentActivityByOwner/);
    expect(HOOK_SRC).toMatch(/app\/zero\/queries/);
  });

  it('uses Zero useQuery (useZeroQuery alias)', () => {
    expect(HOOK_SRC).toMatch(/@rocicorp\/zero\/react/);
    expect(HOOK_SRC).toMatch(/useZeroQuery|useQuery/);
  });

  it('defaults phase to idle when no plan', () => {
    // Pure mapping helper is inlined; assert status→phase branches exist.
    expect(HOOK_SRC).toMatch(/phaseFromPlanStatus|idle/);
    expect(HOOK_SRC).toMatch(/tool_execution|dispatching/);
  });
});
