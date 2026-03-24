/**
 * AssimilationPlanCard
 *
 * Displays an assimilation coverage plan for user approval.
 * Follows the ToolApprovalCard pattern: header + status + content + actions.
 */

import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  GitFork,
  X,
  XCircle,
} from '@/components/ui/icons'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssimilationPlanCardProps {
  sessionId: string
  repositoryName: string
  repositoryUrl: string
  profile: string
  planSummary: string
  status: 'pending_approval' | 'approved' | 'rejected' | 'in_progress' | 'completed'
  dimensionScores?: Record<string, number>
  currentIteration?: number
  maxIterations?: number
  onApprove?: () => void
  onReject?: (feedback?: string) => void
  onViewPlan?: () => void
}

// ── Dimensions ────────────────────────────────────────────────────────────────

const DIMENSIONS = [
  { key: 'architecture', label: 'Architecture' },
  { key: 'patterns', label: 'Patterns' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'testing', label: 'Testing' },
] as const

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  AssimilationPlanCardProps['status'],
  { label: string; className: string }
> = {
  pending_approval: {
    label: 'Awaiting Approval',
    className: 'bg-warning/15 text-warning',
  },
  approved: {
    label: 'Approved',
    className: 'bg-info/15 text-info',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-info/15 text-info',
  },
  completed: {
    label: 'Completed',
    className: 'bg-success/15 text-success',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-destructive/15 text-destructive',
  },
}

function StatusBadge({ status }: { status: AssimilationPlanCardProps['status'] }) {
  const config = STATUS_BADGE[status]
  return (
    <View className={cn('rounded-full px-2 py-0.5', config.className)}>
      <Text className={cn('text-xs font-semibold', config.className)}>
        {config.label}
      </Text>
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * AssimilationPlanCard shows the planned assimilation coverage for user
 * approval before starting a repository analysis session. Displays plan
 * summary, the five coverage dimensions, and approve/reject actions.
 */
export function AssimilationPlanCard({
  repositoryName,
  planSummary,
  status,
  dimensionScores,
  onApprove,
  onReject,
  onViewPlan,
}: AssimilationPlanCardProps) {
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')

  const isPending = status === 'pending_approval'
  const isRejected = status === 'rejected'
  const isCompleted = status === 'completed'

  const handleRejectPress = () => {
    if (showFeedback) {
      onReject?.(feedbackText.trim() || undefined)
      setShowFeedback(false)
      setFeedbackText('')
    } else {
      setShowFeedback(true)
    }
  }

  return (
    <Card
      className={cn(
        'border',
        isPending ? 'border-primary/50' : 'border-border'
      )}
      testID="assimilation-plan-card"
    >
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <View className="flex-row items-center gap-2">
          <GitFork size={16} className="text-muted-foreground shrink-0" />
          <View className="flex-1">
            <Text className="text-muted-foreground text-xs">
              Assimilation Plan
            </Text>
            <Text className="text-foreground font-semibold" numberOfLines={1}>
              {repositoryName}
            </Text>
          </View>
          <StatusBadge status={status} />
        </View>
      </CardHeader>

      {/* ── Content ── */}
      <CardContent className="gap-3 pt-0">
        {/* Plan summary box */}
        <View className="bg-muted/50 rounded-lg px-3 py-3">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-1">
            Plan Summary
          </Text>
          <Text className="text-foreground text-sm">{planSummary}</Text>
        </View>

        {/* Dimensions list */}
        <View className="gap-1.5">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Coverage Dimensions
          </Text>
          {DIMENSIONS.map(({ key, label }) => {
            const score = dimensionScores?.[key]
            const hasScore = score !== undefined && score > 0

            return (
              <View key={key} className="flex-row items-center gap-2 py-0.5">
                {hasScore ? (
                  <CheckCircle2 size={14} className="text-success" />
                ) : (
                  <View className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40" />
                )}
                <Text
                  className={cn(
                    'text-sm flex-1',
                    hasScore ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </Text>
                {hasScore && (
                  <Text className="text-xs text-muted-foreground font-mono">
                    {score}
                  </Text>
                )}
              </View>
            )
          })}
        </View>

        {/* View full plan link */}
        {onViewPlan ? (
          <Pressable
            testID="assimilation-plan-view-plan"
            className="flex-row items-center gap-1 py-1 active:opacity-60"
            onPress={onViewPlan}
          >
            <Text className="text-primary text-sm">View Full Plan</Text>
            <ArrowRight size={13} className="text-primary" />
          </Pressable>
        ) : null}

        {/* Feedback input (shown when user taps Reject) */}
        {showFeedback ? (
          <View className="gap-1.5">
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              Feedback (optional)
            </Text>
            <TextInput
              testID="assimilation-plan-feedback-input"
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="Tell the agent what to change..."
              placeholderTextColor="hsl(var(--muted-foreground))"
              multiline
              numberOfLines={3}
              className="bg-muted/50 rounded-lg px-3 py-2.5 text-foreground text-sm min-h-[72px] border border-border"
              style={{ textAlignVertical: 'top' }}
            />
          </View>
        ) : null}

        {/* Completed state */}
        {isCompleted ? (
          <View className="flex-row items-center gap-2 py-1">
            <CheckCircle2 size={16} className="text-success" />
            <Text className="text-success text-sm font-medium">
              Assimilation complete
            </Text>
          </View>
        ) : null}

        {/* Rejected state */}
        {isRejected ? (
          <View className="flex-row items-center gap-2 py-1">
            <XCircle size={16} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm">Plan rejected</Text>
          </View>
        ) : null}
      </CardContent>

      {/* ── Actions (pending_approval only) ── */}
      {isPending ? (
        <CardFooter className="gap-3 pt-0">
          <Pressable
            testID="assimilation-plan-approve-button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-primary py-2.5 px-4 active:opacity-80"
            onPress={onApprove}
          >
            <Check size={15} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-sm font-semibold">
              Approve
            </Text>
          </Pressable>

          <Pressable
            testID="assimilation-plan-reject-button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-border py-2.5 px-4 active:opacity-80"
            onPress={handleRejectPress}
          >
            <X size={15} className="text-foreground" />
            <Text className="text-foreground text-sm font-semibold">
              {showFeedback ? 'Send Feedback' : 'Reject'}
            </Text>
          </Pressable>
        </CardFooter>
      ) : null}
    </Card>
  )
}

// ── Convex-wired wrapper ───────────────────────────────────────────────────────

export type AssimilationPlanCardWithConvexProps = Omit<
  AssimilationPlanCardProps,
  'onApprove' | 'onReject'
>

/**
 * AssimilationPlanCardWithConvex wires the AssimilationPlanCard to Convex
 * mutations. Approving starts the analysis; rejecting with feedback re-plans.
 */
export function AssimilationPlanCardWithConvex({
  sessionId,
  ...props
}: AssimilationPlanCardWithConvexProps) {
  const approve = useMutation(api.assimilate.mutations.approveAssimilationPlan)
  const reject = useMutation(api.assimilate.mutations.rejectAssimilationPlan)

  return (
    <AssimilationPlanCard
      {...props}
      sessionId={sessionId}
      onApprove={() =>
        approve({ sessionId: sessionId as Id<'assimilationSessions'> })
      }
      onReject={(feedback) =>
        reject({
          sessionId: sessionId as Id<'assimilationSessions'>,
          feedback,
        })
      }
    />
  )
}
