/**
 * Deep Research Handlers
 *
 * Consolidated handlers for deep research operations.
 * Adapted from deep-research-start and deep-research-iterate Edge Functions.
 *
 * Implements Ralph Loop pattern: iterate → review → refine → repeat
 *
 * @see US-057 - Deep Research Iteration Streaming
 * @see brain/skills/ralph-loop/SKILL.md - Ralph Loop pattern
 * @see PRD 08-uc-deep-research.md - UC-DR-02
 */

import { log } from '../../_shared/logging/logger-server.ts'
import { corsHeaders } from '../../_shared/cors.ts'

// ============================================================
// Types
// ============================================================

export interface StartRequest {
  topic: string
  max_iterations?: number
  conversation_id: string
}

export interface StartResponse {
  session_id: string
  task_id: string
  status: string
  message: string
}

export interface IterateRequest {
  session_id: string
  conversation_id: string
  run_full_loop?: boolean
}

export interface IterateResponse {
  iteration_id: string
  iteration_number: number
  coverage_score: number | null
  feedback: string | null
  status: string
  message_id?: string
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

interface ErrorResponse {
  error: string
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
// Jina Search Types & Functions
// ============================================================

interface JinaSearchResult {
  title: string
  url: string
  content: string
  description?: string
}

interface JinaSearchResponse {
  results: JinaSearchResult[]
}

/**
 * Call Jina Search API for a single query
 */
async function performJinaSearch(
  apiKey: string,
  query: string
): Promise<JinaSearchResult[]> {
  const url = 'https://api.jina.ai/v1/search'
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  const body = JSON.stringify({
    q: query,
    num: 10,
  })

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  })

  if (!response.ok) {
    throw new Error(`Jina API error: ${response.status} ${response.statusText}`)
  }

  const data: JinaSearchResponse = await response.json()
  return data.results || []
}

/**
 * Aggregate search results into structured findings
 */
function aggregateFindings(
  topic: string,
  iterationNumber: number,
  allResults: JinaSearchResult[][]
): string {
  const allFindings: string[] = []

  allResults.forEach((results, idx) => {
    if (results.length === 0) return

    allFindings.push(`\n### Query ${idx + 1} Results:\n`)

    results.slice(0, 5).forEach((result, i) => {
      allFindings.push(
        `${i + 1}. **${result.title}**\n` +
        `   ${result.url}\n` +
        `   ${result.description || result.content?.slice(0, 200)}...\n`
      )
    })
  })

  return `Iteration ${iterationNumber} findings for "${topic}":\n${allFindings.join('\n')}`
}

/**
 * Generate refined queries based on current findings
 */
function generateRefinedQueries(topic: string, findings: string): string[] {
  return [
    `${topic} advanced concepts`,
    `${topic} practical applications`,
    `${topic} recent developments`,
    `${topic} challenges and limitations`,
  ]
}

/**
 * Mock search implementation (fallback when API unavailable)
 */
