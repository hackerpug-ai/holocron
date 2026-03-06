import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import { TrendingUp, DollarSign, Zap } from 'lucide-react-native'
import { View, StyleSheet } from 'react-native'
import type { DeepResearchIteration } from '@/lib/types/deep-research'

/**
 * Extended iteration data with cost information
 */
export interface IterationTimelineData extends Pick<DeepResearchIteration, 'iterationNumber' | 'coverageScore' | 'status'> {
  /** Cost in cents for this iteration */
  costCents?: number
  /** Model used for this iteration */
  modelType?: 'gpt-5' | 'gpt-5-mini'
  /** Timestamp when iteration started */
  startedAt?: Date
  /** Timestamp when iteration completed */
  completedAt?: Date
}

export interface IterationTimelineProps {
  /** Array of iterations to display */
  iterations: IterationTimelineData[]
  /** Optional total cost in cents */
  totalCostCents?: number
  /** Optional test ID */
  testID?: string
  /** Optional class name */
  className?: string
}

/**
 * Get color for coverage score
 */
function getScoreColor(score: number | null, isDark: boolean): string {
  if (score === null) return isDark ? '#64748B' : '#94A3B8'

  const colors = {
    1: isDark ? '#DC2626' : '#EF4444',
    2: isDark ? '#EA580C' : '#F97316',
    3: isDark ? '#EAB308' : '#FACC15',
    4: isDark ? '#16A34A' : '#22C55E',
    5: isDark ? '#059669' : '#10B981',
  }
  return colors[score as keyof typeof colors] || (isDark ? '#64748B' : '#94A3B8')
}

/**
 * Get label for coverage score
 */
function getScoreLabel(score: number | null): string {
  if (score === null) return 'Pending'

  const labels = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent',
  }
  return labels[score as keyof typeof labels] || 'N/A'
}

/**
 * Format cost in dollars
 */
