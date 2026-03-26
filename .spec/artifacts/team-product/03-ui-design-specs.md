# Updated Voice UI Design Specs

## Design System Alignment

The voice assistant UI must feel native to Holocron's "Crystalline Archive" aesthetic — deep navy-black backgrounds, amber/gold primary accents, teal secondary accents — while embracing an audio-first philosophy where "the interface is invisible."

### Existing Patterns to Leverage

| Voice Component | Existing Analog | Reuse Strategy |
|-----------------|-----------------|----------------|
| VoiceControlBar | `NarrationControlBar` | Extend same fixed-bottom-bar pattern with spring slide-in animation |
| VoiceMicButton | `NarrationToggleButton` | Same circular Pressable + spring scale + haptics pattern |
| VoiceStateIndicator | `TypingIndicator` (AnimatedDot) | Extend animated dot pattern for LISTENING/PROCESSING states |
| VoiceProcessingRing | `SpinnerRing` | Reuse directly — same rotating arc SVG on button rim |
| VoiceWaveform | No analog | New component using `react-native-reanimated` + `react-native-svg` |
| VoiceStatusAnnouncer | `accessibilityLiveRegion` pattern | Accessibility-only (no visual render) |

### Styling Conventions (Confirmed from Codebase)

- **NativeWind `className`** for all layout, color, and spacing — never inline magic numbers
- **`themeColors.*`** from `useTheme()` only for `Animated.View` dynamic styles (where className can't reach)
- **`cn()` from `@/lib/utils`** for conditional class merging
- **`react-native-reanimated`** for all animations: `withSpring`, `withRepeat`, `withTiming`, `withSequence`
- **`react-native-svg`** + `Animated.View` for SVG-based animations (SpinnerRing pattern)
- **`expo-haptics`** for tactile feedback on interactive elements
- **`useSafeAreaInsets()`** for bottom padding on fixed bars
- **`lucide-react-native`** for all icons

### Available Tailwind Color Tokens (from `global.css`)

| Token Class | Light | Dark (Crystalline Archive) |
|-------------|-------|---------------------------|
| `bg-primary` | Navy `#0F172A` | Amber `#F5A623` |
| `text-primary` | Navy | Amber |
| `bg-primary/10` | 10% navy | 10% amber tint |
| `bg-muted` | Slate `#F1F5F9` | Deep navy `#1E2A3B` |
| `text-muted-foreground` | Slate `#64748B` | Muted blue `#8B9AAF` |
| `bg-card` | White | Navy `#111820` |
| `border-border` | Light slate | Dark navy `#1E2A3B` |
| `text-destructive` | Red `#EF4444` | Red `#EF4444` |
| `text-success` (via `themeColors`) | Emerald | Emerald `#34D399` |
| `text-warning` (via `themeColors`) | Amber | Amber `#FBBF24` |
| `bg-accent` | Slate `#F1F5F9` | Teal-tinted `#1A3A4A` |
| `text-accent-foreground` | Navy | Teal `#4FD1C5` |

---

## Component Specifications

### VoiceControlBar

The fixed-bottom voice session bar. Extends the `NarrationControlBar` architectural pattern exactly: absolute positioned, spring slide-in, safe-area aware, `border-t border-border bg-card`.

**File**: `components/voice/VoiceControlBar.tsx`
**Story**: `components/voice/VoiceControlBar.stories.tsx`

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ [status stripe — 2px, full width, color by state]   │
│ ─────────────────────────────────────────────────── │
│  [status label]          [close/stop button]        │
│       [VoiceMicButton — center, 56px]               │
│  [transcript preview — 1 line truncated]            │
│ ─────────────────────────────────────────────────── │
│ [safe area padding]                                 │
└─────────────────────────────────────────────────────┘
```

**Export**:
```typescript
export const VOICE_BAR_HEIGHT = 96

export interface VoiceControlBarProps {
  state: VoiceSessionState          // 'idle' | 'listening' | 'processing' | 'speaking' | 'error'
  transcript?: string               // Last partial or final transcript
  isVisible: boolean
  onMicPress: () => void
  onClose: () => void
  testID?: string
}
```

**Animation** (matches NarrationControlBar exactly):
```typescript
const animatedStyle = useAnimatedStyle(() => {
  const hiddenOffset = VOICE_BAR_HEIGHT + insets.bottom
  return {
    transform: [{
      translateY: withSpring(isVisible ? 0 : hiddenOffset, {
        damping: 22,
        stiffness: 320,
      }),
    }],
  }
})
```

**className structure**:
```tsx
<Animated.View
  testID={testID}
  style={[animatedStyle, { paddingBottom: insets.bottom }]}
  className="absolute bottom-0 left-0 right-0 border-t border-border bg-card"
>
  {/* Status stripe — 2px */}
  <View className="h-0.5 w-full overflow-hidden bg-muted">
    <View className={cn('h-full', stripeColorClass)} />
  </View>

  {/* Content */}
  <View className="px-4 pt-3 pb-2">
    {/* Top row: state label + close */}
    <View className="flex-row items-center justify-between mb-2">
      <VoiceStateIndicator state={state} />
      <Pressable testID="voice-bar-close" onPress={onClose} ...>
        <X size={16} className="text-muted-foreground" />
      </Pressable>
    </View>

    {/* Center: Mic button */}
    <View className="items-center mb-2">
      <VoiceMicButton state={state} onPress={onMicPress} />
    </View>

    {/* Transcript preview */}
    {transcript && (
      <Text
        testID="voice-bar-transcript"
        className="text-muted-foreground text-xs text-center"
        numberOfLines={1}
      >
        {transcript}
      </Text>
    )}
  </View>
</Animated.View>
```

**Status stripe colors** (NativeWind class map):
```typescript
const STRIPE_CLASSES: Record<VoiceSessionState, string> = {
  idle:       'bg-muted',
  listening:  'bg-success',       // Emerald — active recording
  processing: 'bg-warning',       // Amber — matches NarrationControlBar running state
  speaking:   'bg-primary',       // Primary — same as narration playback
  error:      'bg-destructive',
}
```

**testID convention**: `voice-control-bar` (root), `voice-bar-close`, `voice-bar-transcript`

---

### VoiceMicButton

Circular pressable mic button. Extends `NarrationToggleButton` pattern: same spring scale + haptics, same `h-[52px] w-[52px]` size to match the NarrationControlBar play button.

**File**: `components/voice/VoiceMicButton.tsx`
**Story**: `components/voice/VoiceMicButton.stories.tsx`

**Export**:
```typescript
export interface VoiceMicButtonProps {
  state: VoiceSessionState
  onPress: () => void
  testID?: string
}
```

**Visual states**:

| State | Background class | Icon | SpinnerRing |
|-------|-----------------|------|-------------|
| `idle` | `bg-primary` | `Mic` (primary-foreground) | none |
| `listening` | `bg-success` | `Mic` (white/dark foreground) | PulseRing (success color) |
| `processing` | `bg-primary/20` | `Loader` (primary) | SpinnerRing (primary color) |
| `speaking` | `bg-primary/10` | `Volume2` (primary) | none |
| `error` | `bg-destructive/20` | `MicOff` (destructive) | none |

**Implementation pattern** (mirrors NarrationToggleButton + NarrationControlBar):
```tsx
<View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
  {/* Reuse SpinnerRing from narration for PROCESSING state */}
  <SpinnerRing
    size={56}
    strokeWidth={2.5}
    active={state === 'processing'}
    color={themeColors.primary}
  />
  {/* PulseRing for LISTENING state — new variant */}
  <PulseRing
    size={56}
    active={state === 'listening'}
    color={themeColors.success}
  />
  <Pressable
    testID={testID}
    onPress={handlePress}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabelForState[state]}
    className={cn(
      'h-[52px] w-[52px] items-center justify-center rounded-full',
      buttonBgClass[state]
    )}
  >
    <StateIcon state={state} />
  </Pressable>
