import { ActivityIndicator, View } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Lock,
  XCircle,
} from '@/components/ui/icons'

// ── Types ────────────────────────────────────────────────────────────────────

export type PlanStepStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'completed'
  | 'skipped'
  | 'failed'

export interface PlanStepRowProps {
  stepIndex: number
  toolDisplayName: string
  description: string
  requiresApproval: boolean
  status: PlanStepStatus
  resultSummary?: string
  errorMessage?: string
}

// ── Status icon ──────────────────────────────────────────────────────────────

function StepStatusIcon({ status }: { status: PlanStepStatus }) {
  switch (status) {
    case 'pending':
      return <Circle size={16} className="text-muted-foreground shrink-0" />
    case 'running':
      return <ActivityIndicator size="small" className="shrink-0" />
    case 'awaiting_approval':
      return <Clock size={16} className="text-yellow-500 shrink-0" />
    case 'approved':
      return <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
    case 'completed':
      return <CheckCircle2 size={16} className="text-green-500 shrink-0" />
    case 'skipped':
      return <XCircle size={16} className="text-muted-foreground shrink-0" />
    case 'failed':
      return <AlertTriangle size={16} className="text-destructive shrink-0" />
  }
}

// ── Main component ──────────────────────────────────────────────────────────

export function PlanStepRow({
  stepIndex,
  description,
  requiresApproval,
  status,
  resultSummary,
  errorMessage,
}: PlanStepRowProps) {
  return (
    <View data-testid={`plan-step-row-${stepIndex}`} className="gap-1">
      <View className="flex-row items-center gap-2">
        <StepStatusIcon status={status} />
        <View className="flex-row items-center gap-1 flex-1">
          {requiresApproval ? (
            <Lock size={12} className="text-muted-foreground shrink-0" />
          ) : null}
          <Text
            className={cn(
              'text-sm flex-1',
              status === 'completed' && 'text-muted-foreground',
              status === 'skipped' && 'text-muted-foreground line-through',
              status === 'failed' && 'text-destructive'
            )}
          >
            {stepIndex + 1}. {description}
          </Text>
        </View>
      </View>

      {/* Result summary (completed) */}
      {status === 'completed' && resultSummary ? (
        <View className="ml-6 pl-2">
          <Text className="text-muted-foreground text-xs">{resultSummary}</Text>
        </View>
      ) : null}

      {/* Error message (failed) */}
      {status === 'failed' && errorMessage ? (
        <View className="ml-6 pl-2">
          <Text className="text-destructive text-xs">{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  )
}