function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(3)}`
}

/**
 * ScoreProgressionBar displays a horizontal bar chart of score progression
 */
function ScoreProgressionBar({ iterations, isDark }: { iterations: IterationTimelineData[], isDark: boolean }) {
  const theme = useTheme()
  const maxScore = 5

  return (
    <View style={styles.progressionContainer}>
      <View style={styles.progressionHeader}>
        <Text
          style={[
            styles.sectionLabel,
            { color: theme.colors.mutedForeground }
          ]}
        >
          Coverage Progression
        </Text>
        <View style={styles.scoreRange}>
          <Text style={[styles.rangeLabel, { color: theme.colors.mutedForeground }]}>
            1
          </Text>
          <Text style={[styles.rangeLabel, { color: theme.colors.mutedForeground }]}>
            5
          </Text>
        </View>
      </View>

      <View style={styles.barContainer}>
        {iterations.map((iteration, index) => {
          const score = iteration.coverageScore ?? 0
          const heightPercent = (score / maxScore) * 100
          const color = getScoreColor(score, isDark)
          const isActive = iteration.status === 'running'
          const isPending = iteration.status === 'pending'

          return (
            <View key={iteration.iterationNumber} style={styles.barWrapper}>
              <View style={styles.barColumn}>
                <View style={[styles.barTrack, { backgroundColor: theme.colors.muted }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${heightPercent}%`,
                        backgroundColor: color,
                        opacity: isPending ? 0.3 : isActive ? 0.8 : 1,
                      }
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.iterationLabel,
                    { color: theme.colors.mutedForeground }
                  ]}
                >
                  {iteration.iterationNumber}
                </Text>
              </View>
            </View>
          )
        })}
      </View>

      <View style={styles.legendContainer}>
        {[1, 2, 3, 4, 5].map(score => (
          <View key={score} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: getScoreColor(score, isDark) }
              ]}
            />
            <Text style={[styles.legendText, { color: theme.colors.mutedForeground }]}>
              {getScoreLabel(score)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/**
 * CostComparison displays cost breakdown by iteration and model type
 */
function CostComparison({
  iterations,
  totalCostCents
}: {
  iterations: IterationTimelineData[],
  totalCostCents?: number
}) {
  const theme = useTheme()

  const gpt5Iterations = iterations.filter(i => i.modelType === 'gpt-5')
  const gpt5MiniIterations = iterations.filter(i => i.modelType === 'gpt-5-mini')

  const gpt5Cost = gpt5Iterations.reduce((sum, i) => sum + (i.costCents ?? 0), 0)
  const gpt5MiniCost = gpt5MiniIterations.reduce((sum, i) => sum + (i.costCents ?? 0), 0)

  const total = totalCostCents ?? (gpt5Cost + gpt5MiniCost)
  const gpt5Percent = total > 0 ? (gpt5Cost / total) * 100 : 0
  const gpt5MiniPercent = total > 0 ? (gpt5MiniCost / total) * 100 : 0

  return (
    <View style={styles.costContainer}>
      <View style={styles.costHeader}>
        <View style={styles.costHeaderLeft}>
          <DollarSign size={16} color={theme.colors.primary} />
          <Text style={[styles.sectionLabel, { color: theme.colors.mutedForeground }]}>
            Cost Analysis
          </Text>
        </View>
        <Text style={[styles.totalCost, { color: theme.colors.foreground }]}>
          {formatCost(total)}
        </Text>
      </View>

      <View style={styles.costBreakdown}>
        {/* GPT-5 Row */}
        <View style={styles.modelRow}>
          <View style={styles.modelInfo}>
            <View style={[styles.modelBadge, { backgroundColor: theme.colors.primary }]}>
              <Zap size={12} color={theme.colors.primaryForeground} />
            </View>
            <View style={styles.modelDetails}>
              <Text style={[styles.modelName, { color: theme.colors.foreground }]}>
                GPT-5
              </Text>
              <Text style={[styles.modelCount, { color: theme.colors.mutedForeground }]}>
                {gpt5Iterations.length} {gpt5Iterations.length === 1 ? 'iteration' : 'iterations'}
              </Text>
            </View>
          </View>
          <View style={styles.modelCost}>
            <Text style={[styles.costValue, { color: theme.colors.foreground }]}>
              {formatCost(gpt5Cost)}
            </Text>
            <Text style={[styles.costPercent, { color: theme.colors.mutedForeground }]}>
              {gpt5Percent.toFixed(0)}%
            </Text>
          </View>
        </View>

        <Progress
          value={gpt5Percent}
          className="h-1.5 mb-3"
          indicatorClassName="bg-primary"
        />

        {/* GPT-5-mini Row */}
        <View style={styles.modelRow}>
          <View style={styles.modelInfo}>
            <View style={[styles.modelBadge, { backgroundColor: theme.colors.secondary }]}>
              <Zap size={12} color={theme.colors.secondaryForeground} />
            </View>
            <View style={styles.modelDetails}>
              <Text style={[styles.modelName, { color: theme.colors.foreground }]}>
                GPT-5-mini
              </Text>
              <Text style={[styles.modelCount, { color: theme.colors.mutedForeground }]}>
                {gpt5MiniIterations.length} {gpt5MiniIterations.length === 1 ? 'iteration' : 'iterations'}
              </Text>
            </View>
          </View>
          <View style={styles.modelCost}>
            <Text style={[styles.costValue, { color: theme.colors.foreground }]}>
              {formatCost(gpt5MiniCost)}
            </Text>
            <Text style={[styles.costPercent, { color: theme.colors.mutedForeground }]}>
              {gpt5MiniPercent.toFixed(0)}%
            </Text>
          </View>
        </View>

        <Progress
          value={gpt5MiniPercent}
          className="h-1.5"
          indicatorClassName="bg-secondary"
        />
      </View>
    </View>
  )
}

/**
 * IterationTimeline displays the research journey with score progression and cost analysis.
 *
 * Shows:
 * - Visual bar chart of coverage score progression across iterations
 * - Cost breakdown by model type (GPT-5 vs GPT-5-mini)
 * - Total cost and percentage distribution
 * - Iteration status indicators
 *
 * Designed for the deep research workflow to help users understand:
 * - How research quality improved over iterations
 * - Where compute costs were allocated
 * - Which model types were used for each iteration
 */
export function IterationTimeline({
  iterations,
  totalCostCents,
  testID = 'iteration-timeline',
  className,
}: IterationTimelineProps) {
  const theme = useTheme()

  const sortedIterations = [...iterations].sort(
    (a, b) => a.iterationNumber - b.iterationNumber
  )

  const hasCostData = iterations.some(i => i.costCents !== undefined)

  return (
    <Card testID={testID} className={className}>
      <CardHeader>
        <View style={styles.header}>
          <TrendingUp size={18} color={theme.colors.primary} />
          <CardTitle>Research Timeline</CardTitle>
        </View>
      </CardHeader>

      <CardContent>
        {/* Score Progression */}
        <ScoreProgressionBar
          iterations={sortedIterations}
          isDark={theme.isDark}
        />

        {/* Cost Comparison (only show if cost data exists) */}
        {hasCostData && (
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        )}
        {hasCostData && (
          <CostComparison
            iterations={sortedIterations}
            totalCostCents={totalCostCents}
          />
        )}
      </CardContent>
    </Card>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Score Progression Styles
  progressionContainer: {
    width: '100%',
  },
  progressionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreRange: {
    flexDirection: 'row',
    gap: 8,
  },
  rangeLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  barContainer: {
    flexDirection: 'row',
    height: 120,
    gap: 8,
    marginBottom: 12,
  },
  barWrapper: {
    flex: 1,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  barTrack: {
    flex: 1,
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
  },
  iterationLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '500',
  },

  // Cost Comparison Styles
  divider: {
    height: 1,
    marginVertical: 16,
  },
  costContainer: {
    width: '100%',
  },
  costHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  costHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalCost: {
    fontSize: 18,
    fontWeight: '700',
  },
  costBreakdown: {
    gap: 8,
  },
  modelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modelBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelDetails: {
    gap: 2,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '600',
  },
  modelCount: {
    fontSize: 11,
  },
  modelCost: {
    alignItems: 'flex-end',
    gap: 2,
  },
  costValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  costPercent: {
    fontSize: 11,
  },
})
