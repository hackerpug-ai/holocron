# Voice Assistant PRD Gap Analysis

**Date**: 2026-03-28
**Analyst**: product-manager
**PRD**: `.spec/prd/voice-assistant/`
**Codebase Baseline**: `main` branch as of 2026-03-28

---

## Executive Summary

The Voice Assistant PRD was authored in an aspirational greenfield context. Against the current codebase, **0% of the PRD's required infrastructure exists** — no voice sessions, no STT/TTS pipeline, no WebRTC/WebSocket transport, and no VAD integration. The only relevant asset is ElevenLabs TTS for document narration (batch, non-realtime). Given this reality, the 6-week appetite is significantly underestimated for a full P0+P1 build. A realistic path forward requires either (a) a hard scope reduction to a single-service MVP, or (b) an appetite reset to 10–12 weeks.

**Overall Readiness**: 0%
**Recommendation**: REQUEST SCOPE REDUCTION before any implementation begins.

---

## 1. Stale Assumptions

### 1.1 OpenAI Realtime API (High Risk)

The PRD designates `gpt-4o-realtime-preview` as the **primary stack** for speech-to-speech. This API:

- Was in limited beta at PRD authoring time (March 2026)
- Has no publicly documented Expo/React Native SDK
- Requires WebRTC or WebSocket transport, neither of which exists in the codebase
- Has historically unstable pricing and availability

**Impact**: The "Primary Stack" plan may not be buildable within the appetite window. The PRD lists the Pipecat framework as the "Fallback Stack" — this may need to become the primary.

### 1.2 ElevenLabs Is Already Installed (Low Risk, Positive)

The PRD treats ElevenLabs as a new dependency. It is already installed (`elevenlabs@^1.59.0`) and integrated for document narration. The batch TTS pattern (`client.textToSpeech.convert()`) exists in `convex/audio/actions.ts`. However:

- Current integration is **batch** (convert full paragraph, return MP3 blob), not **streaming** (synthesize as text arrives)
- The PRD requires streaming TTS for low-latency response
- ElevenLabs streaming (`textToSpeech.stream()`) is available in the SDK but not yet used

**Impact**: Dependency is present; the streaming usage pattern must still be built.

### 1.3 expo-audio Is Already Installed (Low Risk, Positive)

`expo-audio@~55.0.9` is installed and actively used in `useAudioPlayback.ts`. The hook configures:
- `playsInSilentMode: true`
- `shouldPlayInBackground: true`
- Lock screen controls
- Audio session interruption mode

The audio session management patterns needed by UC-AUDIO-03 already exist. They target document playback but are directly reusable.

**Impact**: Significant reuse opportunity. Audio session management is ~60% built.

### 1.4 No Microphone Capture Pattern Exists

`expo-audio` is used only for **playback**, never for **capture**. Microphone recording with streaming PCM output to a cloud STT service requires a different API path (`expo-av` or the new `expo-audio` recording API). Neither pattern exists in the codebase.

**Impact**: UC-AUDIO-01 (Capture Microphone Audio) is 0% implemented.

### 1.5 Deepgram Is Not Installed

Deepgram is listed as the primary STT provider. It has no installation, no API key pattern, and no usage anywhere in the project.

**Impact**: The STT layer is entirely greenfield.

### 1.6 VAD Libraries Are Not Installed

The PRD specifies Silero VAD (primary) and WebRTC VAD (fallback). Neither exists in the codebase or `package.json`. Silero requires WASM/native module integration. WebRTC VAD requires a native module.

**Impact**: VAD (UC-SPEECH-03) is 100% greenfield and requires native module work.

### 1.7 Wake Word Is P1 But Heavily Underestimated

Wake word detection (UC-VSESS-05) requires an on-device ML model with <1% false positive rate and <5% battery impact. No React Native library achieves this without a native module. The PRD lists this as P1 (Should Have) within the 6-week appetite. This is likely a separate 4–6 week effort on its own.

**Impact**: Wake word should be moved to P2 or a separate initiative phase.

---

## 2. Implementation Gap Inventory

### VSESS - Voice Session Management

| Use Case | Status | Gap |
|----------|--------|-----|
| UC-VSESS-01: Start Voice Session | 0% | No session lifecycle, no WebRTC/WebSocket, no activation sound |
| UC-VSESS-02: Maintain Session Context | 0% | No voiceSessions table, no context persistence |
| UC-VSESS-03: Handle Session Timeout | 0% | No timeout logic, no warm connection concept |
| UC-VSESS-04: End Voice Session | 0% | No session teardown, no farewell TTS trigger |
| UC-VSESS-05: Wake Word Activation | 0% | No on-device model, no wake word library |

