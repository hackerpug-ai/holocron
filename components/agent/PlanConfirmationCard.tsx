/**
 * PlanConfirmationCard
 *
 * Displays a generated plan for user approval before execution.
 * Shows plan title, description, steps, and metadata with Approve/Reject/Modify actions.
 *
 * Features:
 * - Plan type badge (deep-research, shop, assimilation, agent)
 * - Collapsible step list with descriptions
 * - Plan metadata display (estimated time, resource requirements)
 * - Approve/Reject/Modify buttons with feedback support
 * - Loading state during plan generation
 * - Theme-aware styling with semantic tokens
 */

import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from 'react-native'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import {
  Check,
  ChevronDown,
  ChevronUp,
  GitFork,
  Pencil,
  ShoppingCart,
  Sparkles,
  X,
} from '@/components/ui/icons'
import type {
  PlanStatus,
  PlanStep,
  PlanType,
} from '@/lib/types/plan-cards'

// ============================================================
// Types
// ============================================================

export interface PlanConfirmationCardProps {
  /** Unique identifier for the plan */
  planId: string
  /** Type of plan */
  planType: PlanType
  /** Plan title */
  title: string
  /** Plan description */
  description?: string
  /** Current status of the plan */
  status: PlanStatus
  /** Plan steps to execute */
  steps: PlanStep[]
  /** Estimated execution time in seconds */
  estimatedTimeSeconds?: number
  /** Estimated cost in USD */
  estimatedCostUsd?: number
  /** Additional metadata for display */
  metadata?: Record<string, unknown>
  /** Callback when plan is approved */
  onApprove?: () => void
  /** Callback when plan is rejected (with optional feedback) */
  onReject?: (feedback?: string) => void
  /** Callback when plan is modified */
  onModify?: () => void
  /** Test ID prefix for testing */
  testID?: string
}

// ============================================================
// Constants
// ============================================================

const PLAN_TYPE_CONFIG: Record<
  PlanType,
  { label: string; icon: typeof Sparkles; className: string }
> = {
  'deep-research': {
    label: 'Deep Research',
    icon: Sparkles,
    className: 'text-purple-500',
  },
  shop: {
    label: 'Shop',
    icon: ShoppingCart,
    className: 'text-blue-500',
  },
  assimilation: {
    label: 'Assimilation',
    icon: GitFork,
    className: 'text-green-500',
  },
  agent: {
    label: 'Agent',
    icon: Sparkles,
    className: 'text-primary',
  },
}

const STATUS_BADGE: Record<
  PlanStatus,
  { label: string; className: string }
