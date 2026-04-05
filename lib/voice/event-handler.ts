import type {
  RealtimeEvent,
  RealtimeEventCallbacks,
  ParsedFunctionCall,
} from './types'

/**
 * Creates a data channel message handler that dispatches pre-parsed OpenAI
 * Realtime events to typed callbacks.
 *
 * The caller is responsible for parsing the raw JSON before calling the
 * returned handler. webrtc-connection.ts already parses data channel messages,
 * so passing a parsed object avoids a redundant JSON.stringify/parse round-trip.
 *
 * Usage:
 * ```ts
 * const handler = createEventHandler({
 *   onSessionCreated: (session) => console.log('Session:', session.id),
 *   onFunctionCall: (fn) => executeTool(fn.name, fn.arguments, fn.callId),
 *   onError: (err) => console.error(err.type, err.message),
 * })
 *
 * dc.addEventListener('message', (e) => {
 *   try { handler(JSON.parse(e.data)) } catch { }
 * })
 * ```
 */
export function createEventHandler(
  callbacks: RealtimeEventCallbacks,
  logger: { debug: (msg: string, ...args: unknown[]) => void } = console
): (event: unknown) => void {
  return (event: unknown) => {
    const parsed = event as RealtimeEvent & { type: string }

    if (!parsed || typeof parsed.type !== 'string') {
      logger.debug('[voice/event-handler] Event missing type field:', parsed)
      return
    }

    switch (parsed.type) {
      case 'session.created':
        callbacks.onSessionCreated?.(parsed.session)
        break

      case 'session.updated':
        callbacks.onSessionUpdated?.(parsed.session)
        break

      case 'response.output_item.done':
        handleOutputItemDone(parsed, callbacks, logger)
        break

      case 'response.audio_transcript.done':
        callbacks.onTranscript?.(parsed.transcript)
        break

      case 'conversation.item.input_audio_transcription.completed':
        callbacks.onUserTranscript?.(parsed.transcript)
        break

      case 'input_audio_buffer.speech_started':
        callbacks.onSpeechStarted?.()
        break

      case 'input_audio_buffer.speech_stopped':
        callbacks.onSpeechStopped?.()
        break

      case 'error':
        callbacks.onError?.({
          type: parsed.error.type,
          message: parsed.error.message,
        })
        break

      default:
        logger.debug('[voice/event-handler] Unhandled event type:', (parsed as { type: string }).type)
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