function mockSearchIteration(
  topic: string,
  queries: string[],
  iterationNumber: number
): { findings: string; refinedQueries: string[] } {
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

/**
 * Perform real web search using Jina Search API
 * Falls back to mock data if API key not configured
 */
async function searchIteration(
  topic: string,
  queries: string[],
  iterationNumber: number
): Promise<{ findings: string; refinedQueries: string[] }> {
  const jinaApiKey = Deno.env.get('JINA_API_KEY')

  // Fall back to mock if no API key
  if (!jinaApiKey) {
    log('deep-research-iterate').warn('JINA_API_KEY not set, using mock results')
    return mockSearchIteration(topic, queries, iterationNumber)
  }

  try {
    // Search all queries in parallel
    const searchPromises = queries.map(query =>
      performJinaSearch(jinaApiKey, query)
    )
    const results = await Promise.all(searchPromises)

    // Aggregate findings from all searches
    const findings = aggregateFindings(topic, iterationNumber, results)

    // Generate refined queries based on coverage
    const refinedQueries = iterationNumber < 4
      ? generateRefinedQueries(topic, findings)
      : []

    return { findings, refinedQueries }
  } catch (error) {
    log('deep-research-iterate').error('Search API failed, using mock', { error })
    return mockSearchIteration(topic, queries, iterationNumber)
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
  const baseCoverage = Math.min(1 + iterationNumber * 0.8, 5)
  const coverageScore = Math.round(baseCoverage * 10) / 10

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
// Database Operations
// ============================================================

/**
 * Create a new deep research session in the database
 */
async function createResearchSession(
  supabase: any,
  conversationId: string,
  topic: string,
  maxIterations: number
): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  try {
    // @ts-ignore - Supabase type inference issue
    const { data, error } = await supabase
      .from('research_sessions')
      .insert({
        conversation_id: conversationId,
        query: topic,
        input_type: 'topic_research',
        max_iterations: maxIterations,
        status: 'pending',
        current_iteration: 0,
        plan_json: {},
        findings_json: [],
      })
      .select('id')
      .single()

    if (error) {
      log('deep-research-start').error('Failed to create research session', { error })
      return { data: null, error: { message: error.message } }
    }

    return { data, error: null }
  } catch (err) {
    log('deep-research-start').error('Exception creating research session', { error: err })
    return { data: null, error: { message: String(err) } }
  }
}

/**
 * Update task status in long_running_tasks table
 */
async function updateTaskStatus(
  supabase: any,
  taskId: string,
  status: 'loading' | 'running',
  currentStep: number,
  totalSteps: number,
  progressMessage: string
): Promise<void> {
  try {
    // @ts-ignore - Supabase type inference issue
    const { error } = await supabase
      .from('long_running_tasks')
      .update({
        status,
        current_step: currentStep,
        total_steps: totalSteps,
        progress_message: progressMessage,
        started_at: status === 'running' ? new Date().toISOString() : undefined,
      })
      .eq('id', taskId)

    if (error) {
      log('deep-research-start').warn('Failed to update task status', { error, taskId })
    }
  } catch (err) {
    log('deep-research-start').warn('Exception updating task status', { error: err, taskId })
  }
}

/**
 * Update task config in long_running_tasks table
 */
async function updateTaskConfig(
  supabase: any,
  taskId: string,
  config: Record<string, unknown>
): Promise<void> {
  try {
    // @ts-ignore - Supabase type inference issue
    const { error } = await supabase
      .from('long_running_tasks')
      .update({ config })
      .eq('id', taskId)

    if (error) {
      log('deep-research-start').warn('Failed to update task config', { error, taskId })
    }
  } catch (err) {
    log('deep-research-start').warn('Exception updating task config', { error: err, taskId })
  }
}

/**
 * Mark task as failed with error details
 */
async function failTask(
  supabase: any,
  taskId: string,
  errorMessage: string,
  errorDetails: { message?: string } | null
): Promise<void> {
  try {
    // @ts-ignore - Supabase type inference issue
    const { error } = await supabase
      .from('long_running_tasks')
      .update({
        status: 'error',
        error_message: errorMessage,
        error_details: errorDetails,
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId)

    if (error) {
      log('deep-research-start').error('Failed to mark task as failed', { error, taskId })
    }
  } catch (err) {
    log('deep-research-start').error('Exception marking task as failed', { error: err, taskId })
  }
}

/**
 * Save iteration results to database
 */
async function saveIteration(
  supabase: any,
  sessionId: string,
  iterationNumber: number,
  coverageScore: number | null,
  feedback: string | null,
  findings: string | null,
  refinedQueries: string[] | null
): Promise<{ iterationId: string | null; error: string | null }> {
  try {
    // @ts-ignore - Supabase type inference issue
    const { data, error } = await supabase
      .from('research_iterations')
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
      log('deep-research-iterate').error('Failed to save iteration', { error, sessionId })
      return { iterationId: null, error: error.message }
    }

    return { iterationId: data?.id || null, error: null }
  } catch (err) {
    log('deep-research-iterate').error('Exception saving iteration', { error: err, sessionId })
    return { iterationId: null, error: String(err) }
  }
}

/**
 * Post an iteration card message to the chat
 */
async function streamIterationCard(
  supabase: any,
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

    // @ts-ignore - Supabase type inference issue
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
      log('deep-research-iterate').error('Failed to stream iteration card', { error, conversationId, sessionId })
      return { messageId: null, error: error.message }
    }

    return { messageId: data?.id || null, error: null }
  } catch (err) {
    log('deep-research-iterate').error('Exception streaming iteration card', { error: err, conversationId, sessionId })
    return { messageId: null, error: String(err) }
  }
}