> = {
  created: {
    label: 'Created',
    className: 'bg-muted text-muted-foreground',
  },
  pending_approval: {
    label: 'Awaiting Approval',
    className: 'bg-warning/15 text-warning',
  },
  approved: {
    label: 'Approved',
    className: 'bg-info/15 text-info',
  },
  executing: {
    label: 'Executing',
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
  failed: {
    label: 'Failed',
    className: 'bg-destructive/15 text-destructive',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-muted text-muted-foreground',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-destructive/15 text-destructive',
  },
}

// ============================================================
// Sub-components
// ============================================================

function PlanTypeBadge({
  planType,
}: {
  planType: PlanType
}) {
  const config = PLAN_TYPE_CONFIG[planType]
  const Icon = config.icon

  return (
    <View className="flex-row items-center gap-1.5">
      <Icon size={14} className={cn('shrink-0', config.className)} />
      <Text className={cn('text-xs font-semibold', config.className)}>
        {config.label}
      </Text>
    </View>
  )
}

function StatusBadge({ status }: { status: PlanStatus }) {
  const config = STATUS_BADGE[status]

  return (
    <View className={cn('rounded-full px-2 py-0.5', config.className)}>
      <Text className={cn('text-xs font-semibold', config.className)}>
        {config.label}
      </Text>
    </View>
  )
}

function PlanStepItem({
  step,
  index,
}: {
  step: PlanStep
  index: number
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <View
      className="border-b border-border last:border-b-0 py-3"
      testID={`plan-step-${index}`}
    >
      <Pressable
        className="flex-row items-start gap-2"
        onPress={() => setExpanded(!expanded)}
        testID={`plan-step-${index}-toggle`}
      >
        <View className="w-6 h-6 rounded-full bg-muted items-center justify-center mt-0.5">
          <Text className="text-xs font-semibold text-foreground">
            {index + 1}
          </Text>
        </View>

        <View className="flex-1 gap-1">
          <Text className="text-sm font-medium text-foreground">
            {step.description}
          </Text>

          {step.requiresApproval ? (
            <View className="flex-row items-center gap-1">
              <View className="w-2 h-2 rounded-full bg-warning" />
              <Text className="text-xs text-warning">Requires approval</Text>
            </View>
          ) : null}

          {expanded && step.toolDisplayName ? (
            <Text className="text-xs text-muted-foreground mt-1">
              Tool: {step.toolDisplayName}
            </Text>
          ) : null}
        </View>

        {expanded ? (
          <ChevronUp size={16} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-muted-foreground shrink-0" />
        )}
      </Pressable>
    </View>
  )
}

function MetadataRow({
  label,
  value,
  testID,
}: {
  label: string
  value: string | number
  testID?: string
}) {
  return (
    <View className="flex-row items-center gap-2" testID={testID}>
      <Text className="text-xs text-muted-foreground uppercase tracking-wide w-24">
        {label}
      </Text>
      <Text className="text-sm text-foreground font-medium">{value}</Text>
    </View>
  )
}

// ============================================================
// Main Component
// ============================================================

/**
 * PlanConfirmationCard displays a generated plan for user approval.
 *
 * Shows plan details including title, description, steps, and metadata.
 * Provides Approve, Reject, and Modify actions when status is pending_approval.
 */
export function PlanConfirmationCard({
  planId,
  planType,
  title,
  description,
  status,
  steps,
  estimatedTimeSeconds,
  estimatedCostUsd,
  metadata,
  onApprove,
  onReject,
  onModify,
  testID = 'plan-confirmation-card',
}: PlanConfirmationCardProps) {
  const [stepsExpanded, setStepsExpanded] = useState(true)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')

  const isPending = status === 'pending_approval'
  const isExecuting = status === 'executing' || status === 'in_progress'
  const isCompleted = status === 'completed'
  const isRejected = status === 'rejected'

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
      testID={testID}
    >
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <View className="flex-row items-center gap-2">
          <PlanTypeBadge planType={planType} />
          <View className="flex-1" />
          <StatusBadge status={status} />
        </View>

        <Text className="text-foreground font-semibold text-lg mt-2">
          {title}
        </Text>

        {description ? (
          <Text className="text-muted-foreground text-sm mt-1">
            {description}
          </Text>
        ) : null}

        {/* Plan ID (for debugging) */}
        <Text className="text-muted-foreground/50 text-xs mt-1 font-mono">
          ID: {planId.slice(0, 8)}...
        </Text>
      </CardHeader>

      {/* ── Content ── */}
      <CardContent className="gap-4 pt-0">
        {/* Metadata section */}
        {(estimatedTimeSeconds !== undefined ||
          estimatedCostUsd !== undefined ||
          metadata) && (
          <View className="bg-muted/50 rounded-lg px-3 py-3 gap-2">
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-1">
              Plan Details
            </Text>

            {estimatedTimeSeconds !== undefined && (
              <MetadataRow
                label="Est. Time"
                value={
                  estimatedTimeSeconds < 60
                    ? `${estimatedTimeSeconds}s`
                    : `${Math.ceil(estimatedTimeSeconds / 60)}m`
                }
                testID={`${testID}-est-time`}
              />
            )}

            {estimatedCostUsd !== undefined && (
              <MetadataRow
                label="Est. Cost"
                value={`$${estimatedCostUsd.toFixed(2)}`}
                testID={`${testID}-est-cost`}
              />
            )}

            {metadata &&
              Object.entries(metadata).map(([key, value]) => (
                <MetadataRow
                  key={key}
                  label={key.replace(/_/g, ' ')}
                  value={String(value)}
                  testID={`${testID}-metadata-${key}`}
                />
              ))}
          </View>
        )}

        {/* Steps section */}
        <View className="gap-2">
          <Pressable
            className="flex-row items-center gap-2"
            onPress={() => setStepsExpanded(!stepsExpanded)}
            testID={`${testID}-steps-toggle`}
          >
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              Steps ({steps.length})
            </Text>
            {stepsExpanded ? (
              <ChevronUp size={14} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={14} className="text-muted-foreground" />
            )}
          </Pressable>

          {stepsExpanded ? (
            <ScrollView
              className="bg-muted/30 rounded-lg"
              showsVerticalScrollIndicator={false}
            >
              {steps.map((step, index) => (
                <PlanStepItem key={step.stepIndex} step={step} index={index} />
              ))}
            </ScrollView>
          ) : null}
        </View>

        {/* Executing state */}
        {isExecuting ? (
          <View className="flex-row items-center gap-2 py-1">
            <ActivityIndicator size="small" />
            <Text className="text-muted-foreground text-sm">
              Executing plan...
            </Text>
          </View>
        ) : null}

        {/* Completed state */}
        {isCompleted ? (
          <View className="flex-row items-center gap-2 py-1">
            <Check size={16} className="text-success" />
            <Text className="text-success text-sm font-medium">
              Plan completed successfully
            </Text>
          </View>
        ) : null}

        {/* Rejected state */}
        {isRejected ? (
          <View className="flex-row items-center gap-2 py-1">
            <X size={16} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm">Plan rejected</Text>
          </View>
        ) : null}

        {/* Feedback input (shown when user taps Reject) */}
        {showFeedback ? (
          <View className="gap-1.5">
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              Feedback (optional)
            </Text>
            <Pressable className="bg-muted/50 rounded-lg px-3 py-2.5 min-h-[72px] border border-border">
              <Text className="text-muted-foreground text-sm">
                Tell the agent what to change about this plan...
              </Text>
            </Pressable>
          </View>
        ) : null}
      </CardContent>

      {/* ── Actions (pending_approval only) ── */}
      {isPending ? (
        <CardFooter className="gap-3 pt-0">
          <Pressable
            testID={`${testID}-approve-button`}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-primary py-2.5 px-4 active:opacity-80"
            onPress={onApprove}
          >
            <Check size={15} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-sm font-semibold">
              Approve
            </Text>
          </Pressable>

          {onModify ? (
            <Pressable
              testID={`${testID}-modify-button`}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-border py-2.5 px-4 active:opacity-80"
              onPress={onModify}
            >
              <Pencil size={15} className="text-foreground" />
              <Text className="text-foreground text-sm font-semibold">
                Modify
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            testID={`${testID}-reject-button`}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-border py-2.5 px-4 active:opacity-80"
            onPress={handleRejectPress}
          >
            <X size={15} className="text-foreground" />
            <Text className="text-foreground text-sm font-semibold">
              {showFeedback ? 'Send' : 'Reject'}
            </Text>
          </Pressable>
        </CardFooter>
      ) : null}
    </Card>
  )
}
