import { describe, it, expect, vi } from 'vitest'
import { dispatchFunctionCall, classifyError, getSpokenErrorMessage } from '@/lib/voice/function-dispatcher'
import type { DispatcherDeps } from '@/lib/voice/function-dispatcher'
import type { ParsedFunctionCall } from '@/lib/voice/types'

function makeDeps(overrides: Partial<DispatcherDeps> = {}): DispatcherDeps {
  return {
    convex: {
      runAction: vi.fn().mockResolvedValue([]),
      runMutation: vi.fn().mockResolvedValue('mock-id'),
      runQuery: vi.fn().mockResolvedValue([]),
    },
    routerPush: vi.fn(),
    sendEvent: vi.fn(),
    sessionId: 'session123' as unknown as string,
    ...overrides,
  }
}

function makeFunctionCall(
  name: string,
  args: Record<string, unknown> = {},
  callId = 'call_abc123'
): ParsedFunctionCall {
  return { callId, name, arguments: args }
}

// Helper to get the conversation.item.create call
function getItemCreateCall(sendEvent: ReturnType<typeof vi.fn>) {
  const call = sendEvent.mock.calls.find(
    (args: unknown[]) => (args[0] as Record<string, unknown>).type === 'conversation.item.create'
  )
  return call ? (call[0] as Record<string, unknown>) : undefined
}

// Helper to get the response.create call
function getResponseCreateCall(sendEvent: ReturnType<typeof vi.fn>) {
  const call = sendEvent.mock.calls.find(
    (args: unknown[]) => (args[0] as Record<string, unknown>).type === 'response.create'
  )
  return call ? (call[0] as Record<string, unknown>) : undefined
}

// ─── AC-1: dispatch search_knowledge ─────────────────────────────────────────

describe('dispatch search_knowledge', () => {
  it('calls Convex hybridSearch action with query, sends result via conversation.item.create with matching call_id, then response.create', async () => {
    const mockResults = [{ _id: 'doc1', title: 'Voice Research', score: 0.9 }]
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockResolvedValue(mockResults),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue([]),
      },
    })

    const fn = makeFunctionCall('search_knowledge', { query: 'test query' }, 'call_search1')
    await dispatchFunctionCall(fn, deps)

    // Must call hybridSearch action
    expect(deps.convex.runAction).toHaveBeenCalledWith(
      'documents/search:hybridSearch',
      expect.objectContaining({ query: 'test query' })
    )

    // Must send conversation.item.create with correct call_id
    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(itemCreate).toBeDefined()
    const item = itemCreate!.item as Record<string, unknown>
    expect(item.call_id).toBe('call_search1')
    expect(item.type).toBe('function_call_output')

    // Output must be JSON-stringified result
    const output = JSON.parse(item.output as string) as { success: boolean; data: unknown }
    expect(output.success).toBe(true)
    expect(output.data).toEqual(mockResults)

    // Must send response.create after
    const responseCreate = getResponseCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(responseCreate).toBeDefined()
    expect(responseCreate!.type).toBe('response.create')

    // response.create must come after conversation.item.create
    const allCalls = (deps.sendEvent as ReturnType<typeof vi.fn>).mock.calls
    const itemCreateIndex = allCalls.findIndex(
      (args: unknown[]) => (args[0] as Record<string, unknown>).type === 'conversation.item.create'
    )
    const responseCreateIndex = allCalls.findIndex(
      (args: unknown[]) => (args[0] as Record<string, unknown>).type === 'response.create'
    )
    expect(itemCreateIndex).toBeGreaterThanOrEqual(0)
    expect(responseCreateIndex).toBeGreaterThan(itemCreateIndex)
  })

  it('uses call_id from callId field, not item.id', async () => {
    const deps = makeDeps()
    const fn = makeFunctionCall('search_knowledge', { query: 'test' }, 'call_CORRECT')
    await dispatchFunctionCall(fn, deps)

    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    expect(item.call_id).toBe('call_CORRECT')
  })
})

// ─── AC-2: dispatch create_note ───────────────────────────────────────────────

