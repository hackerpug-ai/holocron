/**
 * VideoCard - Card component for video content with thumbnail, duration, and metadata
 *
 * Displays:
 * - 16:9 thumbnail image with play icon overlay
 * - Duration badge in bottom-right corner
 * - Title (truncated to 2 lines)
 * - Source information
 * - Feedback buttons (when feedItemId provided)
 *
 * Handles missing thumbnails with fallback UI.
 */

import { View, Pressable, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/text'
import { Play } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import { SummaryText } from './SummaryText'
import { OptimizedImage } from '@/components/ui/OptimizedImage'
import { FeedbackButtons } from './FeedbackButtons'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

export interface VideoCardProps {
  /** URL to thumbnail image (16:9 aspect ratio) */
  thumbnailUrl?: string
  /** Duration string in format "MM:SS" or "H:MM:SS" */
  duration?: string
  /** Video title */
  title: string
  /** Optional summary text */
  summary?: string
  /** Source name (e.g., "YouTube", "Vimeo") */
  source?: string
  /** Optional published timestamp (relative time display) */
  publishedAt?: string
  /** Callback when card is pressed */
  onPress?: () => void
  /** Test ID for testing */
  testID?: string
  /** Feed item ID for feedback functionality */
  feedItemId?: Id<'feedItems'>
}

/**
 * VideoCard component
 *
 * @example
 * ```tsx
 * <VideoCard
 *   thumbnailUrl="https://example.com/thumb.jpg"
 *   duration="12:34"
 *   title="Understanding React Native"
 *   source="YouTube"
 *   onPress={() => navigateToVideo()}
 *   testID="video-card-1"
 * />
 * ```
 */
export function VideoCard({
  thumbnailUrl,
  duration,
  title,
  summary,
  source,
  publishedAt,
  onPress,
  testID = 'video-card',
  feedItemId,
}: VideoCardProps) {
  const { colors, spacing, radius } = useTheme()

  // Fetch feedback state if feedItemId is provided
  const feedbackData = useQuery(
    api.feeds.queries.getFeedItemFeedback,
    feedItemId ? { feedItemId } : 'skip'
  )
  const currentFeedback = feedbackData?.feedback ?? null

  const submitFeedbackMutation = useMutation(api.feeds.mutations.submitFeedback)

  const handleFeedback = (type: 'positive' | 'negative' | null) => {
    if (!feedItemId) return

    // Map FeedbackButtons type to Convex type
    // Only submit if not null (deselecting)
    if (type !== null) {
      const feedback = type === 'positive' ? 'up' : 'down'
      submitFeedbackMutation({ feedItemId, feedback })
    }
  }

  // Build accessibility label for screen readers
  const accessibilityLabel = `Video. ${title}${summary ? `. ${summary}` : ''}${source ? `. Source: ${source}` : ''}${duration ? `. Duration: ${duration}` : ''}${publishedAt ? `. ${publishedAt}` : ''}. Tap to watch.`

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          opacity: pressed ? 0.7 : 1,
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: radius.lg,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens video in web view"
      accessibilityState={{ disabled: !onPress }}
    >
      {/* Thumbnail container with 16:9 aspect ratio */}
      <View
        style={[
          styles.thumbnailContainer,
          { borderRadius: radius.lg },
        ]}
        testID={`${testID}-thumbnail-container`}
      >
        {thumbnailUrl ? (
          <View
            accessible={true}
            accessibilityRole="image"
            accessibilityLabel={`Video thumbnail for ${title}`}
          >
            <OptimizedImage
              source={{ uri: thumbnailUrl }}
              aspectRatio={16 / 9}
              borderRadius={radius.lg}
              testID={`${testID}-thumbnail`}
              priority="normal"
            />
          </View>
        ) : (
          <View
            style={[
              styles.fallback,
              {
                backgroundColor: colors.muted,
                borderRadius: radius.lg,
              },
            ]}
            testID={`${testID}-fallback`}
            accessible={true}
            accessibilityRole="image"
            accessibilityLabel="No thumbnail available"
          >
            <Play size={48} color={colors.mutedForeground} testID={`${testID}-fallback-icon`} />
          </View>
        )}

        {/* Duration badge */}
        {duration && (
          <View
            style={[
              styles.durationBadge,
              {
                backgroundColor: colors.overlay,
                opacity: 0.85,
                padding: spacing.xs,
                borderRadius: radius.sm,
              },
            ]}
            testID={`${testID}-duration`}
          >
            <Text
              style={{ color: colors.primary }}
              className="text-xs font-semibold"
            >
              {duration}
            </Text>
          </View>
        )}

        {/* Play icon overlay */}
        {thumbnailUrl && (
          <View style={styles.playIcon} testID={`${testID}-play-icon`}>
            <Play size={40} color={colors.primary} />
          </View>
        )}
      </View>

      {/* Metadata section */}
      <View style={[styles.metadata, { padding: spacing.md, gap: spacing.xs }]}>
        {/* Title */}
        <Text
          style={{ color: colors.foreground }}
          className="text-base font-semibold leading-snug"
          numberOfLines={2}
          testID={`${testID}-title`}
        >
          {title}
        </Text>

        {/* Summary */}
        <SummaryText
          summary={summary}
          title={title}
          testID={`${testID}-summary`}
        />

        {/* Source and published date */}
        <View style={[styles.metaRow, { gap: spacing.sm }]}>
          <View style={[styles.metaLeft, { gap: spacing.sm }]}>
            {source && (
              <Text
                style={{ color: colors.mutedForeground }}
                className="text-sm"
                testID={`${testID}-source`}
              >
                {source}
              </Text>
            )}
            {publishedAt && (
              <>
                <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
                <Text
                  style={{ color: colors.mutedForeground }}
                  className="text-sm"
                  testID={`${testID}-published-at`}
                >
                  {publishedAt}
                </Text>
              </>
            )}
          </View>

          {/* Feedback buttons */}
          {feedItemId && (
            <FeedbackButtons
              findingId={feedItemId}
              currentFeedback={
                currentFeedback === 'up' ? 'positive' :
                currentFeedback === 'down' ? 'negative' :
                null
              }
              onFeedback={handleFeedback}
              testID={`${testID}-feedback`}
            />
          )}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    width: '100%',
    overflow: 'hidden',
  },
  thumbnailContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  playIcon: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -20, // Half of icon size (40)
    marginLeft: -20, // Half of icon size (40)
  },
  metadata: {
    width: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
})
