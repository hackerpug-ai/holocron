/**
 * Deep Research Iterate Edge Function
 *
 * Implements Ralph Loop pattern for multi-iteration research with streaming progress.
 * - POST: Runs a single iteration or starts the full iteration loop for a session
 * - OPTIONS: CORS preflight
 *
 * Ralph Loop: iterate → review → refine → repeat until coverage >= 4 or max iterations
 *
 * @see US-057 - Deep Research Iteration Streaming
 * @see brain/skills/ralph-loop/SKILL.md - Ralph Loop pattern
 * @see PRD 08-uc-deep-research.md - UC-DR-02
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ============================================================
// Types
// ============================================================

interface IterateRequest {
  session_id: string
  conversation_id: string
  run_full_loop?: boolean
}

interface IterateResponse {
  iteration_id: string
  iteration_number: number
  coverage_score: number | null
  feedback: string | null
  status: string
  message_id?: string
}

interface ErrorResponse {
  error: string
}

interface IterationCardData {
  card_type: 'iteration'
  session_id: string
  iteration_number: number
  coverage_score: number | null
  feedback: string | null
  findings: string | null
  estimated_remaining: number
}

interface FinalResultCardData {
  card_type: 'final_result'
  session_id: string
  topic: string
  total_iterations: number
  final_coverage_score: number
  findings_summary: string
}

// ============================================================
// Response Helper
// ============================================================

function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ============================================================
// Ralph Loop: Search Iteration
// ============================================================

/**
 * Simulate a search iteration - in production this would call external search APIs
 * For now, we return mock findings based on the iteration number
 */
async function searchIteration(
  topic: string,
  queries: string[],
  iterationNumber: number
): Promise<{ findings: string; refinedQueries: string[] }> {
  // Mock implementation - in production this would:
  // 1. Call search APIs (Exa, web search, etc.)
  // 2. Aggregate results
  // 3. Return structured findings

  const mockFindings = `Iteration ${iterationNumber} findings for "${topic}": ` +
    `Researched ${queries.length} queries. Found relevant information about ` +
    `${topic.includes('quantum') ? 'quantum computing principles' : 'the topic'}. `

  const refinedQueries = iterationNumber < 4
    ? [
        `${topic} advanced concepts`,
        `${topic} practical applications`,
        `${topic} recent developments`,
      ]
    : []

  return {
    findings: mockFindings,
    refinedQueries,
  }
}

// ============================================================
// Ralph Loop: Review Findings
// ============================================================

/**
 * Review findings and generate coverage score (1-5) + feedback
 * In production this would use an LLM to assess completeness
 */
async function reviewFindings(
  findings: string,
  iterationNumber: number
): Promise<{ coverageScore: number; feedback: string; refinedQueries: string[] }> {
  // Mock implementation - simulate coverage improving over iterations
  // Coverage starts low and improves until reaching 4+
  const baseCoverage = Math.min(1 + iterationNumber * 0.8, 5)
  const coverageScore = Math.round(baseCoverage * 10) / 10 // Round to 1 decimal

  const feedback = coverageScore >= 4
    ? 'Coverage complete. All key aspects of the topic have been thoroughly researched.'
    : `Coverage incomplete. Found initial information but gaps remain in: ` +
      `technical details, practical examples, and recent developments. ` +
      `Refining queries for deeper exploration.`

  const refinedQueries = coverageScore < 4
    ? [
        'technical implementation details',
        'real-world case studies',
        'latest research papers',
      ]
    : []

  return {
    coverageScore,
    feedback,
    refinedQueries,
  }
}

// ============================================================
// Ralph Loop: Save Iteration
// ============================================================

/**
 * Save iteration results to database with proper error handling
 */