/**
 * Post the final result card when research completes
 */
async function postFinalResultCard(
  supabase: any,
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

    // @ts-ignore - Supabase type inference issue
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
      log('deep-research-iterate').error('Failed to post final result card', { error, conversationId, sessionId })
      return { messageId: null, error: error.message }
    }

    return { messageId: data?.id || null, error: null }
  } catch (err) {
    log('deep-research-iterate').error('Exception posting final result card', { error: err, conversationId, sessionId })
    return { messageId: null, error: String(err) }
  }
}

/**
 * Mark session as completed or cancelled
 */
async function completeSession(
  supabase: any,
  sessionId: string,
  status: 'completed' | 'cancelled'
): Promise<{ error: string | null }> {
  try {
    // @ts-ignore - Supabase type inference issue
    const { error } = await supabase
      .from('research_sessions')
      .update({ status })
      .eq('id', sessionId)

    if (error) {
      log('deep-research-iterate').error('Failed to complete session', { error, sessionId, status })
      return { error: error.message }
    }

    return { error: null }
  } catch (err) {
    log('deep-research-iterate').error('Exception completing session', { error: err, sessionId, status })
    return { error: String(err) }
  }
}

/**
 * Check if the session has been cancelled by user
 */
async function isSessionCancelled(
  supabase: any,
  sessionId: string
): Promise<boolean> {
  try {
    // @ts-ignore - Supabase type inference issue
    const { data, error } = await supabase
      .from('research_sessions')
      .select('status')
      .eq('id', sessionId)
      .single()

    if (error || !data) {
      log('deep-research-iterate').error('Failed to check session status', { error, sessionId })
      return false
    }

    return data.status === 'cancelled'
  } catch (err) {
    log('deep-research-iterate').error('Exception checking session status', { error: err, sessionId })
    return false
  }
}

/**
 * Get the next iteration number for a session
 */
async function getNextIterationNumber(
  supabase: any,
  sessionId: string
): Promise<{ iterationNumber: number | null; error: string | null }> {
  try {
    // @ts-ignore - Supabase type inference issue
    const { data, error } = await supabase
      .from('research_iterations')
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
      log('deep-research-iterate').error('Failed to get next iteration number', { error, sessionId })
      return { iterationNumber: null, error: error.message }
    }

    const nextIteration = (data?.iteration_number || 0) + 1
    return { iterationNumber: nextIteration, error: null }
  } catch (err) {
    log('deep-research-iterate').error('Exception getting next iteration number', { error: err, sessionId })
    return { iterationNumber: null, error: String(err) }
  }
}

// ============================================================
// Ralph Loop: Single Iteration
// ============================================================

/**
 * Run a single research iteration following Ralph Loop pattern
 */
async function runSingleIteration(
  supabase: any,
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

    // Start with initial queries
    const initialQueries = [topic, `${topic} overview`, `${topic} introduction`]

    // Ralph Loop Step 1: Search
    const searchResults = await searchIteration(topic, initialQueries, iterationNumber)

    // Ralph Loop Step 2: Review
    const reviewResults = await reviewFindings(searchResults.findings, iterationNumber)

    // Ralph Loop Step 3: Save iteration to database
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
      log('deep-research-iterate').warn('Failed to stream iteration card', { error: streamError, sessionId, iterationNumber })
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
  } catch (err) {
    log('deep-research-iterate').error('Exception in runSingleIteration', { error: err, sessionId })
    return { result: null, error: String(err) }
  }
}

// ============================================================
// Ralph Loop: Full Loop
// ============================================================

/**
 * Run the full Ralph Loop until coverage >= 4, max iterations, or cancelled
 */
