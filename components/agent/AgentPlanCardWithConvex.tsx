import { ActivityIndicator, View } from 'react-native'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Text } from '@/components/ui/text'
import { AgentPlanCard } from './AgentPlanCard'

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentPlanCardWithConvexProps {
  planId: string
}

// ── Main component ──────────────────────────────────────────────────────────

export function AgentPlanCardWithConvex({ planId }: AgentPlanCardWithConvexProps) {
  const typedPlanId = planId as Id<'agentPlans'>

  const plan = useQuery(api.agentPlans.queries.get, { id: typedPlanId })
  const steps = useQuery(api.agentPlans.queries.getSteps, { planId: typedPlanId })

  const approveStep = useMutation(api.agentPlans.mutations.approveStep)
  const rejectStep = useMutation(api.agentPlans.mutations.rejectStep)
  const cancelPlan = useMutation(api.agentPlans.mutations.cancelPlan)

  // Loading state
  if (!plan || !steps) {
    return (
      <View className="flex-row items-center justify-center gap-2 py-4">
        <ActivityIndicator size="small" />
        <Text className="text-muted-foreground text-sm">Loading plan...</Text>
      </View>
    )
  }

  const handleApproveStep = (stepIndex: number) => {
    approveStep({ planId: typedPlanId, stepIndex })
  }

  const handleRejectStep = (stepIndex: number) => {
    rejectStep({ planId: typedPlanId, stepIndex })
  }

  const handleCancelPlan = () => {
    cancelPlan({ planId: typedPlanId })
  }

  return (
    <AgentPlanCard
      title={plan.title}
      status={plan.status}
      steps={steps.map((step) => ({
        stepIndex: step.stepIndex,
        toolDisplayName: step.toolDisplayName,
        description: step.description,
        requiresApproval: step.requiresApproval,
        status: step.status,
        resultSummary: step.resultSummary,
        errorMessage: step.errorMessage,
      }))}
      currentStepIndex={plan.currentStepIndex}
      onApproveStep={handleApproveStep}
      onRejectStep={handleRejectStep}
      onCancelPlan={handleCancelPlan}
    />
  )
}
