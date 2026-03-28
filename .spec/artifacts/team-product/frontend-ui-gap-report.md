# Frontend UI Gap Report: Voice Assistant Components

**Date**: 2026-03-28
**Author**: frontend-designer
**Scope**: Voice UI component proposals vs. existing Holocron React Native codebase

---

## Executive Summary

The proposed voice UI components serve a fundamentally different interaction paradigm than the existing narration system. Narration is a batch TTS playback system (article reading with pause/skip controls); voice is a real-time bidirectional speech session. Despite this difference, there are **significant reuse opportunities** at the animation primitive and state machine levels. The overlay pattern, button, and processing spinner all have existing analogs. Several components — waveform display, wake word handler, and audio session management — are net-new with no direct analog.

---

## 1. Component Reuse Analysis

### VoiceOverlay

**Proposed role**: Full-screen or floating overlay showing voice session state (IDLE → LISTENING → PROCESSING → SPEAKING → ERROR).

**Existing analogs**:
- `ImprovementSubmitSheet` (`components/improvements/ImprovementSubmitSheet.tsx`) — multi-state animated modal with Animated `translateY`, backdrop, pan-to-dismiss, and `Modal transparent` pattern. This is the most complete overlay skeleton in the codebase.
- `components/ui/dialog.tsx` — rn-primitives Dialog with `bg-black/50` overlay and `FadeIn/FadeOut` animated transitions.

**Recommendation**: **Extend the Modal + animated sheet pattern from `ImprovementSubmitSheet`**. The VoiceOverlay is different in that it may be non-blocking and anchored to the bottom or floating rather than a full-page sheet, but the animation infrastructure (`useSharedValue`, `withTiming`, `Easing.out(Easing.cubic)`, backdrop opacity) can be directly copied. Do not duplicate — extract a shared `AnimatedBottomOverlay` base or use the same pattern with a different height/layout.

**Cannot reuse**: The narration bar (`NarrationControlBar`) is a persistent bottom bar for in-progress playback. Voice overlay needs to be dismissible, transient, and state-driven per-session. Different enough to require a new component.

---

### MicButton

**Proposed role**: Tap-to-talk circular button trigger with haptic + animation feedback. States: idle, active (session open), disabled.

**Existing analogs**:
- `NarrationToggleButton` (`components/narration/NarrationToggleButton.tsx`) — **direct reuse candidate**. It is a circular 40×40 Pressable with:
  - Spring scale animation on press (`withSequence(withSpring(1.25), withSpring(1.0))`)
  - `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` on every press
  - Mic/MicOff icon toggle based on `isActive` boolean
  - `bg-primary/10` tint when active
  - Accessible `accessibilityRole="button"` + label

**Gap**: `NarrationToggleButton` is a binary toggle (enabled/disabled mode). `MicButton` needs to express 4 states: idle, listening-active, processing (non-interactive), and error. The animation on narration is a one-shot spring bounce; voice may need a continuous pulse in the listening state.

**Recommendation**: **Extend `NarrationToggleButton`** into a more generic `MicButton` that accepts a `voiceState: 'idle' | 'listening' | 'processing' | 'speaking' | 'error'` prop instead of a boolean. Keep the haptic and spring animation infrastructure. The existing `Mic`/`MicOff` icons from `@/components/ui/icons` (Lucide) are already available. Add a `variant` prop to differentiate the visual style per state.

---

### ListeningIndicator (Pulsing Dot)

**Proposed role**: Cyan pulsing dot shown during LISTENING state.

**Existing analogs**:
- `TypingIndicator` (`components/chat/TypingIndicator.tsx`) — **partial reuse**. It renders 3 animated dots with `withRepeat(withSequence(withTiming(1), withTiming(0.3)), -1)` opacity pulses with staggered delays. The `AnimatedDot` component is a 2×2 rounded-full `bg-primary/60` view.

**Gap**: `ListeningIndicator` needs a single larger pulsing dot (not 3 small ones), and the design spec calls for cyan color rather than primary. The pulse animation pattern is identical — just different visual scale and color.

**Recommendation**: Extract the `AnimatedDot` from `TypingIndicator` into a shared primitive, or create `ListeningIndicator` as a single-dot variant. The `withRepeat + withSequence + withTiming` pattern from `TypingIndicator` is the correct approach and should be reused verbatim. Keep using `className` with NativeWind tokens — do not hardcode `#00BCD4` for cyan; use `bg-cyan-400` (available via Tailwind) or map to a theme token.

