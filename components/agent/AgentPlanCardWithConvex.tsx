/**
 * Agent plan card data via Zero (S-REWRITE-INTEGRATE).
 * Named *WithConvex historically; no longer imports the Convex React client.
 */

import { useZero, useQuery as useZeroQuery } from '@rocicorp/zero/react';
import { ActivityIndicator, View } from 'react-native';
import { agentPlanById, agentPlanStepsByPlan } from '@/app/zero/queries';
import { Text } from '@/components/ui/text';
import { AgentPlanCard, type PlanStatus } from './AgentPlanCard';
import type { PlanStepStatus } from './PlanStepRow';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentPlanCardWithConvexProps {
  planId: string;
}

type PlanRow = {
  id: string;
  title?: string | null;
  status: string;
  current_step_index?: number | null;
};

type StepRow = {
  id: string;
  step_index?: number | null;
  tool_name?: string | null;
  tool_display_name?: string | null;
  description?: string | null;
  requires_approval?: boolean | null;
  status: string;
  result_summary?: string | null;
  error_message?: string | null;
};

function mapPlanStatus(status: string): PlanStatus {
  switch (status) {
    case 'pending':
    case 'created':
      return 'created';
    case 'running':
    case 'in_progress':
    case 'executing':
    case 'approved':
      return 'executing';
    case 'awaiting_approval':
      return 'awaiting_approval';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'error':
      return 'failed';
    case 'cancelled':
    case 'rejected':
    case 'timed_out':
      return 'cancelled';
    default:
      return 'executing';
  }
}

// ── Main component ──────────────────────────────────────────────────────────

export function AgentPlanCardWithConvex({ planId }: AgentPlanCardWithConvexProps) {
  const zero = useZero();
  const [planRaw, planDetails] = useZeroQuery(agentPlanById(planId));
  const [stepsRaw] = useZeroQuery(agentPlanStepsByPlan(planId));

  const plan = planRaw as unknown as PlanRow | undefined;
  const steps = (stepsRaw ?? []) as unknown as StepRow[];

  // Loading state — first result not yet available
  if (!plan && planDetails.type === 'unknown') {
    return (
      <View className="flex-row items-center justify-center gap-2 py-4">
        <ActivityIndicator size="small" />
        <Text className="text-muted-foreground text-sm">Loading plan...</Text>
      </View>
    );
  }

  if (!plan) {
    return (
      <View className="flex-row items-center justify-center gap-2 py-4">
        <Text className="text-muted-foreground text-sm">Plan not found</Text>
      </View>
    );
  }

  const handleApproveStep = (stepIndex: number) => {
    const step = steps.find((s) => s.step_index === stepIndex);
    if (!step) return;
    void zero.mutate.agent_plan_steps.update({
      id: step.id,
      status: 'approved',
    });
  };

  const handleRejectStep = (stepIndex: number) => {
    const step = steps.find((s) => s.step_index === stepIndex);
    if (!step) return;
    void zero.mutate.agent_plan_steps.update({
      id: step.id,
      status: 'rejected',
    });
  };

  const handleCancelPlan = () => {
    void zero.mutate.agent_plans.update({
      id: planId,
      status: 'cancelled',
      updated_at: Date.now(),
      completed_at: Date.now(),
    });
  };

  return (
    <AgentPlanCard
      title={plan.title ?? 'Agent plan'}
      status={mapPlanStatus(plan.status)}
      steps={steps.map((step) => ({
        stepIndex: step.step_index ?? 0,
        toolDisplayName: step.tool_display_name ?? step.tool_name ?? 'Step',
        description: step.description ?? '',
        requiresApproval: step.requires_approval ?? false,
        status: step.status as PlanStepStatus,
        resultSummary: step.result_summary ?? undefined,
        errorMessage: step.error_message ?? undefined,
      }))}
      currentStepIndex={plan.current_step_index ?? undefined}
      onApproveStep={handleApproveStep}
      onRejectStep={handleRejectStep}
      onCancelPlan={handleCancelPlan}
    />
  );
}
