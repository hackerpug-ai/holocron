import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'

/**
 * Hook for fetching a research session with its iterations from Convex.
 *
 * This hook uses Convex's reactive useQuery which automatically
 * pushes updates to the client when the session changes in the database.
 *
 * This implements US-060: Direct session entity watching via useQuery
 *
 * @param sessionId - The ID of the research session to fetch
 * @returns The session data or undefined while loading, plus error state
 *
 * @example
 * ```tsx
 * const { session, isLoading, error } = useResearchSession(sessionId)
 *
 * if (isLoading) return <LoadingSpinner />
 * if (error) return <ErrorState message={error.message} />
 * if (!session) return <NotFound />
 *
 * return <ResearchSessionView session={session} />
 * ```
 */
export function useResearchSession(sessionId: string | null) {
  // Direct query - Convex auto-updates when entity changes!
  // This is the key pattern from US-060 - no manual subscriptions needed
  const session = useQuery(
    api.researchSessions.queries.get,
    sessionId ? { id: sessionId as any } : 'skip'
  )

  return {
    session: session ?? undefined,
    isLoading: session === undefined,
    error: null, // Convex queries don't throw - they return undefined for missing data
  }
}

/**
 * Hook for fetching a deep research session with its iterations from Convex.
 *
 * This hook uses Convex's reactive useQuery which automatically
 * pushes updates to the client when the session changes in the database.
 *
 * @param sessionId - The ID of the deep research session to fetch
 * @returns The session data or undefined while loading, plus error state
 *
 * @example
 * ```tsx
 * const { session, isLoading, error } = useDeepResearchSession(sessionId)
 *
 * if (isLoading) return <LoadingSpinner />
 * if (error) return <ErrorState message={error.message} />
 * if (!session) return <NotFound />
 *
 * return <DeepResearchDetailView session={session} />
 * ```
 */
export function useDeepResearchSession(sessionId: string | null) {
  const session = useQuery(
    api.research.queries.getDeepResearchSession,
    sessionId ? { sessionId: sessionId as any } : 'skip'
  )

  return {
    session: session ?? undefined,
    isLoading: session === undefined,
    error: null,
  }
}

/**
 * Type guard to check if session is loading
 */
export function isSessionLoading(session: any | undefined): session is undefined {
  return session === undefined
}

/**
 * Type guard to check if session exists
 */
export function sessionExists(session: any | undefined): session is Doc<'researchSessions'> {
  return session !== undefined
}

/**
 * Get the status label for a research session
 */
export function getSessionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Starting research...',
    searching: 'Searching sources...',
    analyzing: 'Analyzing findings...',
    synthesizing: 'Synthesizing results...',
    completed: 'Research complete',
    failed: 'Research failed',
    cancelled: 'Research cancelled',
    running: 'Research in progress...',
  }
  return labels[status] || status
}

/**
 * Calculate progress percentage for a research session
 */
export function calculateSessionProgress(session: Doc<'researchSessions'>): number {
  if (session.currentIteration && session.maxIterations) {
    return (session.currentIteration / session.maxIterations) * 100
  }

  const statusProgress: Record<string, number> = {
    pending: 0,
    searching: 25,
    analyzing: 50,
    synthesizing: 75,
    completed: 100,
    failed: 0,
    cancelled: 0,
    running: 50,
  }

  return statusProgress[session.status] || 0
}