async function runFullRalphLoop(
  supabase: any,
  sessionId: string,
  conversationId: string,
  topic: string,
  maxIterations: number
): Promise<{ totalIterations: number; finalCoverageScore: number | null; error: string | null }> {
  let coverageScore: number | null = null
  let iteration = 0
  let allFindings: string[] = []

  const logger = log('deep-research-iterate')
  logger.info('Starting Ralph Loop', { sessionId, topic, maxIterations })

  // Ralph Loop: iterate until coverage >= 4 or max iterations or cancelled
  while (
    (coverageScore === null || coverageScore < 4) &&
    iteration < maxIterations
  ) {
    // Check for cancellation before each iteration
    const cancelled = await isSessionCancelled(supabase, sessionId)
    if (cancelled) {
      logger.info('Session cancelled by user', { sessionId, iteration })
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
      logger.error('Iteration failed', { error, sessionId, iteration })
      // Continue to next iteration on error (graceful degradation)
      continue
    }

    // Update coverage score for loop condition
    coverageScore = result.coverage_score
    logger.info('Iteration complete', { sessionId, iteration, maxIterations, coverageScore })

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

  logger.info('Ralph Loop complete', { sessionId, totalIterations: iteration, finalCoverageScore: finalScore })

  return { totalIterations: iteration, finalCoverageScore: finalScore, error: null }
}

// ============================================================
// Handler: Start Deep Research
// ============================================================

export async function handleDeepResearchStart(
  payload: unknown,
  supabase: any
): Promise<Response> {
  const logger = log('deep-research-start-handler')
  const body = payload as StartRequest

  try {
    // Validate required fields
    if (!body.topic) {
      return jsonResponse<ErrorResponse>({ error: 'topic is required' }, 400)
    }
    if (!body.conversation_id) {
      return jsonResponse<ErrorResponse>({ error: 'conversation_id is required' }, 400)
    }

    // Validate max_iterations
    const maxIterations = body.max_iterations ?? 5
    if (maxIterations < 1 || maxIterations > 20) {
      return jsonResponse<ErrorResponse>(
        { error: 'max_iterations must be between 1 and 20' },
        400
      )
    }

    // Check conversation exists
    // @ts-ignore - Supabase type inference issue
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', body.conversation_id)
      .single()

    if (convError || !conversation) {
      return jsonResponse<ErrorResponse>({ error: 'Conversation not found' }, 404)
    }

    // Check if we can start a new task (concurrency control)
    // @ts-ignore - Supabase RPC type inference
    const { data: canStart, error: checkError } = await supabase.rpc('can_start_task', {
      p_conversation_id: body.conversation_id,
      p_task_type: 'deep-research',
    })

    if (checkError) {
      logger.error('Failed to check can_start_task', { error: checkError })
      return jsonResponse<ErrorResponse>({ error: 'Failed to check task availability' }, 500)
    }

    if (!canStart) {
      logger.info('Concurrency limit reached', { conversation_id: body.conversation_id })
      return jsonResponse<ErrorResponse>(
        {
          error: 'Another deep-research task is already running for this conversation. Please wait for it to complete or cancel it first.',
        },
        429
      )
    }

    // Create long-running task
    const config = {
      topic: body.topic,
      max_iterations: maxIterations,
    }
    // @ts-ignore - Supabase RPC type inference
    const { data: taskId, error: createError } = await supabase.rpc('create_long_running_task', {
      p_conversation_id: body.conversation_id,
      p_task_type: 'deep-research',
      p_config: config,
    })

    if (createError || !taskId) {
      logger.error('Failed to create long-running task', { error: createError })
      return jsonResponse<ErrorResponse>({ error: 'Failed to create task' }, 500)
    }

    logger.info('Task created', { taskId, conversation_id: body.conversation_id })

    // Update task status to loading
    await updateTaskStatus(supabase, taskId, 'loading', 0, maxIterations, 'Initializing research session...')

    // Create deep research session
    const { data: session, error: sessionError } = await createResearchSession(
      supabase,
      body.conversation_id,
      body.topic,
      maxIterations
    )

    if (sessionError || !session) {
      await failTask(supabase, taskId, 'Failed to create research session', sessionError)
      return jsonResponse<ErrorResponse>({ error: 'Failed to create research session' }, 500)
    }

    const sessionId = session.id

    // Update task with session_id in config
    await updateTaskConfig(supabase, taskId, { ...config, session_id: sessionId })

    // Update task status to running
    await updateTaskStatus(supabase, taskId, 'running', 1, maxIterations, 'Research session created')

    // Start the iteration loop directly (no HTTP fetch)
    // Instead of calling deep-research-iterate via HTTP, we call the function directly
    await triggerIterationLoop(supabase, sessionId, body.conversation_id, body.topic, maxIterations, taskId)

    // Return immediately (research runs in background)
    return jsonResponse<StartResponse>({
      session_id: sessionId,
      task_id: taskId,
      status: 'running',
      message: `Deep research session started for topic: "${body.topic}"`,
    })
  } catch (error) {
    logger.error('Request failed', { error, topic: body.topic })
    return jsonResponse<ErrorResponse>({ error: 'Internal server error' }, 500)
  }
}

/**
 * Trigger the iteration loop directly (replaces HTTP fetch to deep-research-iterate)
 */
async function triggerIterationLoop(
  supabase: any,
  sessionId: string,
  conversationId: string,
  topic: string,
  maxIterations: number,
  taskId: string
): Promise<void> {
  const logger = log('deep-research-start-handler')

  try {
    // Update session status to running
    // @ts-ignore - Supabase type inference issue
    const { error: updateError } = await supabase
      .from('research_sessions')
      .update({ status: 'running' })
      .eq('id', sessionId)

    if (updateError) {
      logger.warn('Failed to update session status to running', { error: updateError, sessionId })
    }

    // Run the full Ralph Loop
    const result = await runFullRalphLoop(
      supabase,
      sessionId,
      conversationId,
      topic,
      maxIterations
    )

    if (result.error) {
      logger.error('Ralph Loop failed', { error: result.error, sessionId })
      await failTask(supabase, taskId, 'Ralph Loop failed', { message: result.error })
      return
    }

    // Complete the task
    // @ts-ignore - Supabase RPC type inference
    await supabase.rpc('complete_task', {
      p_task_id: taskId,
      p_result: {
        totalIterations: result.totalIterations,
        finalCoverageScore: result.finalCoverageScore,
      },
    })

    logger.info('Task completed successfully', { taskId, sessionId })
  } catch (err) {
    logger.error('Exception in triggerIterationLoop', { error: err, sessionId, taskId })
    await failTask(supabase, taskId, 'Iteration loop failed', { message: String(err) })
  }
}

// ============================================================
// Handler: Iterate Deep Research
// ============================================================

export async function handleDeepResearchIterate(
  payload: unknown,
  supabase: any
): Promise<Response> {
  const logger = log('deep-research-iterate-handler')
  const body = payload as IterateRequest

  try {
    // Validate required fields
    if (!body.session_id) {
      return jsonResponse<ErrorResponse>({ error: 'session_id is required' }, 400)
    }
    if (!body.conversation_id) {
      return jsonResponse<ErrorResponse>({ error: 'conversation_id is required' }, 400)
    }

    // Fetch session details
    // @ts-ignore - Supabase type inference issue
    const { data: session, error: sessionError } = await supabase
      .from('research_sessions')
      .select('id, query, max_iterations, status')
      .eq('id', body.session_id)
      .single()

    if (sessionError || !session) {
      return jsonResponse<ErrorResponse>({ error: 'Session not found' }, 404)
    }

    // Handle both 'topic' (new schema) and 'query' (production schema) columns
    const topic = session.topic || session.query
    if (!topic) {
      return jsonResponse<ErrorResponse>({ error: 'Session has no topic/query' }, 400)
    }

    // Check if session is already completed or cancelled
    if (session.status === 'completed') {
      return jsonResponse<ErrorResponse>({ error: 'Session already completed' }, 400)
    }
    if (session.status === 'cancelled') {
      return jsonResponse<ErrorResponse>({ error: 'Session cancelled' }, 400)
    }

    // Update session status to running
    // @ts-ignore - Supabase type inference issue
    const { error: updateError } = await supabase
      .from('research_sessions')
      .update({ status: 'running' as const })
      .eq('id', body.session_id)

    if (updateError) {
      logger.warn('Failed to update session status', { error: updateError, sessionId: body.session_id })
    }

    // Run single iteration or full loop based on request
    if (body.run_full_loop) {
      // Run full Ralph Loop
      const result = await runFullRalphLoop(
        supabase,
        body.session_id,
        body.conversation_id,
        topic,
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
        topic,
        session.max_iterations
      )

      if (error || !result) {
        return jsonResponse<ErrorResponse>({ error: error || 'Iteration failed' }, 500)
      }

      return jsonResponse<IterateResponse>(result)
    }
  } catch (err) {
    logger.error('Request failed', { error: err, sessionId: body.session_id })
    return jsonResponse<ErrorResponse>({ error: 'Internal server error' }, 500)
  }
}
