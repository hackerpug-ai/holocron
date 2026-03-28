import { describe, it, expect, vi } from 'vitest'
import { dispatchFunctionCall } from '@/lib/voice/function-dispatcher'
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

    // Must send error result, not throw
    const itemCreate = getItemCreateCall(deps.sendEvent as ReturnType<typeof vi.fn>)
    expect(itemCreate).toBeDefined()
    const item = itemCreate!.item as Record<string, unknown>
    const output = JSON.parse(item.output as string) as { success: boolean; error: string }
    expect(output.success).toBe(false)
    expect(output.error).toContain('Convex search failed')

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
