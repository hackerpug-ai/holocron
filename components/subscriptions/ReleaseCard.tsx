/**
 * ReleaseCard - Card component for software releases with version badge, summary, and changelog link
 *
 * Displays:
 * - Prominent version badge (pill-shaped)
 * - Repository/source name
 * - Release title (truncated to 2 lines)
 * - Optional summary (truncated to 3 lines)
 * - Optional published date
 * - Optional changelog button
 * - Feedback buttons (when feedItemId provided)
 *
 * Falls back to source name when repositoryName is not provided.
 */

import { View, Pressable, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { SummaryText } from './SummaryText'
import { FeedbackButtons } from './FeedbackButtons'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

export interface ReleaseCardProps {
  /** Version string (e.g., "v2.1.0", "1.0.0-beta") */
  version: string
  /** Release title */
  title: string
  /** Optional summary/description (truncated to 3 lines) */
  summary?: string
  /** Repository name (e.g., "facebook/react") */
  repositoryName?: string
  /** Source name (fallback when repositoryName is not provided) */
  source: string
  /** Optional published timestamp (relative time display) */
  publishedAt?: string
  /** Optional changelog URL */
  changelogUrl?: string
  /** Callback when card is pressed */
  onPress?: () => void
  /** Test ID for testing */
  testID?: string
  /** Feed item ID for feedback functionality */
  feedItemId?: Id<'feedItems'>
}

/**
 * ReleaseCard component
 *
 * @example
 * ```tsx
 * <ReleaseCard
 *   version="v2.1.0"
 *   title="New performance improvements"
 *   summary="This release includes significant performance improvements and bug fixes."
 *   repositoryName="facebook/react"
 *   source="GitHub"
 *   publishedAt="2 days ago"
 *   changelogUrl="https://github.com/facebook/react/releases/tag/v2.1.0"
 *   onPress={() => navigateToRelease()}
 *   testID="release-card-1"
 * />
 * ```
 */
export function ReleaseCard({
  version,
  title,
  summary,
  repositoryName,
  source,
  publishedAt,
  changelogUrl,
  onPress,
  testID = 'release-card',
  feedItemId,
}: ReleaseCardProps) {
  const { colors, spacing, radius } = useTheme()

  // Use repositoryName if provided, otherwise fall back to source
  const displayName = repositoryName || source

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
          borderRadius: radius.xl,
        },
      ]}
    >
      {/* Header with version badge and source info */}
      <View
        style={[styles.header, { padding: spacing.md, gap: spacing.sm }]}
        testID={`${testID}-header`}
      >
        {/* Version badge */}
        <View
          style={[
            styles.versionBadge,
            {
              backgroundColor: colors.primary,
              borderRadius: radius.full,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
            },
          ]}
          testID={`${testID}-version-badge`}
        >
          <Text
            style={{ color: colors.primaryForeground }}
            className="text-xs font-semibold"
          >
            {version}
          </Text>
        </View>

        {/* Source info */}
        <View style={[styles.sourceInfo, { gap: spacing.sm }]}>
          <Text
            style={{ color: colors.mutedForeground }}
            className="text-sm"
            numberOfLines={1}
            testID={`${testID}-source`}
          >
            {displayName}
          </Text>
          {publishedAt && (
            <Text
              style={{ color: colors.mutedForeground }}
              className="text-sm"
              testID={`${testID}-published-at`}
            >
              • {publishedAt}
            </Text>
          )}
        </View>
      </View>

      {/* Content section */}
      <View
        style={[styles.content, { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.xs }]}
        testID={`${testID}-content`}
      >
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

        {/* Changelog button and feedback */}
        <View style={[styles.footerRow, { marginTop: spacing.xs }]}>
          {changelogUrl && (
            <Button
              testID={`${testID}-changelog-btn`}
              variant="ghost"
              size="sm"
              onPress={onPress}
              className="px-2 py-1"
            >
              <Text className="text-sm text-primary">View changelog</Text>
            </Button>
          )}

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  versionBadge: {
    alignSelf: 'flex-start',
  },
  sourceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    width: '100%',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
