# Technical Requirements

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Mobile App (Expo)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │ VoiceSession     │  │ AudioCapture     │  │ UIState          │      │
│  │ Manager          │──│ Service          │──│ Manager          │      │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘      │
│           │                     │                                        │
│           ▼                     ▼                                        │
│  ┌──────────────────────────────────────────┐                           │
│  │         Transport Layer                   │                           │
│  │  ┌─────────────┐  ┌─────────────────┐    │                           │
│  │  │ WebRTC      │  │ WebSocket       │    │                           │
│  │  │ (Primary)   │  │ (Fallback)      │    │                           │
│  │  └─────────────┘  └─────────────────┘    │                           │
│  └────────────────────┬─────────────────────┘                           │
│                       │                                                  │
└───────────────────────┼──────────────────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         Cloud Services                                     │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│  │ OpenAI Realtime │  │ ElevenLabs      │  │ Deepgram        │           │
│  │ API             │  │ TTS             │  │ STT             │           │
│  │ (Primary)       │  │ (TTS Primary)   │  │ (STT Fallback)  │           │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│           │                    │                    │                     │
│           └────────────────────┼────────────────────┘                     │
│                                │                                          │
│                                ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐         │
│  │                    Convex Backend                            │         │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │         │
│  │  │ voiceSessions│  │ voiceCommands│  │ voiceAnalytics│       │         │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │         │
│  └─────────────────────────────────────────────────────────────┘         │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### VoiceSessionManager

**Purpose**: Orchestrates voice session lifecycle and state transitions.

```typescript
interface VoiceSessionState {
  status: 'idle' | 'listening' | 'processing' | 'speaking' | 'error'
  sessionId: string | null
  context: ConversationTurn[]
  errorState: ErrorInfo | null
}

interface VoiceSessionManager {
  // Lifecycle
  startSession(): Promise<void>
  endSession(): Promise<void>
  
  // State
  getState(): VoiceSessionState
  onStateChange(callback: (state: VoiceSessionState) => void): void
  
  // Context
  addTurn(turn: ConversationTurn): void
  clearContext(): void
}
```

**State Machine**:
```
IDLE ──(activate)──▶ LISTENING
  ▲                      │
  │                (speech_end)
  │                      ▼
  │               PROCESSING
  │                      │
  │               (response_ready)
  │                      ▼
  └──(finished)─── SPEAKING
         ▲              │
         │         (interrupted)
         └──────────────┘
```

### AudioCaptureService

**Purpose**: Handles microphone input and audio output.

```typescript
interface AudioCaptureService {
  // Capture
  startCapture(options: CaptureOptions): Promise<void>
  stopCapture(): void
  onAudioChunk(callback: (chunk: AudioChunk) => void): void
  
  // Playback
  playAudio(stream: AudioStream): Promise<void>
  stopPlayback(): void
  
  // Routing
  getAudioRoute(): AudioRoute
  setAudioRoute(route: AudioRoute): void
}

interface CaptureOptions {
  sampleRate: 16000 // Hz
  channels: 1       // Mono
  bitDepth: 16      // PCM
  vadEnabled: boolean
}
```

### STTProcessor

**Purpose**: Converts speech to text with streaming support.

```typescript
interface STTProcessor {
  // Connection
  connect(config: STTConfig): Promise<void>
  disconnect(): void
  
  // Streaming
  sendAudio(chunk: AudioChunk): void
  onPartialTranscript(callback: (text: string) => void): void
  onFinalTranscript(callback: (result: TranscriptResult) => void): void
  
  // VAD
  onSpeechStart(callback: () => void): void
  onSpeechEnd(callback: () => void): void
}

interface TranscriptResult {
  text: string
  confidence: number
  duration: number
  words: WordTiming[]
}
```

### TTSStreamer

**Purpose**: Synthesizes and streams speech audio.

```typescript
interface TTSStreamer {
  // Synthesis
  synthesize(text: string, options: TTSOptions): Promise<AudioStream>
  synthesizeStreaming(text: string, options: TTSOptions): AsyncIterable<AudioChunk>
  
  // Control
  stop(): void
  pause(): void
  resume(): void
  
  // Events
  onPlaybackProgress(callback: (position: number) => void): void
  onPlaybackComplete(callback: () => void): void
}

interface TTSOptions {
  voice: string           // Voice ID
  speed: number           // 0.5 - 2.0
  stability: number       // 0 - 1
  similarity: number      // 0 - 1
}
```

---

## Convex Schema

### voiceSessions Table

```typescript
export const voiceSessions = defineTable({
  userId: v.id("users"),
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
  state: v.union(
    v.literal("idle"),
    v.literal("listening"),
    v.literal("processing"),
    v.literal("speaking"),
    v.literal("error")
  ),
  turnCount: v.number(),
  totalDuration: v.optional(v.number()),
  context: v.array(v.object({
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    timestamp: v.number(),
    audioUrl: v.optional(v.string()),
  })),
  metadata: v.object({
    deviceType: v.string(),
    platform: v.string(),
    appVersion: v.string(),
  }),
})
.index("by_user", ["userId"])
.index("by_user_recent", ["userId", "startedAt"])
```

