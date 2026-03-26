# Voice Assistant PRD Gap Analysis

**Date**: 2026-03-25
**Analyst**: product-manager
**PRD Version Reviewed**: .spec/prd/voice-assistant/

---

## Executive Summary

The PRD was written as if the app has no audio infrastructure. In reality, Holocron already has a mature ElevenLabs TTS pipeline, expo-audio playback with lock screen controls, and a full narration state machine used inside the document viewer. The PRD's AUDIO group (TTS output side) is approximately 70% already built. The genuinely new work is the *input* side: microphone capture, STT, VAD, interruption handling, voice session lifecycle, and the query-routing layer that bridges spoken commands to existing Convex APIs.

---

## What Already Exists

### ElevenLabs TTS Pipeline (Production)
- `convex/audio/actions.ts` — `generateSegment`, `generateForDocument`, `regenerateForDocument`, `retryFailedSegments`
- Model: `eleven_flash_v2_5` (not `eleven_flash_v2` as the PRD specifies — already on newer model)
- Output format: `mp3_44100_128` — matches PRD exactly
- Voice settings: `stability: 0.6`, `similarity_boost: 0.75` — configurable
- Context-aware TTS: `previous_text` / `next_text` passed per segment for prosody continuity
- Retry logic: up to 3 retries per segment with exponential enforcement (`resetSegmentForRetry`)
- 200ms stagger scheduling to prevent ElevenLabs rate limiting

### Convex Audio Backend (Production)
- `audioSegments` table: paragraph-level audio with `pending/generating/completed/failed` status, `paragraphIndex`, `paragraphHash`, `storageId`, `durationMs`, `retryCount`, `errorMessage`
- `audioJobs` table: batch job tracking with `totalSegments`, `completedSegments`, `failedSegments`, `status`
- Scheduled timeout handling in `convex/audio/scheduled.ts`
- File storage via `ctx.storage.store()` — Convex blob storage, not external URLs
- Notification push on job completion

### expo-audio Playback (Production)
- `components/narration/hooks/useAudioPlayback.ts` — full lifecycle hook
- `setAudioModeAsync` — background audio session, lock screen controls
- CarPlay/Bluetooth routing awareness mentioned in existing code comments
- Playback speed control: 0.5x, 1x, 1.5x, 2x (matches PRD)
- Auto-advance between segments on completion
- `createAudioPlayer` / `AudioPlayer` lifecycle with proper cleanup

### Narration State Machine (Production)
- `components/narration/hooks/useNarrationState.ts` — full reducer
- States: `idle → generating → partially_ready → ready → playing → paused`
- Actions: `ENTER_MODE`, `EXIT_MODE`, `PARAGRAPH_READY`, `ALL_READY`, `PLAY`, `PAUSE`, `TICK`, `SKIP_TO`, `SET_SPEED`, `REGENERATE`
- Paragraph-level tracking: `activeParagraphIndex`, `totalParagraphs`, `generatedCount`
- Progress persistence: `useNarrationProgress` saves/restores paragraph index and speed per document

### NarrationControlBar UI (Production)
- `components/narration/NarrationControlBar.tsx`
- Animated bottom bar with play/pause, skip prev/next, speed pill, regenerate, retry-failed
- Progress stripe showing generation progress vs. playback position
- Time display (elapsed / total), paragraph counter, generation status

### Chat System with Multi-Turn Conversations (Production)
- `convex/conversations/`, `convex/chatMessages/`, `convex/chat/agentMutations.ts`
- Multi-turn conversation history
- 13 agent tools in `convex/chat/tools.ts`: `search_knowledge_base`, `browse_category`, `knowledge_base_stats`, `quick_research`, and more
- Slash command system, agent support, streaming responses

### Document Viewer Integration (Production)
- `app/document/[id].tsx` — full narration integration in document viewer
- MDAST paragraph-to-audio-segment alignment via `computeNarrationMap`
- Tap-to-skip paragraph, long-press for excerpt actions, scroll-to-active

---

## What Needs Extension

### TTS for Voice Responses (Medium Extension)
- Existing TTS is document-scoped: generates a job per document, stores MP3s in Convex file storage
- Voice assistant needs *conversational TTS*: short, one-shot synthesis of assistant replies, not stored
- Extend `convex/audio/actions.ts` to add a `synthesizeForVoice` action — single-segment, ephemeral, streaming-first
- The ElevenLabs client and voice configuration are already in place; streaming mode (`textToSpeech.stream()`) is not yet used

### Audio Session Management (Minor Extension)
- `useAudioPlayback.ts` already calls `setAudioModeAsync` for background audio
- Voice assistant needs *recording mode*: `allowsRecordingIOS: true`, different `iosCategory`
- Needs toggling between playback mode and recording mode during a session
- This is a configuration change on the existing `setAudioModeAsync` call, not a new system

