/**
 * Plan Management Queries
 *
 * Queries for retrieving execution plans and their approval status.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get plan by ID
 */
export const get = query({
  args: { id: v.id("executionPlans") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Get plans by status
 */
export const getByStatus = query({
  args: { status: v.string() },
  handler: async (ctx, { status }) => {
    return await ctx.db
      .query("executionPlans")
      .withIndex("by_status", (q) => q.eq("status", status as any))
      .collect();
  },
});

/**
 * Get plans by type
 */
export const getByType = query({
  args: { type: v.string() },
  handler: async (ctx, { type }) => {
    return await ctx.db
      .query("executionPlans")
      .withIndex("by_type", (q) => q.eq("type", type as any))
      .collect();
  },
});

/**
 * Get plans by status and type
 */
export const getByStatusAndType = query({
  args: {
    status: v.string(),
    type: v.string(),
  },
  handler: async (ctx, { status, type }) => {
    return await ctx.db
      .query("executionPlans")
      .withIndex("by_status_and_type", (q) =>
        q.eq("status", status as any).eq("type", type as any)
      )
      .collect();
  },
});

/**
 * Get recent plans ordered by creation time
 */
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    return await ctx.db
      .query("executionPlans")
      .withIndex("by_created")
      .order("desc")
      .take(limit);
  },
});

/**
 * Get approval record for a plan
 */
export const getApproval = query({
  args: { planId: v.id("executionPlans") },
  handler: async (ctx, { planId }) => {
    return await ctx.db
      .query("planApprovals")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .first();
  },
});

/**
 * Get all approvals by user
 */
export const getApprovalsByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("planApprovals")
      .withIndex("by_approved_by", (q) => q.eq("approvedBy", userId))
      .collect();
  },
});

/**
 * List all plans (for validation/testing)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("executionPlans").collect();
  },
});
