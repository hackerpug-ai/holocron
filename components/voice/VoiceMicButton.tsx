/**
 * US-013: VoiceMicButton — mic/stop toggle for voice session start/stop.
 *
 * - IDLE: shows mic icon, tappable, calls onStart on press
 * - LISTENING | SPEAKING: shows stop icon, tappable, calls onStop on press
 * - CONNECTING: disabled, tap does nothing
 * - Debounced 150ms to prevent rapid double-start
 */

import { useRef, useEffect } from 'react'
import { Pressable, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { cn } from '@/lib/utils'
import { Mic, Square } from '@/components/ui/icons'
import type { VoiceState } from '@/hooks/use-voice-session-state'

export interface VoiceMicButtonProps {
  /** Current voice session state */
  voiceState: VoiceState
  /** Called when the button is pressed in IDLE state */
  onStart: () => void
  /** Called when the button is pressed in LISTENING or SPEAKING state */
  onStop: () => void
  /** Optional additional className for the outer Pressable */
  className?: string
  /** When true and voiceState is idle, shows a pulsing warm connection indicator dot */
  isWarm?: boolean
}

/**
 * VoiceMicButton renders a circular button that toggles voice sessions.
 *
 * State map:
 * - idle       → mic icon, enabled
 * - connecting → mic icon, disabled (no-op on tap)
 * - listening  → stop icon, enabled
 * - speaking   → stop icon, enabled
 * - processing → stop icon, enabled
 * - error      → mic icon, enabled (allows retry)
 */
export function VoiceMicButton({ voiceState, onStart, onStop, className, isWarm = false }: VoiceMicButtonProps) {
  const lastPressTime = useRef<number>(0)
  const DEBOUNCE_MS = 300

  const isConnecting = voiceState === 'connecting'
  const isActive = voiceState === 'listening' || voiceState === 'speaking' || voiceState === 'processing'
  const showWarmDot = isWarm && voiceState === 'idle'

  const warmPulse = useSharedValue(1)

  useEffect(() => {
    if (showWarmDot) {
      warmPulse.value = withRepeat(
        withTiming(0.5, { duration: 1000 }),
        -1,
        true
      )
    } else {
      warmPulse.value = 1
    }
  }, [showWarmDot, warmPulse])

  const warmDotStyle = useAnimatedStyle(() => ({
    opacity: warmPulse.value,
  }))

  function handlePress() {
    if (isConnecting) return

    const now = Date.now()
    if (now - lastPressTime.current < DEBOUNCE_MS) return
    lastPressTime.current = now

    if (isActive) {
      onStop()
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      onStart()
    }
  }

  const accessibilityLabel = isActive ? 'Stop voice session' : 'Start voice session'

  return (
    <Pressable
      testID="voice-mic-button"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: isConnecting }}
      disabled={isConnecting}
      onPress={handlePress}
      className={cn('items-center justify-center', className)}
    >
      {({ pressed }) => (
        <View
          className={cn(
            'h-10 w-10 items-center justify-center rounded-full',
            isConnecting
              ? 'bg-muted opacity-50'
              : isActive
              ? pressed
                ? 'bg-destructive/70'
                : 'bg-destructive'
              : pressed
              ? 'bg-primary/70'
              : 'bg-primary'
          )}
        >
          {isActive ? (
            <Square size={22} className="text-primary-foreground" />
          ) : (
            <Mic size={22} className="text-primary-foreground" />
          )}
          {showWarmDot && (
            <Animated.View
              testID="voice-mic-warm-indicator"
              className="absolute top-0 right-0 h-2 w-2 rounded-full bg-emerald-400"
              style={warmDotStyle}
            />
          )}
        </View>
      )}
    </Pressable>
  )
}
