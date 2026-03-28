/**
 * Plan Confirmation Service
 *
 * Handles the approval workflow for execution plans.
 * Workflow: draft -> pending -> approved/rejected -> executing
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * Request plan approval
 *
 * Submits a draft plan for user approval.
 * Transitions plan status from: draft -> pending
 *
 * AC-1: Draft plan -> Request approval -> Status becomes pending
 */
export const requestPlanApproval = mutation({
  args: {
    planId: v.id("executionPlans"),
  },
  handler: async (ctx, { planId }): Promise<{ success: boolean; status: string }> => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Validate plan is in draft status
    if (plan.status !== "draft") {
      throw new Error(`Cannot request approval for plan in ${plan.status} status`);
    }

    // Update plan status to pending
    await ctx.db.patch(planId, {
      status: "pending",
      updatedAt: Date.now(),
    });

    return { success: true, status: "pending" };
  },
});

/**
 * Approve plan
 *
 * Marks a pending plan as approved and creates an approval record.
 * Transitions plan status from: pending -> approved
 *
 * AC-2: Pending plan -> Approve -> Status becomes approved, approval record created
 */
export const approvePlan = mutation({
  args: {
    planId: v.id("executionPlans"),
    userId: v.string(),
  },
  handler: async (ctx, { planId, userId }): Promise<{ success: boolean; approvalId: Id<"planApprovals"> }> => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Validate plan is in pending status
    if (plan.status !== "pending") {
      throw new Error(`Cannot approve plan in ${plan.status} status`);
    }

    // Create approval record
    const approvalId = await ctx.db.insert("planApprovals", {
      planId,
      approvedBy: userId,
      approvedAt: Date.now(),
      decision: "approved",
    });

    // Update plan status to approved
    await ctx.db.patch(planId, {
      status: "approved",
      updatedAt: Date.now(),
    });

    return { success: true, approvalId };
  },
});

/**
 * Reject plan
 *
 * Marks a pending plan as rejected with an optional reason.
 * Transitions plan status from: pending -> rejected
 *
 * AC-3: Pending plan -> Reject -> Status becomes rejected, reason stored
 */
export const rejectPlan = mutation({
  args: {
    planId: v.id("executionPlans"),
    userId: v.string(),
    rejectionReason: v.optional(v.string()),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, { planId, userId, rejectionReason, feedback }): Promise<{ success: boolean; approvalId: Id<"planApprovals"> }> => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Validate plan is in pending status
    if (plan.status !== "pending") {
      throw new Error(`Cannot reject plan in ${plan.status} status`);
    }

    // Create rejection record
    const approvalId = await ctx.db.insert("planApprovals", {
      planId,
      approvedBy: userId,
      approvedAt: Date.now(),
      decision: "rejected",
      rejectionReason,
      feedback,
    });

    // Update plan status to rejected
    await ctx.db.patch(planId, {
      status: "rejected",
      updatedAt: Date.now(),
    });

    return { success: true, approvalId };
  },
});

/**
 * Modify plan
 *
 * Updates a plan's content with user modifications.
 * Can be called on draft or rejected plans to incorporate feedback.
 *
 * AC-4: Draft/rejected plan -> Modify -> Content updated, status reset to draft
 */
export const modifyPlan = mutation({
  args: {
    planId: v.id("executionPlans"),
    modifications: v.any(),
  },
  handler: async (ctx, { planId, modifications }): Promise<{ success: boolean; status: string }> => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Validate plan is in a modifiable state
    if (plan.status !== "draft" && plan.status !== "rejected") {
      throw new Error(`Cannot modify plan in ${plan.status} status`);
    }

    // Update plan content and reset to draft
    await ctx.db.patch(planId, {
      content: modifications,
      status: "draft",
      updatedAt: Date.now(),
    });

    return { success: true, status: "draft" };
  },
});

/**
 * Start plan execution
 *
 * Transitions an approved plan to executing status.
 * Called by the execution engine when starting plan execution.
 *
 * AC-5: Approved plan -> Start execution -> Status becomes executing
 */
export const startExecution = mutation({
  args: {
    planId: v.id("executionPlans"),
  },
  handler: async (ctx, { planId }): Promise<{ success: boolean; status: string }> => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Validate plan is approved
    if (plan.status !== "approved") {
      throw new Error(`Cannot start execution for plan in ${plan.status} status`);
    }

    // Update plan status to executing
    await ctx.db.patch(planId, {
      status: "executing",
      updatedAt: Date.now(),
    });

    return { success: true, status: "executing" };
  },
});

/**
 * Complete plan execution
 *
 * Marks an executing plan as completed.
 *
 * AC-6: Executing plan -> Complete -> Status becomes completed
 */
export const completeExecution = mutation({
  args: {
    planId: v.id("executionPlans"),
  },
  handler: async (ctx, { planId }): Promise<{ success: boolean; status: string }> => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Validate plan is executing
    if (plan.status !== "executing") {
      throw new Error(`Cannot complete plan in ${plan.status} status`);
    }

    // Update plan status to completed
    await ctx.db.patch(planId, {
      status: "completed",
      updatedAt: Date.now(),
    });

    return { success: true, status: "completed" };
  },
});

/**
 * Fail plan execution
 *
 * Marks an executing plan as failed.
 *
 * AC-7: Executing plan -> Fail -> Status becomes failed
 */
export const failExecution = mutation({
  args: {
    planId: v.id("executionPlans"),
  },
  handler: async (ctx, { planId }): Promise<{ success: boolean; status: string }> => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Validate plan is executing
    if (plan.status !== "executing") {
      throw new Error(`Cannot fail plan in ${plan.status} status`);
    }

    // Update plan status to failed
    await ctx.db.patch(planId, {
      status: "failed",
      updatedAt: Date.now(),
    });

    return { success: true, status: "failed" };
  },
});
