import { useEffect, useState } from 'react'
import { log } from '@/lib/logger-client'
import { supabase } from '@/lib/supabase'
import type {
  DeepResearchSessionRow,
  DeepResearchIterationRow,
  DeepResearchSessionWithIterations,
} from '@/lib/types/deep-research'

/**
 * Transforms raw database rows to app-level types
 */
function transformSessionRow(row: DeepResearchSessionRow): DeepResearchSessionWithIterations {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    topic: row.topic,
    maxIterations: row.max_iterations,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    iterations: [],
  }
}

function transformIterationRow(row: DeepResearchIterationRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    iterationNumber: row.iteration_number,
    coverageScore: row.coverage_score,
    feedback: row.feedback,
    refinedQueries: row.refined_queries as string[] | null,
    findings: row.findings,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

interface UseDeepResearchSessionResult {
  session: DeepResearchSessionWithIterations | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

interface UseDeepResearchSessionOptions {
  enabled?: boolean
}

/**
 * Hook for fetching a deep research session with its iterations from Supabase.
 *
 * @example
 * ```tsx
 * const { session, loading, error } = useDeepResearchSession(sessionId)
 *
 * if (loading) return <LoadingSpinner />
 * if (error) return <ErrorState message={error.message} />
 * return <DeepResearchDetailView session={session} />
 * ```
 */
export function useDeepResearchSession(
  sessionId: string | null,
  options: UseDeepResearchSessionOptions = {}
): UseDeepResearchSessionResult {
  const { enabled = true } = options

  const [session, setSession] = useState<DeepResearchSessionWithIterations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchSession = async () => {
    if (!sessionId || !enabled) {
      setSession(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch session data
      const { data: sessionData, error: sessionError } = await supabase
        .from('deep_research_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (sessionError) {
        throw new Error(`Failed to fetch session: ${sessionError.message}`)
      }

      if (!sessionData) {
        throw new Error('Session not found')
      }

      // Transform session row
      const transformedSession = transformSessionRow(sessionData as DeepResearchSessionRow)

      // Fetch iterations for this session
      const { data: iterationsData, error: iterationsError } = await supabase
        .from('deep_research_iterations')
        .select('*')
        .eq('session_id', sessionId)
        .order('iteration_number', { ascending: true })

      if (iterationsError) {
        throw new Error(`Failed to fetch iterations: ${iterationsError.message}`)
      }

      // Transform and attach iterations
      const iterations =
        (iterationsData as DeepResearchIterationRow[])?.map(transformIterationRow) ?? []

      setSession({
        ...transformedSession,
        iterations,
      })
    } catch (err) {
      log('useDeepResearchSession').error('Failed to fetch deep research session', err, {
        sessionId,
      })

      setError(err instanceof Error ? err : new Error('Failed to fetch session'))
      setSession(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSession()
  }, [sessionId, enabled])

  return {
    session,
    loading,
    error,
    refetch: fetchSession,
  }
}
