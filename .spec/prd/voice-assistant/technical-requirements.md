# Technical Requirements

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

---

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

---

## WebRTC Connection Flow

```
1. Client calls Convex action: voice.createSession
   → Convex POSTs to https://api.openai.com/v1/realtime/client_secrets
   → Returns ephemeral key (expires in ~60s)

2. Client creates RTCPeerConnection
   const pc = new RTCPeerConnection();

3. Client gets mic
   const ms = await mediaDevices.getUserMedia({ audio: true });
   pc.addTrack(ms.getTracks()[0]);

4. Client handles remote audio
   pc.addEventListener('track', (e) => remoteStream.addTrack(e.track));

5. Client creates data channel
   const dc = pc.createDataChannel('oai-events');  // name MUST be 'oai-events'

6. SDP offer/answer exchange
   const offer = await pc.createOffer();
   await pc.setLocalDescription(offer);

   const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
     method: 'POST',
     body: offer.sdp,
     headers: {
       Authorization: `Bearer ${EPHEMERAL_KEY}`,
       'Content-Type': 'application/sdp',
     },
   });

   await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() });

7. Audio flows via WebRTC, events via data channel
```

---

## Session Configuration

Sent via data channel after connection:

```json
{
  "type": "session.update",
  "session": {
    "model": "gpt-realtime",
    "modalities": ["text", "audio"],
    "voice": "cedar",
    "instructions": "You are the Holocron voice assistant. You help users search their knowledge base, manage tasks, check on research, and navigate the app. Before calling any function tool, briefly announce what you're about to do. When a function call is pending and the user asks about it, say you're still waiting on the result.",
    "turn_detection": {
      "type": "server_vad",
      "threshold": 0.5,
      "prefix_padding_ms": 300,
      "silence_duration_ms": 500,
      "idle_timeout_ms": 30000
    },
    "tools": [],
    "tool_choice": "auto",
    "truncation": { "type": "retention_ratio", "retention_ratio": 0.8 },
    "input_audio_transcription": { "model": "gpt-4o-transcribe" }
  }
}
```

---

## Function Calling

### Event Flow

```
1. OpenAI decides to call a function
   → Server emits: response.output_item.done
   {
     item: {
       type: "function_call",
       call_id: "call_abc123",
       name: "search_knowledge",
       arguments: "{\"query\": \"voice assistant research\"}"
     }
   }
   Note: Filter on item.type === "function_call" (event fires for non-function outputs too)

2. Client executes function (calls Convex query/mutation/action)

3. Client returns result via data channel:
   → Send: conversation.item.create
   {
     type: "conversation.item.create",
     item: {
       type: "function_call_output",
       call_id: "call_abc123",
       output: JSON.stringify(result)
     }
   }

4. Client triggers response:
   → Send: response.create
   { type: "response.create" }
   WARNING: Without this, the model will NOT generate a follow-up response.

5. OpenAI speaks the result
```

### Async Function Calling (GA Model)

The `gpt-realtime` GA model supports async function calling:
- Model continues the conversation while function calls are pending
- If asked about a pending result, model says "I'm still waiting on that"
- Automatically enabled — no config needed
- **LIMITATION**: Cannot send `response.create` while a response is active (get `conversation_already_has_active_response` error)

### Function Call Error: `call_id` Mismatch

The `call_id` must come from `item.call_id` in the `response.output_item.done` event (format: `call_XXXX`), NOT from `item.id` (format: `item_XXXX`).

### Tool Definitions

#### Pure Reads (synchronous — return data immediately)

| Tool | Maps To (Convex) | Returns |
|------|-------------------|---------|
| `get_conversation_context` | `chatMessages.by_conversation` | Recent messages from paired chat session |
| `search_knowledge` | `documents.search` / holocron hybrid search | Array of document summaries |
| `list_recent_documents` | `documents.queries.list` | Recent documents with titles |
| `get_document` | `documents.queries.get` | Full document content |
| `get_conversations` | `conversations` query | Recent chat conversations |
| `get_research_sessions` | `researchSessions` queries | Research sessions + status |
| `get_improvements` | `improvements.queries.list` | Improvement requests + status |
| `check_agent_status` | Session/task status queries | Status of any async process |

