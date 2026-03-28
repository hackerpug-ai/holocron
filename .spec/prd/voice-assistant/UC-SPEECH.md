# UC-SPEECH: Speech Processing

## Overview

Speech Processing handles conversion between speech and text, including STT transcription, TTS synthesis, voice activity detection, and interruption handling.

---

## UC-SPEECH-01: Transcribe Speech to Text

> **Implementation Note**: OpenAI Realtime handles STT internally via built-in Whisper. No separate STT service needed. Transcripts available via `response.audio_transcript.done` and `input_audio_transcription` events on the data channel.

**Actor**: System
**Trigger**: Audio captured while in LISTENING state
**Preconditions**: WebRTC connection to OpenAI Realtime established

### Main Flow
1. Audio streamed to OpenAI Realtime via WebRTC audio track
2. OpenAI returns partial transcripts via data channel events
3. System displays partial text (optional visual)
4. Final transcript returned on speech end (`response.audio_transcript.done`)
5. Transcript passed to intent processing (handled by OpenAI's LLM)

### Alternate Flows
- **A1**: Low confidence → OpenAI model asks user to repeat (via prompt instruction)
- **A2**: Connection drops → Reconnect WebRTC with new ephemeral token

### Acceptance Criteria
- [ ] Partial results within 300ms
- [ ] Final transcript within 500ms of speech end
- [ ] Accuracy ≥92% for clear speech
- [ ] Accuracy ≥85% with background noise

---

## UC-SPEECH-02: Synthesize Text to Speech

> **Implementation Note**: OpenAI Realtime handles TTS internally. Audio output arrives as a WebRTC audio track — no separate TTS service needed. Voice set to `cedar` or `marin` at session start.

**Actor**: System
**Trigger**: OpenAI Realtime generates a response
**Preconditions**: WebRTC connection established, speaker output active

### Main Flow
1. OpenAI Realtime generates audio response internally
2. Audio streams to client via WebRTC audio track
3. `react-native-incall-manager` routes to speaker
4. System tracks spoken position via `response.audio_transcript.delta` events
5. Interruption handled server-side by OpenAI VAD

### Alternate Flows
- **A1**: Service unavailable → Show "voice assistant unavailable" error
- **A2**: Long response → OpenAI streams natively, interruption handled server-side

### Acceptance Criteria
- [ ] First audio within 300ms of request
- [ ] Natural prosody and pacing
- [ ] Consistent voice across responses
- [ ] SSML support for emphasis/pauses

---

## UC-SPEECH-03: Detect Voice Activity (VAD)

> **Implementation Note**: OpenAI Realtime provides server-side VAD (`server_vad` or `semantic_vad`). No on-device VAD model needed. Configuration via `session.update` on the data channel.

**Actor**: System (OpenAI Realtime server-side)
**Trigger**: Continuous during LISTENING state
**Preconditions**: WebRTC connection active

### Main Flow
1. Audio frames processed by OpenAI's server-side VAD
2. Server emits `input_audio_buffer.speech_started` when speech detected
3. Server emits `input_audio_buffer.speech_stopped` when silence detected
4. `server_vad`: configurable threshold, prefix_padding, silence_duration
5. `semantic_vad`: chunks audio based on meaning (user completed utterance)

### Alternate Flows
- **A1**: Background noise → Increase `threshold` via `session.update`
- **A2**: User pauses mid-thought → `semantic_vad` with `eagerness: "low"` waits longer

### Acceptance Criteria
- [ ] Speech start detection <100ms
- [ ] Speech end detection <300ms after actual end
- [ ] Handles breaths and filler words correctly
- [ ] Adapts to ambient noise level

---

## UC-SPEECH-04: Handle User Interruption (Barge-In)

> **Implementation Note**: OpenAI Realtime handles barge-in server-side. When `interrupt_response: true` is set in VAD config (default), the server stops TTS output and transitions to listening automatically.

**Actor**: User
**Trigger**: User speaks while assistant is speaking
**Preconditions**: WebRTC connection active, model speaking

### Main Flow
1. OpenAI server-side VAD detects speech during model output
2. Server immediately stops audio output (<100ms)
3. Server transitions to capturing user input
4. User's interruption is captured and transcribed
5. New user input processed normally by the model

### Alternate Flows
- **A1**: False positive (cough, etc.) → Model may briefly pause then resume
- **A2**: User says "continue" → Model resumes from context

### Acceptance Criteria
- [ ] TTS stops within 100ms of interruption
- [ ] No audio overlap (ducking not sufficient)
- [ ] Interruption transcribed completely
- [ ] Context includes interrupted response

---

## UC-SPEECH-05: Handle Noise and Environment

> **Deferred to Phase 2** — Rely on OpenAI Realtime's built-in noise handling and configurable VAD threshold for V1. On-device noise suppression requires native audio processing.

**Actor**: System
**Trigger**: Elevated background noise detected
**Preconditions**: Active voice session

### Main Flow
1. System monitors ambient noise level
2. When noise >60dB, adjust processing
3. Apply noise suppression to captured audio
4. Adjust VAD thresholds dynamically
5. Increase TTS volume if needed

### Alternate Flows
- **A1**: Noise too high (>80dB) → Warn user, suggest quieter location
- **A2**: Sudden loud noise → Ignore, don't trigger false VAD

### Acceptance Criteria
- [ ] STT accuracy ≥85% with moderate noise (60dB)
- [ ] False VAD triggers <5% in noisy environment
- [ ] Noise suppression doesn't distort voice
- [ ] Adapts within 2 seconds of noise change

---

## L4 Holdout Scenarios

### H-SPEECH-01: Multiple Speakers
**Scenario**: Multiple people speaking near the device
**Expected**: Focus on loudest/nearest speaker, ignore others
**Why Holdout**: Speaker diarization is P2 feature

### H-SPEECH-02: Accent/Dialect Handling
**Scenario**: User with strong regional accent
**Expected**: Maintain ≥85% accuracy with adaptation
**Why Holdout**: Requires accent-specific tuning

### H-SPEECH-03: Whispered Speech
**Scenario**: User whispers to avoid disturbing others
**Expected**: STT handles with slightly reduced accuracy
**Why Holdout**: Edge case requiring gain adjustment
