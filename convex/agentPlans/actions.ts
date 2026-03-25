"use node";

/**
 * Agent Plans: Execution Engine
 *
 * Drives the execution of agentPlan steps.
 *
 * Flow:
 *   executePlanStep() — fetches current step, handles approval gate or executes tool
 *   continueAfterPlan() — schedules LLM continuation after plan finishes
 *   resumeAfterApproval() — resumes plan execution after a step is approved
 */

import { internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { executeAgentTool } from "../chat/toolExecutor";

// ---------------------------------------------------------------------------
// executePlanStep
// ---------------------------------------------------------------------------

export const executePlanStep = internalAction({
  args: { planId: v.id("agentPlans") },
  handler: async (ctx, { planId }): Promise<void> => {
    // 1. Fetch the plan
    const plan = await ctx.runQuery(api.agentPlans.queries.get, { id: planId });

    // 2. Early exit conditions
    if (!plan) return;
    if (
      plan.status === "completed" ||
      plan.status === "failed" ||
      plan.status === "cancelled"
    ) {
      return;
    }

    // 3. Find the current step
    const steps = await ctx.runQuery(api.agentPlans.queries.getSteps, {
      planId,
    });
    const step = steps.find((s: any) => s.stepIndex === plan.currentStepIndex);

    // 4. No step found — plan is done
    if (!step) {
      await ctx.runMutation(internal.agentPlans.mutations.updatePlanStatus, {
        planId,
        status: "completed",
        completedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        0,
        internal.agentPlans.actions.continueAfterPlan,
        { conversationId: plan.conversationId },
      );
      return;
    }

    // 5. Handle approval gate
    if (step.requiresApproval && step.status === "pending") {
      await ctx.runMutation(internal.agentPlans.mutations.updateStepStatus, {
        planId,
        stepIndex: step.stepIndex,
        status: "awaiting_approval",
      });
      await ctx.runMutation(internal.agentPlans.mutations.updatePlanStatus, {
        planId,
        status: "awaiting_approval",
      });
      return;
    }

    // 6. Execute the step (pending without approval, or already approved)
    if (step.status === "pending" || step.status === "approved") {
      // Mark step and plan as running
      await ctx.runMutation(internal.agentPlans.mutations.updateStepStatus, {
        planId,
        stepIndex: step.stepIndex,
        status: "running",
        startedAt: Date.now(),
      });
      await ctx.runMutation(internal.agentPlans.mutations.updatePlanStatus, {
        planId,
        status: "executing",
      });

      // Set agent busy
      await ctx.runMutation(internal.chat.agentMutations.setAgentBusy, {
        conversationId: plan.conversationId,
        busy: true,
      });

      try {
        const agentResponse = await executeAgentTool(
          ctx,
          step.toolName,
          step.toolArgs,
          plan.conversationId,
        );

        // Validate messageType against allowed chatMessages schema values
        const allowedTypes = [
          "text",
          "result_card",
          "error",
          "progress",
        ] as const;
        type AllowedType = (typeof allowedTypes)[number];
        const messageType: AllowedType = allowedTypes.includes(
          agentResponse.messageType as AllowedType,
        )
          ? (agentResponse.messageType as AllowedType)
          : "text";

        // Persist tool result as a chat message
        await ctx.runMutation(api.chatMessages.mutations.create, {
          conversationId: plan.conversationId,
          role: "agent",
          content: agentResponse.content,
          messageType,
          cardData: agentResponse.cardData,
        });

        // Mark step completed
        const resultSummary = agentResponse.content.substring(0, 200);
        await ctx.runMutation(internal.agentPlans.mutations.updateStepStatus, {
          planId,
          stepIndex: step.stepIndex,
          status: "completed",
          resultSummary,
          completedAt: Date.now(),
        });

        // Advance to the next step
        await ctx.runMutation(internal.agentPlans.mutations.advanceStep, {
          planId,
        });

        // Unset busy
        await ctx.runMutation(internal.chat.agentMutations.setAgentBusy, {
          conversationId: plan.conversationId,
          busy: false,
        });

        // Schedule next step
        await ctx.scheduler.runAfter(
          0,
          internal.agentPlans.actions.executePlanStep,
          { planId },
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Step execution failed";

        await ctx.runMutation(internal.agentPlans.mutations.updateStepStatus, {
          planId,
          stepIndex: step.stepIndex,
          status: "failed",
          errorMessage,
        });

        await ctx.runMutation(internal.agentPlans.mutations.updatePlanStatus, {
          planId,
          status: "failed",
        });

        // Unset busy
        await ctx.runMutation(internal.chat.agentMutations.setAgentBusy, {
          conversationId: plan.conversationId,
          busy: false,
        });

        // Post error to chat
        await ctx.runMutation(api.chatMessages.mutations.create, {
          conversationId: plan.conversationId,
          role: "agent",
          content: `Plan step failed: ${errorMessage}`,
          messageType: "error",
        });

        // Let LLM acknowledge the failure
        await ctx.scheduler.runAfter(
          0,
          internal.agentPlans.actions.continueAfterPlan,
          { conversationId: plan.conversationId },
        );
      }
    }
  },
});

// ---------------------------------------------------------------------------
// continueAfterPlan
// ---------------------------------------------------------------------------

/**
 * Delegate to continueAfterTool — it rebuilds conversation context and prompts
 * the LLM for a follow-up response, which is exactly what we need after a plan
 * completes or fails.
 */
export const continueAfterPlan = internalAction({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }): Promise<void> => {
    await ctx.scheduler.runAfter(
      0,
      internal.chat.agent.continueAfterTool,
      { conversationId },
    );
  },
});

// ---------------------------------------------------------------------------
// resumeAfterApproval
// ---------------------------------------------------------------------------

export const resumeAfterApproval = internalAction({
  args: { planId: v.id("agentPlans") },
  handler: async (ctx, { planId }): Promise<void> => {
    await ctx.scheduler.runAfter(
      0,
      internal.agentPlans.actions.executePlanStep,
      { planId },
    );
  },
});
