# Technical Requirements

## Document Index

| File | Description |
|------|-------------|
| [01-webrtc-connection.md](./01-webrtc-connection.md) | WebRTC connection flow, ephemeral tokens, SDP exchange |
| [02-session-config.md](./02-session-config.md) | Session configuration, VAD, voices, limits |
| [03-function-calling.md](./03-function-calling.md) | Event flow, tool definitions, async FC, bridge pattern |
| [04-convex-schema.md](./04-convex-schema.md) | Tables, indexes, corrected validators |
| [05-convex-endpoints.md](./05-convex-endpoints.md) | Mutations, queries, actions, crons |
| [06-performance-cost.md](./06-performance-cost.md) | Latency targets, pricing, session limits, security |
| [07-testing-strategy.md](./07-testing-strategy.md) | Unit, integration, E2E, performance tests |

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                React Native App (Expo)                │
│                                                       │
│  ┌──────────────┐    ┌────────────────────────────┐  │
│  │ Voice UI      │    │ react-native-webrtc         │  │
│  │ (RN overlay)  │◄──►│ RTCPeerConnection           │  │
│  │               │    │ + data channel (oai-events)  │  │
│  │ MicButton     │    │ + getUserMedia (mic)         │  │
│  │ Indicators    │    │ + ontrack (speaker output)   │  │
│  │ Waveform      │    └─────────────┬────────────────┘  │
│  └──────┬────────┘                  │                    │
│         │                           │ function calls     │
│         ▼                           ▼                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Convex (persistence + function call handlers)    │    │
│  │ voiceSessions | voiceCommands | chatMessages     │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼ WebRTC (audio) + data channel (JSON events)
               ┌─────────────────┐
               │ OpenAI Realtime  │  ← VAD, interruption, STT, TTS,
               │ gpt-realtime     │    context mgmt, async func calling
               └─────────────────┘
```

**Server-side (handled by OpenAI — zero code from us):**
- Speech-to-text transcription
- Text-to-speech synthesis
- Voice Activity Detection (server_vad / semantic_vad)
- Interruption / barge-in
- Multi-turn context management
- Async function calling

**Client-side (we build):**
- WebRTC connection lifecycle
- Data channel event handling
- Function call execution (calling Convex)
- Voice UI overlay
- Session persistence to Convex

## Component Specifications

### VoiceSessionState (Client-Side `useReducer`)

State machine runs client-side for <100ms transition latency. NOT stored in Convex.

```typescript
type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error'

type VoiceAction =
  | { type: 'CONNECT_START' }
  | { type: 'CONNECTED' }
  | { type: 'SPEECH_STARTED' }
  | { type: 'SPEECH_STOPPED' }
  | { type: 'RESPONSE_STARTED' }
  | { type: 'RESPONSE_DONE' }
  | { type: 'ERROR'; error: string }
  | { type: 'DISCONNECT' }

interface VoiceSessionState {
  status: VoiceState
  sessionId: string | null
  conversationId: string | null
  errorMessage: string | null
  transcript: string
  isInterrupted: boolean
}
```

### VoiceTokenService (Convex Action)

Generates ephemeral tokens for client-side WebRTC connection.

```typescript
// POST /v1/realtime/client_secrets (current endpoint)
// Note: /v1/realtime/sessions is deprecated
interface VoiceTokenService {
  createEphemeralToken(config: SessionConfig): Promise<{
    value: string       // ephemeral key (prefix: "ek_")
    expires_at: number  // Unix timestamp, ~60 second lifetime
  }>
}
```

### VoiceConnectionManager

Manages `RTCPeerConnection` lifecycle and data channel.

```typescript
interface VoiceConnectionManager {
  // Lifecycle
  connect(ephemeralKey: string): Promise<void>
  disconnect(): void

  // Data channel
  getDataChannel(): RTCDataChannel  // name: 'oai-events'
  sendEvent(event: RealtimeClientEvent): void

  // Events
  onStateChange(cb: (state: RTCPeerConnectionState) => void): void
  onDataChannelOpen(cb: () => void): void
  onDataChannelMessage(cb: (event: RealtimeServerEvent) => void): void
}
```

### VoiceEventHandler

Parses data channel events and dispatches function calls.

```typescript
interface VoiceEventHandler {
  // Receive from OpenAI
  onTranscript(cb: (text: string, isFinal: boolean) => void): void
  onFunctionCall(cb: (callId: string, name: string, args: string) => void): void
  onResponseDone(cb: () => void): void
  onSpeechStarted(cb: () => void): void
  onSpeechStopped(cb: () => void): void
  onError(cb: (error: RealtimeError) => void): void

  // Send to OpenAI
  sendFunctionResult(callId: string, output: string): void
  sendSessionUpdate(config: Partial<SessionConfig>): void
}
```

## Reference Implementation

- **Repo**: [thorwebdev/expo-webrtc-openai-realtime](https://github.com/thorwebdev/expo-webrtc-openai-realtime) (143 stars)
- **Holocron Research**: `js79bg8zt1j787w7p3sts2scp583stnz` — OpenAI Realtime API + React Native Integration Guide
- **OpenAI Docs**: [Realtime WebRTC Guide](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- **OpenAI Blog**: [Developer Notes on the Realtime API](https://developers.openai.com/blog/realtime-api) (Sep 2025)
