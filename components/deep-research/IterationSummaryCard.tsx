import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/use-theme'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Zap } from '@/components/ui/icons'
import { useState } from 'react'
import { Pressable, View, type ViewProps } from 'react-native'
import type { DeepResearchIteration } from '@/lib/types/deep-research'

interface WorkerIndicatorProps {
  /** Worker index (1-based) */
  workerId: number
  /** Worker status */
  status: 'idle' | 'active' | 'complete' | 'error'
  /** Optional worker task description */
  task?: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WorkerIndicator({ workerId, status, task }: WorkerIndicatorProps) {

  const statusConfig = {
    idle: {
      bg: 'bg-muted',
      text: 'text-muted-foreground',
      icon: null,
    },
    active: {
      bg: 'bg-info/10 dark:bg-info/20',
      text: 'text-info',
      icon: <Zap size={10} className="text-info" />,
    },
    complete: {
      bg: 'bg-success/10 dark:bg-success/20',
      text: 'text-success',
      icon: <CheckCircle2 size={10} className="text-success" />,
    },
    error: {
      bg: 'bg-destructive/10 dark:bg-destructive/20',
      text: 'text-destructive',
      icon: <AlertCircle size={10} className="text-destructive" />,
    },
  }

  const config = statusConfig[status]

  return (
    <View
      className={cn(
        'flex-row items-center gap-1 rounded px-1.5 py-0.5',
        config.bg,
        status === 'active' && 'animate-pulse'
      )}
      testID={`worker-indicator-${workerId}`}
    >
      {config.icon}
      <Text className={cn('text-xs font-medium', config.text)}>
        W{workerId}
      </Text>
    </View>
  )
}

interface ParallelWorkersProps {
  /** Array of worker statuses (max 5 for GPT-5-mini) */
  workers: Array<WorkerIndicatorProps>
}

function ParallelWorkers({ workers }: ParallelWorkersProps) {
  return (
    <View className="flex-row flex-wrap gap-1" testID="parallel-workers">
      {workers.map((worker) => (
        <WorkerIndicator key={worker.workerId} {...worker} />
      ))}
    </View>
  )
}

interface CoverageVisualizationProps {
  /** Coverage score (0-100) */
  score: number | null
  /** Optional label */
  label?: string
}

function CoverageVisualization({ score, label = 'Coverage' }: CoverageVisualizationProps) {
  const displayScore = score ?? 0

  // Color coding based on coverage score
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-success'
    if (score >= 60) return 'bg-warning'
    if (score >= 40) return 'bg-warning'
    return 'bg-destructive'
  }

  return (
    <View className="gap-1.5" testID="coverage-visualization">
      <View className="flex-row items-center justify-between">
        <Text className="text-muted-foreground text-xs">{label}</Text>
        <Text className="text-foreground text-xs font-semibold">
          {score !== null ? `${displayScore}%` : 'N/A'}
        </Text>
      </View>
      <View className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <View
          className={cn('h-full rounded-full', getScoreColor(displayScore))}
          style={{ width: `${displayScore}%` }}
        />
      </View>
    </View>
  )
}

interface AgentCoordinationStatusProps {
  /** Number of active workers */
  activeWorkers: number
  /** Total workers */
  totalWorkers: number
  /** Coordination phase */
  phase: 'idle' | 'distributing' | 'working' | 'aggregating' | 'complete'
}

function AgentCoordinationStatus({
  activeWorkers,
  totalWorkers,
  phase,
}: AgentCoordinationStatusProps) {
  const phaseLabels = {
    idle: 'Waiting',
    distributing: 'Distributing queries',
    working: `${activeWorkers}/${totalWorkers} workers active`,
    aggregating: 'Aggregating results',
    complete: 'Complete',
  }

  const phaseColors = {
    idle: 'text-muted-foreground',
    distributing: 'text-info',
    working: 'text-info',
    aggregating: 'text-warning',
    complete: 'text-success',
  }

  return (
    <View className="flex-row items-center gap-2" testID="agent-coordination-status">
      <View
        className={cn(
          'h-2 w-2 rounded-full',
          phase === 'working' && 'animate-pulse bg-info',
          phase === 'distributing' && 'animate-pulse bg-info',
          phase === 'aggregating' && 'animate-pulse bg-warning',
          phase === 'complete' && 'bg-success',
          phase === 'idle' && 'bg-muted'
        )}
      />
      <Text className={cn('text-xs font-medium', phaseColors[phase])}>
        {phaseLabels[phase]}
      </Text>
    </View>
  )
}

