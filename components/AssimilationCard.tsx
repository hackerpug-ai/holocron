import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ChevronRight, GitFork, Star, Zap } from '@/components/ui/icons'
import { Pressable, View, type ViewProps } from 'react-native'
import type { Id } from '@/convex/_generated/dataModel'

export interface AssimilationMetadata {
  repositoryName: string
  repositoryUrl: string
  primaryLanguage?: string
  stars?: number
  sophisticationRating: number
  trackRatings: {
    architecture: number
    patterns: number
    documentation: number
    dependencies: number
    testing: number
  }
}

interface AssimilationCardProps extends Omit<ViewProps, 'children'> {
  /** Document ID in Convex */
  documentId: Id<'documents'>
  /** Assimilation metadata */
  metadata: AssimilationMetadata
  /** Brief description or snippet */
  snippet?: string
  /** Date of assimilation */
  date?: string
  /** Callback when card is pressed */
  onPress?: () => void
}

/**
 * Get color class for sophistication rating
 */
function getRatingColor(rating: number): string {
  if (rating >= 5) return 'text-success'
  if (rating >= 4) return 'text-info'
  if (rating >= 3) return 'text-warning'
  return 'text-destructive'
}

/**
 * Get sophistication level label
 */
function getSophisticationLabel(rating: number): string {
  if (rating === 5) return 'ELITE'
  if (rating === 4) return 'ADVANCED'
  if (rating === 3) return 'COMPETENT'
  if (rating === 2) return 'DEVELOPING'
  return 'PRIMITIVE'
}

/**
 * AssimilationCard displays Borg-themed assimilation results embedded in the chat stream.
 * Shows repository information, sophistication ratings, and track scores with Borg styling.
 */
export function AssimilationCard({
  documentId,
  metadata,
  snippet,
  date,
  onPress,
  className,
  ...props
}: AssimilationCardProps) {
  const {
    repositoryName,
    repositoryUrl,
    primaryLanguage,
    stars,
    sophisticationRating,
    trackRatings,
  } = metadata

  const ratingColor = getRatingColor(sophisticationRating)
  const sophisticationLabel = getSophisticationLabel(sophisticationRating)

  const content = (
    <Card className={cn('py-4 border-primary/20', className)} testID="assimilation-card" {...props}>
      <CardHeader className="flex-row items-start justify-between pb-2">
        <View className="flex-1 gap-2">
          {/* Borg header */}
          <View className="flex-row items-center gap-2">
            <Zap size={16} className="text-primary" />
            <Text className="text-primary text-xs font-bold uppercase tracking-wider">
              Borg Analysis
            </Text>
          </View>

          {/* Repository name */}
          <View className="flex-row items-center gap-2">
            <GitFork size={14} className="text-muted-foreground" />
            <Text className="text-foreground text-base font-semibold" numberOfLines={1}>
              {repositoryName}
            </Text>
          </View>
        </View>

        {onPress && (
          <ChevronRight size={20} className="text-muted-foreground" />
        )}
      </CardHeader>

      {/* Metadata section */}
      <CardContent className="flex-row items-center gap-4 pt-0 pb-2 flex-wrap">
        {primaryLanguage && (
          <View className="flex-row items-center gap-1">
            <Text className="text-muted-foreground text-xs">Language:</Text>
            <Text className="text-foreground text-xs font-semibold">{primaryLanguage}</Text>
          </View>
        )}

        {stars !== undefined && stars > 0 && (
          <View className="flex-row items-center gap-1">
            <Star size={12} className="text-star-rating" />
            <Text className="text-foreground text-xs font-semibold">{stars.toLocaleString()}</Text>
          </View>
        )}

        {/* Overall sophistication */}
        <View className="flex-row items-center gap-1">
          <Text className="text-muted-foreground text-xs">Rating:</Text>
          <Text className={cn('text-xs font-bold', ratingColor)}>
            {sophisticationRating}/5 ({sophisticationLabel})
          </Text>
        </View>
      </CardContent>

      {/* Track ratings */}
      <CardContent className="pt-0 pb-2">
        <Text className="text-muted-foreground text-xs mb-1 uppercase tracking-wide">
          Track Analysis
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          {Object.entries(trackRatings).map(([track, rating]) => {
            const trackColor = getRatingColor(rating as number)
            return (
              <View key={track} className="flex-row items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                <Text className="text-muted-foreground text-xs capitalize">{track}:</Text>
                <Text className={cn('text-xs font-bold', trackColor)}>{rating}/5</Text>
              </View>
            )
          })}
        </View>
      </CardContent>

      {/* Snippet if provided */}
      {snippet && (
        <CardContent className="pt-0 pb-2">
          <Text className="text-muted-foreground text-sm" numberOfLines={3}>
            {snippet}
          </Text>
        </CardContent>
      )}

      {/* Borg footer */}
      {date && (
        <CardContent className="pt-0">
          <Text className="text-muted-foreground text-xs italic">
            Assimilated: {date}
          </Text>
        </CardContent>
      )}
    </Card>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className="active:opacity-80"
        testID="assimilation-card-pressable"
      >
        {content}
      </Pressable>
    )
  }

  return content
}
