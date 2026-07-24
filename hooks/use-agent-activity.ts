/**
 * Agent activity bar via Zero (S-REWRITE-01).
 *
 * Contract: api.db.agentActivity.get → zero_query agent_plans / agentActivityByOwner.
 * Phase is derived from the most recent non-terminal plan status for the thread.
 */

import { useQuery } from '@rocicorp/zero/react';
import { agentActivityByOwner } from '@/app/zero/queries';

export type AgentPhase =
  | 'idle'
  | 'triage'
  | 'clarifying'
  | 'dispatching'
  | 'tool_execution'
  | 'synthesis';

export interface UseAgentActivityResult {
  phase: AgentPhase;
  toolName: string | null;
  loading: boolean;
  error: Error | null;
}

export interface UseAgentActivityArgs {
  threadId?: string | null;
}

type AgentPlanRow = {
  id: string;
  status: string;
  title?: string | null;
  updated_at: number;
};

const TERMINAL = new Set(['completed', 'cancelled', 'failed', 'rejected', 'timed_out']);

function phaseFromStatus(status: string): AgentPhase {
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

export function useAgentActivity({ threadId }: UseAgentActivityArgs): UseAgentActivityResult {
  const [rawRows, details] = useQuery(threadId ? agentActivityByOwner(threadId) : undefined);

  const rows = (rawRows ?? []) as unknown as AgentPlanRow[];
  const active = rows.find((r) => !TERMINAL.has(r.status));

  return {
    phase: active ? phaseFromStatus(active.status) : 'idle',
    toolName: active?.title ?? null,
    loading: Boolean(threadId) && details.type === 'unknown' && rows.length === 0,
    error: null,
  };
}
