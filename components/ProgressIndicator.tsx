import { Progress } from '@/components/ui/progress'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Clock, Globe, Loader2 } from '@/components/ui/icons'
import { View, type ViewProps } from 'react-native'

type ResearchPhase = 'searching' | 'analyzing' | 'synthesizing' | 'complete'

interface ProgressIndicatorProps extends Omit<ViewProps, 'children'> {
  /** Current research phase */
  phase: ResearchPhase
  /** Progress percentage (0-100) */
  progress?: number
  /** Elapsed time in seconds */
  elapsedTime?: number
  /** List of sources being consulted */
  sources?: string[]
  /** Whether research is active */
  isActive?: boolean
  /** Optional status message */
  statusMessage?: string
}

const phaseLabels: Record<ResearchPhase, string> = {
  searching: 'Searching...',
  analyzing: 'Analyzing...',
  synthesizing: 'Synthesizing...',
  complete: 'Complete',
}

const phaseProgress: Record<ResearchPhase, number> = {
  searching: 25,
  analyzing: 50,
  synthesizing: 75,
  complete: 100,
}

function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

/**
 * ProgressIndicator shows real-time progress of research operations.
 * Displays current phase, progress bar, elapsed time, and sources.
 */
export function ProgressIndicator({
  phase,
  progress,
  elapsedTime,
  sources = [],
  isActive = true,
  statusMessage,
  className,
  ...props
}: ProgressIndicatorProps) {
  const displayProgress = progress ?? phaseProgress[phase]
  const isComplete = phase === 'complete'

  return (
    <View
      className={cn('rounded-lg border border-border bg-card p-4', className)}
      testID="progress-indicator"
      {...props}
    >
      {/* Header */}
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {isActive && !isComplete && (
            <Loader2 size={16} className="text-primary animate-spin" />
          )}
          <Text className="text-foreground font-semibold">{phaseLabels[phase]}</Text>
        </View>
        {elapsedTime !== undefined && (
          <View className="flex-row items-center gap-1">
            <Clock size={14} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm">
              {formatElapsedTime(elapsedTime)}
            </Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <Progress value={displayProgress} className="mb-3" />

      {/* Status message */}
      {statusMessage && (
        <Text className="text-muted-foreground mb-3 text-sm">{statusMessage}</Text>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <View>
          <View className="mb-2 flex-row items-center gap-1">
            <Globe size={12} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-xs uppercase tracking-wide">
              Sources ({sources.length})
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-1">
            {sources.slice(0, 5).map((source, index) => (
              <View
                key={index}
                className="rounded bg-muted px-2 py-0.5"
              >
                <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                  {source}
                </Text>
              </View>
            ))}
            {sources.length > 5 && (
              <View className="rounded bg-muted px-2 py-0.5">
                <Text className="text-muted-foreground text-xs">
                  +{sources.length - 5} more
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  )
}
