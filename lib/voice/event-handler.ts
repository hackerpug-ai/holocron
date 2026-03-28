import type {
  RealtimeEvent,
  RealtimeEventCallbacks,
  ParsedFunctionCall,
} from './types'

/**
 * Creates a data channel message handler that parses OpenAI Realtime events
 * and dispatches them to typed callbacks.
 *
 * Usage:
 * ```ts
 * const handler = createEventHandler({
 *   onSessionCreated: (session) => console.log('Session:', session.id),
 *   onFunctionCall: (fn) => executeTool(fn.name, fn.arguments, fn.callId),
 *   onError: (err) => console.error(err.type, err.message),
 * })
 *
 * dc.addEventListener('message', (e) => handler(e.data))
 * ```
 */
export function createEventHandler(
  callbacks: RealtimeEventCallbacks,
  logger: { debug: (msg: string, ...args: unknown[]) => void } = console
): (rawData: string) => void {
  return (rawData: string) => {
    let event: RealtimeEvent & { type: string }
    try {
      event = JSON.parse(rawData) as RealtimeEvent & { type: string }
    } catch {
      logger.debug('[voice/event-handler] Malformed JSON on data channel:', rawData)
      return
    }

    if (!event || typeof event.type !== 'string') {
      logger.debug('[voice/event-handler] Event missing type field:', event)
      return
    }

    switch (event.type) {
      case 'session.created':
        callbacks.onSessionCreated?.(event.session)
        break

      case 'session.updated':
        callbacks.onSessionUpdated?.(event.session)
        break

      case 'response.output_item.done':
        handleOutputItemDone(event, callbacks, logger)
        break

      case 'response.audio_transcript.done':
        callbacks.onTranscript?.(event.transcript)
        break

      case 'input_audio_buffer.speech_started':
        callbacks.onSpeechStarted?.()
        break

      case 'input_audio_buffer.speech_stopped':
        callbacks.onSpeechStopped?.()
        break

      case 'error':
        callbacks.onError?.({
          type: event.error.type,
          message: event.error.message,
        })
        break

      default:
        logger.debug('[voice/event-handler] Unhandled event type:', (event as { type: string }).type)
        break
    }
  }
}

function handleOutputItemDone(
  event: { type: 'response.output_item.done'; item: { type: string; [key: string]: unknown } },
  callbacks: RealtimeEventCallbacks,
  logger: { debug: (msg: string, ...args: unknown[]) => void }
): void {
  const { item } = event

  if (item.type !== 'function_call') {
    return
  }

  // Use item.call_id (format: call_XXXX), NOT item.id (format: item_XXXX)
  const callId = item.call_id as string
  const name = item.name as string
  const rawArguments = item.arguments as string

  let parsedArguments: Record<string, unknown>
  try {
    parsedArguments = JSON.parse(rawArguments) as Record<string, unknown>
  } catch {
    logger.debug(
      '[voice/event-handler] Failed to parse function call arguments:',
      rawArguments
    )
    callbacks.onError?.({
      type: 'function_call_parse_error',
      message: `Failed to parse arguments for function "${name}" (call_id: ${callId})`,
    })
    return
  }

  const parsed: ParsedFunctionCall = {
    callId,
    name,
    arguments: parsedArguments,
  }

  callbacks.onFunctionCall?.(parsed)
}