describe('dispatch create_note', () => {
  it('calls Convex documents.create mutation, returns success result, records voiceCommand with success=true', async () => {
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockResolvedValue(null),
        runMutation: vi.fn().mockResolvedValue('new-doc-id'),
        runQuery: vi.fn().mockResolvedValue(null),
      },
    })

    const fn = makeFunctionCall(
      'create_note',
      { title: 'Test Note', content: 'Content here' },
      'call_note1'
    )
    await dispatchFunctionCall(fn, deps)

    // Must call documents create mutation
    expect(deps.convex.runMutation).toHaveBeenCalledWith(
      'documents/mutations:create',
      expect.objectContaining({
        title: 'Test Note',
        content: 'Content here',
        category: 'note',
      })
    )

    // Must return success result
    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean }
    expect(output.success).toBe(true)

    // Must record voiceCommand — wait a tick for fire-and-forget
    await new Promise((resolve) => setTimeout(resolve, 10))
    const recordCalls = (deps.convex.runMutation as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: unknown[]) => args[0] === 'voice/mutations:recordCommand'
    )
    expect(recordCalls.length).toBeGreaterThan(0)
    const recordArgs = recordCalls[0][1] as Record<string, unknown>
    expect(recordArgs.success).toBe(true)
  })
})

// ─── AC-3: dispatch navigate_app ─────────────────────────────────────────────

describe('dispatch navigate_app', () => {
  it('calls router.push with correct path for settings, returns success result', async () => {
    const deps = makeDeps()

    const fn = makeFunctionCall('navigate_app', { screen: 'settings' }, 'call_nav1')
    await dispatchFunctionCall(fn, deps)

    expect(deps.routerPush).toHaveBeenCalledWith('/settings')

    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    expect(item.call_id).toBe('call_nav1')

    const output = JSON.parse(item.output as string) as { success: boolean; data: { navigatedTo: string } }
    expect(output.success).toBe(true)
    expect(output.data.navigatedTo).toBe('settings')
  })

  it('maps all known screens to correct paths', async () => {
    const screenPaths: Record<string, string> = {
      home: '/',
      documents: '/documents',
      conversations: '/conversations',
      research: '/research',
      improvements: '/improvements',
      settings: '/settings',
    }

    for (const [screen, expectedPath] of Object.entries(screenPaths)) {
      const routerPush = vi.fn()
      const deps = makeDeps({ routerPush })
      const fn = makeFunctionCall('navigate_app', { screen }, `call_nav_${screen}`)
      await dispatchFunctionCall(fn, deps)
      expect(routerPush).toHaveBeenCalledWith(expectedPath)
    }
  })
})

// ─── AC-4: dispatch error — pure read fails ───────────────────────────────────

describe('dispatch error handling', () => {
  it('returns error result via conversation.item.create (not thrown) when Convex throws, records voiceCommand with success=false', async () => {
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockRejectedValue(new Error('Convex search failed')),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue(null),
      },
    })

    const fn = makeFunctionCall('search_knowledge', { query: 'failing query' }, 'call_fail1')

    // Must NOT throw
    await expect(dispatchFunctionCall(fn, deps)).resolves.toBeUndefined()

    // Must send error result, not throw — error must be user-friendly (no raw error text)
    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(itemCreate).toBeDefined()
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; error: string }
    expect(output.success).toBe(false)
    // Must NOT expose raw error message to user
    expect(output.error).not.toContain('Convex search failed')
    expect(output.error).toBeDefined()

    // Must still send response.create
    const responseCreate = getResponseCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(responseCreate).toBeDefined()

    // Must record voiceCommand with success=false
    await new Promise((resolve) => setTimeout(resolve, 10))
    const recordCalls = (deps.convex.runMutation as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: unknown[]) => args[0] === 'voice/mutations:recordCommand'
    )
    expect(recordCalls.length).toBeGreaterThan(0)
    const recordArgs = recordCalls[0][1] as Record<string, unknown>
    expect(recordArgs.success).toBe(false)
  })

  it('handles unknown function name by returning error result without throwing', async () => {
    const deps = makeDeps()
    const fn = makeFunctionCall('nonexistent_tool', {}, 'call_unknown1')

    await expect(dispatchFunctionCall(fn, deps)).resolves.toBeUndefined()

    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; error: string }
    expect(output.success).toBe(false)
    expect(output.error).toContain('Unknown function: nonexistent_tool')
  })
})

// ─── AC-5: dispatch async start_research with timeout ────────────────────────

