import { internalMutation } from "../_generated/server";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Timeout Stuck Agent Plans
 *
 * Finds agent plans stuck in "executing" status beyond 30 minutes and marks
 * them as "failed". Also marks active steps as failed, resets agentBusy on
 * the conversation, and posts an error message to chat so the user knows what
 * happened.
 *
 * This handles the case where the Convex runtime kills an action mid-flight
 * (e.g., 10-minute action timeout) and the catch/finally blocks never execute,
 * leaving the plan in "executing" and agentBusy=true forever.
 *
 * Plans in "awaiting_approval" are stable waiting states (user stepped away)
 * and are intentionally excluded from this timeout.
 *
 * Intended to be called on a cron schedule (every 5 minutes).
 */
export const timeoutStuckPlans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const executingPlans = await ctx.db
      .query("agentPlans")
      .withIndex("by_status", (q) => q.eq("status", "executing"))
      .collect();

    const stuckPlans = executingPlans.filter(
      (plan) => now - plan.updatedAt > TIMEOUT_MS
    );

    let timedOutCount = 0;

    for (const plan of stuckPlans) {
      // Mark plan as failed
      await ctx.db.patch(plan._id, {
        status: "failed",
        updatedAt: now,
      });

      // Mark all active steps as failed
      const steps = await ctx.db
        .query("agentPlanSteps")
        .withIndex("by_plan", (q) => q.eq("planId", plan._id))
        .collect();

      for (const step of steps) {
        if (
          ["pending", "running", "awaiting_approval", "approved"].includes(
            step.status
          )
        ) {
          await ctx.db.patch(step._id, {
            status: "failed",
            errorMessage: "Plan timed out",
          });
        }
      }

      // Reset agentBusy so the conversation isn't permanently blocked
      await ctx.db.patch(plan.conversationId, {
        agentBusy: false,
        agentBusySince: undefined,
      });

      // Post an error message to the conversation so the user sees what happened
      await ctx.db.insert("chatMessages", {
        conversationId: plan.conversationId,
        role: "agent",
        content: `The plan "${plan.title}" timed out after 30 minutes of inactivity.`,
        messageType: "error",
        createdAt: now,
      });

      timedOutCount++;
    }

    if (timedOutCount > 0) {
      console.log(
        `[timeoutStuckPlans] Timed out ${timedOutCount} stuck agent plan(s)`
      );
    }
  },
});