### Convex Schema for Session Persistence (New Tables, Existing Patterns)
- No `voiceSessions`, `voiceCommands`, or `voiceAnalytics` tables exist yet
- Structure and patterns are identical to existing tables — follow `audioJobs`/`audioSegments` pattern
- Context persistence (conversation turns) maps directly to the existing chat `conversations` + `chatMessages` pattern

### Query Routing to Existing Convex APIs (Medium Extension)
- All target APIs already exist: `search_knowledge_base`, task management, document queries
- Need: a voice-specific intent classifier and routing layer that maps transcripts to these existing tools
- Can leverage existing `convex/chat/tools.ts` tool definitions — they already have zod schemas
- The LLM response generation path through `convex/chat/agentMutations.ts` can be reused with a voice-optimized prompt

### Error State Narration (Minor Extension)
- App has visual error states (Alert, error rows in NarrationControlBar)
- Voice assistant needs spoken error messages — requires calling TTS for error strings
- The TTS pipeline is ready; only the triggering logic is new

---

## What's Genuinely New

### Microphone Capture & STT (Net New)
- No microphone capture code exists anywhere in the codebase
- `expo-audio` is installed and used for playback — it also supports recording via `AudioRecorder`, but this has not been implemented
- Need: `AudioRecorder` setup, PCM chunk streaming to STT service, permission handling
- STT service integration (Deepgram or OpenAI Realtime API) is entirely absent

### Voice Activity Detection (Net New)
- No VAD exists
- PRD proposes Silero VAD (on-device) — this requires a native module or WASM integration not currently present
- Alternative: server-side VAD via Deepgram `vad_events: true` (simpler, no new native modules)
- Silence detection / speech-end detection logic is entirely new

### VoiceSessionManager (Net New)
- No session lifecycle orchestrator exists
- The narration state machine (`useNarrationState`) is the closest analog — handles a similar state machine but for playback, not conversation
- New: `IDLE → LISTENING → PROCESSING → SPEAKING → IDLE` state machine with session context accumulation

### Wake Word Detection (Net New — P1)
- Not present in codebase
- Requires on-device ML model (Picovoice Porcupine or equivalent)
- PRD correctly scopes this as P1 (should-have)

### Barge-In / Interruption Handling (Net New)
- No concept of interrupting playback with new speech exists
- The existing narration playback can be paused/stopped, but detecting mic input during TTS playback is not implemented
- Requires concurrent mic monitoring while TTS plays — complex audio session configuration

### Voice UI Components (Net New)
- No visual components for voice session state (pulsing mic indicator, listening state, waveform)
- NarrationControlBar is the closest existing component but is playback-only, not input-capturing

---

## Functional Group Analysis

### VSESS - Voice Session Management
- **Exists**: None. No session lifecycle manager.
- **Extend**: Can adapt the narration state machine pattern (`useNarrationState` reducer) as an architectural template.
- **New**: `VoiceSessionManager` with `IDLE → LISTENING → PROCESSING → SPEAKING` state machine; session context accumulation; wake word detection (P1); timeout handling.

### AUDIO - Audio Capture & Playback
- **Exists**: Full TTS playback pipeline (`useAudioPlayback`, `expo-audio`, `setAudioModeAsync` with background audio). Audio session for playback. Lock screen controls. Bluetooth/CarPlay routing via expo-audio.
- **Extend**: `setAudioModeAsync` to support recording mode alongside playback. Streaming TTS synthesis (single-use, not document-scoped). Audio ducking for voice responses.
- **New**: Microphone capture via `expo-audio AudioRecorder`. PCM chunk streaming to STT. Audio format negotiation (16kHz mono PCM for STT). Concurrent mic + playback for barge-in.

### SPEECH - Speech Processing
- **Exists**: TTS synthesis via ElevenLabs (`convex/audio/actions.ts`). MP3 playback at configurable speeds.
- **Extend**: ElevenLabs action to support streaming synthesis (currently batch-collects chunks before storing). TTS for conversational responses (ephemeral, not stored in audioSegments).
- **New**: STT integration (Deepgram/OpenAI Realtime). VAD (server-side via Deepgram or client-side via Silero). Interruption (barge-in) detection. Noise handling (entirely absent). Confidence scoring on transcripts.

### QUERY - Query & Action Execution
- **Exists**: Full knowledge query API (`convex/chat/tools.ts` — `search_knowledge_base`, `browse_category`, etc.). LLM agent with tool use (`convex/chat/agentMutations.ts`). Multi-turn conversation context. Task management APIs (`convex/tasks/`). Navigation via Expo Router (all routes exist).
- **Extend**: Voice-optimized response formatting (concise, speech-friendly, no markdown). Progress narration injection during long operations. Confirmation flow that listens for "yes"/"no" instead of UI taps. Navigation commands mapped to Expo Router routes.
- **New**: Intent classification from transcripts. `VoiceCommandRouter` that maps intents to existing Convex tool calls. `voiceSessions` and `voiceCommands` Convex tables. Progress update timing (speak "still working" at 2s mark).

