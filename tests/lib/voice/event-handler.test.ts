import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEventHandler } from '@/lib/voice/event-handler'
import type { RealtimeEventCallbacks } from '@/lib/voice/types'

function makeLogger() {
  return { debug: vi.fn() }
}

describe('createEventHandler', () => {
  let callbacks: Required<RealtimeEventCallbacks>
  let logger: ReturnType<typeof makeLogger>
  let handler: (raw: string) => void

  beforeEach(() => {
    callbacks = {
      onSessionCreated: vi.fn(),
      onSessionUpdated: vi.fn(),
      onFunctionCall: vi.fn(),
      onTranscript: vi.fn(),
      onSpeechStarted: vi.fn(),
      onSpeechStopped: vi.fn(),
      onError: vi.fn(),
    }
    logger = makeLogger()
    handler = createEventHandler(callbacks, logger)
  })

  // --- AC 1: session.created ---
  describe('session.created', () => {
    it('fires onSessionCreated with parsed session config', () => {
      const event = {
        type: 'session.created',
        session: {
          id: 'sess_abc123',
          model: 'gpt-realtime',
          voice: 'cedar',
          instructions: 'You are a helpful assistant.',
        },
      }

      handler(JSON.stringify(event))

      expect(callbacks.onSessionCreated).toHaveBeenCalledOnce()
      expect(callbacks.onSessionCreated).toHaveBeenCalledWith({
        id: 'sess_abc123',
        model: 'gpt-realtime',
        voice: 'cedar',
        instructions: 'You are a helpful assistant.',
      })
    })
  })

  // --- AC 2: response.output_item.done + function_call ---
  describe('response.output_item.done with function_call', () => {
    it('fires onFunctionCall with name, parsed arguments, and call_id', () => {
      const event = {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          id: 'item_xyz789',
          call_id: 'call_abc123',
          name: 'search_knowledge',
          arguments: '{"query":"voice assistant research"}',
        },
      }

      handler(JSON.stringify(event))

      expect(callbacks.onFunctionCall).toHaveBeenCalledOnce()
      expect(callbacks.onFunctionCall).toHaveBeenCalledWith({
        callId: 'call_abc123',
        name: 'search_knowledge',
        arguments: { query: 'voice assistant research' },
      })
    })

    it('uses item.call_id not item.id', () => {
      const event = {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          id: 'item_WRONG',
          call_id: 'call_CORRECT',
          name: 'test_tool',
          arguments: '{}',
        },
      }

      handler(JSON.stringify(event))

      const call = vi.mocked(callbacks.onFunctionCall).mock.calls[0][0]
      expect(call.callId).toBe('call_CORRECT')
      expect(call.callId).not.toBe('item_WRONG')
    })
  })

  // --- AC 3: response.output_item.done + message type filtered ---
  describe('response.output_item.done with message type filtered', () => {
    it('does NOT fire onFunctionCall for item.type message', () => {
      const event = {
        type: 'response.output_item.done',
        item: {
          type: 'message',
          id: 'item_msg123',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
        },
      }

      handler(JSON.stringify(event))

      expect(callbacks.onFunctionCall).not.toHaveBeenCalled()
    })

    it('does NOT fire onFunctionCall for item.type audio', () => {
      const event = {
        type: 'response.output_item.done',
        item: {
          type: 'audio',
          id: 'item_audio123',
        },
      }

      handler(JSON.stringify(event))

      expect(callbacks.onFunctionCall).not.toHaveBeenCalled()
    })
  })

  // --- AC 4: malformed JSON ---
  describe('malformed JSON handling', () => {
    it('catches malformed JSON and logs debug, handler does not crash', () => {
      expect(() => handler('this is not json{')).not.toThrow()
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Malformed JSON'),
        expect.any(String)
      )
    })

    it('continues processing events after malformed message', () => {
      handler('broken{{{')

      const event = {
        type: 'session.created',
        session: { id: 'sess_1', model: 'gpt-realtime' },
      }
      handler(JSON.stringify(event))

      expect(callbacks.onSessionCreated).toHaveBeenCalledOnce()
    })

    it('handles event without type field', () => {
      handler(JSON.stringify({ data: 'no type here' }))
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('missing type'),
        expect.anything()
      )
    })
  })

  // --- AC 5: error event ---
  describe('error event', () => {
    it('fires onError with error type and message', () => {
      const event = {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Session has expired',
          code: 'session_expired',
        },
      }

      handler(JSON.stringify(event))

      expect(callbacks.onError).toHaveBeenCalledOnce()
      expect(callbacks.onError).toHaveBeenCalledWith({
        type: 'invalid_request_error',
        message: 'Session has expired',
      })
    })
  })

  // --- Other event types ---
  describe('session.updated', () => {
    it('fires onSessionUpdated callback', () => {
      const event = {
        type: 'session.updated',
        session: { id: 'sess_1', model: 'gpt-realtime', voice: 'marin' },
      }

      handler(JSON.stringify(event))

      expect(callbacks.onSessionUpdated).toHaveBeenCalledOnce()
      expect(callbacks.onSessionUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ voice: 'marin' })
      )
    })
  })

  describe('response.audio_transcript.done', () => {
    it('fires onTranscript with transcript text', () => {
      const event = {
        type: 'response.audio_transcript.done',
        transcript: 'Hello, how can I help you?',
      }

      handler(JSON.stringify(event))

      expect(callbacks.onTranscript).toHaveBeenCalledWith('Hello, how can I help you?')
    })
  })

  describe('input_audio_buffer events', () => {
    it('fires onSpeechStarted', () => {
      handler(JSON.stringify({ type: 'input_audio_buffer.speech_started' }))
      expect(callbacks.onSpeechStarted).toHaveBeenCalledOnce()
    })

    it('fires onSpeechStopped', () => {
      handler(JSON.stringify({ type: 'input_audio_buffer.speech_stopped' }))
      expect(callbacks.onSpeechStopped).toHaveBeenCalledOnce()
    })
  })

  // --- Unknown events logged ---
  describe('unknown event types', () => {
    it('logs unknown event types at debug level', () => {
      handler(JSON.stringify({ type: 'conversation.item.created' }))
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled event type'),
        'conversation.item.created'
      )
    })
  })

  // --- Function call argument parse error ---
  describe('function call with malformed arguments', () => {
    it('logs error and fires onError when arguments JSON is invalid', () => {
      const event = {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          id: 'item_1',
          call_id: 'call_1',
          name: 'broken_tool',
          arguments: 'not valid json{{{',
        },
      }

      handler(JSON.stringify(event))

      expect(callbacks.onFunctionCall).not.toHaveBeenCalled()
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'function_call_parse_error',
        })
      )
    })
  })
})