</View>
```

**Haptics**: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)` on every press (same as NarrationToggleButton).

**Spring animation** (same as NarrationToggleButton):
```typescript
scale.value = withSequence(
  withSpring(1.25, { damping: 10 }),
  withSpring(1.0, { damping: 14 })
)
```

**Accessibility labels**:
```typescript
const accessibilityLabelForState: Record<VoiceSessionState, string> = {
  idle:       'Start voice session',
  listening:  'Stop listening',
  processing: 'Processing your request',
  speaking:   'Tap to interrupt',
  error:      'Voice error, tap to retry',
}
```

**testID convention**: `voice-mic-button`

---

### VoiceStateIndicator

Small inline label + dot indicating current session state. Used inside VoiceControlBar top row.

**File**: `components/voice/VoiceStateIndicator.tsx`
**Story**: `components/voice/VoiceStateIndicator.stories.tsx`

**Export**:
```typescript
export interface VoiceStateIndicatorProps {
  state: VoiceSessionState
  testID?: string
}
```

**Implementation** — extends `TypingIndicator` AnimatedDot pattern for LISTENING state:

```tsx
export function VoiceStateIndicator({ state, testID = 'voice-state-indicator' }: VoiceStateIndicatorProps) {
  return (
    <View testID={testID} className="flex-row items-center gap-1.5">
      {/* Animated dot — pulses only in LISTENING state */}
      {state === 'listening' && <AnimatedDot color="text-success" />}
      {state === 'processing' && <AnimatedDot color="text-warning" speed="fast" />}
      {state === 'error' && <StaticDot color="text-destructive" />}

      <Text testID="voice-state-label" className={cn('text-xs font-medium', labelColorClass[state])}>
        {STATE_LABELS[state]}
      </Text>
    </View>
  )
}
```

