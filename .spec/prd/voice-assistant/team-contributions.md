# Team Contributions

This document captures the planning team outputs that informed this PRD.

---

## Product Manager Contributions

### User Personas (4)

1. **The Commuter** (P0) - Professional with 30-60 min daily commute, hands on wheel, needs 100% hands-free operation
2. **The Hands-Busy Professional** (P0) - Knowledge worker multitasking while cooking/cleaning, needs quick capture and natural flow
3. **The Active Lifestyle User** (P1) - Fitness enthusiast exercising, needs voice control with heavy breathing/movement
4. **The Accessibility-Focused User** (P1) - User with visual/motor impairments, needs full voice accessibility

### Pain Points Identified (6)

| Pain Point | Current State | Target State |
|------------|---------------|--------------|
| Silent Processing | No feedback during waits | Continuous audio progress updates |
| Can't Interrupt | Must wait for completion | Barge-in support, instant stop |
| Context Loss | Repeat everything each turn | Multi-turn context persistence |
| Screen Required | Visual confirmations | 100% audio-only completion |
| No Progress Feedback | Unknown if processing | Real-time status narration |
| Poor Noise Handling | Fails in cars/gyms | Adaptive VAD, noise suppression |

### Functional Groups (5)

- **VSESS** - Voice Session Management (5 UCs)
- **AUDIO** - Audio Capture & Playback (5 UCs)
- **SPEECH** - Speech Processing (5 UCs)
- **QUERY** - Query & Action Execution (5 UCs)
- **ERREC** - Error Recovery (5 UCs)

### Total Use Cases: 25 (5 per group)

---

## Engineering Manager Contributions

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Native App Layer                       │
├─────────────────────────────────────────────────────────────────┤
│  VoiceSessionManager  │  AudioCaptureService  │  UIStateManager │
├─────────────────────────────────────────────────────────────────┤
│              WebRTCTransport / WebSocketTransport               │
├─────────────────────────────────────────────────────────────────┤
│    STTProcessor    │    TTSStreamer    │    LLMOrchestrator    │
├─────────────────────────────────────────────────────────────────┤
│                       Convex Backend                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ voiceSessions│  │ voiceAnalytics│  │ voiceCommands│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Purpose |
|-----------|---------|
| VoiceSessionManager | State machine, lifecycle, context |
| AudioCaptureService | Mic access, encoding, streaming |
| WebRTCTransport | Real-time audio transport |
| STTProcessor | Speech-to-text with VAD |
| TTSStreamer | Text-to-speech playback |
| LLMOrchestrator | Intent routing, action dispatch |

### Convex Schema Extensions

```typescript
// voiceSessions table
{
  userId: v.id("users"),
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
  state: v.union("idle", "listening", "processing", "speaking"),
  turnCount: v.number(),
  context: v.array(v.object({...})),
}

// voiceAnalytics table
{
  sessionId: v.id("voiceSessions"),
  sttLatency: v.number(),
  ttsLatency: v.number(),
  confidence: v.number(),
  errorType: v.optional(v.string()),
}
```

### External Dependencies

| Service | Purpose | Fallback |
|---------|---------|----------|
| OpenAI Realtime API | Speech-to-speech | Separate STT+LLM+TTS |
| ElevenLabs | High-quality TTS | Deepgram Aura |
| Deepgram Nova-3 | Fast STT | Whisper API |
| Silero VAD | Voice activity | WebRTC VAD |

### Technical Constraints

- **Latency Budget**: 1.5s end-to-end (500ms STT + 500ms LLM + 500ms TTS)
- **Audio Format**: 16kHz mono PCM for STT, MP3 for TTS
- **Memory**: <100MB for voice processing
- **Battery**: <10% per hour active use

---

## UI Designer Contributions

### Design Philosophy: Audio-First

> "The interface is invisible. The voice IS the interface."

### Visual States (Minimal)

| State | Visual | Audio |
|-------|--------|-------|
| IDLE | Subtle mic icon | Silent |
| LISTENING | Pulsing dot (cyan) | Gentle activation chime |
| PROCESSING | Rotating dots | "Working on that..." |
| SPEAKING | Waveform animation | TTS voice |
| ERROR | Brief red pulse | Error explanation |

### Audio Feedback Taxonomy

| Category | Examples | Priority |
|----------|----------|----------|
| Activation | Entry chime, wake word ack | P0 |
| Progress | "Searching...", "Still working..." | P0 |
| Confirmation | "Done", "Added", "Canceled" | P0 |
| Error | Gentle error tone + explanation | P0 |
| Ambient | Silence between turns | - |

### Interaction Patterns

1. **Tap-to-Talk**: User taps mic, speaks, releases (or auto-end)
2. **Wake Word**: "Hey Holocron" triggers listening
3. **Continuous**: After response, stays listening for follow-up
4. **Interruption**: User speaks during TTS, immediately stops

### Accessibility Requirements

- All interactions completable via voice alone
- Audio descriptions for all state changes
- Adjustable speech rate (0.5x - 2x)
- High contrast mode for visual indicators
- Screen reader announces state changes

### Component Architecture

```
VoiceOverlay/
├── MicButton.tsx        # Tap-to-talk trigger
├── ListeningIndicator/  # Pulsing dot
├── ProcessingSpinner/   # Rotating dots
├── WaveformDisplay/     # Speaking visualization
└── StatusAnnouncer/     # Screen reader updates
```

---

## Research Reference

Deep research findings stored in Holocron:
- **Document ID**: `js7ecpzbs9bqe0k11837j6y`
- **Title**: Voice Assistant Implementation Guide
- **Topics**: OpenAI Realtime API, Pipecat, ElevenLabs, Deepgram, WebRTC, expo-av

### Key Research Insights

1. **OpenAI Realtime API** - Best for integrated speech-to-speech with function calling
2. **Pipecat** - Open-source alternative for modular pipeline control
3. **ElevenLabs Flash** - Lowest latency TTS (75ms)
4. **Deepgram Nova-3** - Fastest STT (300ms, 92-97% accuracy)
5. **WebRTC** - Preferred transport for mobile real-time audio
