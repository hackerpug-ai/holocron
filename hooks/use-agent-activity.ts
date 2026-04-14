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

  return {
    phase: (result?.phase as AgentPhase) ?? 'idle',
    toolName: (result?.toolName as string | null) ?? null,
    loading: result === undefined && threadId !== null,
    error: null,
  }
}