#### Agent Dispatchers (async — bridge holds open, polls Convex via useQuery)

| Tool | Maps To | Timeout | On Timeout |
|------|---------|---------|------------|
| `start_research` | `researchSessions.create` + agent | 60s | "Research is still running. Ask me to check later." |
| `submit_improvement` | `improvements.create` + agent | 30s | "Improvement submitted, still being analyzed." |
| `create_note` | `documents.mutations.create` | 5s | N/A (fast mutation) |
| `navigate_app` | Expo Router `router.push()` | 1s | N/A (client-side) |

#### Tool Definition Format

```json
{
  "type": "function",
  "name": "search_knowledge",
  "description": "Search the user's knowledge base for documents and notes. Returns matching documents with titles and excerpts.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query"
      }
    },
    "required": ["query"]
  }
}
```

---

## Convex Schema

### voiceSessions Table

```typescript
export const voiceSessions = defineTable({
  conversationId: v.id("conversations"),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  turnCount: v.number(),
  totalDurationMs: v.optional(v.number()),
  metadata: v.optional(v.object({
    deviceType: v.string(),
    platform: v.string(),
    appVersion: v.string(),
  })),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_conversation", ["conversationId"])
  .index("by_started", ["startedAt"])
  .index("by_created", ["createdAt"])
```

### voiceCommands Table

```typescript
export const voiceCommands = defineTable({
  sessionId: v.id("voiceSessions"),
  transcript: v.string(),
  intent: v.string(),
  entities: v.array(v.object({
    type: v.string(),
    value: v.string(),
    confidence: v.number(),
  })),
  actionType: v.string(),
  actionParams: v.optional(v.record(v.string(), v.string())),
  result: v.optional(v.object({
    success: v.boolean(),
    data: v.optional(v.any()),
    error: v.optional(v.string()),
  })),
  success: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_session", ["sessionId", "createdAt"])
```

### voiceAnalytics Table (P2 — Deferred)

```typescript
export const voiceAnalytics = defineTable({
  sessionId: v.id("voiceSessions"),
  commandId: v.optional(v.id("voiceCommands")),
  sttLatencyMs: v.number(),
  llmLatencyMs: v.number(),
  ttsLatencyMs: v.number(),
  totalLatencyMs: v.number(),
  sttConfidence: v.optional(v.number()),
  errorType: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  recovered: v.optional(v.boolean()),
  createdAt: v.number(),
})
  .index("by_session", ["sessionId"])
```

---

## API Endpoints

### Convex Functions

```typescript
// convex/voice/actions.ts
export const createSession = action({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.object({
    ephemeralKey: v.string(),
    expiresAt: v.number(),
    sessionId: v.id("voiceSessions"),
  }),
  handler: async (ctx, args) => {
    // 1. POST to https://api.openai.com/v1/realtime/client_secrets
    // 2. Create voiceSessions record
    // 3. Return ephemeral key + session ID
  },
})

// convex/voice/mutations.ts
export const endSession = mutation({
  args: { sessionId: v.id("voiceSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Mark session completed, calculate duration
  },
})

export const recordTranscript = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("agent")),
    content: v.string(),
  },
  returns: v.id("chatMessages"),
  handler: async (ctx, args) => {
    // Write to existing chatMessages table
  },
})

export const recordCommand = mutation({
  args: {
    sessionId: v.id("voiceSessions"),
    transcript: v.string(),
    intent: v.string(),
    actionType: v.string(),
    success: v.boolean(),
  },
  returns: v.id("voiceCommands"),
  handler: async (ctx, args) => {
    // Write to voiceCommands table
  },
})

// convex/voice/queries.ts
export const getActiveSession = query({
  args: { conversationId: v.id("conversations") },
  returns: v.union(v.object({ /* session fields */ }), v.null()),
  handler: async (ctx, args) => {
    // Find active (non-completed) session for conversation
  },
})

// convex/voice/scheduled.ts
export const timeoutOrphanedSessions = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // Find sessions where completedAt is null and createdAt > 10 min ago
    // Mark as completed with error
  },
})
```

