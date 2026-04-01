/**
 * VideoCard - Card component for video content with thumbnail, duration, and metadata
 *
 * Displays:
 * - 16:9 thumbnail image with play icon overlay
 * - Duration badge in bottom-right corner
 * - Title (truncated to 2 lines)
 * - Source information
 *
 * Handles missing thumbnails with fallback UI.
 */

import { View, Pressable, StyleSheet, Image } from 'react-native'
import { Text } from '@/components/ui/text'
import { Play } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import { SummaryText } from './SummaryText'

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
}: VideoCardProps) {
  const { colors, spacing, radius } = useTheme()

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
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.thumbnail}
            resizeMode="cover"
            testID={`${testID}-thumbnail`}
          />
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
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
})