**State labels**:
```typescript
const STATE_LABELS: Record<VoiceSessionState, string> = {
  idle:       'Voice',
  listening:  'Listening...',
  processing: 'Thinking...',
  speaking:   'Speaking',
  error:      'Error',
}
```

**Label color classes**:
```typescript
const labelColorClass: Record<VoiceSessionState, string> = {
  idle:       'text-muted-foreground',
  listening:  'text-success',         // maps to themeColors.success via --success CSS var
  processing: 'text-warning',         // maps to themeColors.warning via --warning CSS var
  speaking:   'text-primary',
  error:      'text-destructive',
}
```

Note: `text-success`, `text-warning` are NOT default Tailwind classes. They must be added to `tailwind.config.js`:
```js
colors: {
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  info: 'hsl(var(--info))',
}
```
These CSS variables already exist in `global.css`; only the Tailwind config mapping is needed.

**testID convention**: `voice-state-indicator`, `voice-state-label`

---

### PulseRing

New animation component for LISTENING state. Concentric expanding ring that pulses outward from the mic button. Complements SpinnerRing (which is for PROCESSING).

**File**: `components/voice/PulseRing.tsx`
**Story**: `components/voice/PulseRing.stories.tsx`

**Export**:
```typescript
export interface PulseRingProps {
  size: number
  active: boolean
  color?: string        // hex color from themeColors
  testID?: string
}
```

**Implementation** — `react-native-reanimated` absolute overlay, same pointerEvents="none" pattern as SpinnerRing:
```tsx
export function PulseRing({ size, active, color = '#34D399', testID = 'pulse-ring' }: PulseRingProps) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(0.6)

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(
        withTiming(1.5, { duration: 900, easing: Easing.out(Easing.ease) }),
        -1, false
      )
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 0 }),
          withTiming(0, { duration: 900, easing: Easing.out(Easing.ease) })
        ),
        -1, false
      )
    } else {
      cancelAnimation(scale)
      cancelAnimation(opacity)
      scale.value = 1
      opacity.value = 0
    }
  }, [active])

  if (!active) return null

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[
        animatedStyle,
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
        },
      ]}
    />
  )
}
```

**testID convention**: `pulse-ring`

---

### VoiceWaveform

New component for SPEAKING state. Bar-based waveform showing TTS audio activity. Uses animated height bars driven by audio amplitude data (or simulated when no amplitude data available).

**File**: `components/voice/VoiceWaveform.tsx`
**Story**: `components/voice/VoiceWaveform.stories.tsx`