**Group Completion: 0%** — Entirely greenfield. All 3 required schema tables are missing.

### AUDIO - Audio Capture & Playback

| Use Case | Status | Gap |
|----------|--------|-----|
| UC-AUDIO-01: Capture Microphone Audio | 0% | No mic capture, no PCM streaming, no encoding |
| UC-AUDIO-02: Play TTS Audio | 60% | expo-audio player exists; lacks streaming chunk playback, barge-in stop |
| UC-AUDIO-03: Manage Audio Session | 70% | Session config exists in useAudioPlayback; lacks voice-chat mode, phone call interruption |
| UC-AUDIO-04: Handle Audio Ducking | 50% | `interruptionMode: 'doNotMix'` is set; no active ducking of other apps |
| UC-AUDIO-05: Route Audio Output | 40% | Lock screen + routing exists; lacks route-change event handling for voice sessions |

**Group Completion: ~25%** — Playback infrastructure is partially reusable; capture is 0%.

### SPEECH - Speech Processing

| Use Case | Status | Gap |
|----------|--------|-----|
| UC-SPEECH-01: Transcribe Speech to Text | 0% | No STT provider, no streaming transcription |
| UC-SPEECH-02: Synthesize Text to Speech | 20% | ElevenLabs exists (batch); streaming TTS not implemented |
| UC-SPEECH-03: Detect Voice Activity | 0% | No VAD library installed |
| UC-SPEECH-04: Handle User Interruption | 0% | No barge-in logic, no mid-playback stop from voice |
| UC-SPEECH-05: Handle Noise and Environment | 0% | No noise monitoring, no dynamic VAD threshold |

**Group Completion: ~5%** — ElevenLabs SDK is the only existing asset; everything else is greenfield.

### QUERY - Query & Action Execution

| Use Case | Status | Gap |
|----------|--------|-----|
| UC-QUERY-01: Execute Knowledge Query | 30% | Search API exists (Convex); lacks voice intent → API bridge, result formatting for speech |
| UC-QUERY-02: Create Task or Note | 20% | Create mutations exist; lacks voice confirmation flow, spoken result |
| UC-QUERY-03: Navigate Application | 10% | Expo Router navigation exists; lacks voice intent → screen mapping |
| UC-QUERY-04: Provide Progress Updates | 0% | No TTS progress narration during async operations |
| UC-QUERY-05: Handle Confirmation Flows | 0% | No voice confirmation state machine |

**Group Completion: ~12%** — Holocron's backend APIs are the biggest reuse opportunity, but the voice→action bridge layer is entirely missing.

### ERREC - Error Recovery

| Use Case | Status | Gap |
|----------|--------|-----|
| UC-ERREC-01: Handle Network Failure | 0% | No voice session retry logic, no spoken error feedback |
| UC-ERREC-02: Handle Recognition Failure | 0% | No low-confidence handling, no re-prompt flow |
| UC-ERREC-03: Handle Execution Failure | 10% | Convex error patterns exist; lacks spoken error narration |
| UC-ERREC-04: Guide to Permission Fix | 0% | No permission check UX, no spoken guidance |
| UC-ERREC-05: Activate Fallback Mode | 0% | No fallback service switching logic |

**Group Completion: ~2%** — Almost entirely greenfield.

### Overall Implementation Status

| Group | Completion | Notes |
|-------|------------|-------|
| VSESS | 0% | Schema, lifecycle, transport all missing |
| AUDIO | ~25% | Playback reusable; capture is 0% |
| SPEECH | ~5% | ElevenLabs SDK only |
| QUERY | ~12% | Backend APIs exist; voice bridge missing |
| ERREC | ~2% | Convex error patterns only |
| **Overall** | **~8%** | |

---

## 3. Dependency Analysis

### Already In Project (Reusable)

| Dependency | Current Usage | Voice Reuse |
|------------|---------------|-------------|
| `elevenlabs@^1.59.0` | Batch TTS for documents | Streaming TTS for voice responses |
| `expo-audio@~55.0.9` | Document playback | TTS playback, audio session management |
| `convex@^1.32.0` | All backend | Session persistence, analytics |
| `@ai-sdk/openai@^3.0.41` | Chat agent | LLM intent processing |
| `expo-notifications` | Already configured | Async result delivery (P2) |
| `react-native-reanimated` | UI animations | Voice UI animations |

