/**
 * VoiceToolActivityPill
 *
 * Animated pill that surfaces the active tool being executed during a voice session.
 * Appears when toolName is non-null and disappears when null.
 * Uses Reanimated FadeIn/FadeOut for smooth enter/exit transitions.
 */

import { ActivityIndicator, StyleSheet, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import { TOOL_DISPLAY_NAMES } from '@/lib/voice/function-dispatcher'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceToolActivityPillProps {
  /** When non-null, shows the pill with the display name for the active tool */
  toolName: string | null
  /** Optional testID for the root element */
  testID?: string
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function VoiceToolActivityPill({
  toolName,
  testID = 'voice-tool-activity-pill',
}: VoiceToolActivityPillProps) {
  const { colors, spacing, radius } = useTheme()

  if (!toolName) {
    return null
  }

  const displayName = TOOL_DISPLAY_NAMES[toolName] ?? toolName

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      testID={testID}
      style={[
        styles.pill,
        {
          backgroundColor: colors.secondary,
          borderRadius: radius.full,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.md,
          gap: spacing.xs,
        },
      ]}
    >
      <ActivityIndicator
        size="small"
        color={colors.secondaryForeground}
        testID={`${testID}-spinner`}
      />
      <View style={styles.textWrapper}>
        <Text
          className="text-sm"
          style={{ color: colors.secondaryForeground }}
          testID={`${testID}-label`}
        >
          {displayName}
        </Text>
      </View>
    </Animated.View>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  textWrapper: {
    flexShrink: 1,
  },
})
