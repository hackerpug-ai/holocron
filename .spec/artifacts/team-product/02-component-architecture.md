# Updated Voice Component Architecture

## Architecture Philosophy

The voice assistant is built **on top of** the existing narration system, not alongside or instead of it. The narration system already solves:

- Audio session management (`expo-audio`, `setAudioModeAsync`, lock screen controls)
- Segment-by-segment playback with auto-advance
- A reducer-based state machine with clean action dispatch
- ElevenLabs TTS integration with Convex storage
- Background playback with CarPlay/lock screen controls

Voice adds three genuinely new capabilities:
1. **Microphone capture** — no existing code for this
2. **STT streaming** — no existing code for this
3. **Conversational context** — no existing pattern (narration is one-directional)

Everything else should reuse or extend existing patterns.

---

## Existing → Voice Mapping

| PRD Component | Existing Code | Relationship |
|---|---|---|
| `VoiceSessionManager` | `useNarrationState.ts` | Extend: add voice states to existing state machine via a new `useVoiceSession` hook that sits alongside narration, sharing the same audio session |
| `AudioCaptureService` (playback half) | `useAudioPlayback.ts` | Reuse: `setAudioModeAsync`, `createAudioPlayer`, lock screen controls, rate control — all already working |
| `AudioCaptureService` (capture half) | None | New: `expo-audio` recording APIs, mic permission flow, PCM chunk streaming |
| `STTProcessor` | None | New: WebSocket/WebRTC transport to Deepgram or OpenAI Realtime, VAD integration |
| `TTSStreamer` | `convex/audio/actions.ts` (`generateSegment`) | Extend: existing ElevenLabs pipeline handles batch TTS; voice needs streaming TTS (first-chunk latency). Same voice ID, same `eleven_flash_v2_5` model. |
| `UIStateManager` | `NarrationControlBar.tsx`, `NarrationToggleButton.tsx` | Extend: add a new `VoiceOrb` UI component for the conversational mode; narration bar stays for document narration |
| `VoiceSessionState` (Convex) | `audioJobs` + `audioSegments` tables | Add: new `voiceSessions` / `voiceCommands` / `voiceAnalytics` tables alongside existing audio tables |

---

## New Hooks Needed

### `useVoiceSession`

**Purpose**: Orchestrates the full voice conversation lifecycle. This is the voice equivalent of `useNarrationState` — the single source of truth for voice state.

**File**: `components/voice/hooks/useVoiceSession.ts`

**Interface**:

```typescript
export type VoiceSessionStatus =
  | 'idle'
  | 'connecting'       // WebRTC/WS handshake in progress
  | 'listening'        // Mic open, VAD active, waiting for speech
  | 'processing'       // Speech detected, STT running
  | 'speaking'         // TTS playing response
  | 'interrupted'      // User spoke during speaking → back to listening
  | 'error'

export interface VoiceSessionState {
  status: VoiceSessionStatus
  sessionId: string | null
  turnCount: number
  partialTranscript: string | null   // Real-time STT partial results
  errorCode: VoiceErrorCode | null
  isInterruptible: boolean           // true when in speaking state
}

type VoiceSessionAction =
  | { type: 'CONNECT' }
  | { type: 'CONNECTED'; sessionId: string }
  | { type: 'START_LISTENING' }
  | { type: 'SPEECH_START' }
  | { type: 'PARTIAL_TRANSCRIPT'; text: string }
  | { type: 'SPEECH_END'; transcript: string }
  | { type: 'RESPONSE_START' }
  | { type: 'RESPONSE_COMPLETE' }
  | { type: 'INTERRUPTED' }
  | { type: 'ERROR'; code: VoiceErrorCode }
  | { type: 'END_SESSION' }
  | { type: 'RESET' }

export interface UseVoiceSessionReturn {
  state: VoiceSessionState
  isVoiceMode: boolean
  startSession(): Promise<void>
  endSession(): Promise<void>
  interruptResponse(): void
}

export function useVoiceSession(): UseVoiceSessionReturn
```

**Relationship to `useNarrationState`**: Independent hook. Document narration and voice session are mutually exclusive — when voice is active, narration is exited (and vice versa). The document screen can check `isVoiceMode` to suppress the `NarrationControlBar`.

