/**
 * Cancel Session Handler
 *
 * Provides functionality for the /cancel slash command to:
 * - Cancel an active deep research session
 * - Stop the session after the current iteration completes
 * - Prevent cancellation of other users' sessions
 *
 * @see US-061 - Implement /cancel Command Handler
 * @see PRD 08-uc-deep-research.md - UC-DR-02
 */

// ============================================================
// Types
// ============================================================

export interface CancelSession {
  id: string
  query: string
  status: string
  created_at: string
  updated_at: string
  max_iterations: number
  current_iteration?: number
}

export interface CancelResponse {
  content: string
  message_type: 'text' | 'error' | 'success'
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Get the active running session for a conversation
 *
 * Queries for sessions with status 'running' in the given conversation.
 * If multiple sessions are running (edge case), returns the most recent one.
 *
 * @param supabase - Supabase client instance
 * @param conversationId - The conversation ID to filter by
 * @returns The active session or null if none found
 */
export async function getActiveSession(
  supabase: any,
  conversationId: string
): Promise<CancelSession | null> {
  try {
    const { data: session, error } = await supabase
      .from('research_sessions')
      .select('id, query, status, created_at, updated_at, max_iterations')
      .eq('conversation_id', conversationId)
      .eq('status', 'running')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No session found
        return null
      }
      console.error('Error fetching active session:', error)
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
      query: session.query,
      status: session.status,
      created_at: session.created_at,
      updated_at: session.updated_at,
      max_iterations: session.max_iterations,
      current_iteration: currentIteration,
    }
  } catch (error) {
    console.error('Error in getActiveSession:', error)
    throw error
  }
}

/**
 * Cancel a session by updating its status to 'cancelled'
 *
 * This performs an atomic update to the session status.
 * RLS policies will prevent users from canceling other users' sessions.
 *
 * @param supabase - Supabase client instance
 * @param sessionId - The session ID to cancel
 * @returns true if cancellation was successful, false otherwise
 */
export async function cancelSession(
  supabase: any,
  sessionId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('research_sessions')
      .update({ status: 'cancelled' })
      .eq('id', sessionId)

    if (error) {
      console.error('Error canceling session:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in cancelSession:', error)
    return false
  }
}

// ============================================================
// Handler Functions
// ============================================================

/**
 * Handle the /cancel slash command
 *
 * This is the main entry point for the /cancel command.
 * It finds the active running session in the conversation and
 * marks it as 'cancelled' so it will stop after the current iteration.
 *
 * @param args - The command arguments string (should be empty for /cancel)
 * @param supabase - Supabase client instance
 * @param conversationId - The conversation ID
 * @returns CancelResponse with content and message_type
 *
 * @example
 * // Cancel active session
 * handleCancelCommand('', supabase, convId)
 * // => { content: 'Research will stop after current iteration completes', message_type: 'success' }
 *
 * @example
 * // No active session
 * handleCancelCommand('', supabase, convId)
 * // => { content: 'No active research to cancel', message_type: 'text' }
 */
export async function handleCancelCommand(
  args: string,
  supabase: any,
  conversationId: string
): Promise<CancelResponse> {
  try {
    // /cancel takes no arguments
    const trimmedArgs = args.trim()

    if (trimmedArgs && trimmedArgs !== '') {
      return {
        content: 'The /cancel command doesn\'t take any arguments. It will cancel the active research session in this conversation.',
        message_type: 'text',
      }
    }

    // Find the active running session
    const session = await getActiveSession(supabase, conversationId)

    if (!session) {
      return {
        content: 'No active research to cancel. Start a new research session with /deep-research.',
        message_type: 'text',
      }
    }

    // Cancel the session
    const success = await cancelSession(supabase, session.id)

    if (!success) {
      return {
        content: 'Failed to cancel the research session. Please try again later.',
        message_type: 'error',
      }
    }

    return {
      content: `Research will stop after current iteration completes. Session "${session.query}" marked as cancelled.`,
      message_type: 'success',
    }
  } catch (error) {
    console.error('Error handling cancel command:', error)

    // Check if it's a permission error (403)
    if (error && typeof error === 'object' && 'code' in error) {
      const errorCode = (error as any).code
      if (errorCode === '42501' || errorCode === 'PGRST116') {
        return {
          content: 'You don\'t have permission to cancel this research session.',
          message_type: 'error',
        }
      }
    }

    return {
      content: 'Sorry, I couldn\'t process your cancel request. Please try again later.',
      message_type: 'error',
    }
  }
}
