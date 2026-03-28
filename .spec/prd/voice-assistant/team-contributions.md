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
┌──────────────────────────────────────────────────────┐
│                React Native App (Expo)                │
├──────────────────────────────────────────────────────┤
│  VoiceSessionState   │  VoiceUI          │  Convex   │
│  (useReducer)        │  (overlay, mic,   │  Client   │
│                      │   indicators)     │           │
├──────────────────────────────────────────────────────┤
│  VoiceConnectionManager (react-native-webrtc)        │
│  RTCPeerConnection + DataChannel('oai-events')       │
├──────────────────────────────────────────────────────┤
│  VoiceEventHandler (function call dispatch)          │
├──────────────────────────────────────────────────────┤
│                 Convex Backend                        │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │ voiceSessions│  │ voiceCommands│                   │
│  └──────────────┘  └──────────────┘                  │
└──────────────────────────────────────────────────────┘
         │ WebRTC + data channel
         ▼
┌─────────────────────────────────────┐
│  OpenAI Realtime (gpt-realtime)     │
│  VAD, STT, TTS, interruption,      │
│  context mgmt, async func calling   │
└─────────────────────────────────────┘
```

### Component Responsibilities

| Component | Purpose |
|-----------|---------|
| VoiceSessionState | Client-side state machine (useReducer), lifecycle |
| VoiceConnectionManager | RTCPeerConnection, data channel, mic/speaker |
| VoiceEventHandler | Parse data channel events, dispatch function calls to Convex |
| VoiceUI | Overlay, mic button, indicators, waveform |
| Convex Backend | Session persistence, function call handlers, ephemeral token generation |

### Convex Schema Extensions

See `technical-requirements.md` for full corrected schema. Key tables:
- `voiceSessions` — linked to `conversations` via `conversationId`
- `voiceCommands` — records function calls and results per session
- `voiceAnalytics` — latency metrics (P2, deferred)

### External Dependencies

| Service | Purpose | Notes |
|---------|---------|-------|
| OpenAI Realtime API | Speech-to-speech via WebRTC | Single provider, no fallback |
| `react-native-webrtc` | Native WebRTC module | Must install |
| `react-native-incall-manager` | Speaker routing | Must install |

### Technical Constraints

- **Latency Budget**: ~800ms end-to-end (single-service speech-to-speech)
- **Audio Format**: PCM 24kHz (WebRTC native)
- **Context Window**: 32,768 tokens (auto-truncation with retention_ratio: 0.8)
- **Session Duration**: 60 minutes max
- **Cost**: ~$3 per 10-minute session
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
components/voice/
├── VoiceOverlay.tsx              # Modal overlay (adapts ImprovementSubmitSheet pattern)
├── MicButton.tsx                 # Tap-to-talk (extends NarrationToggleButton: spring + haptics)
├── ListeningIndicator.tsx        # Pulsing dot (adapts TypingIndicator AnimatedDot pattern)
├── ProcessingSpinner.tsx         # Spinning arc (reuses SpinnerRing directly)
├── WaveformDisplay.tsx           # Audio bars — net-new (react-native-svg, already installed)
├── StatusAnnouncer.tsx           # Accessibility — net-new (AccessibilityInfo.announceForAccessibility)
└── hooks/
    ├── useVoiceSessionState.ts   # useReducer state machine (mirrors useNarrationState pattern)
    ├── useVoiceConnection.ts     # RTCPeerConnection + data channel lifecycle
    ├── useVoiceEventHandler.ts   # Data channel event parsing + function call dispatch
    └── useVoiceAccessibility.ts  # AccessibilityInfo announcements for state changes
```

### Component Reuse Map

| Voice Component | Reuses From | What's Reused |
|----------------|-------------|---------------|
| VoiceOverlay | `ImprovementSubmitSheet` | Modal + animated backdrop + pan-to-dismiss |
| MicButton | `NarrationToggleButton` | Spring scale animation, haptics, Mic icon |
| ListeningIndicator | `TypingIndicator` | `withRepeat + withSequence + withTiming` pulse pattern |
| ProcessingSpinner | `SpinnerRing` | Entire component (parameterize color/size) |
| WaveformDisplay | — | Net-new (use `react-native-svg` bars) |
| StatusAnnouncer | — | Net-new (`AccessibilityInfo` hook) |
| useVoiceSessionState | `useNarrationState` | `useReducer` + action types pattern |
| useVoiceConnection | — | Net-new (WebRTC lifecycle) |
| useVoiceEventHandler | — | Net-new (data channel events) |

---

## Research Reference

Deep research findings stored in Holocron:
- **Document ID**: `js79bg8zt1j787w7p3sts2scp583stnz` — OpenAI Realtime API + React Native Integration Guide (Mar 2026)
- **Document ID**: `js7ecpzbs9bqe0k11837j6y` — Voice Assistant Implementation Guide (Mar 2026, original research)
- **Reference Impl**: [thorwebdev/expo-webrtc-openai-realtime](https://github.com/thorwebdev/expo-webrtc-openai-realtime) (143 stars)

### Key Research Insights

1. **OpenAI Realtime API (GA)** - Single-service speech-to-speech with async function calling, ~800ms E2E latency
2. **`react-native-webrtc`** - Proven for native WebRTC in Expo React Native, used by reference implementation
3. **Async Function Calling** - GA model continues conversation while functions are pending, no re-engineering needed
4. **Ephemeral Tokens** - Server generates ~60s tokens via `/v1/realtime/client_secrets`, client never sees API key
5. **`semantic_vad`** - Smarter than `server_vad`, chunks on meaning not silence (available for P1 upgrade)
