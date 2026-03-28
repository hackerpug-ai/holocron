/**
 * PlanExecutionCard
 *
 * Displays live progress of plan execution with progress bar, current step,
 * completed steps, and error states for failed steps.
 *
 * Shows plan title and description, progress bar based on completed steps,
 * all steps with status indicators, and highlights the current step being executed.
 */

import { View, ActivityIndicator } from 'react-native'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { CheckCircle2, Circle, AlertTriangle, Loader2 } from '@/components/ui/icons'

// ── Types ────────────────────────────────────────────────────────────────────

export type PlanExecutionStatus =
  | 'created'
  | 'executing'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type PlanStepStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'completed'
  | 'skipped'
  | 'failed'

export interface PlanExecutionStep {
  stepIndex: number
  description: string
  status: PlanStepStatus
  errorMessage?: string
  resultSummary?: string
}

export interface PlanExecutionCardProps {
  title: string
  description?: string
  status: PlanExecutionStatus
  steps: PlanExecutionStep[]
  currentStepIndex?: number
  className?: string
  testID?: string
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PlanExecutionStatus, { label: string; className: string }> = {
  created: {
    label: 'Created',
    className: 'bg-muted text-muted-foreground',
  },
  executing: {
    label: 'Executing',
    className: 'bg-blue-500/10 text-blue-500',
  },
  awaiting_approval: {
    label: 'Awaiting Approval',
    className: 'bg-yellow-500/10 text-yellow-500',
  },
  completed: {
    label: 'Completed',
    className: 'bg-green-500/10 text-green-500',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-500/10 text-red-500',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-muted text-muted-foreground',
  },
}

function PlanStatusBadge({ status }: { status: PlanExecutionStatus }) {
  const config = STATUS_BADGE[status]
  return (
    <View className={cn('rounded-full px-2 py-0.5', config.className)}>
      <Text className={cn('text-xs font-semibold', config.className)}>
        {config.label}
      </Text>
    </View>
  )
}

// ── Status icon for steps ─────────────────────────────────────────────────────

function StepStatusIcon({ status }: { status: PlanStepStatus }) {
  switch (status) {
    case 'pending':
      return <Circle size={16} className="text-muted-foreground shrink-0" />
    case 'running':
      return <ActivityIndicator size="small" className="shrink-0" />
    case 'awaiting_approval':
      return <Circle size={16} className="text-yellow-500 shrink-0" />
    case 'approved':
      return <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
    case 'completed':
      return <CheckCircle2 size={16} className="text-green-500 shrink-0" />
    case 'skipped':
      return <Circle size={16} className="text-muted-foreground/50 shrink-0" />
    case 'failed':
      return <AlertTriangle size={16} className="text-destructive shrink-0" />
  }
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({
  completed,
  total,
  className,
}: {
  completed: number
  total: number
  className?: string
}) {
  const progress = total > 0 ? completed / total : 0
  const percentage = Math.round(progress * 100)

  return (
    <View className={cn('gap-1', className)}>
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted-foreground">Progress</Text>
        <Text className="text-xs text-muted-foreground font-medium">
          {percentage}%
        </Text>
      </View>
      <View className="h-2 w-full flex-row overflow-hidden rounded-full bg-muted">
        <View
          className={cn(
            'h-full rounded-full transition-all',
            progress === 1 ? 'bg-green-500' : 'bg-primary'
          )}
          style={{ width: `${percentage}%` }}
        />
      </View>
      <Text className="text-xs text-muted-foreground text-center">
        {completed} of {total} steps completed
      </Text>
    </View>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function PlanExecutionCard({
  title,
  description,
  status,
  steps,
  currentStepIndex,
  className,
  testID,
}: PlanExecutionCardProps) {
  const completedSteps = steps.filter(
    (s) => s.status === 'completed' || s.status === 'skipped'
  ).length
  const totalSteps = steps.length
  const isExecuting = status === 'executing'
  const isComplete = status === 'completed'
  const isFailed = status === 'failed'

  return (
    <Card
      className={cn(
        'border',
        isExecuting ? 'border-blue-500/40' : isFailed ? 'border-destructive/40' : 'border-border',
        className
      )}
      testID={testID ?? 'plan-execution-card'}
    >
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <View className="flex-row items-center gap-2">
          {isExecuting ? (
            <Loader2 size={16} className="text-blue-500 shrink-0 animate-spin" />
          ) : isComplete ? (
            <CheckCircle2 size={16} className="text-green-500 shrink-0" />
          ) : isFailed ? (
            <AlertTriangle size={16} className="text-destructive shrink-0" />
          ) : (
            <Circle size={16} className="text-muted-foreground shrink-0" />
          )}
          <View className="flex-1">
            <Text className="text-muted-foreground text-xs">Execution Plan</Text>
          </View>
          <PlanStatusBadge status={status} />
        </View>
        <Text className="text-foreground font-semibold text-base mt-1">
          {title}
        </Text>
        {description && (
          <Text className="text-muted-foreground text-sm mt-1">{description}</Text>
        )}
      </CardHeader>

      {/* ── Progress Bar ── */}
      <CardContent className="pt-0 pb-3">
        <ProgressBar completed={completedSteps} total={totalSteps} />
      </CardContent>

      {/* ── Steps ── */}
      <CardContent className="gap-3 pt-0">
        {steps.map((step) => {
          const isCurrent = currentStepIndex !== undefined && step.stepIndex === currentStepIndex
          const isFailed = step.status === 'failed'
          const isCompleted = step.status === 'completed'
          const isSkipped = step.status === 'skipped'

          return (
            <View
              key={step.stepIndex}
              className={cn(
                'gap-1.5 rounded-lg border p-3',
                isCurrent && 'border-primary/40 bg-primary/5',
                isFailed && 'border-destructive/40 bg-destructive/5',
                isCompleted && 'border-transparent',
                !isCurrent && !isFailed && 'border-border bg-muted/30'
              )}
              testID={`plan-step-${step.stepIndex}`}
            >
              {/* Step header */}
              <View className="flex-row items-center gap-2">
                <StepStatusIcon status={step.status} />
                <Text
                  className={cn(
                    'text-sm flex-1',
                    isCurrent && 'text-primary font-medium',
                    isFailed && 'text-destructive font-medium',
                    isCompleted && 'text-muted-foreground',
                    isSkipped && 'text-muted-foreground/50 line-through'
                  )}
                >
                  {step.stepIndex + 1}. {step.description}
                </Text>
              </View>

              {/* Result summary (completed) */}
              {isCompleted && step.resultSummary && (
                <View className="ml-6 pl-2">
                  <Text className="text-muted-foreground text-xs">
                    ✓ {step.resultSummary}
                  </Text>
                </View>
              )}

              {/* Error message (failed) */}
              {isFailed && step.errorMessage && (
                <View className="ml-6 pl-2">
                  <Text className="text-destructive text-xs">
                    {step.errorMessage}
                  </Text>
                </View>
              )}

              {/* Current step indicator */}
              {isCurrent && (
                <View className="ml-6 pl-2">
                  <Text className="text-primary text-xs font-medium">
                    Running...
                  </Text>
                </View>
              )}
            </View>
          )
        })}
      </CardContent>
    </Card>
  )
}