Register timeout cron in `convex/crons.ts`:
```typescript
crons.interval(
  "voice-session-timeout",
  { minutes: 10 },
  internal.voice.scheduled.timeoutOrphanedSessions
);
```

---

## External Service Integration

### OpenAI Realtime API

Single provider — no fallback services.

**Ephemeral Token Endpoint:**
```
POST https://api.openai.com/v1/realtime/client_secrets
Authorization: Bearer ${OPENAI_API_KEY}
Content-Type: application/json

{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime",
    "audio": { "output": { "voice": "cedar" } }
  }
}

→ Response: { "value": "ek_abc123", "expires_at": 1234567890 }
```

**WebRTC SDP Endpoint:**
```
POST https://api.openai.com/v1/realtime/calls
Authorization: Bearer ${EPHEMERAL_KEY}
Content-Type: application/sdp

{SDP offer body}

→ Response: SDP answer (text/plain)
```

**Available Voices:** `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`

**Recommended:** `cedar` or `marin` for best assistant quality (per OpenAI, Sep 2025)

---

## Session Limits

| Limit | Value |
|-------|-------|
| Max session duration | 60 minutes |
| Token context window | 32,768 tokens |
| Max response tokens | 4,096 tokens |
| Max input tokens | 28,672 tokens |
| Instructions + tools max | 16,384 tokens |
| Ephemeral token lifetime | ~60 seconds |
| Audio format | PCM 24kHz |
| Speed range | 0.25–1.5 (default 1.0) |

---

## Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| End-to-End Latency | <800ms | Single-service speech-to-speech |
| Interruption Response | <100ms | OpenAI server-side VAD handles this |
| Activation Latency | <500ms | Tap to listening state |
| WebRTC Connection | <2s | SDP offer/answer + ICE |

---

## Cost Estimate

| Component | Cost |
|-----------|------|
| Audio input | $0.06/min ($0.04/min cached) |
| Audio output | $0.24/min |
| Text input | $5.00/1M tokens ($2.50 cached) |
| Text output | $20.00/1M tokens |
| **10-minute session** | **~$3.00** |

---

## Security Considerations

### API Keys

- OpenAI API key stored in Convex environment variables (never on client)
- Client receives only ephemeral tokens (~60s lifetime)
- Ephemeral tokens generated per-session via Convex action

### Audio Data

- Audio NOT stored beyond session (WebRTC streams are ephemeral)
- Transcripts persisted to chatMessages if user opts in
- Session context cleared by OpenAI after session ends

### Permissions

- Microphone: Required, prompt on first use
- Background Audio: Optional, enhances experience

---

## Testing Strategy

### Unit Tests

- Voice session state machine transitions
- Data channel event parsing
- Function call dispatch and result formatting
- Ephemeral token generation

### Integration Tests

- WebRTC connection establishment
- Data channel message round-trip
- Convex mutation/query flows for voice endpoints
- Function call → Convex → result flow

### E2E Tests

- Full conversation flow (tap → speak → response → end)
- Function calling (search knowledge, create note)
- Error recovery (network failure, service unavailable)
- Session timeout handling

### Performance Tests

- End-to-end latency measurement
- WebRTC connection time
- Function call round-trip time

---

## Reference Implementation

- **Repo**: [thorwebdev/expo-webrtc-openai-realtime](https://github.com/thorwebdev/expo-webrtc-openai-realtime) (143 stars)
- **Holocron Research**: `js79bg8zt1j787w7p3sts2scp583stnz` — OpenAI Realtime API + React Native Integration Guide
- **OpenAI Docs**: [Realtime WebRTC Guide](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- **OpenAI Blog**: [Developer Notes on the Realtime API](https://developers.openai.com/blog/realtime-api) (Sep 2025)