**Export**:
```typescript
export interface VoiceWaveformProps {
  /** Array of amplitude values 0-1, length determines bar count */
  amplitudes?: number[]
  /** Whether TTS is actively speaking */
  active: boolean
  /** Bar color — defaults to primary via themeColors */
  color?: string
  barCount?: number   // default 5
  testID?: string
}
```

**Implementation**:
```tsx
export function VoiceWaveform({
  amplitudes,
  active,
  color,
  barCount = 5,
  testID = 'voice-waveform',
}: VoiceWaveformProps) {
  const { colors: themeColors } = useTheme()
  const barColor = color ?? themeColors.primary

  // 5 shared values for bar heights
  const bars = Array.from({ length: barCount }, (_, i) => ({
    height: useSharedValue(4),
    delay: i * 80,
  }))

  useEffect(() => {
    bars.forEach((bar, i) => {
      if (active) {
        const targetHeight = amplitudes?.[i] != null
          ? Math.max(4, amplitudes[i] * 32)
          : 4 + Math.random() * 24  // simulated

        bar.height.value = withRepeat(
          withSequence(
            withTiming(targetHeight, { duration: 200 }),
            withTiming(4, { duration: 300 })
          ),
          -1, false
        )
      } else {
        cancelAnimation(bar.height)
        bar.height.value = withTiming(4, { duration: 200 })
      }
    })
  }, [active, amplitudes])

  return (
    <View
      testID={testID}
      className="flex-row items-center gap-0.5"
      style={{ height: 32 }}
      accessibilityLabel="Audio waveform"
    >
      {bars.map((bar, i) => {
        const animatedStyle = useAnimatedStyle(() => ({
          height: bar.height.value,
        }))
        return (
          <Animated.View
            key={i}
            style={[
              animatedStyle,
              {
                width: 3,
                borderRadius: 2,
                backgroundColor: barColor,
              },
            ]}
          />
        )
      })}
    </View>
  )
}
```

**When to render**: Replace `VoiceMicButton`'s center icon with `VoiceWaveform` when `state === 'speaking'`, or render it inline in `VoiceControlBar` below the mic button.

**testID convention**: `voice-waveform`

---

### VoiceStatusAnnouncer

Accessibility-only component. Renders nothing visible. Uses `accessibilityLiveRegion="polite"` to announce state changes to screen readers. Required for 100% audio-first accessibility per UC-VSESS requirements.

**File**: `components/voice/VoiceStatusAnnouncer.tsx`
**Story**: `components/voice/VoiceStatusAnnouncer.stories.tsx`

**Export**:
```typescript
export interface VoiceStatusAnnouncerProps {
  state: VoiceSessionState
  transcript?: string
  errorMessage?: string
  testID?: string
}
```

**Implementation**:
```tsx
const ANNOUNCEMENTS: Record<VoiceSessionState, string> = {
  idle:       'Voice assistant ready',
  listening:  'Listening, speak now',
  processing: 'Processing your request',
  speaking:   'Assistant speaking',
  error:      'Voice error',
}

export function VoiceStatusAnnouncer({
  state,
  transcript,
  errorMessage,
  testID = 'voice-status-announcer',
}: VoiceStatusAnnouncerProps) {
  const message = state === 'error' && errorMessage
    ? `Error: ${errorMessage}`
    : ANNOUNCEMENTS[state]

  return (
    <View
      testID={testID}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    />
  )
}
```

**testID convention**: `voice-status-announcer`

---

## Visual State Matrix

| State | Status Stripe | Mic Button | State Dot | Waveform | Audio Feedback |
|-------|--------------|------------|-----------|----------|----------------|
| IDLE | `bg-muted` | `bg-primary` + Mic icon | none | hidden | silent |
| LISTENING | `bg-success` | `bg-success` + Mic icon + PulseRing | pulsing success dot | hidden | activation chime |
| PROCESSING | `bg-warning` | `bg-primary/20` + Loader + SpinnerRing | pulsing warning dot | hidden | "Working on that..." |
| SPEAKING | `bg-primary` | `bg-primary/10` + Volume2 icon | static primary dot | visible, animated | TTS voice |
| ERROR | `bg-destructive` | `bg-destructive/20` + MicOff icon | static destructive dot | hidden | error tone + explanation |

### Animation Durations

