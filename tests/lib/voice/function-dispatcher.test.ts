import { describe, it, expect, vi } from 'vitest'
import { dispatchFunctionCall, classifyError, getSpokenErrorMessage } from '@/lib/voice/function-dispatcher'
import type { DispatcherDeps } from '@/lib/voice/function-dispatcher'
import type { ParsedFunctionCall } from '@/lib/voice/types'

function makeDeps(overrides: Partial<DispatcherDeps> = {}): DispatcherDeps {
  return {
    convex: {
      runAction: vi.fn().mockResolvedValue({ success: true, content: '[]', skipContinuation: false }),
      runMutation: vi.fn().mockResolvedValue('mock-id'),
      runQuery: vi.fn().mockResolvedValue([]),
    },
    routerPush: vi.fn(),
    sendEvent: vi.fn(),
    sessionId: 'session123' as unknown as string,
    conversationId: 'conv123' as unknown as string,
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

// ─── Server-side tool dispatch ──────────────────────────────────────────────

describe('server-side tool dispatch', () => {
  it('calls executeTool action with toolName, toolArgs, and conversationId', async () => {
    const mockResult = { success: true, content: JSON.stringify([{ _id: 'doc1' }]), skipContinuation: false }
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockResolvedValue(mockResult),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue([]),
      },
    })

    const fn = makeFunctionCall('search_knowledge', { query: 'test query' }, 'call_search1')
    await dispatchFunctionCall(fn, deps)

    // Must call executeTool action with correct args
    expect(deps.convex.runAction).toHaveBeenCalledWith(
      'voice/executeTool:executeTool',
      {
        toolName: 'search_knowledge',
        toolArgs: { query: 'test query' },
        conversationId: 'conv123',
      }
    )

    // Must send conversation.item.create with correct call_id
    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(itemCreate).toBeTruthy()
    const item = itemCreate!.item as Record<string, unknown>
    expect(item.call_id).toBe('call_search1')
    expect(item.type).toBe('function_call_output')

    // Output must be JSON-stringified result with server content
    const output = JSON.parse(item.output as string) as { success: boolean; data: unknown }
    expect(output.success).toBe(true)
    expect(output.data).toBe(mockResult.content)

    // Must send response.create after
    const responseCreate = getResponseCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(responseCreate).toBeTruthy()
    expect(responseCreate!.type).toBe('response.create')
  })

  it('uses call_id from callId field, not item.id', async () => {
    const deps = makeDeps()
    const fn = makeFunctionCall('search_knowledge', { query: 'test' }, 'call_CORRECT')
    await dispatchFunctionCall(fn, deps)

    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    expect(item.call_id).toBe('call_CORRECT')
  })

  it('routes create_note through server-side executeTool', async () => {
    const mockResult = { success: true, content: JSON.stringify({ id: 'new-doc-id' }), skipContinuation: false }
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockResolvedValue(mockResult),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue(null),
      },
    })

    const fn = makeFunctionCall(
      'create_note',
      { title: 'Test Note', content: 'Content here' },
      'call_note1'
    )
    await dispatchFunctionCall(fn, deps)

    expect(deps.convex.runAction).toHaveBeenCalledWith(
      'voice/executeTool:executeTool',
      {
        toolName: 'create_note',
        toolArgs: { title: 'Test Note', content: 'Content here' },
        conversationId: 'conv123',
      }
    )

    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean }
    expect(output.success).toBe(true)
  })

  it('records audit trail via recordCommand mutation', async () => {
    const deps = makeDeps()
    const fn = makeFunctionCall('search_knowledge', { query: 'test' }, 'call_audit1')
    await dispatchFunctionCall(fn, deps)

    // Wait for fire-and-forget recordCommand
    await new Promise((resolve) => setTimeout(resolve, 10))
    const recordCalls = (deps.convex.runMutation as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: unknown[]) => args[0] === 'voice/mutations:recordCommand'
    )
    expect(recordCalls.length).toBeGreaterThan(0)
    const recordArgs = recordCalls[0][1] as Record<string, unknown>
    expect(recordArgs.success).toBe(true)
    expect(recordArgs.sessionId).toBe('session123')
  })
})

// ─── navigate_app (client-side) ─────────────────────────────────────────────

