import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react-native'
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
    1: 'bg-red-100 text-red-700',
    2: 'bg-orange-100 text-orange-700',
    3: 'bg-yellow-100 text-yellow-700',
    4: 'bg-green-100 text-green-700',
    5: 'bg-emerald-100 text-emerald-700',
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
              <CheckCircle2 size={18} className="text-green-600" />
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
