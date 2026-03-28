/**
 * Typed event discriminated union for OpenAI Realtime data channel events.
 *
 * These types represent the subset of events we handle from the oai-events
 * data channel. Unknown event types are logged but not typed here.
 */

// --- Session Events ---

export type SessionConfig = {
  id: string
  model: string
  voice?: string
  instructions?: string
  tools?: Array<{
    type: string
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }>
  [key: string]: unknown
}

export type SessionCreatedEvent = {
  type: 'session.created'
  session: SessionConfig
}

export type SessionUpdatedEvent = {
  type: 'session.updated'
  session: SessionConfig
}

// --- Response Events ---

export type FunctionCallItem = {
  type: 'function_call'
  id: string
  call_id: string
  name: string
  arguments: string
}

export type MessageItem = {
  type: 'message'
  id: string
  [key: string]: unknown
}

export type ResponseOutputItemDoneEvent = {
  type: 'response.output_item.done'
  item: FunctionCallItem | MessageItem
}

export type ResponseAudioTranscriptDoneEvent = {
  type: 'response.audio_transcript.done'
  transcript: string
}

// --- Input Audio Transcription Events ---

export type InputAudioTranscriptionCompletedEvent = {
  type: 'conversation.item.input_audio_transcription.completed'
  transcript: string
}

// --- Input Audio Buffer Events ---

export type InputAudioBufferSpeechStartedEvent = {
  type: 'input_audio_buffer.speech_started'
}

export type InputAudioBufferSpeechStoppedEvent = {
  type: 'input_audio_buffer.speech_stopped'
}

// --- Error Events ---

export type RealtimeErrorEvent = {
  type: 'error'
  error: {
    type: string
    message: string
    code?: string
    [key: string]: unknown
  }
}

// --- Discriminated Union ---

export type RealtimeEvent =
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | ResponseOutputItemDoneEvent
  | ResponseAudioTranscriptDoneEvent
  | InputAudioTranscriptionCompletedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | RealtimeErrorEvent

// --- Callback Types ---

export type ParsedFunctionCall = {
  callId: string
  name: string
  arguments: Record<string, unknown>
}

export type RealtimeEventCallbacks = {
  onSessionCreated?: (session: SessionConfig) => void
  onSessionUpdated?: (session: SessionConfig) => void
  onFunctionCall?: (fn: ParsedFunctionCall) => void
  onTranscript?: (transcript: string) => void
  onUserTranscript?: (transcript: string) => void
  onSpeechStarted?: () => void
  onSpeechStopped?: () => void
  onError?: (error: { type: string; message: string }) => void
}