### Missing Dependencies (Must Install)

| Dependency | Purpose | Risk |
|------------|---------|------|
| Deepgram SDK (`@deepgram/sdk`) | Streaming STT | Low — stable, well-documented |
| VAD library (Silero or `@ricky0123/vad-react`) | Voice activity detection | High — React Native port is experimental |
| WebRTC library (`react-native-webrtc`) | Transport for OpenAI Realtime | High — requires native module, no Expo managed workflow |
| OR WebSocket (built-in) | Transport fallback | Low — available in React Native natively |
| Microphone recording API | PCM audio capture | Medium — expo-av or expo-audio recording mode |

### Key Risk: WebRTC on Expo

The PRD names WebRTC as the primary transport. `react-native-webrtc` requires native module compilation, which breaks Expo Go and requires a dev client build. Holocron already uses `expo-dev-client`, so this is workable — but it adds build complexity.

**Alternative**: WebSocket-based Deepgram STT avoids WebRTC entirely and achieves the PRD's latency targets. This should be the primary path.

---

## 4. Priority Re-assessment

### Current PRD Priority vs. Reality

| Item | PRD Priority | Recommended Priority | Reason |
|------|-------------|---------------------|--------|
| OpenAI Realtime API | P0 (primary stack) | P2 or deferred | Beta API, WebRTC complexity, no SDK |
| Deepgram STT (WebSocket) | P1 (fallback STT) | P0 | Most viable STT path, well-supported |
| ElevenLabs streaming TTS | P0 | P0 | Already installed, streaming is feasible |
| Wake word detection | P1 | P2 or separate phase | Requires native on-device ML model |
| VAD (Silero) | P0 | P1 | React Native port is unstable |
| Session analytics | P1 | P2 | Nice-to-have, defer until core works |
| Context persistence across turns | P1 | P0 | Essential for multi-turn conversation |
| Noise suppression | P1 | P2 | Complex native work |
| Custom wake word | P2 | Out of scope | Way beyond 6-week appetite |

### Revised Priority Stack

**P0 — Must Have (Revised)**
- Voice session lifecycle (start, end, timeout)
- Deepgram STT via WebSocket (streaming, real-time)
- ElevenLabs streaming TTS
- Basic VAD (server-side from Deepgram, not on-device)
- Microphone capture and PCM streaming
- Interruption handling (barge-in)
- Multi-turn context in memory (session lifetime only)
- Error recovery (network, recognition, execution)

**P1 — Should Have (Revised)**
- Convex voiceSessions persistence
- Convex voiceAnalytics logging
- Intent classification and action routing
- Progress narration during long operations

**P2 — Could Have (Deferred)**
- Wake word detection
- On-device VAD (Silero)
- Session history and replay
- Noise suppression
- Offline fallback
- Voice cloning

---

## 5. Scope Reduction Opportunities

### Option A: WebSocket-Only MVP (Recommended)

Remove WebRTC entirely. Use WebSocket for Deepgram STT and HTTP/streaming for ElevenLabs TTS. This eliminates the highest-complexity dependency while hitting P0 latency targets.

- Removes `react-native-webrtc` native module
- Uses built-in WebSocket + fetch streaming
- Reduces build complexity by ~30%
- Achieves <1.5s end-to-end latency target

### Option B: Drop Wake Word to Phase 2

Wake word detection (UC-VSESS-05) is listed as P1 but requires native ML model integration. Cut it entirely from the 6-week scope. Users activate via tap only.

- Removes on-device model dependency
- Removes always-on audio monitoring (battery concern)
- Eliminates most of the native module risk

### Option C: Drop VAD — Use Deepgram Server VAD

Deepgram Nova-2 includes server-side VAD (`vad_events: true`). Instead of integrating Silero on-device, rely on Deepgram's built-in speech end detection. This eliminates on-device VAD completely.

- Removes Silero/WebRTC VAD dependency
- Slightly increases latency (server round-trip for speech-end)
- Acceptable tradeoff for a V1

### Option D: Drop Noise Suppression

UC-SPEECH-05 (Handle Noise) requires dynamic VAD threshold tuning and noise suppression. Cut from V1; Deepgram's built-in noise handling covers the common case.

### Option E: Defer voiceAnalytics Table

The `voiceAnalytics` table with per-turn latency metrics is P1. Defer the full analytics schema until after V1 ships. Log basic events to existing `notifications` or a simple log table instead.

