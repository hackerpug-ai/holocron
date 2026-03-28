/**
 * Function call dispatcher for the Holocron voice assistant.
 *
 * Routes OpenAI Realtime function_call events to Convex endpoints,
 * returns results via the data channel, and records execution audit trail.
 *
 * Design: pure function with injected dependencies for testability.
 *
 * CRITICAL:
 * - Use item.call_id (call_XXXX), NOT item.id (item_XXXX)
 * - Always send response.create after conversation.item.create
 * - Pure reads execute immediately; agent dispatchers use timeout
 * - All results JSON.stringified before sending as output
 * - Record each function call via voice.recordCommand mutation
 */

import type { ParsedFunctionCall } from './types'

// ─── Error classification ─────────────────────────────────────────────────────

export type ErrorClass = 'transient' | 'permanent' | 'rate_limit'

export function classifyError(error: unknown): ErrorClass {
  if (error instanceof Error) {
    if (error.message.includes('429')) return 'rate_limit'
    if (error.message.includes('timeout') || error.message.includes('500')) return 'transient'
  }
  return 'permanent'
}

export function getSpokenErrorMessage(errorClass: ErrorClass, context?: string): string {
  switch (errorClass) {
    case 'transient':
      return 'Something went wrong. Let me try again.'
    case 'rate_limit':
      return 'Too many requests. Try again in a moment.'
    case 'permanent':
      return context ? `I couldn't ${context}.` : "I can't do that right now."
  }
}

// ─── Dependency types ────────────────────────────────────────────────────────

export type RouterPush = (path: string) => void

export type ConvexRunner = {
  runAction: (path: string, args: Record<string, unknown>) => Promise<unknown>
  runMutation: (path: string, args: Record<string, unknown>) => Promise<unknown>
  runQuery: (path: string, args: Record<string, unknown>) => Promise<unknown>
}

export type SendEvent = (event: Record<string, unknown>) => void

export type DispatcherDeps = {
  convex: ConvexRunner
  routerPush: RouterPush
  sendEvent: SendEvent
  sessionId: string
  /** Optional override for async timeout ms (default: 60_000) */
  researchTimeoutMs?: number
  /** Optional override for submit_improvement timeout ms (default: 30_000) */
  improvementTimeoutMs?: number
}

// ─── Result types ─────────────────────────────────────────────────────────────

export type DispatchResult = {
  success: boolean
  data?: unknown
  error?: string
}

// ─── Screen path map for navigate_app ─────────────────────────────────────────

const SCREEN_PATHS: Record<string, string> = {
  home: '/',
  documents: '/documents',
  conversations: '/conversations',
  research: '/research',
  improvements: '/improvements',
  settings: '/settings',
}

// ─── Timeout helper ────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T | string> {
  const timer = new Promise<string>((resolve) => {
    setTimeout(() => resolve(timeoutMessage), ms)
  })
  return Promise.race([promise, timer])
}

// ─── Individual tool handlers ──────────────────────────────────────────────────

async function handleSearchKnowledge(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const query = args.query as string
  const results = await deps.convex.runAction('documents/search:hybridSearch', {
    query,
    limit: 10,
  })
  return { success: true, data: results }
}

async function handleListRecentDocuments(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const limit = args.limit !== undefined ? Number(args.limit) : 10
  const results = await deps.convex.runQuery('documents/queries:list', { limit })
  return { success: true, data: results }
}

async function handleGetDocument(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const result = await deps.convex.runQuery('documents/queries:get', {
    id: args.document_id,
  })
  return { success: true, data: result }
}

async function handleGetConversations(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const limit = args.limit !== undefined ? Number(args.limit) : 5
  const results = await deps.convex.runQuery('conversations/queries:list', { limit })
  return { success: true, data: results }
}

async function handleGetResearchSessions(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const limit = args.limit !== undefined ? Number(args.limit) : 5
  const results = await deps.convex.runQuery('researchSessions/queries:list', { limit })
  return { success: true, data: results }
}

async function handleGetImprovements(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const limit = args.limit !== undefined ? Number(args.limit) : 5
  const results = await deps.convex.runQuery('improvements/queries:list', { limit })
  return { success: true, data: results }
}

async function handleCheckAgentStatus(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const result = await deps.convex.runQuery('researchSessions/queries:get', {
    id: args.session_id,
  })
  return { success: true, data: result }
}

