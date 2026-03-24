import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { AlertTriangle, Clock, Hash, Sparkles } from '@/components/ui/icons'
import type { ViewProps } from 'react-native'
import { View } from 'react-native'

export interface DeepResearchConfirmationCardProps extends Omit<ViewProps, 'children'> {
  /** Research topic or query */
  topic: string
  /** Maximum number of research iterations (default: 5) */
  maxIterations?: number
  /** Estimated duration in minutes (calculated from iterations) */
  estimatedMinutes?: number
  /** Unique session identifier */
  sessionId: string
  /** Optional custom warning message */
  warningMessage?: string
  /** Optional class name for custom styling */
  className?: string
}

/**
 * Calculates estimated duration based on iteration count
 * Default: 2 minutes per iteration
 */
function calculateEstimatedDuration(iterations: number): number {
  return iterations * 2
}

/**
 * DeepResearchConfirmationCard displays a confirmation prompt
 * when user initiates deep research via /deep-research command.
 * Shows topic, iteration count, estimated time, session ID,
 * and warning about processing time.
 */
export function DeepResearchConfirmationCard({
  topic,
  maxIterations = 5,
  estimatedMinutes,
  sessionId,
  warningMessage = 'This research will take longer than standard searches. You can safely navigate away and return later.',
  className,
  ...props
}: DeepResearchConfirmationCardProps) {
  const duration = estimatedMinutes ?? calculateEstimatedDuration(maxIterations)

  return (
    <Card
      className={cn('border-primary/50', className)}
      testID="deep-research-confirmation-card"
      {...props}
    >
      <CardHeader className="pb-3">
        <View className="flex-row items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <Text className="text-foreground flex-1 font-semibold" numberOfLines={2}>
            Deep Research Confirmation
          </Text>
        </View>
      </CardHeader>

      <CardContent className="gap-4 pt-0">
        {/* Topic */}
        <View>
          <Text className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
            Research Topic
          </Text>
          <Text className="text-foreground text-base" numberOfLines={2}>
            {topic}
          </Text>
        </View>

        {/* Iterations and Duration */}
        <View className="flex-row items-center gap-4">
          <View className="flex-1">
            <Text className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
              Max Iterations
            </Text>
            <Text className="text-foreground text-lg font-semibold">{maxIterations}</Text>
          </View>

          <View className="flex-1">
            <Text className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
              Est. Duration
            </Text>
            <View className="flex-row items-center gap-1">
              <Clock size={14} className="text-muted-foreground" />
              <Text className="text-foreground text-lg font-semibold">{duration} min</Text>
            </View>
          </View>
        </View>

        {/* Session ID */}
        <View className="bg-muted/50 rounded-md px-3 py-2">
          <View className="flex-row items-center gap-2">
            <Hash size={14} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-xs uppercase tracking-wide">
              Session ID
            </Text>
          </View>
          <Text
            className="text-foreground mt-1 font-mono text-sm"
            testID="deep-research-session-id"
          >
            {sessionId}
          </Text>
        </View>

        {/* Warning */}
        <View className="bg-warning/10 dark:bg-warning/15 border-warning/30 dark:border-warning/20 rounded-md border px-3 py-2">
          <View className="flex-row gap-2">
            <AlertTriangle size={16} className="text-warning mt-0.5" />
            <View className="flex-1">
              <Text className="text-warning mb-1 text-xs font-semibold uppercase tracking-wide">
                Processing Time Notice
              </Text>
              <Text className="text-foreground text-sm">{warningMessage}</Text>
            </View>
          </View>
        </View>
      </CardContent>
    </Card>
  )
}
