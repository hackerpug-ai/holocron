/**
 * VoiceCaptions
 *
 * Subtitle-style caption component showing recent voice transcripts like movie captions.
 *
 * Features:
 * - Simple View with mapped children (2-4 visible max, no FlatList)
 * - Uses useAutoDismissCaptions to auto-dismiss old entries
 * - Agent captions: bodySmall-sized, semi-transparent background pill, left-aligned
 * - User captions: caption-sized, muted color, italic, right-aligned
 * - Reanimated FadeInUp entrance + FadeOut exit
 * - pointerEvents="none" so it doesn't block orb gestures
 * - No speaker labels - differentiated by styling only
 */

import { StyleSheet, View } from 'react-native'
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import { useAutoDismissCaptions } from '@/hooks/use-auto-dismiss-captions'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type VoiceCaptionsProps = {
  transcripts: Array<{ role: 'user' | 'agent'; content: string; timestamp: number }>
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 4

// ─── Main Component ────────────────────────────────────────────────────────────

export function VoiceCaptions({ transcripts }: VoiceCaptionsProps) {
  const { colors, spacing, radius } = useTheme()
  const visibleCaptions = useAutoDismissCaptions(transcripts)

  // Only show the last MAX_VISIBLE captions
  const displayCaptions = visibleCaptions.slice(-MAX_VISIBLE)

  if (displayCaptions.length === 0) {
    return null
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.sm,
        },
      ]}
      testID="voice-captions-container"
    >
      {displayCaptions.map((caption) => {
        const isAgent = caption.role === 'agent'
        const key = `${caption.role}-${caption.timestamp}`

        return (
          <Animated.View
            key={key}
            entering={FadeInUp.duration(200)}
            exiting={FadeOut.duration(300)}
            style={[
              styles.captionRow,
              {
                alignItems: isAgent ? 'flex-start' : 'flex-end',
                marginBottom: spacing.xs,
              },
            ]}
          >
            <View
              style={[
                styles.captionPill,
                {
                  backgroundColor: isAgent ? `${colors.muted}CC` : 'transparent',
                  borderRadius: radius.lg,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                },
              ]}
            >
              <Text
                className={isAgent ? 'text-sm' : 'text-xs'}
                style={[
                  {
                    color: isAgent ? colors.foreground : colors.mutedForeground,
                  },
                  !isAgent && styles.userText,
                ]}
              >
                {caption.content}
              </Text>
            </View>
          </Animated.View>
        )
      })}
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  captionRow: {
    width: '100%',
  },
  captionPill: {
    maxWidth: '85%',
  },
  userText: {
    fontStyle: 'italic',
  },
})