export interface IterationSummaryCardProps extends Omit<ViewProps, 'children'> {
  /** Iteration data */
  iteration: DeepResearchIteration
  /** Worker statuses for parallel processing */
  workers?: Array<WorkerIndicatorProps>
  /** Agent coordination phase */
  coordinationPhase?: AgentCoordinationStatusProps['phase']
  /** Whether this iteration is currently active */
  isActive?: boolean
  /** Optional callback when card is pressed */
  onPress?: () => void
  /** Whether the card is initially expanded */
  defaultExpanded?: boolean
}

/**
 * IterationSummaryCard displays a comprehensive summary of a deep research iteration.
 * Shows iteration number, GPT-5-mini parallel worker indicators, research findings preview,
 * coverage score visualization, and agent coordination status.
 */
export function IterationSummaryCard({
  iteration,
  workers = [],
  coordinationPhase = 'idle',
  isActive = false,
  onPress,
  defaultExpanded = false,
  className,
  ...props
}: IterationSummaryCardProps) {
  const { colors } = useTheme()
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const hasDetails = iteration.findings || iteration.feedback || iteration.refinedQueries?.length
  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight
  const isComplete = iteration.status === 'completed'

  const handlePress = () => {
    if (hasDetails) {
      setIsExpanded(!isExpanded)
    }
    onPress?.()
  }

  // Calculate worker stats
  const activeWorkers = workers.filter((w) => w.status === 'active').length
  const totalWorkers = workers.length

  // Truncate findings for preview (first 150 chars)
  const findingsPreview = iteration.findings
    ? iteration.findings.length > 150
      ? `${iteration.findings.slice(0, 150)}...`
      : iteration.findings
    : null

  return (
    <Card
      className={cn(
        'transition-all',
        isActive && 'border-primary shadow-md',
        className
      )}
      testID="iteration-summary-card"
      {...props}
    >
      <Pressable onPress={handlePress} disabled={!hasDetails && !onPress}>
        <CardHeader className="gap-3">
          {/* Header Row: Iteration Number + Status */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              {isComplete ? (
                <CheckCircle2 size={20} className="text-success" />
              ) : isActive ? (
                <View
                  className="h-5 w-5 animate-pulse rounded-full"
                  style={{ backgroundColor: colors.primary }}
                />
              ) : (
                <AlertCircle size={20} className="text-muted-foreground" />
              )}
              <View>
                <Text className="text-foreground text-base font-semibold">
                  Iteration {iteration.iterationNumber}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {isComplete
                    ? 'Completed'
                    : isActive
                    ? 'In Progress'
                    : 'Pending'}
                </Text>
              </View>
            </View>
            {hasDetails && (
              <ChevronIcon size={18} className="text-muted-foreground" />
            )}
          </View>

          {/* Parallel Workers Row */}
          {workers.length > 0 && (
            <View className="gap-2">
              <Text className="text-muted-foreground text-xs font-medium">
                GPT-5-mini Workers
              </Text>
              <ParallelWorkers workers={workers} />
            </View>
          )}

          {/* Coverage Score */}
          {iteration.coverageScore !== null && (
            <CoverageVisualization score={iteration.coverageScore} />
          )}

          {/* Agent Coordination Status */}
          {workers.length > 0 && (
            <AgentCoordinationStatus
              activeWorkers={activeWorkers}
              totalWorkers={totalWorkers}
              phase={coordinationPhase}
            />
          )}

          {/* Findings Preview */}
          {findingsPreview && !isExpanded && (
            <View className="bg-muted rounded-md p-3">
              <Text className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
                Findings Preview
              </Text>
              <Text className="text-foreground text-sm leading-relaxed">
                {findingsPreview}
              </Text>
            </View>
          )}
        </CardHeader>
      </Pressable>

      {/* Expanded Content */}
      {isExpanded && hasDetails && (
        <CardContent className="gap-4 pt-0">
          {/* Full Findings */}
          {iteration.findings && (
            <View>
              <Text className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
                Research Findings
              </Text>
              <Text className="text-foreground text-sm leading-relaxed">
                {iteration.findings}
              </Text>
            </View>
          )}

          {/* Reviewer Feedback */}
          {iteration.feedback && (
            <View>
              <Text className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
                Reviewer Feedback
              </Text>
              <View className="bg-muted rounded-md p-3">
                <Text className="text-foreground text-sm leading-relaxed">
                  {iteration.feedback}
                </Text>
              </View>
            </View>
          )}

          {/* Refined Queries */}
          {iteration.refinedQueries && iteration.refinedQueries.length > 0 && (
            <View>
              <Text className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
                Refined Queries ({iteration.refinedQueries.length})
              </Text>
              <View className="gap-2">
                {iteration.refinedQueries.map((query, index) => (
                  <View
                    key={index}
                    className="bg-muted flex-row items-start gap-2 rounded-md p-2"
                  >
                    <Text className="text-primary text-xs font-semibold">
                      {index + 1}.
                    </Text>
                    <Text className="text-foreground flex-1 text-sm">
                      {query}
                    </Text>
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