---

### `useAudioCapture`

**Purpose**: Manages microphone access, audio recording, and streaming PCM chunks to the STT pipeline. Entirely new — nothing in `useAudioPlayback` covers input.

**File**: `components/voice/hooks/useAudioCapture.ts`

**Interface**:

```typescript
export interface AudioCaptureOptions {
  sampleRate: 16000
  channels: 1
  encoding: 'pcm_16bit'
  vadEnabled: boolean
}

export interface AudioChunk {
  data: ArrayBuffer
  timestampMs: number
  isSpeech: boolean   // from VAD
}

export interface UseAudioCaptureReturn {
  isRecording: boolean
  permissionStatus: 'granted' | 'denied' | 'undetermined'
  startCapture(options?: Partial<AudioCaptureOptions>): Promise<void>
  stopCapture(): void
  /** Subscribe to audio chunks as they come in — returns unsubscribe fn */
  onChunk(callback: (chunk: AudioChunk) => void): () => void
  /** VAD events */
  onSpeechStart(callback: () => void): () => void
  onSpeechEnd(callback: () => void): () => void
}

export function useAudioCapture(): UseAudioCaptureReturn
```

**What's reused from `useAudioPlayback`**: The `setAudioModeAsync` call pattern — voice capture will call `setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentMode: true })` using the same `expo-audio` API.

**What's new**: `expo-audio` `AudioRecorder` (or `expo-av` `Audio.Recording` if `expo-audio` doesn't expose low-level PCM streaming), permission request flow, VAD integration (Silero via WASM or server-side VAD from OpenAI Realtime).

---

### `useSTTStream`

**Purpose**: Manages the WebSocket connection to Deepgram (or delegates to OpenAI Realtime API) and produces transcript events. Entirely new.

**File**: `components/voice/hooks/useSTTStream.ts`

**Interface**:

```typescript
export type STTProvider = 'deepgram' | 'openai_realtime'

export interface TranscriptResult {
  text: string
  confidence: number
  isFinal: boolean
  words?: Array<{ word: string; start: number; end: number }>
}

export interface UseSTTStreamReturn {
  isConnected: boolean
  connect(provider: STTProvider): Promise<void>
  disconnect(): void
  sendChunk(chunk: AudioChunk): void
  onPartial(callback: (text: string) => void): () => void
  onFinal(callback: (result: TranscriptResult) => void): () => void
}

export function useSTTStream(): UseSTTStreamReturn
```

**Note on OpenAI Realtime API**: If using OpenAI Realtime as the primary path, `useSTTStream` and the LLM turn are handled by the same WebRTC/WS connection — the hook manages the unified transport. Deepgram is the fallback for STT-only mode.

---

### `useVoiceTTS`

**Purpose**: Handles streaming TTS for voice responses. Distinct from the batch `generateForDocument` pipeline — this needs first-byte latency under 300ms.

**File**: `components/voice/hooks/useVoiceTTS.ts`

**Interface**:

```typescript
export interface UseVoiceTTSReturn {
  isSpeaking: boolean
  /** Stream text → plays audio chunks as they arrive */
  speak(text: string, options?: { voice?: string; speed?: number }): Promise<void>
  stop(): void
  /** Register interrupt handler — caller is responsible for calling stop() */
  onInterruptible(callback: () => void): () => void
}

export function useVoiceTTS(): UseVoiceTTSReturn
```

**Relationship to existing ElevenLabs pipeline**:
- Existing `generateSegment` in `convex/audio/actions.ts`: batch-generates full segments, stores in Convex file storage, serves via `audioUrl`. Latency: 2–5s per segment, acceptable for narration.
- Voice TTS: must stream directly from ElevenLabs to device speaker via the ElevenLabs streaming endpoint. No Convex storage round-trip. Same `eleven_flash_v2_5` model, same voice ID.
- Implementation: call ElevenLabs streaming endpoint from a Convex HTTP action (to keep API key server-side), pipe chunks back over a streaming response, play with `expo-audio`'s streaming playback support.

