import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

export type AgentPhase =
  | 'idle'
  | 'triage'
  | 'clarifying'
  | 'dispatching'
  | 'tool_execution'
  | 'synthesis'

export interface UseAgentActivityResult {
  phase: AgentPhase
  toolName: string | null
  loading: boolean
  error: Error | null
}

export interface UseAgentActivityArgs {
  threadId?: string | null
}

export function useAgentActivity({
  threadId,
}: UseAgentActivityArgs): UseAgentActivityResult {
  const result = useQuery(
    api.db.agentActivity.get,
    threadId ? { threadId } : 'skip',
  )

  const activity = result as { phase?: AgentPhase; toolName?: string | null } | undefined

  return {
    phase: activity?.phase ?? 'idle',
    toolName: activity?.toolName ?? null,
    loading: result === undefined && threadId !== null,
    error: null,
  }
}