---

### ProcessingSpinner (Rotating Dots)

**Proposed role**: 3 rotating dots shown during PROCESSING state.

**Existing analogs**:
- `SpinnerRing` (`components/narration/SpinnerRing.tsx`) — **direct reuse candidate**. It is a generic rotating SVG arc built with `react-native-reanimated` and `react-native-svg`. It accepts `size`, `strokeWidth`, `active`, and `color` props. It uses `withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1)`.
- `TypingIndicator` dot animation could also serve a rotating-dots variant.

**Gap**: The design spec calls for "rotating dots" (discrete circles), not a continuous arc ring. `SpinnerRing` renders a dashed SVG arc, which is close but visually different. If "rotating dots" means 3 circles in an orbital rotation pattern, that requires a new layout. If a single spinning arc is acceptable, `SpinnerRing` is ready to use.

**Recommendation**: **Reuse `SpinnerRing` as-is** for the processing state — it is a well-built, parameterized spinner. If the design spec strictly requires discrete rotating dots, create a thin `ProcessingDots` wrapper using the same `useSharedValue + withRepeat(withTiming(360))` infrastructure from `SpinnerRing`. Do not recreate the animation from scratch.

**Also note**: `ActivityIndicator` from React Native is used in `ImprovementSubmitSheet` for processing states. This is a quick and accessible fallback but does not match the "rotating dots" visual.

---

### WaveformDisplay

**Proposed role**: Audio waveform animation shown during SPEAKING state — visualizes TTS playback in real time.

**Existing analogs**: None. The codebase has no waveform visualization component. The closest is the progress stripe in `NarrationControlBar` (a linear fill bar), which shows playback position but not amplitude waveform.

**Verdict**: **Net-new component, no analog.** A waveform requires real-time amplitude data from the audio stream. The existing `useAudioPlayback` hook provides only `currentTimeSeconds` ticks (via `playbackStatusUpdate`), not PCM amplitude data.

**Notes for implementation**:
- Will need either a fake/generative animated waveform (bars oscillating at fixed frequencies during speaking) or real amplitude data from the TTS audio stream.
- For the fake approach: use `useSharedValue` + `withRepeat(withSequence(withTiming(maxHeight), withTiming(minHeight)))` per bar with staggered delays — same pattern as `TypingIndicator` dots but with height instead of opacity.
- `react-native-svg` is already installed (used by `SpinnerRing`), enabling SVG-based waveform paths if needed.

---

### StatusAnnouncer

**Proposed role**: Accessibility component — announces voice state changes to screen readers.

**Existing analogs**: No dedicated `StatusAnnouncer` or `AccessibilityLiveRegion` component exists in the codebase. The existing components use `accessibilityRole` and `accessibilityLabel` consistently, but there is no live-region pattern for dynamic state announcements.

**Verdict**: **Net-new component**. In React Native, screen reader announcements are made via `AccessibilityInfo.announceForAccessibility(message)`. This would be a lightweight hook (`useVoiceAccessibility`) rather than a visual component, invoked on voice state transitions.

---

## 2. Hook Reuse Analysis

### useAudioPlayback — Can it be extended for real-time voice?

**Current scope**: Owns the `expo-audio` `AudioPlayer` lifecycle for TTS segment playback. Loads a URL, plays, handles pause/rate/auto-advance, and manages lock screen controls.

**Gap vs. voice**: Voice requires:
1. **Microphone capture** (recording, not playback) — `useAudioPlayback` is purely a playback hook, has no recording infrastructure.
2. **Streaming audio input** to STT — needs continuous PCM frame streaming, not segment URL loading.
3. **Real-time TTS playback** — streaming chunks rather than loading a complete segment URL.
4. **Barge-in detection** — must monitor mic while TTS is playing to allow interruption.

**Verdict**: **Cannot extend; must create new hooks.** The architectural gap is fundamental: voice sessions require simultaneous record + playback with real-time streaming, while `useAudioPlayback` is a sequential file-based playback hook. Sharing the `setAudioModeAsync` configuration call is the only safe overlap.

**What to reuse**: The `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })` configuration from `useAudioPlayback` should be the starting point for voice session audio configuration.

---

### useNarrationState — Can it be extended for real-time voice?

