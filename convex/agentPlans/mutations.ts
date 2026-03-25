import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Convert a snake_case tool name to a Title Case display name.
 * e.g. "web_search" → "Web Search"
 */
export const toTitleCase = (toolName: string): string =>
  toolName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/**
 * Create an agent plan with all its steps.
 * Also inserts an "agent_plan" chatMessage that references the plan.
 */
export const createPlan = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
    steps: v.array(
      v.object({
        toolName: v.string(),
        toolArgs: v.any(),
        description: v.string(),
        requiresApproval: v.boolean(),
      })
    ),
  },
  handler: async (ctx, { conversationId, title, steps }) => {
    const now = Date.now();

    // Insert the chat message first so we have a messageId for the plan record
    const messageId = await ctx.db.insert("chatMessages", {
      conversationId,
      role: "agent",
      content: `I've created a plan: ${title}`,
      messageType: "agent_plan",
      createdAt: now,
    });

    // Insert the plan record
    const planId = await ctx.db.insert("agentPlans", {
      conversationId,
      messageId,
      title,
      status: "created",
      currentStepIndex: 0,
      totalSteps: steps.length,
      createdAt: now,
      updatedAt: now,
    });

    // Insert all step records
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await ctx.db.insert("agentPlanSteps", {
        planId,
        stepIndex: i,
        toolName: step.toolName,
        toolDisplayName: toTitleCase(step.toolName),
        toolArgs: step.toolArgs,
        description: step.description,
        requiresApproval: step.requiresApproval,
        status: "pending",
      });
    }

    return { planId, messageId };
  },
});

/**
 * Update the top-level status of an agent plan.
 */
export const updatePlanStatus = internalMutation({
  args: {
    planId: v.id("agentPlans"),
    status: v.union(
      v.literal("created"),
      v.literal("executing"),
      v.literal("awaiting_approval"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, { planId, status, completedAt }) => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`agentPlan ${planId} not found`);
    }

    await ctx.db.patch(planId, {
      status,
      updatedAt: Date.now(),
      ...(completedAt !== undefined ? { completedAt } : {}),
    });
  },
});

/**
 * Update the status (and optional metadata) of a single step within a plan.
 */
export const updateStepStatus = internalMutation({
  args: {
    planId: v.id("agentPlans"),
    stepIndex: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("awaiting_approval"),
      v.literal("approved"),
      v.literal("completed"),
      v.literal("skipped"),
      v.literal("failed")
    ),
    toolCallId: v.optional(v.id("toolCalls")),
    resultSummary: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, { planId, stepIndex, status, ...rest }) => {
    const step = await ctx.db
      .query("agentPlanSteps")
      .withIndex("by_plan", (q) =>
        q.eq("planId", planId).eq("stepIndex", stepIndex)
      )
      .unique();

    if (!step) {
      throw new Error(
        `agentPlanStep not found for planId=${planId} stepIndex=${stepIndex}`
      );
    }

    const patch: Record<string, unknown> = { status };
    if (rest.toolCallId !== undefined) patch.toolCallId = rest.toolCallId;
    if (rest.resultSummary !== undefined) patch.resultSummary = rest.resultSummary;
    if (rest.errorMessage !== undefined) patch.errorMessage = rest.errorMessage;
    if (rest.startedAt !== undefined) patch.startedAt = rest.startedAt;
    if (rest.completedAt !== undefined) patch.completedAt = rest.completedAt;

    await ctx.db.patch(step._id, patch);
  },
});

/**
 * Approve the current awaiting_approval step (called from the frontend).
 */
export const approveStep = mutation({
  args: {
    planId: v.id("agentPlans"),
    stepIndex: v.number(),
  },
  handler: async (ctx, { planId, stepIndex }) => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`agentPlan ${planId} not found`);
    }
    if (plan.status !== "awaiting_approval") {
      throw new Error(
        `Plan ${planId} is not awaiting approval (status: ${plan.status})`
      );
    }
    if (plan.currentStepIndex !== stepIndex) {
      throw new Error(
        `stepIndex ${stepIndex} does not match currentStepIndex ${plan.currentStepIndex}`
      );
    }

    const step = await ctx.db
      .query("agentPlanSteps")
      .withIndex("by_plan", (q) =>
        q.eq("planId", planId).eq("stepIndex", stepIndex)
      )
      .unique();

    if (!step) {
      throw new Error(
        `agentPlanStep not found for planId=${planId} stepIndex=${stepIndex}`
      );
    }

    await ctx.db.patch(step._id, { status: "approved" });
  },
});

/**
 * Reject (skip) the current awaiting_approval step (called from the frontend).
 * Advances currentStepIndex; completes the plan if there are no more steps.
 */
export const rejectStep = mutation({
  args: {
    planId: v.id("agentPlans"),
    stepIndex: v.number(),
  },
  handler: async (ctx, { planId, stepIndex }) => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`agentPlan ${planId} not found`);
    }
    if (plan.status !== "awaiting_approval") {
      throw new Error(
        `Plan ${planId} is not awaiting approval (status: ${plan.status})`
      );
    }

    const step = await ctx.db
      .query("agentPlanSteps")
      .withIndex("by_plan", (q) =>
        q.eq("planId", planId).eq("stepIndex", stepIndex)
      )
      .unique();

    if (!step) {
      throw new Error(
        `agentPlanStep not found for planId=${planId} stepIndex=${stepIndex}`
      );
    }

    await ctx.db.patch(step._id, { status: "skipped" });

    const nextStepIndex = plan.currentStepIndex + 1;
    const now = Date.now();

    if (nextStepIndex >= plan.totalSteps) {
      await ctx.db.patch(planId, {
        status: "completed",
        currentStepIndex: nextStepIndex,
        completedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(planId, {
        status: "executing",
        currentStepIndex: nextStepIndex,
        updatedAt: now,
      });
    }
  },
});

/**
 * Cancel a plan and skip all pending / awaiting_approval steps.
 */
export const cancelPlan = mutation({
  args: {
    planId: v.id("agentPlans"),
  },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`agentPlan ${planId} not found`);
    }

    await ctx.db.patch(planId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    // Skip all steps that haven't finished yet
    const steps = await ctx.db
      .query("agentPlanSteps")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .collect();

    for (const step of steps) {
      if (step.status === "pending" || step.status === "awaiting_approval") {
        await ctx.db.patch(step._id, { status: "skipped" });
      }
    }
  },
});

/**
 * Advance the plan to the next step (internal).
 * Returns the new currentStepIndex, or null if the plan is now complete.
 */
export const advanceStep = internalMutation({
  args: {
    planId: v.id("agentPlans"),
  },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`agentPlan ${planId} not found`);
    }

    const nextStepIndex = plan.currentStepIndex + 1;
    const now = Date.now();

    if (nextStepIndex >= plan.totalSteps) {
      await ctx.db.patch(planId, {
        status: "completed",
        currentStepIndex: nextStepIndex,
        completedAt: now,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.patch(planId, {
      status: "executing",
      currentStepIndex: nextStepIndex,
      updatedAt: now,
    });

    return nextStepIndex;
  },
});
