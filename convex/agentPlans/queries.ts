import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get a single agent plan by ID.
 */
export const get = query({
  args: { id: v.id("agentPlans") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Get all steps for an agent plan, ordered by stepIndex ascending.
 */
export const getSteps = query({
  args: { planId: v.id("agentPlans") },
  handler: async (ctx, { planId }) => {
    return await ctx.db
      .query("agentPlanSteps")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .order("asc")
      .collect();
  },
});

/**
 * Get the active plan (status "executing" or "awaiting_approval") for a conversation.
 * Returns null if no active plan exists.
 */
export const getActivePlan = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const executing = await ctx.db
      .query("agentPlans")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .filter((q) => q.eq(q.field("status"), "executing"))
      .first();

    if (executing) return executing;

    const awaitingApproval = await ctx.db
      .query("agentPlans")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .filter((q) => q.eq(q.field("status"), "awaiting_approval"))
      .first();

    return awaitingApproval ?? null;
  },
});