async function saveIteration(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  iterationNumber: number,
  coverageScore: number | null,
  feedback: string | null,
  findings: string | null,
  refinedQueries: string[] | null
): Promise<{ iterationId: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('deep_research_iterations')
      .insert({
        session_id: sessionId,
        iteration_number: iterationNumber,
        coverage_score: coverageScore,
        feedback,
        findings,
        refined_queries: refinedQueries,
        status: 'completed' as const,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to save iteration:', error)
      return { iterationId: null, error: error.message }
    }

    return { iterationId: data?.id || null, error: null }
  } catch (error) {
    console.error('Exception saving iteration:', error)
    return { iterationId: null, error: String(error) }
  }
}

// ============================================================
// Ralph Loop: Stream Iteration Card
// ============================================================

/**
 * Post an iteration card message to the chat
 */
async function streamIterationCard(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  sessionId: string,
  iterationNumber: number,
  maxIterations: number,
  coverageScore: number | null,
  feedback: string | null,
  findings: string | null
): Promise<{ messageId: string | null; error: string | null }> {
  try {
    const estimatedRemaining = coverageScore && coverageScore >= 4
      ? 0
      : maxIterations - iterationNumber

    const cardData: IterationCardData = {
      card_type: 'iteration',
      session_id: sessionId,
      iteration_number: iterationNumber,
      coverage_score: coverageScore,
      feedback,
      findings,
      estimated_remaining: estimatedRemaining,
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        role: 'agent' as const,
        content: `Iteration ${iterationNumber}/${maxIterations} complete`,
        message_type: 'result_card' as const,
        card_data: cardData,
        session_id: sessionId,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to stream iteration card:', error)
      return { messageId: null, error: error.message }
    }

    return { messageId: data?.id || null, error: null }
  } catch (error) {
    console.error('Exception streaming iteration card:', error)
    return { messageId: null, error: String(error) }
  }
}

// ============================================================
// Ralph Loop: Post Final Result Card
// ============================================================

/**
 * Post the final result card when research completes
 */
async function postFinalResultCard(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  sessionId: string,
  topic: string,
  totalIterations: number,
  finalCoverageScore: number,
  findingsSummary: string
): Promise<{ messageId: string | null; error: string | null }> {
  try {
    const cardData: FinalResultCardData = {
      card_type: 'final_result',
      session_id: sessionId,
      topic,
      total_iterations: totalIterations,
      final_coverage_score: finalCoverageScore,
      findings_summary: findingsSummary,
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        role: 'agent' as const,
        content: `Deep research complete: ${topic}`,
        message_type: 'result_card' as const,
        card_data: cardData,
        session_id: sessionId,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to post final result card:', error)
      return { messageId: null, error: error.message }
    }

    return { messageId: data?.id || null, error: null }
  } catch (error) {
    console.error('Exception posting final result card:', error)
    return { messageId: null, error: String(error) }
  }
}

// ============================================================
// Ralph Loop: Complete Session
// ============================================================

/**
 * Mark session as completed or cancelled
 */
async function completeSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  status: 'completed' | 'cancelled'
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('deep_research_sessions')
      .update({ status })
      .eq('id', sessionId)

    if (error) {
      console.error('Failed to complete session:', error)
      return { error: error.message }
    }

    return { error: null }
  } catch (error) {
    console.error('Exception completing session:', error)
    return { error: String(error) }
  }
}

// ============================================================
// Ralph Loop: Check if Session is Cancelled
// ============================================================

/**
 * Check if the session has been cancelled by user
 */
async function isSessionCancelled(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('deep_research_sessions')
      .select('status')
      .eq('id', sessionId)
      .single()

    if (error || !data) {
      console.error('Failed to check session status:', error)
      return false // Assume not cancelled on error
    }

    return data.status === 'cancelled'
  } catch (error) {
    console.error('Exception checking session status:', error)
    return false
  }
}

// ============================================================
// Ralph Loop: Get Next Iteration Number
// ============================================================

/**
 * Get the next iteration number for a session
 */