describe('dispatch async start_research', () => {
  it('returns result within timeout when Convex mutation resolves quickly', async () => {
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockResolvedValue(null),
        runMutation: vi.fn().mockResolvedValue('research-session-id'),
        runQuery: vi.fn().mockResolvedValue(null),
      },
      researchTimeoutMs: 5000,
    })

    const fn = makeFunctionCall('start_research', { topic: 'AI safety' }, 'call_research1')
    await dispatchFunctionCall(fn, deps)

    expect(deps.convex.runMutation).toHaveBeenCalledWith(
      'researchSessions/mutations:create',
      expect.objectContaining({ query: 'AI safety' })
    )

    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; data: { sessionId: string } }
    expect(output.success).toBe(true)
    expect(output.data.sessionId).toBe('research-session-id')
  })

  it('returns timeout message when Convex mutation exceeds timeout', async () => {
    const TIMEOUT_MS = 50
    // Simulate a slow mutation that won't resolve within our short timeout
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockResolvedValue(null),
        runMutation: vi.fn().mockImplementation(
          (path: string) =>
            path === 'researchSessions/mutations:create'
              ? new Promise((resolve) => setTimeout(() => resolve('session-id'), TIMEOUT_MS * 10))
              : Promise.resolve('cmd-id')
        ),
        runQuery: vi.fn().mockResolvedValue(null),
      },
      researchTimeoutMs: TIMEOUT_MS,
    })

    const fn = makeFunctionCall('start_research', { topic: 'slow topic' }, 'call_timeout1')
    await dispatchFunctionCall(fn, deps)

    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; error: string; data: string }
    // Timeout returns the timeout message as data/error
    expect(output.data).toContain('Research is still running')
  }, 5000)
})

// ─── sendEvent ordering ───────────────────────────────────────────────────────

describe('sendEvent ordering', () => {
  it('always sends response.create after conversation.item.create', async () => {
    const deps = makeDeps()
    const fn = makeFunctionCall('navigate_app', { screen: 'home' })
    await dispatchFunctionCall(fn, deps)

    const allCalls = (deps.sendEvent as ReturnType<typeof vi.fn>).mock.calls
    const types = allCalls.map((args: unknown[]) => (args[0] as Record<string, unknown>).type)

    const itemIdx = types.indexOf('conversation.item.create')
    const responseIdx = types.indexOf('response.create')

    expect(itemIdx).toBeGreaterThanOrEqual(0)
    expect(responseIdx).toBeGreaterThan(itemIdx)
  })
})

// ─── US-018: Execution failure handling ──────────────────────────────────────

// ─── US-018 AC-1: transient retry ────────────────────────────────────────────

describe('transient retry - AC-1', () => {
  it('retries once on transient error (network timeout); succeeds on retry without spoken message', async () => {
    let callCount = 0
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) return Promise.reject(new Error('network timeout'))
          return Promise.resolve([{ _id: 'doc1' }])
        }),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue([]),
      },
    })

    const fn = makeFunctionCall('search_knowledge', { query: 'test' }, 'call_transient1')
    await dispatchFunctionCall(fn, deps)

    // Should have called the action twice (initial + retry)
    expect(deps.convex.runAction).toHaveBeenCalledTimes(2)
    // After retry succeeds, result should be success
    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean }
    expect(output.success).toBe(true)
  })

  it('speaks user-friendly message after transient error retry also fails', async () => {
    const transientError = new Error('network timeout')
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockRejectedValue(transientError),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue([]),
      },
    })

    const fn = makeFunctionCall('search_knowledge', { query: 'test' }, 'call_transient2')
    await dispatchFunctionCall(fn, deps)

    // Should have attempted twice (initial + retry)
    expect(deps.convex.runAction).toHaveBeenCalledTimes(2)

    // Error message must be user-friendly, not raw error
    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; error: string }
    expect(output.success).toBe(false)
    expect(output.error).not.toContain('network timeout')
    expect(output.error).toBe('Something went wrong. Let me try again.')
  })
})

// ─── US-018 AC-2: permanent error ────────────────────────────────────────────

describe('permanent error - AC-2', () => {
  it('does not retry on permanent error (404 not found) and speaks user-friendly message', async () => {
    const permanentError = new Error('404 not found')
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockResolvedValue([]),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockRejectedValue(permanentError),
      },
    })

    const fn = makeFunctionCall('get_document', { document_id: 'missing-doc' }, 'call_perm1')
    await dispatchFunctionCall(fn, deps)

    // Should only attempt once — no retry for permanent errors
    expect(deps.convex.runQuery).toHaveBeenCalledTimes(1)

    // Error message must be user-friendly
    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; error: string }
    expect(output.success).toBe(false)
    expect(output.error).not.toContain('404')
    expect(output.error).not.toContain('not found')
  })

  it('session continues after permanent error (does not throw)', async () => {
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockResolvedValue([]),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockRejectedValue(new Error('403 permission denied')),
      },
    })

    const fn = makeFunctionCall('get_document', { document_id: 'forbidden' }, 'call_perm2')

    // Must NOT throw — session continues
    await expect(dispatchFunctionCall(fn, deps)).resolves.toBeUndefined()

    // Must still send response.create so model can continue
    const responseCreate = getResponseCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(responseCreate).toBeDefined()
  })
})