| Animation | Duration | Easing | Component |
|-----------|----------|--------|-----------|
| Bar slide-in | spring (damping 22, stiffness 320) | spring | VoiceControlBar |
| Mic button tap scale | 1.25x → 1.0x spring | spring damping 10/14 | VoiceMicButton |
| PulseRing expand | 900ms | ease-out | PulseRing |
| SpinnerRing rotate | 1100ms | linear (repeat) | SpinnerRing (reused) |
| Processing dot pulse | 400ms on / 400ms off | linear | VoiceStateIndicator |
| Waveform bar | 200ms up / 300ms down | linear | VoiceWaveform |
| State stripe color | instant (class swap) | n/a | VoiceControlBar |

---

## Interaction Patterns

### Tap-to-Talk
1. User taps `VoiceMicButton` (IDLE state)
2. `Haptics.impactAsync(Medium)` fires
3. Spring scale animation plays on button
4. Parent calls `onMicPress` → session transitions to LISTENING
5. Bar status stripe animates to `bg-success`
6. `PulseRing` begins expanding animation
7. `VoiceStatusAnnouncer` announces "Listening, speak now"

### Auto-End (VAD)
- Voice Activity Detection detects end of speech
- Session transitions LISTENING → PROCESSING
- `PulseRing` stops, `SpinnerRing` starts
- Stripe changes `bg-success` → `bg-warning`

### Interruption (Barge-in)
- User taps `VoiceMicButton` during SPEAKING state
- Same haptics + spring animation
- `accessibilityLabel`: "Tap to interrupt"
- Immediately transitions SPEAKING → LISTENING

### Stop Session
- User taps close (`X`) button in top-right
- Session transitions to IDLE
- Bar slides down via spring animation (`isVisible = false`)
- `VoiceStatusAnnouncer` announces "Voice assistant ready"

### Error Recovery
- Stripe changes to `bg-destructive`
- `MicOff` icon shown with `bg-destructive/20` background
- `accessibilityLabel`: "Voice error, tap to retry"
- Tap retries from IDLE

---

## Accessibility Specifications

### Screen Reader (VoiceOver / TalkBack)
- `VoiceStatusAnnouncer` announces all state transitions via `accessibilityLiveRegion="polite"`
- All interactive elements have explicit `accessibilityRole="button"` and `accessibilityLabel`
- `VoiceWaveform` has `accessibilityLabel="Audio waveform"` (decorative, non-interactive)
- Error messages announced: "Error: [errorMessage]"

### testID Conventions
All interactive elements follow `{feature}-{component}-{element}` pattern:

| Element | testID |
|---------|--------|
| VoiceControlBar root | `voice-control-bar` |
| Close button | `voice-bar-close` |
| Transcript text | `voice-bar-transcript` |
| Mic button | `voice-mic-button` |
| State label | `voice-state-label` |
| State indicator | `voice-state-indicator` |
| Waveform | `voice-waveform` |
| PulseRing | `pulse-ring` |
| StatusAnnouncer | `voice-status-announcer` |

### High Contrast Mode
- All state colors use semantic CSS variable tokens (not hardcoded hex)
- In dark theme: primary = amber `#F5A623`, success = emerald `#34D399` — both WCAG AA compliant against `bg-card` (`#111820`)
- Error state uses `text-destructive` / `bg-destructive/20` — same pattern already used in `NarrationControlBar` error row

### Adjustable Speech Rate
- Existing `PlaybackSpeed` pattern from narration (0.5x, 1x, 1.5x, 2x) can extend to TTS voice rate
- Settings screen pattern already established at `app/settings.tsx` → `screens/settings-screen`
- Add `voiceSpeechRate` setting alongside existing theme override controls

---

## Storybook Stories Required

All stories co-located as `{ComponentName}.stories.tsx` siblings (project convention confirmed in `components/chat/*.stories.tsx`).

### VoiceControlBar.stories.tsx
```typescript
export const Idle: Story       // isVisible=true, state='idle'
export const Listening: Story  // state='listening', no transcript
export const Processing: Story // state='processing'
export const Speaking: Story   // state='speaking', with waveform
export const WithTranscript: Story   // state='listening', transcript="Search for recent articles about..."
export const ErrorState: Story       // state='error'
export const Hidden: Story           // isVisible=false (bar off-screen)
export const AllStates: Story        // render() grid of all 5 states
```

