/**
 * Deep Research Start Edge Function
 *
 * Starts a deep research task with iterative search logic.
 * - POST: Accepts { topic, max_iterations?, conversation_id }
 * - OPTIONS: CORS preflight
 *
 * Integrates with long_running_tasks table for concurrency tracking.
 * Returns 429 if another deep-research task is already running for the conversation.
 *
 * @see US-057 - Deep Research Iteration Streaming
 * @see brain/skills/ralph-loop/SKILL.md - Ralph Loop pattern
 * @see PRD 08-uc-deep-research.md - UC-DR-02
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { log } from '../_shared/logging/index.ts'

// ============================================================
// Types
// ============================================================

interface StartRequest {
  topic: string
  max_iterations?: number
  conversation_id: string
}

interface StartResponse {
  session_id: string
  task_id: string
  status: string
  message: string
}

interface ErrorResponse {
  error: string
}

// ============================================================
// Task Executor Interface
// ============================================================

/**
 * Interface for long-running task executors.
 * All task types should implement this for consistent execution patterns.
 */
interface TaskExecutor<TInput = unknown, TResult = unknown> {
  /**
   * Execute the task with the given input.
   * Should handle all iterations and update progress.
   */
  execute(input: TInput): Promise<TResult>
}

// ============================================================
// Deep Research Executor
// ============================================================

interface DeepResearchResult {
  totalIterations: number
  finalCoverageScore: number | null
  findingsSummary: string
}

/**
 * DeepResearchExecutor implements TaskExecutor for deep research tasks.
 * Uses the Zai agent for research queries with iterative search logic.
 */
class DeepResearchExecutor implements TaskExecutor<StartRequest, StartResponse> {
  private supabase: ReturnType<typeof createClient>
  private taskId: string

  constructor(supabase: ReturnType<typeof createClient>, taskId: string) {
    this.supabase = supabase
    this.taskId = taskId
  }

  /**
   * Execute the deep research task with iterative search logic.
   * Follows Ralph Loop pattern: iterate → review → refine → repeat
   */
  async execute(input: StartRequest): Promise<StartResponse> {
    const { topic, conversation_id } = input
    const maxIterations = input.max_iterations ?? 5
    const logger = log('deep-research-executor')

    logger.info('Starting deep research execution', {
      conversationId: conversation_id,
      taskId: this.taskId,
      topic,
      maxIterations,
    })

    // Update task status to loading
    await this.updateTaskStatus(this.taskId, 'loading', 0, maxIterations, 'Initializing research session...')

    // Create deep research session
    const { data: session, error: sessionError } = await this.createResearchSession(
      conversation_id,
      topic,
      maxIterations
    )

    if (sessionError || !session) {
      await this.failTask(this.taskId, 'Failed to create research session', sessionError)
      throw new Error(sessionError?.message || 'Failed to create research session')
    }

    const actualSessionId = session.id

    // Update task with session_id in config
    await this.updateTaskConfig(this.taskId, { session_id: actualSessionId })

    // Update task status to running
    await this.updateTaskStatus(this.taskId, 'running', 1, maxIterations, 'Research session created')

    // Trigger the first iteration
    // This will continue iteratively until coverage >= 4 or max iterations reached
    await this.triggerFirstIteration(actualSessionId, conversation_id)

    logger.info('Deep research execution initiated', {
      sessionId: actualSessionId,
      taskId: this.taskId,
    })

    // Return initial result (the actual research happens asynchronously via deep-research-iterate)
    return {
      session_id: actualSessionId,
      task_id: this.taskId,
      status: 'running',
      message: `Deep research session started for topic: "${topic}"`,
    }
  }