**With A+B+C+D+E applied**, the 6-week scope becomes achievable for a single engineer. Without scope reduction, 10–12 weeks is a more realistic estimate.

---

## 6. Existing Asset Reuse

### High-Value Reuse Targets

**`useAudioPlayback.ts`** (`components/narration/hooks/useAudioPlayback.ts`)

This hook contains the hard work of expo-audio integration: player lifecycle, lock screen controls, background playback, and segment-based auto-advance. For voice assistant TTS playback, a stripped-down version of this hook can be adapted:

- Keep: `setAudioModeAsync` config, lock screen pattern, player lifecycle
- Replace: segment-array logic with single-stream chunk buffer
- Replace: narration state machine references with voice session state machine

Estimated reuse: 40% of the file is directly portable.

**ElevenLabs client pattern** (`convex/audio/actions.ts:88-115`)

The `ElevenLabsClient` instantiation, voice settings, and model selection logic are already solid. The streaming variant (`client.textToSpeech.stream()`) uses the same client and config shape. This is ready to fork.

**Convex schema patterns**

The `audioJobs` and `audioSegments` tables demonstrate the right pattern for async job tracking. The `voiceSessions` schema in the PRD follows the same conventions and can be added with minimal friction.

**`conversationId` / turn model**

The existing `chatMessages` table with `role: "user" | "agent"` and `content: string` mirrors the voice session turn model in the PRD. Voice turns can be appended to existing conversations or stored in the new `voiceSessions.context` array — either approach builds on existing patterns.

**Agent infrastructure** (`convex/agent.ts`, tool dispatch)

The intent classification and action routing needed for UC-QUERY-01 through UC-QUERY-03 can reuse the existing AI agent tool infrastructure. The voice layer becomes a new input channel feeding the same agent core.

### Low-Value Reuse (Do Not Repurpose)

**`NarrationControlBar.tsx`** — The UI design is document-playback specific (paragraph counter, regenerate button, speed pill). Do not adapt this for voice assistant UI. Build a separate `VoiceAssistantOverlay` component from scratch.

**`convex/audio/mutations.ts`** (batch segment mutations) — These are document-narration specific. Do not reuse; write separate voice session mutations.

---

## 7. Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OpenAI Realtime API unavailable/unstable | High | High | Use Deepgram as P0, OpenAI as future upgrade |
| VAD library not viable on React Native | High | Medium | Use Deepgram server VAD instead |
| WebRTC native module breaks build | Medium | High | Use WebSocket-only transport |
| ElevenLabs streaming latency >300ms | Low | Medium | Measure early; fallback to device TTS |
| Microphone permission/recording API issues on Expo | Medium | Medium | Spike audio capture first week |
| 6-week appetite insufficient | High | High | Apply scope reduction Option A-E above |

---

## 8. Recommended Implementation Sequence

If scope reduction is approved, the following sequence de-risks the build:

**Week 1 — Audio Capture Spike**
- Validate microphone capture → PCM streaming on device
- Validate Deepgram WebSocket STT with live audio
- Confirm ElevenLabs streaming TTS first-byte latency
- Gate: all three services working end-to-end before building anything else

**Week 2 — Session Backbone**
- Add `voiceSessions` table to Convex schema
- Build `VoiceSessionManager` state machine
- Build `AudioCaptureService` (mic → PCM → WebSocket)
- Build basic `STTProcessor` (Deepgram WebSocket)

**Week 3 — TTS + Interruption**
- Build `TTSStreamer` (ElevenLabs streaming → expo-audio)
- Implement barge-in (VAD → TTS stop signal)
- Full IDLE → LISTENING → PROCESSING → SPEAKING cycle

**Week 4 — Query Bridge**
- Intent classification (route transcript to existing agent/tools)
- Progress narration for long operations
- Result formatting for speech output

**Week 5 — Error Recovery + Polish**
- Network error handling with retry
- Recognition failure re-prompt
- Timeout handling
- Permission guidance

**Week 6 — QA, Latency Tuning, Hardening**
- Measure against latency targets (<1.5s E2E)
- Stress test audio session on device
- Fix edge cases

---

## Appendix: Schema Delta

Three tables must be added to `convex/schema.ts`:

1. `voiceSessions` — session lifecycle, turn context
2. `voiceCommands` — intent, action, result per turn
3. `voiceAnalytics` — latency and quality metrics (defer to P1)

Full schema definitions are in `.spec/prd/voice-assistant/technical-requirements.md`.