// ─── US-018 AC-3: rate limit ──────────────────────────────────────────────────

describe('rate limit - AC-3', () => {
  it('speaks "Too many requests" message on 429 error without retrying', async () => {
    const rateLimitError = new Error('429 rate limit exceeded')
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockRejectedValue(rateLimitError),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue([]),
      },
    })

    const fn = makeFunctionCall('search_knowledge', { query: 'test' }, 'call_rate1')
    await dispatchFunctionCall(fn, deps)

    // Must NOT retry for rate limit
    expect(deps.convex.runAction).toHaveBeenCalledTimes(1)

    // Error message must be the rate limit message
    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; error: string }
    expect(output.success).toBe(false)
    expect(output.error).toBe('Too many requests. Try again in a moment.')
  })
})

// ─── US-018 AC-4: error logged ───────────────────────────────────────────────

describe('error logged - AC-4', () => {
  it('records voiceCommand with success=false and error type on any execution failure', async () => {
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockRejectedValue(new Error('500 internal server error')),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue([]),
      },
    })

    const fn = makeFunctionCall('search_knowledge', { query: 'test' }, 'call_log1')
    await dispatchFunctionCall(fn, deps)

    // Wait for fire-and-forget recordCommand
    await new Promise((resolve) => setTimeout(resolve, 10))

    const recordCalls = (deps.convex.runMutation as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: unknown[]) => args[0] === 'voice/mutations:recordCommand'
    )
    expect(recordCalls.length).toBeGreaterThan(0)
    const recordArgs = recordCalls[0][1] as Record<string, unknown>
    expect(recordArgs.success).toBe(false)
    const result = recordArgs.result as Record<string, unknown>
    expect(result.error).toBeDefined()
    expect(result.success).toBe(false)
  })

  it('records voiceCommand with success=false on permanent error', async () => {
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockResolvedValue([]),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockRejectedValue(new Error('404 not found')),
      },
    })

    const fn = makeFunctionCall('get_document', { document_id: 'missing' }, 'call_log2')
    await dispatchFunctionCall(fn, deps)

    await new Promise((resolve) => setTimeout(resolve, 10))

    const recordCalls = (deps.convex.runMutation as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: unknown[]) => args[0] === 'voice/mutations:recordCommand'
    )
    expect(recordCalls.length).toBeGreaterThan(0)
    const recordArgs = recordCalls[0][1] as Record<string, unknown>
    expect(recordArgs.success).toBe(false)
  })
})

// ─── classifyError unit tests ─────────────────────────────────────────────────

describe('classifyError', () => {
  it('classifies timeout as transient', () => {
    expect(classifyError(new Error('network timeout'))).toBe('transient')
  })

  it('classifies 500 as transient', () => {
    expect(classifyError(new Error('500 internal server error'))).toBe('transient')
  })

  it('classifies 429 as rate_limit', () => {
    expect(classifyError(new Error('429 too many requests'))).toBe('rate_limit')
  })

  it('classifies 404 as permanent', () => {
    expect(classifyError(new Error('404 not found'))).toBe('permanent')
  })

  it('classifies 403 as permanent', () => {
    expect(classifyError(new Error('403 permission denied'))).toBe('permanent')
  })

  it('classifies unknown errors as permanent', () => {
    expect(classifyError(new Error('some unknown error'))).toBe('permanent')
  })
})

// ─── getSpokenErrorMessage unit tests ────────────────────────────────────────

describe('getSpokenErrorMessage', () => {
  it('returns transient message', () => {
    expect(getSpokenErrorMessage('transient')).toBe('Something went wrong. Let me try again.')
  })

  it('returns rate_limit message', () => {
    expect(getSpokenErrorMessage('rate_limit')).toBe('Too many requests. Try again in a moment.')
  })

  it('returns permanent fallback message without context', () => {
    expect(getSpokenErrorMessage('permanent')).toBe("I can't do that right now.")
  })

  it('returns permanent message with context', () => {
    expect(getSpokenErrorMessage('permanent', 'find that document')).toBe("I couldn't find that document.")
  })
})
