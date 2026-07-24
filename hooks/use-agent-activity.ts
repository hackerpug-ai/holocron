/**
 * Agent activity bar via Zero (S-REWRITE-01 / S-REWRITE-04).
 *
 * Contract: api.db.agentActivity.get → zero_query agent_plans / agentActivityByOwner.
 * Phase is derived from the most recent plan status for the thread.
 */

import { useQuery as useZeroQuery } from '@rocicorp/zero/react';
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

/**
 * Maps agent_plans status → UI phase. Replaces Convex api.db.agentActivity.get
 * (contract: agentActivityByOwner on agent_plans).
 */
function phaseFromPlanStatus(status: string | undefined): AgentPhase {
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

export function useAgentActivity({ threadId }: UseAgentActivityArgs): UseAgentActivityResult {
  const enabled = !!threadId;
  const [plans, details] = useZeroQuery(threadId ? agentActivityByOwner(threadId) : undefined, {
    enabled,
  });

  const plan = (plans?.[0] ?? undefined) as { status?: string; title?: string | null } | undefined;

  return {
    phase: phaseFromPlanStatus(plan?.status),
    toolName: plan?.title ?? null,
    loading: enabled && details.type === 'unknown' && plans === undefined,
    error: null,
  };
}