**Current scope**: A `useReducer`-based state machine with states `idle | generating | partially_ready | ready | playing | paused`. Manages paragraph index, playback position, speed.

**Gap vs. voice**: Voice needs states `idle | listening | processing | speaking | error` with transitions driven by WebRTC/WebSocket events rather than Convex segment readiness. The state machine shape is similar but the states, transitions, and action set are entirely different.

**Verdict**: **Cannot extend directly, but should use the same pattern.** The `useReducer` + explicit action types pattern from `useNarrationState` is the correct architectural approach for voice session state. Create a new `useVoiceSessionState` hook using the same reducer pattern.

**What to reuse**: The pattern:
```typescript
// Reuse this structure exactly
type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'
type VoiceAction = { type: 'START_SESSION' } | { type: 'START_LISTENING' } | ...
function voiceReducer(state, action): VoiceSessionState { ... }
export function useVoiceSessionState(): UseVoiceSessionStateReturn { ... }
```

---

### useNarrationProgress — Relevant to voice?

Not directly relevant. Progress persistence (AsyncStorage of paragraph index) is a narration-specific concern. Voice sessions do not need to resume mid-conversation across app restarts. No reuse.

---

## 3. Design System Alignment

### Theme Token Usage

The existing components use a dual approach:
1. **NativeWind `className`** for static semantic classes (`bg-primary`, `text-muted-foreground`, `border-border`, `rounded-full`)
2. **`useTheme()` / `colors.*`** for dynamic inline styles where `className` is insufficient (e.g., animated SVG stroke color in `SpinnerRing`, input placeholder color)

**Proposed visual states alignment**:

| Voice State | Proposed Visual | Token Alignment |
|-------------|----------------|-----------------|
| IDLE | Subtle mic icon | `text-muted-foreground` — already used in `NarrationToggleButton` for inactive state |
| LISTENING | Pulsing dot (cyan) | **Gap**: No cyan token in `lib/theme.ts`. Use `bg-cyan-400` via Tailwind or add `listening: '#06B6D4'` to theme colors |
| PROCESSING | Rotating dots | `text-primary` / `colors.primary` — matches `SpinnerRing` usage pattern |
| SPEAKING | Waveform animation | `bg-primary` or `text-primary` for bars |
| ERROR | Brief red pulse | `text-destructive` / `colors.destructive` — already defined |

