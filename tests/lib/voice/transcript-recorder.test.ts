/**
 * US-011: TranscriptRecorder tests
 *
 * Tests verify that transcript events are recorded to Convex via
 * fire-and-forget mutation calls, errors are swallowed, and order is preserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTranscriptRecorder } from '@/lib/voice/transcript-recorder'
import type { Id } from '@/convex/_generated/dataModel'

const SESSION_ID = 'session-abc' as Id<'voiceSessions'>
const CONV_ID = 'conv-123' as Id<'conversations'>

type RecordTranscriptFn = (args: {
  sessionId: Id<'voiceSessions'>
  conversationId: Id<'conversations'>
  role: 'user' | 'agent'
  content: string
}) => Promise<unknown>

describe('createTranscriptRecorder', () => {
  let mockRecordTranscript: ReturnType<typeof vi.fn<RecordTranscriptFn>>
  let recorder: ReturnType<typeof createTranscriptRecorder>

  beforeEach(() => {
    mockRecordTranscript = vi.fn().mockResolvedValue('msg-id')
    recorder = createTranscriptRecorder({
      recordTranscript: mockRecordTranscript,
      sessionId: SESSION_ID,
      conversationId: CONV_ID,
    })
  })

  // AC-1: User speaks → recordTranscript called with role 'user'
  describe('AC-1: user transcript', () => {
    it('calls recordTranscript with role user and transcript content', () => {
      recorder.onUserTranscript('Hello, what tasks do I have today?')

      expect(mockRecordTranscript).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        conversationId: CONV_ID,
        role: 'user',
        content: 'Hello, what tasks do I have today?',
      })
    })

    it('fires immediately without awaiting', () => {
      // recordTranscript is not resolved yet — but onUserTranscript returns synchronously
      const slow = new Promise<string>((resolve) =>
        setTimeout(() => resolve('msg'), 100)
      )
      mockRecordTranscript.mockReturnValueOnce(slow)

      // Should not throw or stall
      expect(() => recorder.onUserTranscript('quick message')).not.toThrow()
    })
  })

  // AC-2: Assistant responds → recordTranscript called with role 'agent'
  describe('AC-2: agent transcript', () => {
    it('calls recordTranscript with role agent and transcript content', () => {
      recorder.onAgentTranscript('You have 3 tasks scheduled for today.')

      expect(mockRecordTranscript).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        conversationId: CONV_ID,
        role: 'agent',
        content: 'You have 3 tasks scheduled for today.',
      })
    })
  })

  // AC-3: Recording fails → error logged but session continues
  describe('AC-3: transcript error handling', () => {
    it('logs error when recordTranscript rejects but does not throw', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRecordTranscript.mockRejectedValueOnce(new Error('Convex connection failed'))

      // Should not throw
      expect(() => recorder.onUserTranscript('failing message')).not.toThrow()

      // Allow the promise rejection to settle
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[transcript-recorder]'),
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })

    it('continues processing after a failed recording', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRecordTranscript.mockRejectedValueOnce(new Error('Convex error'))

      recorder.onUserTranscript('first message')

      await new Promise((resolve) => setTimeout(resolve, 0))

      // Second call should still work
      recorder.onAgentTranscript('second message')

      expect(mockRecordTranscript).toHaveBeenCalledTimes(2)
      expect(mockRecordTranscript).toHaveBeenNthCalledWith(2, {
        sessionId: SESSION_ID,
        conversationId: CONV_ID,
        role: 'agent',
        content: 'second message',
      })

      consoleErrorSpy.mockRestore()
    })
  })

  // AC-4: Multiple rapid transcript events → all recorded in order
  describe('AC-4: chronological order', () => {
    it('records multiple rapid transcript events in call order', () => {
      recorder.onUserTranscript('first turn - user')
      recorder.onAgentTranscript('second turn - agent')
      recorder.onUserTranscript('third turn - user')

      expect(mockRecordTranscript).toHaveBeenCalledTimes(3)

      expect(mockRecordTranscript).toHaveBeenNthCalledWith(1, {
        sessionId: SESSION_ID,
        conversationId: CONV_ID,
        role: 'user',
        content: 'first turn - user',
      })
      expect(mockRecordTranscript).toHaveBeenNthCalledWith(2, {
        sessionId: SESSION_ID,
        conversationId: CONV_ID,
        role: 'agent',
        content: 'second turn - agent',
      })
      expect(mockRecordTranscript).toHaveBeenNthCalledWith(3, {
        sessionId: SESSION_ID,
        conversationId: CONV_ID,
        role: 'user',
        content: 'third turn - user',
      })
    })
  })
})
