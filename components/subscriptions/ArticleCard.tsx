/**
 * ArticleCard - Card component for article content with hero image and metadata
 *
 * Displays:
 * - 16:9 hero image with fallback UI
 * - Title (truncated to 2 lines)
 * - Optional summary (truncated to 3 lines)
 * - Source and read time metadata
 *
 * Handles missing hero images with fallback UI showing document icon.
 */

import { View, Pressable, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/text'
import { FileText } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import { SummaryText } from './SummaryText'
import { OptimizedImage } from '@/components/ui/OptimizedImage'

export interface ArticleCardProps {
  /** URL to hero image (16:9 aspect ratio) */
  heroImageUrl?: string
  /** Article title */
  title: string
  /** Optional summary text (2-3 lines) */
  summary?: string
  /** Source name (e.g., "TechCrunch", "The Verge") */
  source: string
  /** Read time estimate (e.g., "5 min read") */
  readTime?: string
  /** Optional published timestamp */
  publishedAt?: string
  /** Callback when card is pressed */
  onPress?: () => void
  /** Test ID for testing */
  testID?: string
}

/**
 * ArticleCard component
 *
 * @example
 * ```tsx
 * <ArticleCard
 *   heroImageUrl="https://example.com/image.jpg"
 *   title="Understanding React Native"
 *   source="TechCrunch"
 *   readTime="5 min read"
 *   onPress={() => navigateToArticle()}
 *   testID="article-card-1"
 * />
 * ```
 */
export function ArticleCard({
  heroImageUrl,
  title,
  summary,
  source,
  readTime,
  publishedAt,
  onPress,
  testID = 'article-card',
}: ArticleCardProps) {
  const { colors, spacing, radius } = useTheme()

  // Build accessibility label for screen readers
  const accessibilityLabel = `Article. ${title}${summary ? `. ${summary}` : ''}${source ? `. Source: ${source}` : ''}${readTime ? `. ${readTime}` : ''}${publishedAt ? `. ${publishedAt}` : ''}. Tap to read.`

  return (
    <Pressable
      testID={`${testID}-pressable`}
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
      accessibilityHint="Opens article in web view"
      accessibilityState={{ disabled: !onPress }}
    >
      {/* Hero image container with 16:9 aspect ratio */}
      <View
        style={[
          styles.heroContainer,
          { borderRadius: radius.lg },
        ]}
        testID={`${testID}-hero-container`}
      >
        {heroImageUrl ? (
          <View
            accessible={true}
            accessibilityRole="image"
            accessibilityLabel={`Article hero image for ${title}`}
          >
            <OptimizedImage
              source={{ uri: heroImageUrl }}
              aspectRatio={16 / 9}
              borderRadius={radius.lg}
              testID={`${testID}-hero`}
              
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
            accessibilityLabel="No hero image available"
          >
            <FileText size={48} color={colors.mutedForeground} testID={`${testID}-fallback-icon`} />
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

        {/* Source, read time, and published date */}
        <View style={[styles.metaRow, { gap: spacing.sm }]}>
          <Text
            style={{ color: colors.mutedForeground }}
            className="text-sm"
            testID={`${testID}-source`}
          >
            {source}
          </Text>
          {readTime && (
            <>
              <View style={[styles.dot, { backgroundColor: colors.mutedForeground }]} />
              <Text
                style={{ color: colors.mutedForeground }}
                className="text-sm"
                testID={`${testID}-read-time`}
              >
                {readTime}
              </Text>
            </>
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
  heroContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
  },
  fallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
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
