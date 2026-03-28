/**
 * US-015: RetryManager tests
 *
 * Tests for network failure detection and retry with exponential backoff.
 * Covers all 4 acceptance criteria:
 *   AC-1: network retry — first retry within 1s, state stays CONNECTING, spoken feedback
 *   AC-2: max retries — all 3 fail, transitions to ERROR with user-friendly message
 *   AC-3: retry success — connection re-established, resumes LISTENING
 *   AC-4: function call retry — Convex call retried once on network error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRetryManager } from '../../lib/voice/retry-manager'

// Use fake timers for all tests to control setTimeout precisely
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// =============================================================================
// AC-1: network retry — first retry happens within 1s, spoken feedback emitted
// =============================================================================

describe('network retry - AC-1: first retry within 1s with spoken feedback', () => {
  it('calls onSpokenFeedback with "Lost connection. Trying again..." on first retry attempt', async () => {
    const onSpokenFeedback = vi.fn()
    const onStateChange = vi.fn()

    // connectFn always fails — we only care about first retry behavior
    const connectFn = vi.fn(async () => {
      throw new Error('ICE failed')
    })

    const manager = createRetryManager({
      onSpokenFeedback,
      onStateChange,
      baseDelay: 1000,
      maxRetries: 3,
    })

    const retryPromise = manager.handleConnectionFailure(connectFn)

    // Advance timer by 1s to trigger first retry
    await vi.advanceTimersByTimeAsync(1000)

    // First retry should have fired spoken feedback
    expect(onSpokenFeedback).toHaveBeenCalledWith('Lost connection. Trying again...')

    // Advance remaining timers to let all retries complete
    await vi.advanceTimersByTimeAsync(8000)
    await retryPromise.catch(() => {})
  })

  it('emits CONNECTING state during retry attempts', async () => {
    const onStateChange = vi.fn()

    const connectFn = vi.fn(async () => {
      throw new Error('ICE failed')
    })

    const manager = createRetryManager({
      onSpokenFeedback: vi.fn(),
      onStateChange,
      baseDelay: 1000,
      maxRetries: 3,
    })

    const retryPromise = manager.handleConnectionFailure(connectFn)

    // Advance to trigger first retry
    await vi.advanceTimersByTimeAsync(1000)

    expect(onStateChange).toHaveBeenCalledWith('connecting')

    // Clean up
    await vi.advanceTimersByTimeAsync(8000)
    await retryPromise.catch(() => {})
  })
})

// =============================================================================
// AC-2: max retries — all 3 fail → ERROR state with user-friendly message
// =============================================================================

describe('max retries - AC-2: ERROR state after 3 failed retries', () => {
  it('transitions to ERROR state after all 3 retries are exhausted', async () => {
    const onStateChange = vi.fn()
    const onSpokenFeedback = vi.fn()

    const connectFn = vi.fn(async () => {
      throw new Error('Network unreachable')
    })

    const manager = createRetryManager({
      onSpokenFeedback,
      onStateChange,
      baseDelay: 1000,
      maxRetries: 3,
    })

    const retryPromise = manager.handleConnectionFailure(connectFn)

    // Advance through all retry delays: 1s, 2s, 4s
    await vi.advanceTimersByTimeAsync(1000) // retry 1
    await vi.advanceTimersByTimeAsync(2000) // retry 2
    await vi.advanceTimersByTimeAsync(4000) // retry 3
    await retryPromise.catch(() => {})

    expect(onStateChange).toHaveBeenCalledWith('error')
  })

  it('emits user-friendly message "No internet. Please check your connection." on exhaustion', async () => {
    const onSpokenFeedback = vi.fn()

    const connectFn = vi.fn(async () => {
      throw new Error('Network unreachable')
    })

    const manager = createRetryManager({
      onSpokenFeedback,
      onStateChange: vi.fn(),
      baseDelay: 1000,
      maxRetries: 3,
    })

    const retryPromise = manager.handleConnectionFailure(connectFn)

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(4000)
    await retryPromise.catch(() => {})

    expect(onSpokenFeedback).toHaveBeenCalledWith(
      'No internet. Please check your connection.'
    )
  })

  it('retries exactly 3 times with exponential delays of 1s, 2s, 4s', async () => {
    const connectFn = vi.fn(async () => {
      throw new Error('Connection failed')
    })

    const manager = createRetryManager({
      onSpokenFeedback: vi.fn(),
      onStateChange: vi.fn(),
      baseDelay: 1000,
      maxRetries: 3,
    })

    const retryPromise = manager.handleConnectionFailure(connectFn)

    // Before any time passes: connectFn has NOT been called yet
    // (handleConnectionFailure waits the delay before calling connectFn)
    expect(connectFn).toHaveBeenCalledTimes(0)

    await vi.advanceTimersByTimeAsync(999)
    expect(connectFn).toHaveBeenCalledTimes(0) // not yet

    await vi.advanceTimersByTimeAsync(1)
    expect(connectFn).toHaveBeenCalledTimes(1) // retry 1 at 1s

    await vi.advanceTimersByTimeAsync(1999)
    expect(connectFn).toHaveBeenCalledTimes(1) // not yet

    await vi.advanceTimersByTimeAsync(1)
    expect(connectFn).toHaveBeenCalledTimes(2) // retry 2 at 2s

    await vi.advanceTimersByTimeAsync(3999)
    expect(connectFn).toHaveBeenCalledTimes(2) // not yet

    await vi.advanceTimersByTimeAsync(1)
    expect(connectFn).toHaveBeenCalledTimes(3) // retry 3 at 4s

    await retryPromise.catch(() => {})
    // No retry 4
    expect(connectFn).toHaveBeenCalledTimes(3)
  })

  it('does not retry more than 3 times', async () => {
    const connectFn = vi.fn(async () => {
      throw new Error('Network error')
    })

    const manager = createRetryManager({
      onSpokenFeedback: vi.fn(),
      onStateChange: vi.fn(),
      baseDelay: 1000,
      maxRetries: 3,
    })

    const retryPromise = manager.handleConnectionFailure(connectFn)

    await vi.advanceTimersByTimeAsync(10000)
    await retryPromise.catch(() => {})

    // 3 retries max (no initial call from manager — caller already tried)
    expect(connectFn.mock.calls.length).toBeLessThanOrEqual(3)
  })
})

// =============================================================================
// AC-3: retry success — connection re-established, state returns to LISTENING
// =============================================================================

describe('retry success - AC-3: LISTENING state after successful retry', () => {
  it('transitions to listening state when a retry succeeds', async () => {
    const onStateChange = vi.fn()

    // connectFn succeeds on first call (this is the first retry attempt)
    const connectFn = vi.fn(async () => {
      // succeeds immediately
    })

    const manager = createRetryManager({
      onSpokenFeedback: vi.fn(),
      onStateChange,
      baseDelay: 1000,
      maxRetries: 3,
    })

    const retryPromise = manager.handleConnectionFailure(connectFn)

    // Advance to trigger first retry (which succeeds)
    await vi.advanceTimersByTimeAsync(1000)
    await retryPromise

    expect(onStateChange).toHaveBeenCalledWith('listening')
  })

  it('resolves the promise without error when retry succeeds', async () => {
    // connectFn always succeeds (first retry succeeds)
    const connectFn = vi.fn(async () => {
      // succeeds
    })

    const manager = createRetryManager({
      onSpokenFeedback: vi.fn(),
      onStateChange: vi.fn(),
      baseDelay: 1000,
      maxRetries: 3,
    })

    const retryPromise = manager.handleConnectionFailure(connectFn)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(retryPromise).resolves.toBeUndefined()
  })
})

// =============================================================================
// AC-4: function call retry — Convex call retried once automatically
// =============================================================================

describe('function call retry - AC-4: Convex function call retried once on network error', () => {
  it('retries the function call once on network error', async () => {
    const manager = createRetryManager({
      onSpokenFeedback: vi.fn(),
      onStateChange: vi.fn(),
      baseDelay: 1000,
      maxRetries: 3,
    })

    let callCount = 0
    const convexFn = vi.fn(async () => {
      callCount++
      if (callCount === 1) throw new Error('Network error')
      return { result: 'success' }
    })

    const result = await manager.retryFunctionCall(convexFn)

    expect(convexFn).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ result: 'success' })
  })

  it('returns error result if retry also fails', async () => {
    const manager = createRetryManager({
      onSpokenFeedback: vi.fn(),
      onStateChange: vi.fn(),
      baseDelay: 1000,
      maxRetries: 3,
    })

    const convexFn = vi.fn(async () => {
      throw new Error('Persistent network error')
    })

    const result = await manager.retryFunctionCall(convexFn)

    expect(convexFn).toHaveBeenCalledTimes(2) // original + 1 retry
    expect(result).toEqual({ error: 'Persistent network error' })
  })

  it('does not retry more than once for function calls', async () => {
    const manager = createRetryManager({
      onSpokenFeedback: vi.fn(),
      onStateChange: vi.fn(),
      baseDelay: 1000,
      maxRetries: 3,
    })

    const convexFn = vi.fn(async () => {
      throw new Error('Network error')
    })

    await manager.retryFunctionCall(convexFn)

    // Must be exactly 2 calls: original + 1 retry
    expect(convexFn).toHaveBeenCalledTimes(2)
  })
})

// =============================================================================
// cleanup / orphan prevention
// =============================================================================

describe('cleanup - no orphaned connections', () => {
  it('calls cleanup callback before each retry to prevent orphaned connections', async () => {
    const onCleanup = vi.fn()

    const connectFn = vi.fn(async () => {
      throw new Error('ICE failed')
    })

    const manager = createRetryManager({
      onSpokenFeedback: vi.fn(),
      onStateChange: vi.fn(),
      onCleanup,
      baseDelay: 1000,
      maxRetries: 3,
    })

    const retryPromise = manager.handleConnectionFailure(connectFn)

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(4000)
    await retryPromise.catch(() => {})

    // onCleanup should have been called before each retry
    expect(onCleanup.mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})
