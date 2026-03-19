# UC-SPEECH: Speech Processing

## Overview

Speech Processing handles conversion between speech and text, including STT transcription, TTS synthesis, voice activity detection, and interruption handling.

---

## UC-SPEECH-01: Transcribe Speech to Text

**Actor**: System
**Trigger**: Audio captured while in LISTENING state
**Preconditions**: STT service connected, audio streaming

### Main Flow
1. Audio chunks streamed to STT service (Deepgram/OpenAI)
2. Service returns partial transcripts in real-time
3. System displays partial text (optional visual)
4. Final transcript returned on speech end
5. Transcript passed to intent processing

### Alternate Flows
- **A1**: Low confidence (<70%) → Ask user to repeat
- **A2**: STT service timeout → Retry with exponential backoff
- **A3**: Primary STT fails → Fall back to secondary (Whisper)

### Acceptance Criteria
- [ ] Partial results within 300ms
- [ ] Final transcript within 500ms of speech end
- [ ] Accuracy ≥92% for clear speech
- [ ] Accuracy ≥85% with background noise

---

## UC-SPEECH-02: Synthesize Text to Speech

**Actor**: System
**Trigger**: Response text ready for speaking
**Preconditions**: TTS service available (ElevenLabs/Deepgram)

### Main Flow
1. System formats text for natural speech
2. System sends to TTS service with voice settings
3. Service streams audio chunks
4. System plays audio as received (streaming playback)
5. System tracks spoken position for interruption

### Alternate Flows
- **A1**: TTS service fails → Fall back to device TTS
- **A2**: Long response → Stream in chunks, allow interruption between

### Acceptance Criteria
- [ ] First audio within 300ms of request
- [ ] Natural prosody and pacing
- [ ] Consistent voice across responses
- [ ] SSML support for emphasis/pauses

---

## UC-SPEECH-03: Detect Voice Activity (VAD)

**Actor**: System
**Trigger**: Continuous during LISTENING state
**Preconditions**: Microphone active, VAD model loaded

### Main Flow
1. Audio frames processed through VAD model (Silero)
2. System tracks speech probability per frame
3. Speech start detected → Begin STT streaming
4. Speech end detected (pause >1s) → Finalize transcript
5. System handles rapid speech/pause patterns

### Alternate Flows
- **A1**: Background noise detected → Raise VAD threshold
- **A2**: Continuous speech >30s → Insert natural break points

### Acceptance Criteria
- [ ] Speech start detection <100ms
- [ ] Speech end detection <300ms after actual end
- [ ] Handles breaths and filler words correctly
- [ ] Adapts to ambient noise level

---

## UC-SPEECH-04: Handle User Interruption (Barge-In)

**Actor**: User
**Trigger**: User speaks while assistant is speaking
**Preconditions**: System in SPEAKING state, TTS playing

### Main Flow
1. VAD detects speech during TTS playback
2. System immediately stops TTS (<100ms)
3. System transitions to LISTENING state
4. User's interruption is captured
5. New user input processed normally

### Alternate Flows
- **A1**: False positive (cough, etc.) → Brief pause, resume TTS
- **A2**: User says "continue" → Resume from interruption point

### Acceptance Criteria
- [ ] TTS stops within 100ms of interruption
- [ ] No audio overlap (ducking not sufficient)
- [ ] Interruption transcribed completely
- [ ] Context includes interrupted response

---

## UC-SPEECH-05: Handle Noise and Environment

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