**What's reused**: Same `createAudioPlayer` + `player.play()` pattern from `useAudioPlayback`. Same `expo-audio` `setAudioModeAsync` session setup.

---

## Updated State Machine

The narration and voice state machines remain **separate reducers** but live in the same audio session. They are mutually exclusive: entering one exits the other.

### Narration State Machine (unchanged)
```
idle → generating → partially_ready → ready → playing → paused
                                                  ↑          ↓
                                                  └── paused ─┘
```

### Voice Session State Machine (new)
```
idle
  │ startSession()
  ▼
connecting
  │ WebRTC/WS established
  ▼
listening  ◄─────────────────────────────────────────┐
  │ VAD speech_start                                   │
  ▼                                                    │
processing (STT running, partial transcript updating) │
  │ speech_end + final transcript                      │
  ▼                                                    │
speaking (TTS streaming)                              │
  │ response_complete           │ INTERRUPTED          │
  ▼                             ▼                      │
listening ◄────────────── interrupted ────────────────┘
  │ endSession() from any state
  ▼
idle

Any state → error → (user dismisses) → idle
```

### Combined reducer action (`VoiceAction | NarrationAction`)

The document screen coordinates both:

```typescript
// In app/document/[id].tsx or a new voice-enabled screen
const narration = useNarrationState(paragraphCount)
const voice = useVoiceSession()

// Mutual exclusion
const handleStartVoice = () => {
  if (narration.isNarrationMode) narration.exitNarrationMode()
  voice.startSession()
}

const handleStartNarration = () => {
  if (voice.isVoiceMode) voice.endSession()
  narration.enterNarrationMode()
}
```

---

## File Structure

Following the existing `components/narration/` convention:

```
components/
├── narration/                          # Existing — unchanged
│   ├── hooks/
│   │   ├── useNarrationState.ts
│   │   ├── useAudioPlayback.ts
│   │   └── useNarrationProgress.ts
│   ├── NarrationControlBar.tsx
│   ├── NarrationToggleButton.tsx
│   └── SpinnerRing.tsx
│
└── voice/                              # New — voice assistant
    ├── hooks/
    │   ├── useVoiceSession.ts          # State machine + session lifecycle
    │   ├── useAudioCapture.ts          # Mic input + VAD
    │   ├── useSTTStream.ts             # WebSocket STT transport
    │   └── useVoiceTTS.ts              # Streaming TTS playback
    ├── VoiceOrb.tsx                    # Primary voice UI — animated listening indicator
    ├── VoiceTranscriptOverlay.tsx      # Shows partial/final transcript during listening
    └── VoiceErrorSheet.tsx             # Error recovery bottom sheet

convex/
├── audio/                              # Existing — unchanged
│   ├── actions.ts
│   ├── mutations.ts
│   └── queries.ts
│
└── voice/                              # New — voice session persistence
    ├── mutations.ts                    # startSession, endSession, addTurn, logAnalytics
    ├── queries.ts                      # getSession, getRecentSessions
    └── actions.ts                      # streamTTS (HTTP action calling ElevenLabs streaming)

app/
├── document/
│   └── [id].tsx                        # Extend: add voice session integration
├── (drawer)/
│   └── _layout.tsx                     # Extend: add voice FAB or mic button to drawer header
└── voice/                              # Optional: standalone voice screen
    └── index.tsx                       # Full-screen voice mode

__tests__/
└── voice/
    ├── useVoiceSession.test.ts
    ├── useAudioCapture.test.ts
    └── useSTTStream.test.ts
```

---

## Integration Points

### 1. Document Screen (`app/document/[id].tsx`)

The document screen already owns the narration integration pattern. Voice extends it:

```typescript
// Add alongside existing narration hooks:
const voice = useVoiceSession()

// Mutual exclusion handler:
const handleToggleVoice = async () => {
  if (voice.isVoiceMode) {
    await voice.endSession()
    return
  }
  if (narration.isNarrationMode) {
    narration.exitNarrationMode()
  }
  await voice.startSession()
}

// Pass document context to voice session for grounded Q&A:
// (voice session receives document title + content summary as system context)
```

The `NarrationControlBar` is hidden when `voice.isVoiceMode` is true. The `VoiceOrb` is shown instead.

