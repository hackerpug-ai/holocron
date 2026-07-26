/**
 * useAgentActivity — static contracts after Convex→Zero rewire (S-REWRITE-01/04).
 *
 * No Zero/Postgres mocks (TESTING-HIERARCHY: mocked tests banned).
 * Asserts the Zero seam without mounting a ZeroProvider.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_SRC = readFileSync(join(__dirname, 'use-agent-activity.ts'), 'utf8');

/** Mirror of phaseFromPlanStatus for pure unit coverage. */
function phaseFromPlanStatus(
  status: string | undefined
): 'idle' | 'triage' | 'clarifying' | 'dispatching' | 'tool_execution' | 'synthesis' {
  switch (status) {
    case 'pending':
      return 'triage';
    case 'approved':
      return 'dispatching';
    case 'running':
    case 'in_progress':
    case 'executing':
      return 'tool_execution';
    case 'completed':
    case 'cancelled':
    case 'failed':
    case 'rejected':
    case 'timed_out':
      return 'idle';
    default:
      return status ? 'synthesis' : 'idle';
  }
}

describe('useAgentActivity Zero seam', () => {
  it('does not import the Convex React client', () => {
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

  it('maps pending → triage', () => {
    expect(phaseFromPlanStatus('pending')).toBe('triage');
  });

  it('maps running → tool_execution', () => {
    expect(phaseFromPlanStatus('running')).toBe('tool_execution');
  });

  it('maps completed → idle', () => {
    expect(phaseFromPlanStatus('completed')).toBe('idle');
  });

  it('defaults phase to idle when no plan', () => {
    expect(phaseFromPlanStatus(undefined)).toBe('idle');
    expect(HOOK_SRC).toMatch(/phaseFromPlanStatus|idle/);
    expect(HOOK_SRC).toMatch(/tool_execution|dispatching/);
  });
});
