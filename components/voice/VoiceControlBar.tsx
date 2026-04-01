/**
 * VoiceControlBar
 *
 * Control buttons for the voice overlay.
 *
 * Two buttons centered in a horizontal row:
 * - Mute (left): Mic/MicOff icon toggle, 52dp diameter. Active → colors.primary, Muted → colors.destructive
 * - Stop (right): Square icon, 64dp diameter (primary action), always colors.destructive
 *
 * Stop fires immediately (idempotent). Mute uses 100ms debounce. Haptics fire immediately for both.
 * All get accessibilityRole="button" and descriptive accessibilityLabel.
 *
 * Uses Lucide icons from lucide-react-native, theme tokens from useTheme().
 */

import { useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Mic, MicOff, Square } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import type { VoiceState } from '@/hooks/use-voice-session-state'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceControlBarProps {
  /** Whether the microphone is muted */
  isMuted: boolean
  /** Called when user taps mute button */
  onToggleMute: () => void
  /** Called when user taps stop button */
  onStop: () => void
  /** Current voice status for state-aware rendering */
  voiceStatus?: VoiceState
  /** Optional testID for the root container */
  testID?: string
}

// ─── Helper Types ─────────────────────────────────────────────────────────────

type ControlButtonType = 'mute' | 'stop'

// ─── Sub-components ────────────────────────────────────────────────────────────

/**
 * Individual control button with debounce.
 */
function ControlButton({
  type,
  isMuted,
  onPress,
  colors,
  testID,
}: {
  type: ControlButtonType
  isMuted: boolean
  onPress: () => void
  colors: ReturnType<typeof useTheme>['colors']
  testID?: string
}) {
  const [pressed, setPressed] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Determine button styling
  const getButtonStyle = () => {
    const baseStyle = {
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    }

    switch (type) {
      case 'mute':
        return {
          ...baseStyle,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: pressed ? colors.primary : colors.card,
          borderWidth: 2,
          borderColor: isMuted ? colors.destructive : colors.primary,
        }
      case 'stop':
        return {
          ...baseStyle,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: pressed ? colors.destructive : colors.card,
          borderWidth: 2,
          borderColor: colors.destructive,
        }
    }
  }

  // Determine icon and color
  const getIcon = () => {
    const iconColor =
      type === 'mute'
        ? isMuted
          ? colors.destructive
          : colors.primary
        : colors.destructive

    switch (type) {
      case 'mute':
        return isMuted ? <MicOff size={24} color={iconColor} /> : <Mic size={24} color={iconColor} />
      case 'stop':
        return <Square size={28} color={iconColor} />
    }
  }

  // Determine accessibility label
  const getAccessibilityLabel = () => {
    switch (type) {
      case 'mute':
        return isMuted ? 'Unmute microphone' : 'Mute microphone'
      case 'stop':
        return 'Stop voice session'
    }
  }

  const handlePress = () => {
    // Haptics fire immediately for both
    if (type === 'mute') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }

    if (type === 'stop') {
      // No debounce — stop is idempotent
      onPress()
    } else {
      // Short debounce for mute toggle
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => onPress(), 100)
    }
  }

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={getAccessibilityLabel()}
      style={[styles.button, getButtonStyle()]}
    >
      {getIcon()}
    </Pressable>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

/**
 * VoiceControlBar renders control buttons for the voice overlay.
 *
 * @example
 * ```tsx
 * <VoiceControlBar
 *   isMuted={false}
 *   onToggleMute={() => toggleMute()}
 *   onStop={() => stopSession()}
 * />
 * ```
 */
export function VoiceControlBar({
  isMuted,
  onToggleMute,
  onStop,
  voiceStatus,
  testID = 'voice-control-bar',
}: VoiceControlBarProps) {
  const { colors, spacing } = useTheme()

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          gap: spacing.md,
        },
      ]}
    >
      {/* Mute button — hidden during connecting */}
      {voiceStatus !== 'connecting' && (
        <ControlButton
          type="mute"
          isMuted={isMuted}
          onPress={onToggleMute}
          colors={colors}

          testID="voice-assistant-control-mute"
        />
      )}

      {/* Stop button */}
      <ControlButton
        type="stop"
        isMuted={isMuted}
        onPress={onStop}
        colors={colors}
        testID="voice-assistant-control-stop"
      />
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  button: {
    // Dynamic styles applied inline based on button type
  },
})
