/**
 * US-016: Error handler tests
 *
 * Tests for service unavailability and microphone permission denial handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createVoiceErrorHandler,
  type VoiceErrorHandler,
  type VoiceErrorType,
} from '@/lib/voice/error-handler'

// Mock Platform and Linking from react-native
vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  Linking: {
    openURL: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(() => Promise.resolve()),
  },
}))

type OnErrorFn = (error: VoiceErrorType) => void
type OnCleanupFn = () => void

describe('createVoiceErrorHandler', () => {
  let mockOnError: ReturnType<typeof vi.fn<OnErrorFn>>
  let mockOnCleanup: ReturnType<typeof vi.fn<OnCleanupFn>>
  let handler: VoiceErrorHandler

  beforeEach(async () => {
    vi.clearAllMocks()
    mockOnError = vi.fn<OnErrorFn>()
    mockOnCleanup = vi.fn<OnCleanupFn>()
    handler = createVoiceErrorHandler({ onError: mockOnError, onCleanup: mockOnCleanup })
  })

  // --- AC-1: service unavailable (token generation fails) ---
  describe('service unavailable - token generation failure', () => {
    it('service unavailable: detects token generation failure and sets correct error type', () => {
      handler.handleTokenGenerationFailure(new Error('fetch failed'))

      expect(mockOnError).toHaveBeenCalledOnce()
      const errorArg = mockOnError.mock.calls[0][0]
      expect(errorArg.kind).toBe('service_unavailable')
    })

    it('service unavailable: shows user-friendly message without API details', () => {
      handler.handleTokenGenerationFailure(new Error('401 Unauthorized: invalid api key'))

      expect(mockOnError).toHaveBeenCalledOnce()
      const errorArg = mockOnError.mock.calls[0][0]
      expect(errorArg.userMessage).toBe('Voice assistant is currently unavailable')
      // Must NOT expose raw API error details
      expect(errorArg.userMessage).not.toContain('401')
      expect(errorArg.userMessage).not.toContain('api key')
      expect(errorArg.userMessage).not.toContain('Unauthorized')
    })

    it('service unavailable: triggers cleanup on token generation failure', () => {
      handler.handleTokenGenerationFailure(new Error('connection refused'))

      expect(mockOnCleanup).toHaveBeenCalledOnce()
    })

    it('service unavailable: provides retry action', () => {
      handler.handleTokenGenerationFailure(new Error('timeout'))

      const errorArg = mockOnError.mock.calls[0][0]
      expect(errorArg.canRetry).toBe(true)
    })
  })

  // --- AC-2: microphone permission denied ---
  describe('permission denied - microphone', () => {
    it('permission denied: detects microphone permission denial', () => {
      handler.handleMicrophonePermissionDenied()

      expect(mockOnError).toHaveBeenCalledOnce()
      const errorArg = mockOnError.mock.calls[0][0]
      expect(errorArg.kind).toBe('permission_denied')
    })

    it('permission denied: shows microphone access needed message', () => {
      handler.handleMicrophonePermissionDenied()

      const errorArg = mockOnError.mock.calls[0][0]
      expect(errorArg.userMessage).toBe('Microphone access needed')
    })

    it('permission denied: provides platform-specific iOS guidance', async () => {
      const { Platform } = await import('react-native')
      vi.mocked(Platform).OS = 'ios'

      const iosMockOnError = vi.fn<OnErrorFn>()
      const iosMockOnCleanup = vi.fn<OnCleanupFn>()
      const iosHandler = createVoiceErrorHandler({ onError: iosMockOnError, onCleanup: iosMockOnCleanup })
      iosHandler.handleMicrophonePermissionDenied()

      const errorArg = iosMockOnError.mock.calls[0][0]
      expect(errorArg.settingsGuidance).toBe('Go to Settings > Holocron > Microphone')
    })

    it('permission denied: provides platform-specific Android guidance', async () => {
      const { Platform } = await import('react-native')
      vi.mocked(Platform).OS = 'android'

      const androidMockOnError = vi.fn<OnErrorFn>()
      const androidMockOnCleanup = vi.fn<OnCleanupFn>()
      const androidHandler = createVoiceErrorHandler({ onError: androidMockOnError, onCleanup: androidMockOnCleanup })
      androidHandler.handleMicrophonePermissionDenied()

      const errorArg = androidMockOnError.mock.calls[0][0]
      expect(errorArg.settingsGuidance).toBe('Go to Settings > Apps > Holocron > Permissions')
    })

    it('permission denied: provides openSettings action', () => {
      handler.handleMicrophonePermissionDenied()

      const errorArg = mockOnError.mock.calls[0][0]
      expect(typeof errorArg.openSettings).toBe('function')
    })
  })

  // --- AC-3: retry after service unavailable - fresh connection ---
  describe('retry fresh - retry after service unavailable', () => {
    it('retry fresh: reset clears error state to allow fresh retry', () => {
      handler.handleTokenGenerationFailure(new Error('timeout'))

      // Reset for retry
      handler.reset()

      // After reset, consecutive error count should be back to 0
      // Verify by checking that 3 consecutive errors still needed to trigger mid-session
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()
      // Only 2 errors — should NOT yet emit service_unavailable mid-session error
      const midSessionCalls = mockOnError.mock.calls.filter(
        (call: [VoiceErrorType]) => call[0].kind === 'service_unavailable' && call[0].isMidSession
      )
      expect(midSessionCalls.length).toBe(0)
    })

    it('retry fresh: reset allows new session start after error', () => {
      handler.handleTokenGenerationFailure(new Error('timeout'))
      const errorCallCount = mockOnError.mock.calls.length

      handler.reset()

      // After reset, no additional errors should have been emitted
      expect(mockOnError.mock.calls.length).toBe(errorCallCount)
    })
  })

  // --- AC-3b: stale session error — better message ---
  describe('stale session - helpful error message', () => {
    it('stale session: shows helpful message when error indicates active session already exists', () => {
      handler.handleTokenGenerationFailure(
        new Error('An active session already exists for conversationId conv_123')
      )

      expect(mockOnError).toHaveBeenCalledOnce()
      const errorArg = mockOnError.mock.calls[0][0]
      expect(errorArg.userMessage).toBe('A previous session is still active. Please try again.')
    })

    it('stale session: still returns service_unavailable kind for stale session errors', () => {
      handler.handleTokenGenerationFailure(
        new Error('An active session already exists for conversationId conv_123')
      )

      const errorArg = mockOnError.mock.calls[0][0]
      expect(errorArg.kind).toBe('service_unavailable')
      expect(errorArg.canRetry).toBe(true)
    })
  })

  // --- AC-4: mid-session unavailable (3 consecutive errors) ---
  describe('mid-session unavailable - 3 consecutive errors', () => {
    it('mid-session unavailable: accumulates consecutive errors without triggering on first two', () => {
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()

      // After 2 errors, should not yet emit service_unavailable
      const midSessionErrors = mockOnError.mock.calls.filter(
        (call: [VoiceErrorType]) => call[0].kind === 'service_unavailable' && call[0].isMidSession
      )
      expect(midSessionErrors.length).toBe(0)
    })

    it('mid-session unavailable: triggers on 3rd consecutive error', () => {
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()

      expect(mockOnError).toHaveBeenCalledOnce()
      const errorArg = mockOnError.mock.calls[0][0]
      expect(errorArg.kind).toBe('service_unavailable')
      expect(errorArg.isMidSession).toBe(true)
    })

    it('mid-session unavailable: shows lost connection message', () => {
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()

      const errorArg = mockOnError.mock.calls[0][0]
      expect(errorArg.userMessage).toBe('Lost connection to voice service. Please try again.')
    })

    it('mid-session unavailable: cleans up session on 3 consecutive errors', () => {
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()

      expect(mockOnCleanup).toHaveBeenCalledOnce()
    })

    it('mid-session unavailable: resets consecutive count after a successful event', () => {
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()
      handler.handleSuccess() // Success resets the count
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()
      handler.handleConsecutiveError()

      // Only one error emission — the second run of 3
      const midSessionErrors = mockOnError.mock.calls.filter(
        (call: [VoiceErrorType]) => call[0].kind === 'service_unavailable' && call[0].isMidSession
      )
      expect(midSessionErrors.length).toBe(1)
    })
  })
})