describe('dispatch navigate_app', () => {
  it('calls router.push with correct path for settings, returns success result', async () => {
    const deps = makeDeps()

    const fn = makeFunctionCall('navigate_app', { screen: 'settings' }, 'call_nav1')
    await dispatchFunctionCall(fn, deps)

    expect(deps.routerPush).toHaveBeenCalledWith('/settings')

    // Should NOT call executeTool for navigate_app
    expect(deps.convex.runAction).not.toHaveBeenCalled()

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

// ─── Error handling ─────────────────────────────────────────────────────────

describe('dispatch error handling', () => {
  it('returns error result via conversation.item.create when server action throws permanent error', async () => {
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

    // Must send error result, not throw — error must be user-friendly
    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(itemCreate).toBeTruthy()
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; error: string }
    expect(output.success).toBe(false)
    expect(output.error).not.toContain('Convex search failed')
    expect(output.error).toBeTruthy()

    // Must still send response.create
    const responseCreate = getResponseCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(responseCreate).toBeTruthy()

    // Must record voiceCommand with success=false
    await new Promise((resolve) => setTimeout(resolve, 10))
    const recordCalls = (deps.convex.runMutation as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: unknown[]) => args[0] === 'voice/mutations:recordCommand'
    )
    expect(recordCalls.length).toBeGreaterThan(0)
    const recordArgs = recordCalls[0][1] as Record<string, unknown>
    expect(recordArgs.success).toBe(false)
  })
})

// ─── Transient retry ────────────────────────────────────────────────────────

describe('transient retry', () => {
  it('retries once on transient error; succeeds on retry', async () => {
    let callCount = 0
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) return Promise.reject(new Error('network timeout'))
          return Promise.resolve({ success: true, content: 'retried', skipContinuation: false })
        }),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue([]),
      },
    })

    const fn = makeFunctionCall('search_knowledge', { query: 'test' }, 'call_transient1')
    await dispatchFunctionCall(fn, deps)

    // Should have called the action twice (initial + retry)
    expect(deps.convex.runAction).toHaveBeenCalledTimes(2)
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

    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; error: string }
    expect(output.success).toBe(false)
    expect(output.error).not.toContain('network timeout')
    expect(output.error).toBe('Something went wrong. Let me try again.')
  })
})

// ─── Permanent error ────────────────────────────────────────────────────────

describe('permanent error', () => {
  it('does not retry on permanent error and speaks user-friendly message', async () => {
    const permanentError = new Error('404 not found')
    const deps = makeDeps({
      convex: {
        runAction: vi.fn().mockRejectedValue(permanentError),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue([]),
      },
    })

    const fn = makeFunctionCall('get_document', { document_id: 'missing-doc' }, 'call_perm1')
    await dispatchFunctionCall(fn, deps)

    // Should only attempt once — no retry for permanent errors
    expect(deps.convex.runAction).toHaveBeenCalledTimes(1)

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
        runAction: vi.fn().mockRejectedValue(new Error('403 permission denied')),
        runMutation: vi.fn().mockResolvedValue('cmd-id'),
        runQuery: vi.fn().mockResolvedValue([]),
      },
    })

    const fn = makeFunctionCall('get_document', { document_id: 'forbidden' }, 'call_perm2')

    // Must NOT throw
    await expect(dispatchFunctionCall(fn, deps)).resolves.toBeUndefined()

    // Must still send response.create
    const responseCreate = getResponseCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(responseCreate).toBeTruthy()
  })
})

// ─── Rate limit ─────────────────────────────────────────────────────────────

describe('rate limit', () => {
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

    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; error: string }
    expect(output.success).toBe(false)
    expect(output.error).toBe('Too many requests. Try again in a moment.')
  })
})

// ─── Error logging ──────────────────────────────────────────────────────────

describe('error logged', () => {
  it('records voiceCommand with success=false on execution failure', async () => {
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
    expect(result.error).toBeTruthy()
    expect(result.success).toBe(false)
  })
})

// ─── sendEvent ordering ─────────────────────────────────────────────────────

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

// ─── classifyError unit tests ───────────────────────────────────────────────

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

// ─── getSpokenErrorMessage unit tests ───────────────────────────────────────

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
