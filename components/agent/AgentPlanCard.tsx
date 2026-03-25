import { Pressable, View } from 'react-native'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { Check, Sparkles, X } from '@/components/ui/icons'
import { PlanStepRow, type PlanStepRowProps } from './PlanStepRow'

// ── Types ────────────────────────────────────────────────────────────────────

export type PlanStatus =
  | 'created'
  | 'executing'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AgentPlanCardProps {
  title: string
  status: PlanStatus
  steps: Array<
    Pick<
      PlanStepRowProps,
      | 'stepIndex'
      | 'toolDisplayName'
      | 'description'
      | 'requiresApproval'
      | 'status'
      | 'resultSummary'
      | 'errorMessage'
    >
  >
  currentStepIndex?: number
  onApproveStep?: (stepIndex: number) => void
  onRejectStep?: (stepIndex: number) => void
  onCancelPlan?: () => void
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PlanStatus, { label: string; className: string }> = {
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

function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const config = STATUS_BADGE[status]
  return (
    <View className={cn('rounded-full px-2 py-0.5', config.className)}>
      <Text className={cn('text-xs font-semibold', config.className)}>
        {config.label}
      </Text>
    </View>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function AgentPlanCard({
  title,
  status,
  steps,
  onApproveStep,
  onRejectStep,
}: AgentPlanCardProps) {
  const isAwaitingApproval = status === 'awaiting_approval'
  const awaitingStep = isAwaitingApproval
    ? steps.find((s) => s.status === 'awaiting_approval')
    : undefined

  return (
    <Card
      className={cn(
        'border',
        isAwaitingApproval ? 'border-primary/50' : 'border-border'
      )}
      testID="agent-plan-card"
    >
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <View className="flex-row items-center gap-2">
          <Sparkles size={16} className="text-muted-foreground shrink-0" />
          <View className="flex-1">
            <Text className="text-muted-foreground text-xs">Agent Plan</Text>
          </View>
          <PlanStatusBadge status={status} />
        </View>
        <Text className="text-foreground font-semibold text-sm mt-1">
          {title}
        </Text>
      </CardHeader>

      {/* ── Steps ── */}
      <CardContent className="gap-2 pt-0">
        {steps.map((step) => (
          <PlanStepRow key={step.stepIndex} {...step} />
        ))}
      </CardContent>

      {/* ── Actions (awaiting approval only) ── */}
      {isAwaitingApproval && awaitingStep ? (
        <CardFooter className="gap-3 pt-0">
          <Pressable
            testID="agent-plan-approve-button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-primary py-2.5 px-4 active:opacity-80"
            onPress={() => onApproveStep?.(awaitingStep.stepIndex)}
          >
            <Check size={15} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-sm font-semibold">
              Approve
            </Text>
          </Pressable>

          <Pressable
            testID="agent-plan-skip-button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-border py-2.5 px-4 active:opacity-80"
            onPress={() => onRejectStep?.(awaitingStep.stepIndex)}
          >
            <X size={15} className="text-foreground" />
            <Text className="text-foreground text-sm font-semibold">Skip</Text>
          </Pressable>
        </CardFooter>
      ) : null}
    </Card>
  )
}
