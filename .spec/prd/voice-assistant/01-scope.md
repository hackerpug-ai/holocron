# 01 - Scope

## Appetite

**6 weeks (Full)** - Comprehensive voice assistant with all core features.

## In Scope

### Must Have (P0)

- [ ] Voice session lifecycle (start, maintain, end)
- [ ] OpenAI Realtime API connection via native WebRTC (`react-native-webrtc`)
- [ ] Server-side VAD + interruption handling (provided by OpenAI Realtime)
- [ ] Function calling bridge to Holocron (pure reads + agent dispatchers)
- [ ] Context persistence across turns (OpenAI manages in-session; Convex persists)
- [ ] Progress narration (model announces intent before function calls via prompt)
- [ ] Basic command execution via function calling (queries, navigation, note capture)
- [ ] Error recovery with spoken guidance
- [ ] Mobile app integration (iOS/Android)

### Should Have (P1)

- [ ] Command history and repeat
- [ ] Hands-free confirmation patterns
- [ ] Upgrade to `semantic_vad` (from `server_vad`)

### Could Have (P2)

- [ ] Wake word detection ("Hey Holocron") — requires native on-device ML model
- [ ] On-device VAD (Silero) — currently using OpenAI server-side VAD
- [ ] Detailed session analytics (voiceAnalytics table)
- [ ] Noise suppression
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
| Network | OpenAI Realtime requires persistent internet connection |
| WebRTC | iOS 14.3+ and Android WebView 80+ for WebRTC support |
| Audio | Microphone permission required |
| Battery | Background audio session limits |
| Privacy | Audio not stored beyond session |
| No fallback | Single provider dependency on OpenAI Realtime — if unavailable, show error |

## Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| OpenAI Realtime API | Speech-to-speech via WebRTC | Required (no fallback) |
| `react-native-webrtc` | Native WebRTC module | Must install |
| `react-native-webrtc-web-shim` | Web-compatible API wrapper | Must install |
| `react-native-incall-manager` | Force audio to speaker | Must install |
| `expo-av` | Audio mode config (playsInSilentModeIOS) | Already installed |
| Convex | Session persistence, function call backend | Already installed |
