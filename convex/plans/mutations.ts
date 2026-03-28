/**
 * Plan Management Mutations
 *
 * Base mutations for creating and updating execution plans.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * Create a new execution plan
 */
export const create = mutation({
  args: {
    type: v.union(
      v.literal("deep-research"),
      v.literal("shop"),
      v.literal("assimilation")
    ),
    content: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<Id<"executionPlans">> => {
    const now = Date.now();
    const planId = await ctx.db.insert("executionPlans", {
      type: args.type,
      status: "draft",
      content: args.content,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
    return planId;
  },
});

/**
 * Update plan content
 */
export const updateContent = mutation({
  args: {
    planId: v.id("executionPlans"),
    content: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<void> => {
    const { planId, ...updates } = args;

    const filteredUpdates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    await ctx.db.patch(planId, filteredUpdates);
  },
});

/**
 * Update plan status
 */
export const updateStatus = mutation({
  args: {
    planId: v.id("executionPlans"),
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.planId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete a plan
 */
export const deletePlan = mutation({
  args: {
    planId: v.id("executionPlans"),
  },
  handler: async (ctx, args): Promise<void> => {
    // Delete all approvals for this plan
    const approvals = await ctx.db
      .query("planApprovals")
      .withIndex("by_plan", (q) => q.eq("planId", args.planId))
      .collect();

    for (const approval of approvals) {
      await ctx.db.delete(approval._id);
    }

    // Delete the plan
    await ctx.db.delete(args.planId);
  },
});
