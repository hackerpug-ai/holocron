import { View, Pressable, StyleSheet, Image } from 'react-native'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { useState } from 'react'
import { Play, Clock, Calendar, User, Newspaper } from '@/components/ui/icons'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

function formatViews(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

function calculateReadTime(wordCount: number): number {
  // Average reading speed: 200 words per minute
  return Math.max(1, Math.ceil(wordCount / 200))
}

// ============================================================================
// VIDEO FEED CARD
// ============================================================================

interface VideoFeedCardProps {
  thumbnailUrl?: string
  duration?: number
  title: string
  creatorName?: string
  viewsCount?: number
  publishedAt: number
}

function VideoFeedCard({
  thumbnailUrl,
  duration,
  title,
  creatorName,
  viewsCount,
  publishedAt,
}: VideoFeedCardProps) {
  const { colors, spacing, radius } = useTheme()

  return (
    <View style={styles.videoContainer}>
      {/* Thumbnail with duration overlay */}
      <View style={styles.thumbnailContainer}>
        {thumbnailUrl ? (
          <View style={[styles.thumbnailPlaceholder, { borderRadius: radius.md }]}>
            <Image
              source={{ uri: thumbnailUrl }}
              style={styles.thumbnail}
              testID="feed-item-video-thumbnail"
              resizeMode="cover"
            />
          </View>
        ) : (
          <View
            style={[
              styles.thumbnailPlaceholder,
              {
                backgroundColor: colors.muted,
                borderRadius: radius.md,
              },
            ]}
          >
            <Play size={32} color={colors.mutedForeground} testID="feed-item-video-fallback-icon" />
          </View>
        )}

        {/* Duration badge */}
        {duration && (
          <View
            style={[
              styles.durationBadge,
              {
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                padding: spacing.xs,
                borderRadius: radius.sm,
              },
            ]}
          >
            <Text
              style={{ color: '#FFFFFF' }}
              testID="feed-item-video-duration"
            >
              {formatDuration(duration)}
            </Text>
          </View>
        )}
      </View>

      {/* Title and metadata */}
      <View style={[styles.metadata, { gap: spacing.xs }]}>
        <Text
          style={{ color: colors.foreground }}
          numberOfLines={2}
          testID="feed-item-video-title"
        >
          {title}
        </Text>
        {creatorName && (
          <Text
            style={{ color: colors.mutedForeground }}
            testID="feed-item-video-creator"
          >
            {creatorName}
          </Text>
        )}
        <View style={styles.statsRow}>
          {viewsCount && (
            <View style={styles.statItem}>
              <Text style={{ color: colors.mutedForeground }} testID="feed-item-video-views">
                {formatViews(viewsCount)} views
              </Text>
            </View>
          )}
          <View style={styles.statItem}>
            <Clock size={12} color={colors.mutedForeground} />
            <Text
              style={{ color: colors.mutedForeground }}
              testID="feed-item-video-date"
            >
              {formatRelativeTime(publishedAt)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// ============================================================================
// BLOG FEED CARD
// ============================================================================

interface BlogFeedCardProps {
  title: string
  summary?: string
  creatorName?: string
  wordCount?: number
  publishedAt: number
}

function BlogFeedCard({
  title,
  summary,
  creatorName,
  wordCount,
  publishedAt,
}: BlogFeedCardProps) {
  const { colors, spacing } = useTheme()
  const readTime = wordCount ? calculateReadTime(wordCount) : null

  return (
    <View style={[styles.blogContainer, { gap: spacing.md }]}>
      {/* Title */}
      <Text
        style={{ color: colors.foreground }}
        numberOfLines={2}
        testID="feed-item-blog-title"
      >
        {title}
      </Text>

      {/* Excerpt */}
      {summary && (
        <Text
          style={{ color: colors.mutedForeground }}
          numberOfLines={3}
          testID="feed-item-blog-excerpt"
        >
          {summary}
        </Text>
      )}

      {/* Metadata row */}
      <View style={[styles.metadataRow, { gap: spacing.md }]}>
        {/* Author */}
        {creatorName && (
          <View style={styles.metaItem}>
            <User size={14} color={colors.mutedForeground} />
            <Text
              style={{ color: colors.mutedForeground }}
              testID="feed-item-blog-author"
            >
              {creatorName}
            </Text>
          </View>
        )}

        {/* Read time */}
        {readTime && (
          <View style={styles.metaItem}>
            <Clock size={14} color={colors.mutedForeground} />
            <Text
              style={{ color: colors.mutedForeground }}
              testID="feed-item-blog-readtime"
            >
              {readTime} min read
            </Text>
          </View>
        )}

        {/* Published date */}
        <View style={styles.metaItem}>
          <Calendar size={14} color={colors.mutedForeground} />
          <Text
            style={{ color: colors.mutedForeground }}
            testID="feed-item-blog-date"
          >
            {formatRelativeTime(publishedAt)}
          </Text>
        </View>

        {/* Link icon */}
        <Newspaper size={14} color={colors.mutedForeground} testID="feed-item-blog-link-icon" />
      </View>
    </View>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

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
  // Video-specific props
  duration?: number
  creatorName?: string
  viewsCount?: number
  // Blog-specific props
  wordCount?: number
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
  thumbnailUrl,
  viewed,
  publishedAt,
  duration,
  creatorName,
  viewsCount,
  wordCount,
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
        <VideoFeedCard
          thumbnailUrl={thumbnailUrl}
          duration={duration}
          title={title}
          creatorName={creatorName}
          viewsCount={viewsCount}
          publishedAt={publishedAt}
        />
      )}

      {contentType === 'blog' && (
        <BlogFeedCard
          title={title}
          summary={summary}
          creatorName={creatorName}
          wordCount={wordCount}
          publishedAt={publishedAt}
        />
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
  // Video card styles
  videoContainer: {
    width: '100%',
    gap: 12,
  },
  thumbnailContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  metadata: {
    paddingVertical: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  // Blog card styles
  blogContainer: {
    width: '100%',
    paddingVertical: 4,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
})