### ERREC - Error Recovery
- **Exists**: Segment-level retry logic (`resetSegmentForRetry`, max 3 retries). Visual error states in `NarrationControlBar`. `Alert.alert` for TTS generation failures. Graceful null handling throughout.
- **Extend**: Retry logic to apply to voice STT/TTS failures (same exponential backoff pattern). Fallback TTS — current system has no fallback (device TTS would be the fallback).
- **New**: Spoken error messages (TTS of error strings — the TTS path exists but needs triggering logic). Permission guidance narration. Fallback mode orchestration (primary STT fails → secondary). Session state watchdog.

---

## Scope Recommendations

### Revised P0 (Must Have — Build Now)
- [ ] STT integration (Deepgram streaming recommended over OpenAI Realtime — simpler, stable API)
- [ ] Microphone capture with expo-audio AudioRecorder
- [ ] VoiceSessionManager state machine
- [ ] Conversational TTS (single-use ElevenLabs synthesis, not document-scoped)
- [ ] Basic voice UI components (listening indicator, active state)
- [ ] Intent classification → existing Convex tool routing (knowledge query, navigation)
- [ ] Error recovery with spoken guidance (extend existing retry pattern)
- [ ] `voiceSessions` + `voiceCommands` Convex tables

### Revised P1 (Should Have — Second Pass)
- [ ] Barge-in interruption detection (complex audio session work)
- [ ] VAD tuning (start with server-side Deepgram VAD events)
- [ ] Context persistence across turns (extend existing chat conversation pattern)
- [ ] Progress narration for long operations (>2s)
- [ ] Confirmation flows ("yes"/"no" voice response)
- [ ] Wake word detection (on-device, Picovoice Porcupine)

### Revised P2 (Could Have — Future)
- [ ] Custom wake word training
- [ ] Voice cloning (ElevenLabs already supports this)
- [ ] Multi-language support
- [ ] Offline fallback (no path for offline STT currently)
- [ ] Car mode

### Drop from Scope
- "Audio not stored beyond session" — PRD assumes this but the existing system stores everything in Convex file storage. For conversational TTS the audio should be ephemeral. Clarify intent: document narration continues to store audio; voice assistant responses do not.
- OpenAI Realtime API as primary STT — the PRD lists this as primary but it's in beta and complex. Given Deepgram is listed as a dependency and is simpler to integrate, recommend Deepgram as primary STT and treat OpenAI Realtime as a future upgrade path.

---

## Persona Relevance Review

The four personas (Commuter, Hands-Busy Professional, Active Lifestyle User, Accessibility-Focused User) are valid and well-differentiated. However, given Holocron's actual feature set (knowledge base, research, document reader, chat), the **Commuter** and **Hands-Busy Professional** personas map most directly to real usage: "read me my saved article while I drive" and "search my knowledge base while I cook."

The **Active Lifestyle User** persona's goal of controlling music/podcasts is out of scope — Holocron is not a media player. This persona is only relevant for "check messages during rest periods" which overlaps with Commuter.

The **Accessibility-Focused User** is important and the existing narration system already partially serves this persona.

**Recommendation**: Keep all four personas but clarify that the Active Lifestyle User's primary job in this context is knowledge access, not media control.

---

## PRD Conflicts with Codebase

| PRD Assumption | Reality |
|----------------|---------|
| ElevenLabs model `eleven_flash_v2` | Codebase uses `eleven_flash_v2_5` (newer) — update PRD |
| Audio not stored beyond session | Document narration audio IS stored in Convex file storage indefinitely. Voice assistant responses should be ephemeral — this distinction needs to be explicit in PRD |
| WebRTC or WebSocket transport layer for STT | Not present. expo-audio + Deepgram HTTP/WebSocket is the realistic path. WebRTC adds complexity with no clear benefit on mobile |
| `voiceSessions` table with `context: ConversationTurn[]` | Context persistence already exists in `conversations` + `chatMessages` tables. The PRD should reuse this schema rather than duplicating it |
| Deepgram config shows `nova-2` model | Deepgram's current recommended model is Nova-3 — update PRD |
| PRD assumes no existing audio infrastructure | Significant audio infrastructure exists. The PRD underestimates leverage from existing code |
| `expo-av` listed as dependency for audio capture | Codebase uses `expo-audio` (the newer, separate package replacing `expo-av`). Dependency list needs updating |
| Chat/navigation commands described as new features | All chat and navigation infrastructure already exists — these are extensions, not new builds |
| Session analytics table (`voiceAnalytics`) | Overkill for initial MVP. Can use existing Convex logging patterns and add analytics in P1 |
