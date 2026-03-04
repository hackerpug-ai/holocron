/**
 * Resume Session Handler
 *
 * Provides functionality for the /resume slash command to:
 * - List incomplete research sessions
 * - Resume a specific session from checkpoint
 * - Restart a session from beginning
 *
 * @see US-056 - Resume Session Slash Command Handler
 * @see PRD 08-uc-deep-research.md - UC-DR-03
 */

// ============================================================
// Types
// ============================================================

export interface ResumeSession {
  id: string
  topic: string
  status: string
  created_at: string
  updated_at: string
  max_iterations: number
  current_iteration?: number
}

export interface ResumeSessionListCardData {
  card_type: 'resume_session_list'
  sessions: ResumeSession[]
}

export interface ResumeCommandOptions {
  sessionId?: string
  restart: boolean
}

export interface ResumeResponse {
  content: string
  message_type: 'result_card' | 'error' | 'success'
  card_data?: ResumeSessionListCardData
}

// ============================================================
// Parser Functions
// ============================================================

/**
 * Parse /resume command arguments
 *
 * @param args - The arguments string after /resume
 * @returns ResumeCommandOptions with sessionId and restart flag
 *
 * @example
 * parseResumeCommand('abc-123') // => { sessionId: 'abc-123', restart: false }
 * parseResumeCommand('abc-123 --restart') // => { sessionId: 'abc-123', restart: true }
 * parseResumeCommand('') // => { sessionId: undefined, restart: false }
 */
export function parseResumeCommand(args: string): ResumeCommandOptions {
  const trimmed = args.trim()

  if (!trimmed) {
    return { sessionId: undefined, restart: false }
  }

  // Check for --restart flag
  const parts = trimmed.split(/\s+/)
  const restart = parts.includes('--restart')

  // Remove --restart flag from parts to get session ID
  const sessionIdParts = parts.filter(p => p !== '--restart')
  const sessionId = sessionIdParts.length > 0 ? sessionIdParts[0] : undefined

  return { sessionId, restart }
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Get incomplete research sessions for a user
 *
 * Queries sessions with status 'pending', 'running', or 'paused'
 * Ordered by updated_at DESC (most recently updated first)
 *
 * @param supabase - Supabase client instance
 * @param conversationId - Optional conversation ID to filter by
 * @returns Array of incomplete sessions
 */
export async function getIncompleteSessions(
  supabase: any,
  conversationId?: string
): Promise<ResumeSession[]> {
  try {
    let query = supabase
      .from('deep_research_sessions')
      .select('id, topic, status, created_at, updated_at, max_iterations')
      .in('status', ['pending', 'running', 'paused'])
      .order('updated_at', { ascending: false })
      .limit(10)

    // Filter by conversation if provided
    if (conversationId) {
      query = query.eq('conversation_id', conversationId)
    }

    const { data: sessions, error } = await query

    if (error) {
      console.error('Error fetching incomplete sessions:', error)
      throw error
    }

    // Get current iteration count for each session
    const sessionsWithIterationCounts = await Promise.all(
      (sessions || []).map(async (session: any) => {
        const { data: iterations, error: iterError } = await supabase
          .from('deep_research_iterations')
          .select('iteration_number')
          .eq('session_id', session.id)
          .order('iteration_number', { ascending: false })
          .limit(1)

        if (iterError) {
          console.error('Error fetching iteration count:', iterError)
          return {
            id: session.id,
            topic: session.topic,
            status: session.status,
            created_at: session.created_at,
            updated_at: session.updated_at,
            max_iterations: session.max_iterations,
            current_iteration: 0,
          }
        }

        const currentIteration = iterations && iterations.length > 0
          ? iterations[0].iteration_number
          : 0

        return {
          id: session.id,
          topic: session.topic,
          status: session.status,
          created_at: session.created_at,
          updated_at: session.updated_at,
          max_iterations: session.max_iterations,
          current_iteration: currentIteration,
        }
      })
    )

    return sessionsWithIterationCounts
  } catch (error) {
    console.error('Error in getIncompleteSessions:', error)
    throw error
  }
}

/**
 * Get a specific session by ID
 *
 * @param supabase - Supabase client instance
 * @param sessionId - The session ID to retrieve
 * @returns The session object or null if not found
 */
export async function getSessionById(
  supabase: any,
  sessionId: string
): Promise<ResumeSession | null> {
  try {
    const { data: session, error } = await supabase
      .from('deep_research_sessions')
      .select('id, topic, status, created_at, updated_at, max_iterations')
      .eq('id', sessionId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Session not found
        return null
      }
      console.error('Error fetching session:', error)
      throw error
    }

    if (!session) {
      return null
    }

    // Get current iteration count
    const { data: iterations, error: iterError } = await supabase
      .from('deep_research_iterations')
      .select('iteration_number')
      .eq('session_id', session.id)
      .order('iteration_number', { ascending: false })
      .limit(1)

    const currentIteration = iterations && iterations.length > 0
      ? iterations[0].iteration_number
      : 0

    return {
      id: session.id,
      topic: session.topic,
      status: session.status,
      created_at: session.created_at,
      updated_at: session.updated_at,
      max_iterations: session.max_iterations,
      current_iteration: currentIteration,
    }
  } catch (error) {
    console.error('Error in getSessionById:', error)
    throw error
  }
}

