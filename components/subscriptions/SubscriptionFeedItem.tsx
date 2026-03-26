import { View, Pressable, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { useState } from 'react'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export interface FeedItemProps {
  feedItemId: string
  groupKey: string
  title: string
  summary?: string
  contentType: 'video' | 'blog' | 'social'
  itemCount: number
  thumbnailUrl?: string
  viewed: boolean
  publishedAt: number
  onPress?: () => void
  testID?: string
}

/**
 * SubscriptionFeedItem - Base component for feed item cards
 *
 * Displays different content types (video, blog, social) in the subscription feed.
 * Handles:
 * - Variant switching based on contentType
 * - Animated press feedback (0.98 scale)
 * - Viewed state styling (opacity 0.6)
 * - Semantic theme tokens
 * - Proper testID attributes
 */
export function SubscriptionFeedItem({
  feedItemId,
  groupKey: _groupKey,
  title,
  summary,
  contentType,
  itemCount: _itemCount,
  thumbnailUrl: _thumbnailUrl,
  viewed,
  publishedAt: _publishedAt,
  onPress,
  testID,
}: FeedItemProps) {
  const { colors, spacing, radius } = useTheme()
  const [pressed, setPressed] = useState(false)

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: withSpring(pressed ? 0.98 : 1) }],
    }
  })

  const handlePressIn = () => {
    setPressed(true)
  }

  const handlePressOut = () => {
    setPressed(false)
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.container,
        animatedStyle,
        {
          opacity: viewed ? 0.6 : 1,
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: radius.lg,
          padding: spacing.lg,
        },
      ]}
      testID={testID || `feed-item-${feedItemId}`}
    >
      {/* Variant content based on contentType */}
      {contentType === 'video' && (
        <View style={styles.contentContainer}>
          <Text style={{ color: colors.foreground }}>{title}</Text>
          {summary && (
            <Text style={{ color: colors.mutedForeground }}>
              {summary}
            </Text>
          )}
        </View>
      )}

      {contentType === 'blog' && (
        <View style={styles.contentContainer}>
          <Text style={{ color: colors.foreground }}>{title}</Text>
          {summary && (
            <Text style={{ color: colors.mutedForeground }}>
              {summary}
            </Text>
          )}
        </View>
      )}

      {contentType === 'social' && (
        <View style={styles.contentContainer}>
          <Text style={{ color: colors.foreground }}>{title}</Text>
          {summary && (
            <Text style={{ color: colors.mutedForeground }}>
              {summary}
            </Text>
          )}
        </View>
      )}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    width: '100%',
  },
  contentContainer: {
    gap: 8,
  },
})
