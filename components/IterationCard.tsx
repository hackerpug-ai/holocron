import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from '@/components/ui/icons'
import { useState } from 'react'
import { Pressable, View, type ViewProps } from 'react-native'

interface IterationCardProps extends Omit<ViewProps, 'children'> {
  /** Iteration number */
  iterationNumber: number
  /** Coverage score (1-5) */
  coverageScore: number
  /** Reviewer feedback identifying gaps */
  feedback?: string
  /** Refined queries for next iteration */
  refinedQueries?: string[]
  /** Whether this iteration is currently active */
  isActive?: boolean
  /** Whether the iteration is complete */
  isComplete?: boolean
  /** Optional callback when card is pressed */
  onPress?: () => void
  /** Whether the card is initially expanded */
  defaultExpanded?: boolean
}

function ScoreBadge({ score }: { score: number }) {
  const colorClass = {
    1: 'bg-destructive/10 text-destructive',
    2: 'bg-warning/10 text-warning',
    3: 'bg-warning/10 text-warning',
    4: 'bg-success/10 text-success',
    5: 'bg-success/10 text-success',
  }[score] ?? 'bg-muted text-muted-foreground'

  return (
    <View className={cn('rounded-full px-2 py-0.5', colorClass)}>
      <Text className="text-xs font-semibold">{score}/5</Text>
    </View>
  )
}

/**
 * IterationCard displays a single deep research iteration.
 * Shows iteration number, coverage score, feedback, and refined queries.
 */
export function IterationCard({
  iterationNumber,
  coverageScore,
  feedback,
  refinedQueries = [],
  isActive = false,
  isComplete = false,
  onPress,
  defaultExpanded = false,
  className,
  ...props
}: IterationCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const hasDetails = feedback || refinedQueries.length > 0
  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

  const handlePress = () => {
    if (hasDetails) {
      setIsExpanded(!isExpanded)
    }
    onPress?.()
  }

  return (
    <Card
      className={cn(
        isActive && 'border-primary',
        className
      )}
      testID="iteration-card"
      {...props}
    >
      <Pressable onPress={handlePress} disabled={!hasDetails && !onPress}>
        <CardHeader className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            {isComplete ? (
              <CheckCircle2 size={18} className="text-success" />
            ) : isActive ? (
              <View className="h-4 w-4 animate-pulse rounded-full bg-primary" />
            ) : (
              <AlertCircle size={18} className="text-muted-foreground" />
            )}
            <Text className="text-foreground font-semibold">
              Iteration {iterationNumber}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <ScoreBadge score={coverageScore} />
            {hasDetails && (
              <ChevronIcon size={16} className="text-muted-foreground" />
            )}
          </View>
        </CardHeader>
      </Pressable>

      {isExpanded && hasDetails && (
        <CardContent className="pt-0">
          {feedback && (
            <View className="mb-3">
              <Text className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
                Reviewer Feedback
              </Text>
              <Text className="text-foreground text-sm">{feedback}</Text>
            </View>
          )}

          {refinedQueries.length > 0 && (
            <View>
              <Text className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
                Refined Queries
              </Text>
              <View className="gap-1">
                {refinedQueries.map((query, index) => (
                  <View
                    key={index}
                    className="bg-muted rounded px-2 py-1"
                  >
                    <Text className="text-foreground text-sm">{query}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </CardContent>
      )}
    </Card>
  )
}
