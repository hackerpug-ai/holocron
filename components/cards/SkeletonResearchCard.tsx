import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ActivityIndicator, type ViewProps } from 'react-native'
import { View } from 'react-native'

interface SkeletonResearchCardProps extends ViewProps {
  /** Optional custom loading message */
  loadingMessage?: string
  /** Number of skeleton lines to display (default: 3) */
  lines?: number
  /** Optional class name for custom styling */
  className?: string
}

/**
 * SkeletonResearchCard displays a loading placeholder for research cards.
 * Shows ActivityIndicator, loading text, and animated skeleton lines
 * to provide visual feedback during data fetching.
 */
export function SkeletonResearchCard({
  loadingMessage = 'Loading research...',
  lines = 3,
  className,
  ...props
}: SkeletonResearchCardProps) {
  return (
    <Card
      className={cn('border-border/50', className)}
      testID="skeleton-research-card"
      {...props}
    >
      <CardHeader className="pb-3">
        {/* Header with loading indicator and message */}
        <View className="flex-row items-center gap-3">
          <ActivityIndicator
            testID="skeleton-research-card-activity-indicator"
            size="small"
          />
          <Text className="text-muted-foreground text-sm">{loadingMessage}</Text>
        </View>
      </CardHeader>

      <CardContent className="gap-3 pt-0">
        {/* Skeleton lines to simulate content */}
        {Array.from({ length: lines }).map((_, index) => (
          <View
            key={index}
            testID={`skeleton-research-card-line-${index}`}
            className={cn(
              'bg-muted/50 rounded-md animate-pulse',
              // Varying widths for more realistic skeleton effect
              index === 0 ? 'h-4 w-3/4' : index === lines - 1 ? 'h-4 w-1/2' : 'h-4 w-full'
            )}
          />
        ))}
      </CardContent>
    </Card>
  )
}
