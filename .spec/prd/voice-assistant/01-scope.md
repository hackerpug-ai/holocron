# 01 - Scope

## Appetite

**6 weeks (Full)** - Comprehensive voice assistant with all core features.

## In Scope

### Must Have (P0)

- [ ] Voice session lifecycle (start, maintain, end)
- [ ] Real-time speech-to-text with <300ms latency
- [ ] Natural text-to-speech with ElevenLabs quality
- [ ] Interruption handling (barge-in support)
- [ ] Progress narration during operations
- [ ] Basic command execution (queries, navigation)
- [ ] Error recovery with spoken guidance
- [ ] Mobile app integration (iOS/Android)

### Should Have (P1)

- [ ] Context persistence across turns
- [ ] Wake word detection ("Hey Holocron")
- [ ] Noise suppression and VAD tuning
- [ ] Command history and repeat
- [ ] Hands-free confirmation patterns
- [ ] Session analytics and quality metrics

### Could Have (P2)

- [ ] Custom wake word training
- [ ] Voice cloning for personalized TTS
- [ ] Multi-language support
- [ ] Offline fallback mode
- [ ] Car mode with simplified interactions

## Out of Scope

- Video/visual responses (audio-only MVP)
- Third-party integrations (Spotify, smart home)
- Voice authentication/biometrics
- Real-time translation
- Multiple concurrent users
- Desktop/web client (mobile-first)

## Constraints

| Constraint | Details |
|------------|---------|
| Platform | iOS 15+, Android 12+ |
| Network | Requires internet (no offline STT/TTS) |
| Audio | Microphone permission required |
| Battery | Background audio session limits |
| Privacy | Audio not stored beyond session |

## Dependencies

| Dependency | Purpose | Risk |
|------------|---------|------|
| OpenAI Realtime API | Speech-to-speech | Beta availability |
| ElevenLabs API | High-quality TTS | Rate limits, cost |
| Deepgram API | Fast STT fallback | Accuracy variance |
| expo-av | Audio capture | Platform quirks |
| Convex | Session persistence | None (existing) |