### voiceAnalytics Table

```typescript
export const voiceAnalytics = defineTable({
  sessionId: v.id("voiceSessions"),
  turnId: v.number(),
  
  // Latency metrics
  sttLatency: v.number(),      // ms
  llmLatency: v.number(),      // ms
  ttsLatency: v.number(),      // ms
  totalLatency: v.number(),    // ms
  
  // Quality metrics
  sttConfidence: v.number(),   // 0-1
  audioQuality: v.number(),    // 0-1
  noiseLevel: v.number(),      // dB
  
  // Errors
  errorType: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  recovered: v.optional(v.boolean()),
})
.index("by_session", ["sessionId"])
.index("by_error_type", ["errorType"])
```

### voiceCommands Table

```typescript
export const voiceCommands = defineTable({
  sessionId: v.id("voiceSessions"),
  turnId: v.number(),
  
  // Intent
  transcript: v.string(),
  intent: v.string(),
  entities: v.array(v.object({
    type: v.string(),
    value: v.string(),
    confidence: v.number(),
  })),
  
  // Execution
  actionType: v.string(),
  actionParams: v.any(),
  result: v.optional(v.any()),
  success: v.boolean(),
  
  timestamp: v.number(),
})
.index("by_session", ["sessionId"])
.index("by_intent", ["intent"])
```

---

## API Endpoints

### Convex Functions

```typescript
// mutations/voice.ts
export const startSession = mutation({
  args: { deviceInfo: v.object({...}) },
  handler: async (ctx, args) => {
    // Create new session
  }
})

export const endSession = mutation({
  args: { sessionId: v.id("voiceSessions") },
  handler: async (ctx, args) => {
    // End session, calculate stats
  }
})

export const addTurn = mutation({
  args: {
    sessionId: v.id("voiceSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Add turn to context
  }
})

export const logAnalytics = mutation({
  args: {
    sessionId: v.id("voiceSessions"),
    turnId: v.number(),
    metrics: v.object({...}),
  },
  handler: async (ctx, args) => {
    // Log analytics event
  }
})

// queries/voice.ts
export const getSession = query({
  args: { sessionId: v.id("voiceSessions") },
  handler: async (ctx, args) => {
    // Return session with context
  }
})

export const getRecentSessions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Return user's recent sessions
  }
})
```

---

## External Service Integration

### OpenAI Realtime API

```typescript
const realtimeConfig = {
  model: "gpt-4o-realtime-preview",
  modalities: ["text", "audio"],
  voice: "alloy",
  input_audio_format: "pcm16",
  output_audio_format: "pcm16",
  input_audio_transcription: {
    model: "whisper-1"
  },
  turn_detection: {
    type: "server_vad",
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 500
  },
  tools: [
    // Function calling definitions
  ]
}
```

### ElevenLabs TTS

```typescript
const elevenLabsConfig = {
  model_id: "eleven_flash_v2",
  voice_id: "21m00Tcm4TlvDq8ikWAM", // Rachel
  voice_settings: {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true
  },
  output_format: "mp3_44100_128"
}
```

### Deepgram STT

```typescript
const deepgramConfig = {
  model: "nova-2",
  language: "en-US",
  punctuate: true,
  interim_results: true,
  endpointing: 300,
  vad_events: true,
  smart_format: true
}
```

---

## Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| Activation Latency | <500ms | Tap to listening state |
| STT Latency | <300ms | Speech end to transcript |
| LLM Latency | <500ms | Transcript to response |
| TTS First Byte | <200ms | Response to audio start |
| End-to-End | <1.5s | Speech end to audio start |
| Interruption Response | <100ms | Speech detected to TTS stop |

---

## Security Considerations

### Audio Data

- Audio NOT stored beyond session unless user opts in
- Session context cleared after 5 minutes of inactivity
- No PII extracted from transcripts automatically

### API Keys

- All service API keys stored in Convex environment
- Rate limiting applied per user
- Usage logged for billing attribution

### Permissions

- Microphone: Required, prompt on first use
- Background Audio: Optional, enhances experience
- Push Notifications: Optional, for async results

---

## Testing Strategy

### Unit Tests

- State machine transitions
- Audio format conversion
- VAD threshold tuning
- Error handling paths

### Integration Tests

- STT service connectivity
- TTS service connectivity
- Convex mutation/query flows
- Audio routing on device

### E2E Tests

- Full conversation flow
- Interruption handling
- Error recovery scenarios
- Network failure handling

### Performance Tests

- Latency benchmarks
- Memory profiling
- Battery consumption
- Concurrent session handling
