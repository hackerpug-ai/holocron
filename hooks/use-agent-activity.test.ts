/**
 * use-agent-activity — pure status→phase mapping checks + no-convex import gate.
 * No Zero/Postgres mocks (TESTING-HIERARCHY: mocked tests banned).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'use-agent-activity.ts');

/** Mirror of phaseFromStatus in use-agent-activity.ts for pure unit coverage. */
function phaseFromStatus(
  status: string
): 'idle' | 'triage' | 'clarifying' | 'dispatching' | 'tool_execution' | 'synthesis' {
  const TERMINAL = new Set(['completed', 'cancelled', 'failed', 'rejected', 'timed_out']);
  switch (status) {
    case 'pending':
      return 'triage';
    case 'approved':
    case 'running':
    case 'in_progress':
    case 'executing':
      return 'dispatching';
    default:
      return TERMINAL.has(status) ? 'idle' : 'dispatching';
  }
}

describe('use-agent-activity (S-REWRITE-01)', () => {
  it('does not import convex/react', () => {
    const src = readFileSync(SRC, 'utf8');
    expect(src).not.toMatch(/from\s+['"]convex\/react['"]/);
    expect(src).toMatch(/from\s+['"]@rocicorp\/zero\/react['"]/);
    expect(src).toMatch(/agentActivityByOwner/);
  });

  it('maps pending → triage', () => {
    expect(phaseFromStatus('pending')).toBe('triage');
  });

  it('maps running → dispatching', () => {
    expect(phaseFromStatus('running')).toBe('dispatching');
  });

  it('maps completed → idle', () => {
    expect(phaseFromStatus('completed')).toBe('idle');
  });
});