### VoiceMicButton.stories.tsx
```typescript
export const Idle: Story
export const Listening: Story      // PulseRing active
export const Processing: Story     // SpinnerRing active
export const Speaking: Story
export const Error: Story
export const AllStates: Story      // render() flex-row of all 5
export const TapInteraction: Story // play() function: tap and verify state
```

### VoiceStateIndicator.stories.tsx
```typescript
export const AllStates: Story  // render() column of all 5 states
export const Idle: Story
export const Listening: Story  // dot pulsing
export const Processing: Story
export const Speaking: Story
export const Error: Story
```

### PulseRing.stories.tsx
```typescript
export const Active: Story    // pulsing
export const Inactive: Story  // renders null
export const CustomColor: Story
```

### VoiceWaveform.stories.tsx
```typescript
export const Active: Story           // simulated amplitudes
export const WithAmplitudes: Story   // specific amplitude array
export const Inactive: Story         // bars at minimum height
```

### VoiceStatusAnnouncer.stories.tsx
```typescript
export const AllStates: Story  // render() each state with visible debug label
// Note: Component is invisible; story shows debug state labels for verification
```

---

## Theme Token Usage

### NativeWind className (preferred, all static styles)

```typescript
// Layout
'absolute bottom-0 left-0 right-0'  // fixed bar position
'border-t border-border bg-card'     // bar surface (matches NarrationControlBar exactly)
'px-4 pt-3 pb-2'                     // bar content padding
'h-0.5 w-full overflow-hidden'       // status stripe container
'h-[52px] w-[52px] rounded-full'     // mic button size

// State colors (className-swapped, never inline)
'bg-success'          // LISTENING stripe and button
'bg-warning'          // PROCESSING stripe
'bg-primary'          // SPEAKING stripe and idle button
'bg-destructive'      // ERROR stripe
'bg-muted'            // IDLE stripe

// Text
'text-muted-foreground text-xs'    // transcript preview
'text-xs font-medium'              // state label
'text-success'                     // LISTENING label (needs tailwind.config addition)
'text-warning'                     // PROCESSING label (needs tailwind.config addition)
'text-destructive'                 // ERROR label
'text-primary'                     // SPEAKING label
```

### useTheme() colors (only for react-native-reanimated dynamic styles)

```typescript
const { colors: themeColors } = useTheme()

// Animated.View dynamic backgrounds (alpha channel required)
backgroundColor: `${themeColors.primary}14`    // 8% primary tint
backgroundColor: `${themeColors.success}26`    // 15% success tint

// SVG/canvas colors (react-native-svg props)
color={themeColors.primary}    // SpinnerRing (reused)
color={themeColors.success}    // PulseRing
color={themeColors.primary}    // VoiceWaveform bars (default)

// lucide-react-native icon color prop (not className)
color={themeColors.primaryForeground}   // icon on filled button
color={themeColors.mutedForeground}     // icon in muted state
```

### tailwind.config.js additions required

```js
// Add to colors extend to enable text-success, text-warning, bg-success, bg-warning classes:
success: 'hsl(var(--success))',
'success-foreground': 'hsl(var(--success-foreground))',
warning: 'hsl(var(--warning))',
'warning-foreground': 'hsl(var(--warning-foreground))',
info: 'hsl(var(--info))',
'info-foreground': 'hsl(var(--info-foreground))',
```
CSS variables for `--success`, `--warning`, `--info` already defined in `global.css` for both light and dark themes.

---

## Unmodular Code Flags

The following are pre-existing patterns in the codebase that the voice UI should avoid repeating:

- `app/document/[id].tsx:515` — inline `backgroundColor: \`${themeColors.primary}14\`` for highlight tint. Voice UI should extract this alpha-tint pattern to a utility if used in 2+ places.
- `components/chat/ChatInput.tsx:150-163` — `useMemo` wrapping `triggersConfig`. Voice UI hooks should NOT wrap config objects in useMemo unless passed to memo components (per REACT-RULES).