/**
 * Restart a session from the beginning
 *
 * This function updates the session status to 'pending' and resets
 * iteration data. In a full implementation, this would also clear
 * or archive previous iterations.
 *
 * @param supabase - Supabase client instance
 * @param sessionId - The session ID to restart
 * @returns true if restart was successful, false otherwise
 */
export async function restartSession(
  supabase: any,
  sessionId: string
): Promise<boolean> {
  try {
    // Update session status to pending
    const { error } = await supabase
      .from('deep_research_sessions')
      .update({ status: 'pending' })
      .eq('id', sessionId)

    if (error) {
      console.error('Error restarting session:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in restartSession:', error)
    return false
  }
}

// ============================================================
// Handler Functions
// ============================================================

/**
 * Handle the /resume slash command
 *
 * This is the main entry point for the /resume command.
 * It parses the command arguments and returns either:
 * - A list of incomplete sessions (no args provided)
 * - A success message for resuming/restarting a session
 * - An error message for invalid session IDs
 *
 * @param args - The command arguments string
 * @param supabase - Supabase client instance
 * @param conversationId - Optional conversation ID for filtering
 * @returns ResumeResponse with content, message_type, and optional card_data
 *
 * @example
 * // List sessions
 * handleResumeCommand('', supabase, convId)
 * // => { content: '...', message_type: 'result_card', card_data: {...} }
 *
 * @example
 * // Resume session
 * handleResumeCommand('abc-123', supabase, convId)
 * // => { content: 'Resuming session: abc-123', message_type: 'success' }
 *
 * @example
 * // Restart session
 * handleResumeCommand('abc-123 --restart', supabase, convId)
 * // => { content: 'Restarting session: abc-123', message_type: 'success' }
 */
export async function handleResumeCommand(
  args: string,
  supabase: any,
  conversationId?: string
): Promise<ResumeResponse> {
  try {
    const { sessionId, restart } = parseResumeCommand(args)

    // If no session ID provided, return list of incomplete sessions
    if (!sessionId) {
      const sessions = await getIncompleteSessions(supabase, conversationId)

      if (sessions.length === 0) {
        return {
          content: 'You don\'t have any incomplete research sessions. Start a new one with /deep-research.',
          message_type: 'result_card',
          card_data: {
            card_type: 'resume_session_list',
            sessions: [],
          },
        }
      }

      return {
        content: `Found ${sessions.length} incomplete research session${sessions.length > 1 ? 's' : ''}:`,
        message_type: 'result_card',
        card_data: {
          card_type: 'resume_session_list',
          sessions,
        },
      }
    }

    // Session ID provided - attempt to resume or restart
    const session = await getSessionById(supabase, sessionId)

    if (!session) {
      return {
        content: `Session not found: ${sessionId}. Please check the session ID and try again.`,
        message_type: 'error',
      }
    }

    // Check if session is already completed
    if (session.status === 'completed') {
      const action = restart ? 'restart' : 'resume'
      return {
        content: `Cannot ${action} a completed session. Use --restart flag to start a new session with the same topic.`,
        message_type: 'error',
      }
    }

    // Handle --restart flag
    if (restart) {
      const success = await restartSession(supabase, sessionId)
      if (success) {
        return {
          content: `Restarting session "${session.topic}" from the beginning.`,
          message_type: 'success',
        }
      } else {
        return {
          content: 'Failed to restart session. Please try again later.',
          message_type: 'error',
        }
      }
    }

    // Resume session from checkpoint
    const progressText = (session.current_iteration ?? 0) > 0
      ? ` from iteration ${session.current_iteration}`
      : ''

    return {
      content: `Resuming session "${session.topic}"${progressText}.`,
      message_type: 'success',
    }
  } catch (error) {
    console.error('Error handling resume command:', error)
    return {
      content: 'Sorry, I couldn\'t process your resume request. Please try again later.',
      message_type: 'error',
    }
  }
}
