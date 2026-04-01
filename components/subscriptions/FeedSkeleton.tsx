/**
 * FeedSkeleton - Loading placeholder for the subscription feed
 *
 * Displays multiple skeleton cards to simulate the feed layout while
 * the initial data is loading. Provides visual feedback and improves
 * perceived performance.
 *
 * Features:
 * - Configurable number of skeleton cards
 * - Matches WhatsNewFindingCard layout
 * - Smooth shimmer animation
 * - Accessible testIDs
 */

import { View } from 'react-native'
import { Skeleton } from '@/components/ui/skeleton'
import { useTheme } from '@/hooks/use-theme'

export interface FeedSkeletonProps {
  /** Number of skeleton cards to display */
  count?: number
  /** Optional test ID prefix */
  testID?: string
}

/**
 * Individual finding skeleton card
 */
function FindingSkeleton({ index, testID }: { index: number; testID?: string }) {
  const { spacing, radius } = useTheme()

  return (
    <View
      className="border-border bg-card mb-3 overflow-hidden"
      style={{
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
      testID={`${testID}-${index}`}
    >
      {/* Top row: category pill + time */}
      <View className="flex-row items-center justify-between">
        <Skeleton className="h-6 w-20 rounded-full" />
        <View className="flex-row items-center gap-2">
          <Skeleton className="h-4 w-8 rounded-full" />
          <Skeleton className="h-4 w-12 rounded" />
        </View>
      </View>

      {/* Title lines */}
      <View className="gap-1">
        <Skeleton className="h-5 w-full rounded" />
        <Skeleton className="h-5 w-4/5 rounded" />
      </View>

      {/* Summary lines */}
      <View className="gap-1">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-2/3 rounded" />
      </View>

      {/* Bottom row: source + author */}
      <View className="flex-row items-center gap-2">
        <Skeleton className="h-5 w-16 rounded" />
        <Skeleton className="h-4 w-24 rounded" />
        <View className="flex-1" />
        <Skeleton className="h-4 w-4 rounded" />
      </View>
    </View>
  )
}

/**
 * FeedSkeleton component
 *
 * @example
 * ```tsx
 * <FeedSkeleton count={5} testID="feed-skeleton" />
 * ```
 */
export function FeedSkeleton({
  count = 5,
  testID = 'feed-skeleton',
}: FeedSkeletonProps) {
  const { spacing } = useTheme()

  return (
    <View
      className="px-4 pt-4"
      style={{ paddingBottom: spacing.md }}
      testID={testID}
    >
      {Array.from({ length: count }).map((_, index) => (
        <FindingSkeleton key={index} index={index} testID={testID} />
      ))}
    </View>
  )
}