async function handleCreateNote(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const id = await deps.convex.runMutation('documents/mutations:create', {
    title: args.title,
    content: args.content,
    category: 'note',
  })
  return { success: true, data: { id } }
}

async function handleNavigateApp(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const screen = args.screen as string
  const path = SCREEN_PATHS[screen] ?? `/${screen}`
  deps.routerPush(path)
  return { success: true, data: { navigatedTo: screen, path } }
}

async function handleStartResearch(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const timeoutMs = deps.researchTimeoutMs ?? 60_000
  const researchPromise = (async (): Promise<DispatchResult> => {
    const sessionId = await deps.convex.runMutation('researchSessions/mutations:create', {
      query: args.topic,
      researchType: 'topic_research',
      inputType: 'voice',
      status: 'pending',
    })
    return { success: true, data: { sessionId } }
  })()

  const result = await withTimeout(
    researchPromise,
    timeoutMs,
    'Research is still running. Ask me to check later.'
  )

  if (typeof result === 'string') {
    return { success: false, data: result, error: result }
  }
  return result
}

async function handleSubmitImprovement(
  args: Record<string, unknown>,
  deps: DispatcherDeps
): Promise<DispatchResult> {
  const timeoutMs = deps.improvementTimeoutMs ?? 30_000
  const improvementPromise = (async (): Promise<DispatchResult> => {
    const id = await deps.convex.runMutation('improvements/mutations:submit', {
      description: args.description,
      sourceScreen: 'voice',
    })
    return { success: true, data: { id } }
  })()

  const result = await withTimeout(
    improvementPromise,
    timeoutMs,
    'Improvement submitted, still being analyzed.'
  )

  if (typeof result === 'string') {
    return { success: false, data: result, error: result }
  }
  return result
}

// ─── Router ────────────────────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>, deps: DispatcherDeps) => Promise<DispatchResult>

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  search_knowledge: handleSearchKnowledge,
  list_recent_documents: handleListRecentDocuments,
  get_document: handleGetDocument,
  get_conversations: handleGetConversations,
  get_research_sessions: handleGetResearchSessions,
  get_improvements: handleGetImprovements,
  check_agent_status: handleCheckAgentStatus,
  create_note: handleCreateNote,
  navigate_app: handleNavigateApp,
  start_research: handleStartResearch,
  submit_improvement: handleSubmitImprovement,
}

// ─── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Dispatch a function call from OpenAI Realtime to the appropriate Convex endpoint.
 *
 * Always returns a result via conversation.item.create + response.create.
 * Never throws — errors are captured and returned as error results.
 * Records audit trail via voice.recordCommand.
 */
export async function dispatchFunctionCall(
  fn: ParsedFunctionCall,
  deps: DispatcherDeps
): Promise<void> {
  const handler = TOOL_HANDLERS[fn.name]

  let result: DispatchResult

  if (!handler) {
    result = {
      success: false,
      error: `Unknown function: ${fn.name}`,
    }
  } else {
    try {
      result = await handler(fn.arguments, deps)
    } catch (err) {
      const errorClass = classifyError(err)

      if (errorClass === 'transient') {
        // Retry once automatically for transient errors
        try {
          result = await handler(fn.arguments, deps)
        } catch {
          // Retry also failed — speak user-friendly message
          result = {
            success: false,
            error: getSpokenErrorMessage('transient'),
          }
        }
      } else {
        // Permanent or rate_limit — no retry
        result = {
          success: false,
          error: getSpokenErrorMessage(errorClass),
        }
      }
    }
  }

  // Return result via data channel — MUST use call_id (call_XXXX)
  deps.sendEvent({
    type: 'conversation.item.create',
    item: {
      type: 'function_call_output',
      call_id: fn.callId,
      output: JSON.stringify(result),
    },
  })

  // Always trigger follow-up response — model won't respond without this
  deps.sendEvent({ type: 'response.create' })

  // Record audit trail (fire-and-forget — do not await, don't block response)
  deps.convex
    .runMutation('voice/mutations:recordCommand', {
      sessionId: deps.sessionId,
      transcript: fn.name,
      intent: fn.name,
      actionType: fn.name,
      success: result.success,
      actionParams: Object.fromEntries(
        Object.entries(fn.arguments).map(([k, v]) => [k, String(v)])
      ),
      result: {
        success: result.success,
        data: result.data,
        error: result.error,
      },
    })
    .catch(() => {
      // Audit trail failure must not disrupt the voice session
    })
}
