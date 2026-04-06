import { mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { toTitleCase } from "../lib/strings";
import { TOOLS_REQUIRING_APPROVAL, VALID_TOOL_NAMES } from "./toolConfig";

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

    // Validate each step's toolName against the server-side allowlist.
    // Reject unknown tool names immediately with a clear error — do not let
    // them silently succeed via the default case in the tool executor.
    for (const step of steps) {
      if (!VALID_TOOL_NAMES.has(step.toolName)) {
        throw new Error(
          `Unknown tool name: "${step.toolName}". ` +
          `Valid tools are: ${[...VALID_TOOL_NAMES].sort().join(", ")}`
        );
      }
    }

    // Override each step's requiresApproval using the server-side constant map.
    // The LLM value is discarded — this prevents prompt-injection bypasses.
    const secureSteps = steps.map((step) => ({
      ...step,
      requiresApproval: TOOLS_REQUIRING_APPROVAL.has(step.toolName),
    }));

    // Insert the plan record first so we have a planId for cardData on the message.
    // We use a two-step approach: insert plan → insert message with cardData → patch plan.
    //
    // Convex does not support forward-referencing IDs, so we insert the plan without
    // a messageId, create the chat message (with plan_id in cardData), then patch
    // the plan with the real messageId.
    //
    // Step 1: Insert the plan record (messageId omitted; back-patched below)
    const planId = await ctx.db.insert("agentPlans", {
      conversationId,
      title,
      status: "created",
      currentStepIndex: 0,
      totalSteps: secureSteps.length,
      createdAt: now,
      updatedAt: now,
    });

    // Step 2: Insert the chat message WITH cardData so consumers see plan_id
    const messageId = await ctx.db.insert("chatMessages", {
      conversationId,
      role: "agent",
      content: `I've created a plan: ${title}`,
      messageType: "agent_plan",
      cardData: { plan_id: planId },
      createdAt: now,
    });

    // Step 3: Back-patch the plan record with the real messageId
    await ctx.db.patch(planId, { messageId });

    // Insert all step records using secureSteps (requiresApproval already overridden)
    for (let i = 0; i < secureSteps.length; i++) {
      const step = secureSteps[i];
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

    // Concurrency guard: only allow approval when step is in an approvable state.
    // If step.status is already "approved", "running", or "completed", a concurrent
    // call already processed this step — return early to prevent double-execution.
    if (
      step.status !== "awaiting_approval" &&
      step.status !== "pending"
    ) {
      return;
    }

    await ctx.db.patch(step._id, { status: "approved" });

    // Resume plan execution now that the step is approved
    await ctx.scheduler.runAfter(
      0,
      internal.agentPlans.actions.resumeAfterApproval,
      { planId },
    );
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
    if (plan.currentStepIndex !== stepIndex) {
      throw new Error(
        `Step index mismatch: expected ${plan.currentStepIndex}, got ${stepIndex}`
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
      // Last step rejected — complete the plan and clear agentBusy
      await ctx.db.patch(planId, {
        status: "completed",
        currentStepIndex: nextStepIndex,
        completedAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(plan.conversationId, {
        agentBusy: false,
        agentBusySince: undefined,
      });
    } else {
      // More steps remain — advance, clear agentBusy, then schedule next step
      await ctx.db.patch(planId, {
        status: "executing",
        currentStepIndex: nextStepIndex,
        updatedAt: now,
      });
      await ctx.db.patch(plan.conversationId, {
        agentBusy: false,
        agentBusySince: undefined,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.agentPlans.actions.executePlanStep,
        { planId },
      );
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

    const now = Date.now();
    await ctx.db.patch(planId, {
      status: "cancelled",
      updatedAt: now,
    });

    // Clear agentBusy on the conversation so the input is not locked.
    // This handles the case where a step was mid-run when the plan was cancelled.
    await ctx.db.patch(plan.conversationId, {
      agentBusy: false,
      agentBusySince: undefined,
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

    // Guard: if the plan was cancelled or failed while a step was running,
    // do not overwrite that terminal status with "completed" or "executing".
    if (plan.status === "cancelled" || plan.status === "failed") {
      return null;
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
