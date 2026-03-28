/**
 * US-013: VoiceMicButton — mic/stop toggle for voice session start/stop.
 *
 * - IDLE: shows mic icon, tappable, calls onStart on press
 * - LISTENING | SPEAKING: shows stop icon, tappable, calls onStop on press
 * - CONNECTING: disabled, tap does nothing
 * - Debounced 300ms to prevent rapid double-start
 */

import { useRef } from 'react'
import { Pressable, View } from 'react-native'
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
export function VoiceMicButton({ voiceState, onStart, onStop, className }: VoiceMicButtonProps) {
  const lastPressTime = useRef<number>(0)
  const DEBOUNCE_MS = 300

  const isConnecting = voiceState === 'connecting'
  const isActive = voiceState === 'listening' || voiceState === 'speaking' || voiceState === 'processing'

  function handlePress() {
    if (isConnecting) return

    const now = Date.now()
    if (now - lastPressTime.current < DEBOUNCE_MS) return
    lastPressTime.current = now

    if (isActive) {
      onStop()
    } else {
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
            'h-16 w-16 items-center justify-center rounded-full',
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
            <Square size={28} className="text-primary-foreground" />
          ) : (
            <Mic size={28} className="text-primary-foreground" />
          )}
        </View>
      )}
    </Pressable>
  )
}
