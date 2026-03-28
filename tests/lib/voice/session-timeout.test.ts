/**
 * US-017: Session timeout with spoken farewell and warm connection
 *
 * Tests for SessionTimeout and WarmConnection classes.
 *
 * AC-1: 30s silence -> spoken farewell -> IDLE transition
 * AC-2: User speaks during farewell -> timeout cancelled, resume LISTENING
 * AC-3: Re-activation within 5 min window -> <200ms, no new ephemeral token
 * AC-4: Re-activation after 5 min window -> cold start (null returned)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Import after mocks are set up
import {
  SessionTimeout,
  WarmConnection,
  IDLE_TIMEOUT_MS,
  WARM_DURATION_MS,
} from '@/lib/voice/session-timeout'

describe('US-017: SessionTimeout — timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-1: 30s silence triggers onTimeout callback', () => {
    const onTimeout = vi.fn()
    const timeout = new SessionTimeout({ onTimeout })

    timeout.start()

    // Before 30s — should not fire
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1)
    expect(onTimeout).not.toHaveBeenCalled()

    // At 30s — should fire
    vi.advanceTimersByTime(1)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('AC-2: timeout interrupted — onTimeout not called when cancel() is invoked before expiry', () => {
    const onTimeout = vi.fn()
    const timeout = new SessionTimeout({ onTimeout })

    timeout.start()
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 5000)

    // User speaks — cancel timeout
    timeout.cancel()

    vi.advanceTimersByTime(10000)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('timeout interrupted — isActive returns false after cancel()', () => {
    const onTimeout = vi.fn()
    const timeout = new SessionTimeout({ onTimeout })

    timeout.start()
    expect(timeout.isActive()).toBe(true)

    timeout.cancel()
    expect(timeout.isActive()).toBe(false)
  })

  it('timeout can be restarted after cancel', () => {
    const onTimeout = vi.fn()
    const timeout = new SessionTimeout({ onTimeout })

    timeout.start()
    timeout.cancel()

    // Restart
    timeout.start()
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS)

    expect(onTimeout).toHaveBeenCalledTimes(1)
  })
})

describe('US-017: WarmConnection — re-activation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-3: re-activation within 5 min window returns warm connection', () => {
    const mockConn = { destroy: vi.fn() }
    const warm = new WarmConnection()

    warm.startWarmPeriod(mockConn as Parameters<WarmConnection['startWarmPeriod']>[0])

    // Within 5 minute window
    vi.advanceTimersByTime(WARM_DURATION_MS - 1000)
    const result = warm.reactivate()

    expect(result).toBe(mockConn)
  })

  it('AC-3: reactivate() during warm window cancels the destroy timer', () => {
    const mockConn = { destroy: vi.fn() }
    const warm = new WarmConnection()

    warm.startWarmPeriod(mockConn as Parameters<WarmConnection['startWarmPeriod']>[0])
    vi.advanceTimersByTime(1000)

    warm.reactivate()

    // After what would have been the 5-min window, connection should NOT be destroyed
    vi.advanceTimersByTime(WARM_DURATION_MS + 1000)
    expect(mockConn.destroy).not.toHaveBeenCalled()
  })

  it('AC-4: cold start — reactivate() after 5 min returns null', () => {
    const mockConn = { destroy: vi.fn() }
    const warm = new WarmConnection()

    warm.startWarmPeriod(mockConn as Parameters<WarmConnection['startWarmPeriod']>[0])

    // Advance past 5 minute window — warm period expires
    vi.advanceTimersByTime(WARM_DURATION_MS + 1)

    const result = warm.reactivate()
    expect(result).toBeNull()
  })

  it('AC-4: cold start — warm connection is destroyed after 5 min', () => {
    const mockConn = { destroy: vi.fn() }
    const warm = new WarmConnection()

    warm.startWarmPeriod(mockConn as Parameters<WarmConnection['startWarmPeriod']>[0])

    vi.advanceTimersByTime(WARM_DURATION_MS)

    expect(mockConn.destroy).toHaveBeenCalledTimes(1)
  })

  it('isWarm() returns true within window, false after', () => {
    const mockConn = { destroy: vi.fn() }
    const warm = new WarmConnection()

    expect(warm.isWarm()).toBe(false)

    warm.startWarmPeriod(mockConn as Parameters<WarmConnection['startWarmPeriod']>[0])
    expect(warm.isWarm()).toBe(true)

    vi.advanceTimersByTime(WARM_DURATION_MS + 1)
    expect(warm.isWarm()).toBe(false)
  })

  it('destroy() clears the warm connection immediately', () => {
    const mockConn = { destroy: vi.fn() }
    const warm = new WarmConnection()

    warm.startWarmPeriod(mockConn as Parameters<WarmConnection['startWarmPeriod']>[0])
    warm.destroy()

    expect(warm.isWarm()).toBe(false)
    expect(mockConn.destroy).toHaveBeenCalledTimes(1)
  })
})
