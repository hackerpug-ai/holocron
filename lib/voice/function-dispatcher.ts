/**
 * Function call dispatcher for the Holocron voice assistant.
 *
 * Routes OpenAI Realtime function_call events:
 * - navigate_app → client-side (needs router.push)
 * - All other tools → server-side via voice/executeTool action
 *
 * Design: pure function with injected dependencies for testability.
 *
 * CRITICAL:
 * - Use item.call_id (call_XXXX), NOT item.id (item_XXXX)
 * - Always send response.create after conversation.item.create
 * - All results JSON.stringified before sending as output
 * - Record each function call via voice.recordCommand mutation
 */

import type { ParsedFunctionCall } from './types'

// ─── Tool display names ────────────────────────────────────────────────────────

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  // Knowledge Base
  search_knowledge_base: "Searching knowledge...",
  browse_category: "Browsing category...",
  knowledge_base_stats: "Fetching stats...",
  // Documents
  save_document: "Saving document...",
  update_document: "Updating document...",
  get_document: "Loading document...",
  // Research
  quick_research: "Researching...",
  deep_research: "Researching deeply...",
  // Shopping
  shop_search: "Searching products...",
  // Subscriptions
  subscribe: "Subscribing...",
  unsubscribe: "Unsubscribing...",
  list_subscriptions: "Fetching subscriptions...",
  check_subscriptions: "Checking subscriptions...",
  // Discovery
  whats_new: "Checking what's new...",
  toolbelt_search: "Searching toolbelt...",
  // Repository Analysis
  assimilate: "Analyzing repository...",
  // Improvements
  add_improvement: "Submitting improvement...",
  search_improvements: "Searching improvements...",
  get_improvement: "Loading improvement...",
  list_improvements: "Loading improvements...",
  // Voice-Only
  navigate_app: "Navigating...",
}

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
  conversationId: string
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

// ─── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Dispatch a function call from OpenAI Realtime to the appropriate handler.
 *
 * - navigate_app is handled client-side (needs router.push)
 * - All other tools are routed to the server-side executeTool action
 *
 * Always returns a result via conversation.item.create + response.create.
 * Never throws — errors are captured and returned as error results.
 * Records audit trail via voice.recordCommand.
 */
export async function dispatchFunctionCall(
  fn: ParsedFunctionCall,
  deps: DispatcherDeps
): Promise<void> {
  let result: DispatchResult

  if (fn.name === 'navigate_app') {
    // Client-side only — needs router.push
    const screen = fn.arguments.screen as string
    const path = SCREEN_PATHS[screen] ?? `/${screen}`
    deps.routerPush(path)
    result = { success: true, data: { navigatedTo: screen, path } }
  } else {
    // ALL other tools → server-side via executeAgentTool
    try {
      const serverResult = await deps.convex.runAction(
        'voice/executeTool:executeTool',
        {
          toolName: fn.name,
          toolArgs: fn.arguments,
          conversationId: deps.conversationId,
        }
      )
      const typed = serverResult as { success: boolean; content: string; skipContinuation: boolean }
      result = { success: typed.success, data: typed.content }
    } catch (err) {
      const errorClass = classifyError(err)

      if (errorClass === 'transient') {
        try {
          const retryResult = await deps.convex.runAction(
            'voice/executeTool:executeTool',
            { toolName: fn.name, toolArgs: fn.arguments, conversationId: deps.conversationId }
          )
          const typed = retryResult as { success: boolean; content: string; skipContinuation: boolean }
          result = { success: typed.success, data: typed.content }
        } catch {
          result = { success: false, error: getSpokenErrorMessage('transient') }
        }
      } else {
        result = { success: false, error: getSpokenErrorMessage(errorClass) }
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

  // Record audit trail (fire-and-forget — do not await, don't block response).
  // Skip when sessionId is empty (race: function call arrived before session ID
  // was stored in the ref — common at session creation time).
  if (deps.sessionId) {
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
}