async function getNextIterationNumber(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ iterationNumber: number | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('deep_research_iterations')
      .select('iteration_number')
      .eq('session_id', sessionId)
      .order('iteration_number', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      // No iterations yet, start with 1
      if (error.code === 'PGRST116') {
        return { iterationNumber: 1, error: null }
      }
      console.error('Failed to get next iteration number:', error)
      return { iterationNumber: null, error: error.message }
    }

    const nextIteration = (data?.iteration_number || 0) + 1
    return { iterationNumber: nextIteration, error: null }
  } catch (error) {
    console.error('Exception getting next iteration number:', error)
    return { iterationNumber: null, error: String(error) }
  }
}

// ============================================================
// Ralph Loop: Run Single Iteration
// ============================================================

/**
 * Run a single research iteration following Ralph Loop pattern
 * Returns the iteration results or error
 */
async function runSingleIteration(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  conversationId: string,
  topic: string,
  maxIterations: number
): Promise<{ result: IterateResponse | null; error: string | null }> {
  try {
    // Get next iteration number
    const { iterationNumber, error: iterError } = await getNextIterationNumber(supabase, sessionId)
    if (iterError || !iterationNumber) {
      return { result: null, error: iterError || 'Failed to get iteration number' }
    }

    // Check if we've exceeded max iterations
    if (iterationNumber > maxIterations) {
      await completeSession(supabase, sessionId, 'completed')
      return { result: null, error: 'Max iterations reached' }
    }

    // Start with initial queries or refined queries from previous iteration
    const initialQueries = [topic, `${topic} overview`, `${topic} introduction`]

    // Ralph Loop Step 1: Search
    const searchResults = await searchIteration(topic, initialQueries, iterationNumber)

    // Ralph Loop Step 2: Review
    const reviewResults = await reviewFindings(searchResults.findings, iterationNumber)

    // Ralph Loop Step 3: Save iteration to database BEFORE streaming
    const { iterationId, error: saveError } = await saveIteration(
      supabase,
      sessionId,
      iterationNumber,
      reviewResults.coverageScore,
      reviewResults.feedback,
      searchResults.findings,
      reviewResults.refinedQueries
    )

    if (saveError || !iterationId) {
      return { result: null, error: saveError || 'Failed to save iteration' }
    }

    // Ralph Loop Step 4: Stream iteration card to chat
    const { messageId, error: streamError } = await streamIterationCard(
      supabase,
      conversationId,
      sessionId,
      iterationNumber,
      maxIterations,
      reviewResults.coverageScore,
      reviewResults.feedback,
      searchResults.findings
    )

    if (streamError) {
      console.error('Failed to stream iteration card (continuing anyway):', streamError)
    }

    return {
      result: {
        iteration_id: iterationId,
        iteration_number: iterationNumber,
        coverage_score: reviewResults.coverageScore,
        feedback: reviewResults.feedback,
        status: 'completed',
        message_id: messageId || undefined,
      },
      error: null,
    }
  } catch (error) {
    console.error('Exception in runSingleIteration:', error)
    return { result: null, error: String(error) }
  }
}

// ============================================================
// Ralph Loop: Run Full Loop
// ============================================================

/**
 * Run the full Ralph Loop until coverage >= 4, max iterations, or cancelled
 * This is the main iteration loop for deep research sessions
 */
