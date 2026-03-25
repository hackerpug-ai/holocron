import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { useAction, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Wrench,
  X,
  XCircle,
} from '@/components/ui/icons'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ToolApprovalCardProps {
  approvalId: string
  toolName: string
  toolDisplayName: string
  toolIcon?: string
  description?: string
  parameters: Record<string, unknown>
  reasoning?: string
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'timed_out'
  resultCardData?: unknown
  onApprove?: () => void
  onReject?: () => void
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  ToolApprovalCardProps['status'],
  { label: string; className: string }
> = {
  pending: {
    label: 'Pending',
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
  completed: {
    label: 'Completed',
    className: 'bg-success/15 text-success',
  },
  rejected: {
    label: 'Declined',
    className: 'bg-destructive/15 text-destructive',
  },
  timed_out: {
    label: 'Timed Out',
    className: 'bg-warning/15 text-warning',
  },
}

function StatusBadge({ status }: { status: ToolApprovalCardProps['status'] }) {
  const config = STATUS_BADGE[status]
  return (
    <View className={cn('rounded-full px-2 py-0.5', config.className)}>
      <Text className={cn('text-xs font-semibold', config.className)}>
        {config.label}
      </Text>
    </View>
  )
}

// ── Parameter row ─────────────────────────────────────────────────────────────

function ParameterRow({ label, value }: { label: string; value: unknown }) {
  const displayValue =
    typeof value === 'object' && value !== null
      ? JSON.stringify(value, null, 2)
      : String(value ?? '')

  return (
    <View className="flex-row gap-3">
      <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide w-28 shrink-0 pt-0.5">
        {label}
      </Text>
      <Text className="text-foreground text-sm flex-1 font-mono">{displayValue}</Text>
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * ToolApprovalCard shows a human-in-the-loop approval prompt for an agent
 * tool call. Displays the tool name, parameters, optional reasoning, and
 * approve/reject actions when status is "pending".
 */
export function ToolApprovalCard({
  toolDisplayName,
  description,
  parameters,
  reasoning,
  status,
  onApprove,
  onReject,
}: ToolApprovalCardProps) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false)

  const isPending = status === 'pending'
  const isExecuting = status === 'approved' || status === 'executing'
  const isCompleted = status === 'completed'
  const isRejected = status === 'rejected'
  const isTimedOut = status === 'timed_out'

  const paramEntries = Object.entries(parameters)

  return (
    <Card
      className="border border-border"
      testID="tool-approval-card"
    >
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <View className="flex-row items-center gap-2">
          <Wrench size={16} className="text-muted-foreground shrink-0" />
          <View className="flex-1">
            <Text className="text-muted-foreground text-xs">
              Agent would like to use
            </Text>
            <Text className="text-foreground font-semibold">{toolDisplayName}</Text>
          </View>
          <StatusBadge status={status} />
        </View>

        {description ? (
          <Text className="text-muted-foreground text-sm mt-1">{description}</Text>
        ) : null}
      </CardHeader>

      {/* ── Parameters ── */}
      <CardContent className="gap-3 pt-0">
        {paramEntries.length > 0 ? (
          <View className="bg-muted/50 rounded-lg px-3 py-3 gap-2">
            {paramEntries.map(([key, val]) => (
              <ParameterRow key={key} label={key} value={val} />
            ))}
          </View>
        ) : (
          <View className="bg-muted/50 rounded-lg px-3 py-2">
            <Text className="text-muted-foreground text-sm">No parameters</Text>
          </View>
        )}

        {/* ── Reasoning (collapsible) ── */}
        {reasoning ? (
          <View>
            <Pressable
              testID="tool-approval-reasoning-toggle"
              className="flex-row items-center gap-1 py-1"
              onPress={() => setReasoningExpanded((v) => !v)}
            >
              {reasoningExpanded ? (
                <ChevronUp size={14} className="text-muted-foreground" />
              ) : (
                <ChevronDown size={14} className="text-muted-foreground" />
              )}
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                Reasoning
              </Text>
            </Pressable>

            {reasoningExpanded ? (
              <View className="bg-muted/30 rounded-md px-3 py-2 mt-1">
                <Text className="text-foreground text-sm">{reasoning}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Executing state ── */}
        {isExecuting ? (
          <View className="flex-row items-center gap-2 py-1">
            <ActivityIndicator size="small" />
            <Text className="text-muted-foreground text-sm">Executing...</Text>
          </View>
        ) : null}

        {/* ── Completed state ── */}
        {isCompleted ? (
          <View className="flex-row items-center gap-2 py-1">
            <CheckCircle2 size={16} className="text-success" />
            <Text className="text-success text-sm font-medium">Completed</Text>
          </View>
        ) : null}

        {/* ── Rejected state ── */}
        {isRejected ? (
          <View className="flex-row items-center gap-2 py-1">
            <XCircle size={16} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-sm">Declined</Text>
          </View>
        ) : null}

        {/* ── Timed out state ── */}
        {isTimedOut ? (
          <View className="flex-row items-center gap-2 py-1">
            <AlertTriangle size={16} className="text-warning" />
            <Text className="text-warning text-sm font-medium">
              Timed out — try sending your request again
            </Text>
          </View>
        ) : null}
      </CardContent>

      {/* ── Actions (pending only) ── */}
      {isPending ? (
        <CardFooter className="gap-3 pt-0">
          <Pressable
            testID="tool-approval-approve-button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-primary py-2.5 px-4 active:opacity-80"
            onPress={onApprove}
          >
            <Check size={15} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-sm font-semibold">Approve</Text>
          </Pressable>

          <Pressable
            testID="tool-approval-reject-button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-border py-2.5 px-4 active:opacity-80"
            onPress={onReject}
          >
            <X size={15} className="text-foreground" />
            <Text className="text-foreground text-sm font-semibold">Reject</Text>
          </Pressable>
        </CardFooter>
      ) : null}
    </Card>
  )
}

// ── Convex-wired wrapper ──────────────────────────────────────────────────────

export type ToolApprovalCardWithConvexProps = Omit<
  ToolApprovalCardProps,
  'onApprove' | 'onReject'
>

/**
 * ToolApprovalCardWithConvex wires the ToolApprovalCard to Convex mutations.
 * Approving sets status to "approved"; rejecting sets status to "rejected".
 */
export function ToolApprovalCardWithConvex(props: ToolApprovalCardWithConvexProps) {
  const executeTool = useAction(api.chat.agent.executeTool)
  const updateStatus = useMutation(api.toolCalls.mutations.updateStatus)

  const handleApprove = () => {
    executeTool({
      toolCallId: props.approvalId as Id<'toolCalls'>,
    })
  }

  const handleReject = () => {
    updateStatus({
      id: props.approvalId as Id<'toolCalls'>,
      status: 'rejected',
    })
  }

  return (
    <ToolApprovalCard
      {...props}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  )
}