### 2. Navigation / Drawer Layout (`app/(drawer)/_layout.tsx`)

The voice FAB (floating action button) or mic icon in the drawer header activates a global voice session not tied to any document — for general queries like "show me my latest articles" or "navigate to subscriptions".

```typescript
// In DrawerLayout or a global provider:
const voice = useVoiceSession()

// Add Mic button to header:
<Pressable testID="global-voice-button" onPress={() => voice.startSession()}>
  <Mic size={20} className="text-muted-foreground" />
</Pressable>
```

### 3. Chat Screen (`app/(drawer)/chat/[conversationId].tsx`)

Voice can inject transcripts directly into the chat input as an alternative input method. The transcript from `useVoiceSession` state's `partialTranscript` can populate the text input in real-time.

### 4. Audio Session Coordination

Both narration and voice share `expo-audio`'s audio session. The key constraint: only one can own the `setAudioModeAsync` configuration at a time.

```typescript
// Narration mode: playsInSilentMode=true, shouldPlayInBackground=true, allowsRecordingIOS=false
// Voice mode: playsInSilentMode=true, shouldPlayInBackground=true, allowsRecordingIOS=true

// On voice session start:
await setAudioModeAsync({
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  allowsRecordingIOS: true,   // enables mic
  interruptionMode: 'mixWithOthers',  // allow ducking
})

// On voice session end (restore narration-compatible mode):
await setAudioModeAsync({
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  allowsRecordingIOS: false,
  interruptionMode: 'doNotMix',
})
```

---

## Migration Strategy

The goal is zero disruption to existing narration behavior.

### Phase 1: Foundation (no user-visible changes)

1. Create `components/voice/hooks/useAudioCapture.ts` — mic recording only, no STT
2. Create `components/voice/hooks/useVoiceSession.ts` — state machine, no network calls
3. Create `convex/voice/` schema and mutations — `voiceSessions` table
4. Add `VoiceOrb.tsx` component — renders in isolation (Storybook story first)

All behind a feature flag: `EXPO_PUBLIC_VOICE_ENABLED=false`

### Phase 2: STT Pipeline

1. Create `components/voice/hooks/useSTTStream.ts` with Deepgram WebSocket
2. Wire `useAudioCapture` → `useSTTStream` inside `useVoiceSession`
3. Test: tap mic, speak, see transcript in `VoiceTranscriptOverlay`

### Phase 3: TTS Response

1. Create `convex/voice/actions.ts` with `streamTTS` HTTP action
2. Create `components/voice/hooks/useVoiceTTS.ts`
3. Wire full loop: transcript → LLM → TTS → speaker

### Phase 4: Document Integration

1. Extend `app/document/[id].tsx` with voice mode
2. Add mutual exclusion with narration mode
3. Pass document context to voice session system prompt

### Phase 5: Global Voice

1. Add mic FAB to drawer layout
2. Context-aware queries (navigation commands, search)

### Key Invariants Throughout

- **`useNarrationState` signature is never changed** — only additive changes allowed to prevent breaking the document screen
- **`useAudioPlayback` is never changed** — voice hooks are separate consumers of `expo-audio`
- **Narration tests must keep passing at every phase** — the pre-commit `vitest run` gate enforces this
- **No shared mutable state** between narration and voice — they coordinate only through the mutual exclusion pattern in the screen layer

---

## TypeScript Interface Summary

```typescript
// The three new hooks the document screen needs to import:
import { useVoiceSession } from '@/components/voice/hooks/useVoiceSession'
import { useAudioCapture } from '@/components/voice/hooks/useAudioCapture'
// (useSTTStream and useVoiceTTS are internal to useVoiceSession)

// The one new UI component:
import { VoiceOrb } from '@/components/voice/VoiceOrb'

// Props contract for VoiceOrb:
export interface VoiceOrbProps {
  voice: UseVoiceSessionReturn
  testID?: string
}

// Convex API additions (additive only):
// api.voice.mutations.startSession
// api.voice.mutations.endSession
// api.voice.mutations.addTurn
// api.voice.queries.getSession
// api.voice.queries.getRecentSessions
// api.voice.actions.streamTTS
```