async function runFullRalphLoop(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  conversationId: string,
  topic: string,
  maxIterations: number
): Promise<{ totalIterations: number; finalCoverageScore: number | null; error: string | null }> {
  let coverageScore: number | null = null
  let iteration = 0
  let allFindings: string[] = []

  console.log(`Starting Ralph Loop for session ${sessionId}: topic="${topic}", max_iterations=${maxIterations}`)

  // Ralph Loop: iterate until coverage >= 4 or max iterations or cancelled
  while (
    (coverageScore === null || coverageScore < 4) &&
    iteration < maxIterations
  ) {
    // Check for cancellation before each iteration
    const cancelled = await isSessionCancelled(supabase, sessionId)
    if (cancelled) {
      console.log(`Session ${sessionId} cancelled by user after ${iteration} iterations`)
      await completeSession(supabase, sessionId, 'cancelled')
      return { totalIterations: iteration, finalCoverageScore: coverageScore, error: null }
    }

    iteration++

    // Run single iteration
    const { result, error } = await runSingleIteration(
      supabase,
      sessionId,
      conversationId,
      topic,
      maxIterations
    )

    if (error || !result) {
      console.error(`Iteration ${iteration} failed:`, error)
      // Continue to next iteration on error (graceful degradation)
      continue
    }

    // Update coverage score for loop condition
    coverageScore = result.coverage_score
    console.log(`Iteration ${iteration}/${maxIterations} complete: coverage=${coverageScore}`)

    // Collect findings for final summary
    if (result.feedback) {
      allFindings.push(result.feedback)
    }
  }

  // Mark session as completed
  await completeSession(supabase, sessionId, 'completed')

  // Post final result card
  const finalScore = coverageScore || 0
  const findingsSummary = allFindings.join('\n\n')
  await postFinalResultCard(
    supabase,
    conversationId,
    sessionId,
    topic,
    iteration,
    finalScore,
    findingsSummary
  )

  console.log(`Ralph Loop complete: ${iteration} iterations, final coverage=${finalScore}`)

  return { totalIterations: iteration, finalCoverageScore: finalScore, error: null }
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return jsonResponse<ErrorResponse>({ error: 'Method not allowed' }, 405)
  }

  // Get environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse<ErrorResponse>({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

  try {
    // Parse request body
    let body: IterateRequest
    try {
      body = await req.json()
    } catch {
      return jsonResponse<ErrorResponse>({ error: 'Invalid JSON body' }, 400)
    }

    // Validate required fields
    if (!body.session_id) {
      return jsonResponse<ErrorResponse>({ error: 'session_id is required' }, 400)
    }
    if (!body.conversation_id) {
      return jsonResponse<ErrorResponse>({ error: 'conversation_id is required' }, 400)
    }

    // Fetch session details
    const { data: session, error: sessionError } = await supabase
      .from('deep_research_sessions')
      .select('id, topic, max_iterations, status')
      .eq('id', body.session_id)
      .single()

    if (sessionError || !session) {
      return jsonResponse<ErrorResponse>({ error: 'Session not found' }, 404)
    }

    // Check if session is already completed or cancelled
    if (session.status === 'completed') {
      return jsonResponse<ErrorResponse>({ error: 'Session already completed' }, 400)
    }
    if (session.status === 'cancelled') {
      return jsonResponse<ErrorResponse>({ error: 'Session cancelled' }, 400)
    }

    // Update session status to running
    const { error: updateError } = await supabase
      .from('deep_research_sessions')
      .update({ status: 'running' as const })
      .eq('id', body.session_id)

    if (updateError) {
      console.error('Failed to update session status:', updateError)
      // Continue anyway
    }

    // Run single iteration or full loop based on request
    if (body.run_full_loop) {
      // Run full Ralph Loop
      const result = await runFullRalphLoop(
        supabase,
        body.session_id,
        body.conversation_id,
        session.topic,
        session.max_iterations
      )

      if (result.error) {
        return jsonResponse<ErrorResponse>({ error: result.error }, 500)
      }

      return jsonResponse({
        session_id: body.session_id,
        total_iterations: result.totalIterations,
        final_coverage_score: result.finalCoverageScore,
        status: 'completed',
      })
    } else {
      // Run single iteration
      const { result, error } = await runSingleIteration(
        supabase,
        body.session_id,
        body.conversation_id,
        session.topic,
        session.max_iterations
      )

      if (error || !result) {
        return jsonResponse<ErrorResponse>({ error: error || 'Iteration failed' }, 500)
      }

      return jsonResponse<IterateResponse>(result)
    }

  } catch (error) {
    console.error('deep-research-iterate error:', error)
    return jsonResponse<ErrorResponse>({ error: 'Internal server error' }, 500)
  }
})