**Gap**: The "cyan" listening state color has no semantic token. The `colors` object in `lib/theme.ts` has `success`, `warning`, `danger`, `info` but no `listening`/`active` state color. Two options:
- Add `listening: '#06B6D4'` (light) / `'#22D3EE'` (dark) to the theme
- Use Tailwind `bg-cyan-400` className directly (already in NativeWind's palette)

### Animation Library Alignment

All existing animations use `react-native-reanimated` (v3 API with hooks). This is the correct approach for voice UI as well:
- `useSharedValue` + `withRepeat` for continuous animations (pulsing, rotating)
- `withSpring` for interaction feedback (button press)
- `withTiming` + `Easing` for state transitions (overlay slide-in/out)

No new animation dependencies needed.

### Styling Pattern Alignment

The project uses **NativeWind `className` for static styles + inline `style` for dynamic values** (colors from `useTheme()`). Voice components should follow this same pattern. `StyleSheet.create()` is used in `ImprovementSubmitSheet` for static layout constants — this is the correct approach for voice overlay layout as well.

---

## 4. Net-New Components (No Existing Analog)

| Component | Justification |
|-----------|--------------|
| `WaveformDisplay` | No amplitude visualization exists anywhere in the codebase |
| `StatusAnnouncer` | No live-region accessibility pattern exists |
| `useVoiceSessionState` | New state machine — narration states don't map to voice states |
| `useAudioCapture` | Microphone capture hook — no recording infrastructure exists |
| `useVoiceTransport` | WebRTC/WebSocket connection management — completely new |
| `useVoiceAccessibility` | `AccessibilityInfo.announceForAccessibility` wrapper for state transitions |

---

## 5. Accessibility Gaps

The PRD specifies strong accessibility requirements for voice (100% audio-only completion, screen reader state announcements, adjustable speech rate, high contrast). Current codebase gaps:

| Requirement | Current State | Gap |
|-------------|--------------|-----|
| Screen reader announces state changes | Components use `accessibilityLabel` on static elements | No `AccessibilityInfo.announceForAccessibility` calls for dynamic state changes |
| Adjustable speech rate (0.5x–2x) | `NarrationControlBar` has speed control (0.5, 1, 1.5, 2x) | Pattern exists; needs to be surfaced in voice TTS playback too |
| Audio descriptions for all state changes | Not present | `useVoiceAccessibility` hook needed |
| High contrast mode for visual indicators | Not implemented anywhere | System `AccessibilityInfo.isHighContrastEnabled` check + alternate styles needed |
| All interactions completable via voice alone | Not applicable to current non-voice UI | Voice UI is the implementation of this requirement |
| Wake word activation (`Hey Holocron`) | No on-device wake word detection | Entirely new; likely requires a native module or Porcupine SDK |

---

## 6. Recommended Component Architecture

```
components/voice/
├── VoiceOverlay.tsx              # Main overlay container (Modal-based, animated)
│   ├── Reuses: Modal pattern from ImprovementSubmitSheet
│   └── Contains: MicButton, ListeningIndicator, ProcessingSpinner, WaveformDisplay, StatusAnnouncer
├── MicButton.tsx                 # Tap-to-talk button
│   └── Extends: NarrationToggleButton (spring animation + haptics)
├── ListeningIndicator.tsx        # Pulsing dot (LISTENING state)
│   └── Adapts: AnimatedDot pattern from TypingIndicator
├── ProcessingSpinner.tsx         # Spinning arc (PROCESSING state)
│   └── Reuses: SpinnerRing directly (same component, different color/size props)
├── WaveformDisplay.tsx           # Audio bars (SPEAKING state) — net-new
│   └── Depends on: react-native-svg (already installed)
├── StatusAnnouncer.tsx           # Screen reader live region — net-new
└── hooks/
    ├── useVoiceSessionState.ts   # State machine (mirrors useNarrationState pattern)
    ├── useAudioCapture.ts        # Mic recording (expo-audio record API) — net-new
    ├── useVoiceTransport.ts      # WebRTC/WebSocket — net-new
    └── useVoiceAccessibility.ts  # AccessibilityInfo.announceForAccessibility — net-new
```

**Key design constraints for implementation**:
1. All `Text` components must use `@/components/ui/text` (NativeWind Text), not `react-native` Text
2. All colors via `className` NativeWind tokens or `useTheme()` — no hardcoded hex
3. Every interactive element needs `testID` with pattern `voice-{component}-{element}`
4. Every interactive element needs `accessibilityRole` + `accessibilityLabel`
5. `StyleSheet.create()` for static layout; inline `style` for dynamic theme values
6. Animation via `react-native-reanimated` v3 hooks — no `Animated` from react-native

---

## 7. Dependency Assessment

| Need | Status |
|------|--------|
| `react-native-reanimated` | Already installed — all animation primitives available |
| `react-native-svg` | Already installed — used by `SpinnerRing` |
| `expo-audio` | Already installed — used by `useAudioPlayback` |
| `expo-haptics` | Already installed — used by `NarrationToggleButton` |
| `react-native-gesture-handler` | Already installed — used by `ImprovementSubmitSheet` |
| WebRTC (voice transport) | **Not installed** — need `react-native-webrtc` or evaluate OpenAI Realtime API SDK |
| Wake word detection | **Not installed** — needs `@picovoice/porcupine-react-native` or similar |
| VAD (voice activity detection) | **Not installed** — Silero VAD or WebRTC VAD need native integration |

---

## Summary Table

| Proposed Component | Action | Existing Source |
|-------------------|--------|----------------|
| VoiceOverlay | Adapt pattern | `ImprovementSubmitSheet` (Modal + animated backdrop) |
| MicButton | Extend | `NarrationToggleButton` (spring + haptics + mic icon) |
| ListeningIndicator | Adapt pattern | `TypingIndicator` (AnimatedDot pulse pattern) |
| ProcessingSpinner | Reuse directly | `SpinnerRing` (parameterize color/size) |
| WaveformDisplay | Create new | `react-native-svg` (already installed) |
| StatusAnnouncer | Create new | None |
| useVoiceSessionState | Create new (same pattern) | `useNarrationState` (useReducer state machine) |
| useAudioCapture | Create new | `useAudioPlayback` (audio session config reference only) |
| useVoiceTransport | Create new | None |
| useVoiceAccessibility | Create new | None |