  /**
   * Create a new deep research session in the database.
   */
  private async createResearchSession(
    conversationId: string,
    topic: string,
    maxIterations: number
  ): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
    try {
      // @ts-ignore - Supabase type inference issue
      const { data, error } = await (this.supabase as any)
        .from('deep_research_sessions')
        .insert({
          conversation_id: conversationId,
          topic,
          max_iterations: maxIterations,
          status: 'pending',
        })
        .select('id')
        .single()

      if (error) {
        log('deep-research-executor').error('Failed to create research session', { error })
        return { data: null, error: { message: error.message } }
      }

      return { data, error: null }
    } catch (err) {
      log('deep-research-executor').error('Exception creating research session', { error: err })
      return { data: null, error: { message: String(err) } }
    }
  }

  /**
   * Trigger the first iteration by calling deep-research-iterate function.
   * This starts the iterative research process.
   */
  private async triggerFirstIteration(
    sessionId: string,
    conversationId: string
  ): Promise<void> {
    const logger = log('deep-research-executor')

    // Update session status to running
    try {
      // @ts-ignore - Supabase type inference issue
      const { error: updateError } = await (this.supabase as any)
        .from('deep_research_sessions')
        .update({ status: 'running' })
        .eq('id', sessionId)

      if (updateError) {
        logger.warn('Failed to update session status to running', { error: updateError, sessionId })
      }
    } catch (err) {
      logger.warn('Exception updating session status', { error: err, sessionId })
    }

    // Call deep-research-iterate function to start the research
    try {
      const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/deep-research-iterate`
      const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

      if (!functionUrl || !supabaseKey) {
        logger.error('Missing environment variables for function call', {
          hasUrl: !!functionUrl,
          hasKey: !!supabaseKey,
        })
        return
      }

      logger.info('Calling deep-research-iterate function', { sessionId, conversationId })

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          conversation_id: conversationId,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.warn('deep-research-iterate returned non-OK status', {
          status: response.status,
          error: errorText,
          sessionId,
        })
      } else {
        logger.info('deep-research-iterate called successfully', { sessionId })
      }
    } catch (err) {
      logger.warn('Failed to call deep-research-iterate', { error: err, sessionId })
      // Don't fail the task - the iterate function will be called by the client or by retry logic
    }
  }

  /**
   * Update task status in the long_running_tasks table.
   */
  private async updateTaskStatus(
    taskId: string,
    status: 'loading' | 'running',
    currentStep: number,
    totalSteps: number,
    progressMessage: string
  ): Promise<void> {
    try {
      // @ts-ignore - Supabase type inference issue
      const { error } = await (this.supabase as any)
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
        log('deep-research-executor').warn('Failed to update task status', { error, taskId })
      }
    } catch (err) {
      log('deep-research-executor').warn('Exception updating task status', { error: err, taskId })
    }
  }

  /**
   * Update task config in the long_running_tasks table.
   */
  private async updateTaskConfig(taskId: string, config: Record<string, unknown>): Promise<void> {
    try {
      // @ts-ignore - Supabase type inference issue
      const { error } = await (this.supabase as any)
        .from('long_running_tasks')
        .update({
          config,
        })
        .eq('id', taskId)

      if (error) {
        log('deep-research-executor').warn('Failed to update task config', { error, taskId })
      }
    } catch (err) {
      log('deep-research-executor').warn('Exception updating task config', { error: err, taskId })
    }
  }

  /**
   * Mark task as failed with error details.
   */
  private async failTask(
    taskId: string,
    errorMessage: string,
    errorDetails: { message?: string } | null
  ): Promise<void> {
    try {
      // @ts-ignore - Supabase type inference issue
      const { error } = await (this.supabase as any)
        .from('long_running_tasks')
        .update({
          status: 'error',
          error_message: errorMessage,
          error_details: errorDetails,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (error) {
        log('deep-research-executor').error('Failed to mark task as failed', { error, taskId })
      }
    } catch (err) {
      log('deep-research-executor').error('Exception marking task as failed', { error: err, taskId })
    }
  }
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
// Generic Task Start Helper
// ============================================================

/**
 * Generic helper to start a long-running task with concurrency control.
 * Checks if a task of the given type can be started for the conversation.
 * Returns 429 if concurrency limit is reached.
 */
async function startTask<TRequest extends { conversation_id: string }, TResponse>(
  supabase: ReturnType<typeof createClient>,
  taskType: 'deep-research' | 'assimilate' | 'shop' | 'research' | 'research-loop' | 'deep-research-teamwork',
  request: TRequest,
  executorFactory: (taskId: string, request: TRequest) => TaskExecutor<TRequest, TResponse>,
  configExtractor: (request: TRequest) => Record<string, unknown>
): Promise<Response> {
  const { conversation_id } = request
  const logger = log('deep-research-start')

  // Step 1: Check if we can start a new task (concurrency control)
  // @ts-ignore - Supabase RPC type inference doesn't work well with Deno
  const { data: canStart, error: checkError } = await supabase.rpc('can_start_task', {
    p_conversation_id: conversation_id,
    p_task_type: taskType,
  })

  if (checkError) {
    logger.error('Failed to check can_start_task', { error: checkError })
    return jsonResponse<ErrorResponse>({ error: 'Failed to check task availability' }, 500)
  }

  if (!canStart) {
    logger.info('Concurrency limit reached', { conversation_id, taskType })
    return jsonResponse<ErrorResponse>(
      {
        error: `Another ${taskType} task is already running for this conversation. Please wait for it to complete or cancel it first.`,
      },
      429
    )
  }

  // Step 2: Create the long-running task
  const config = configExtractor(request)
  // @ts-ignore - Supabase RPC type inference doesn't work well with Deno
  const { data: taskId, error: createError } = await supabase.rpc('create_long_running_task', {
    p_conversation_id: conversation_id,
    p_task_type: taskType,
    p_config: config,
  })

  if (createError || !taskId) {
    logger.error('Failed to create long-running task', { error: createError })
    return jsonResponse<ErrorResponse>({ error: 'Failed to create task' }, 500)
  }

  logger.info('Task created', { taskId, conversation_id, taskType })

  // Step 3: Execute the task
  try {
    const executor = executorFactory(taskId, request)
    const result = await executor.execute(request as unknown as TRequest)

    // Step 4: Complete the task
    // @ts-ignore - Supabase RPC type inference doesn't work well with Deno
    await supabase.rpc('complete_task', {
      p_task_id: taskId,
      p_result: result,
    })

    return jsonResponse<TResponse>(result as TResponse)
  } catch (error) {
    logger.error('Task execution failed', { error, taskId })

    // Fail the task
    // @ts-ignore - Supabase RPC type inference doesn't work well with Deno
    await supabase.rpc('fail_task', {
      p_task_id: taskId,
      p_error_message: String(error),
      p_error_details: { message: String(error) },
    })

    return jsonResponse<ErrorResponse>({ error: 'Task execution failed' }, 500)
  }
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

  // Parse request body
  let body: StartRequest
  try {
    body = await req.json()
  } catch {
    return jsonResponse<ErrorResponse>({ error: 'Invalid JSON body' }, 400)
  }

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

    // Use the generic startTask helper with DeepResearchExecutor
    return await startTask<StartRequest, StartResponse>(
      supabase,
      'deep-research',
      body,
      // Executor factory
      (taskId) => {
        return new DeepResearchExecutor(supabase, taskId)
      },
      // Config extractor
      (request) => ({
        topic: request.topic,
        max_iterations: request.max_iterations ?? 5,
      })
    )
  } catch (error) {
    log('deep-research-start').error('Request failed', { error, body: body?.topic })
    return jsonResponse<ErrorResponse>({ error: 'Internal server error' }, 500)
  }
})
