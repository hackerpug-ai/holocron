/**
 * FeedItemSkeleton - Loading placeholder for subscription feed items
 *
 * Mirrors the three card variants in SubscriptionFeedItem:
 * - social: avatar circle + author info + content lines + engagement row
 * - video:  16:9 thumbnail rectangle + title lines + metadata row
 * - blog:   title lines + excerpt lines + metadata row
 *
 * Uses the Skeleton primitive (bg-accent animate-pulse) so shimmer
 * behaviour is inherited automatically.
 */
import { View, StyleSheet } from 'react-native'
import { Skeleton } from '@/components/ui/skeleton'
import { useTheme } from '@/hooks/use-theme'

// ============================================================================
// VARIANT: SOCIAL
// ============================================================================

function SocialSkeleton({ testID }: { testID?: string }) {
  const { spacing, radius } = useTheme()

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.md,
        },
      ]}
      testID={testID}
    >
      {/* Author row: avatar + name/handle block */}
      <View style={[styles.row, { gap: spacing.sm }]}>
        {/* Avatar circle */}
        <Skeleton className="h-10 w-10 rounded-full" />

        {/* Name + handle stacked */}
        <View style={[styles.authorStack, { gap: spacing.xs }]}>
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </View>
      </View>

      {/* Content lines */}
      <View style={[styles.stack, { gap: spacing.xs }]}>
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-3/4 rounded" />
      </View>

      {/* Engagement row: likes + comments + shares */}
      <View style={[styles.row, { gap: spacing.md }]}>
        <Skeleton className="h-3 w-10 rounded" />
        <Skeleton className="h-3 w-10 rounded" />
        <Skeleton className="h-3 w-10 rounded" />
      </View>
    </View>
  )
}

// ============================================================================
// VARIANT: VIDEO
// ============================================================================

function VideoSkeleton({ testID }: { testID?: string }) {
  const { spacing, radius } = useTheme()

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.md,
        },
      ]}
      testID={testID}
    >
      {/* 16:9 thumbnail */}
      <Skeleton
        style={[styles.thumbnail, { borderRadius: radius.md }]}
      />

      {/* Title lines */}
      <View style={[styles.stack, { gap: spacing.xs }]}>
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-4/5 rounded" />
      </View>

      {/* Metadata row: creator + views + date */}
      <View style={[styles.row, { gap: spacing.md }]}>
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-3 w-14 rounded" />
      </View>
    </View>
  )
}

// ============================================================================
// VARIANT: BLOG
// ============================================================================

function BlogSkeleton({ testID }: { testID?: string }) {
  const { spacing, radius } = useTheme()

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.md,
        },
      ]}
      testID={testID}
    >
      {/* Title lines */}
      <View style={[styles.stack, { gap: spacing.xs }]}>
        <Skeleton className="h-5 w-full rounded" />
        <Skeleton className="h-5 w-4/5 rounded" />
      </View>

      {/* Excerpt lines */}
      <View style={[styles.stack, { gap: spacing.xs }]}>
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-2/3 rounded" />
      </View>

      {/* Metadata row: author + read-time + date */}
      <View style={[styles.row, { gap: spacing.md }]}>
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-3 w-14 rounded" />
      </View>
    </View>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export interface FeedItemSkeletonProps {
  /** Content-type variant to mimic. Defaults to 'blog'. */
  variant?: 'social' | 'video' | 'blog'
  /** Optional testID for the root element */
  testID?: string
}

/**
 * FeedItemSkeleton renders an animated loading placeholder that mirrors the
 * layout of the corresponding SubscriptionFeedItem card variant.
 *
 * @example
 * ```tsx
 * // Show two placeholder cards while loading more items
 * <>
 *   <FeedItemSkeleton variant="video" testID="feed-skeleton-0" />
 *   <FeedItemSkeleton variant="blog"  testID="feed-skeleton-1" />
 * </>
 * ```
 */
export function FeedItemSkeleton({ variant = 'blog', testID = 'feed-item-skeleton' }: FeedItemSkeletonProps) {
  if (variant === 'social') {
    return <SocialSkeleton testID={testID} />
  }

  if (variant === 'video') {
    return <VideoSkeleton testID={testID} />
  }

  return <BlogSkeleton testID={testID} />
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stack: {
    flexDirection: 'column',
  },
  authorStack: {
    flex: 1,
    flexDirection: 'column',
  },
  /** Aspect-ratio 16:9 thumbnail placeholder */
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
})
