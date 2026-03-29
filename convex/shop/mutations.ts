/**
 * Shop Session and Listing Mutations
 *
 * Handles CRUD operations for shop sessions and listings.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

// ============================================================================
// Planning Phase Mutations
// ============================================================================

/**
 * Generate shop plan
 *
 * Creates a retailer dispatch plan before executing the search.
 * Returns the plan ID for UI approval workflow.
 */
export const generateShopPlan = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    query: v.string(),
    retailers: v.optional(v.array(v.string())),
    condition: v.optional(v.string()),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"executionPlans">> => {
    const now = Date.now();

    // Default retailers if not provided
    const DEFAULT_RETAILERS = ["eBay", "Amazon", "Craigslist"];
    const targetRetailers = args.retailers?.length ? args.retailers : DEFAULT_RETAILERS;

    // Build plan content
    const content = {
      title: `Shop: ${args.query}`,
      description: `Find best deals for "${args.query}" across ${targetRetailers.length} retailers`,
      query: args.query,
      condition: args.condition ?? "any",
      priceRange: {
        min: args.priceMin,
        max: args.priceMax,
      },
      retailers: targetRetailers.map((retailer) => ({
        name: retailer,
        enabled: true,
        priority: getRetailerPriority(retailer),
      })),
      estimatedSteps: targetRetailers.length + 2,
      estimatedDurationMs: estimateShopDuration(targetRetailers.length),
    };

    // Create execution plan in draft status
    const planId = await ctx.db.insert("executionPlans", {
      type: "shop",
      status: "draft",
      content,
      metadata: {
        conversationId: args.conversationId,
        query: args.query,
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    return planId;
  },
});

/**
 * Request shop plan approval
 *
 * Submits the draft plan for user approval.
 * Transitions plan status from: draft -> pending
 */
export const requestShopPlanApproval = mutation({
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
 * Approve shop plan
 *
 * Marks a pending plan as approved.
 * Transitions plan status from: pending -> approved
 */
export const approveShopPlan = mutation({
  args: {
    planId: v.id("executionPlans"),
    userId: v.string(),
  },
  handler: async (ctx, { planId, userId }): Promise<{ success: boolean; status: string }> => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Validate plan is in pending status
    if (plan.status !== "pending") {
      throw new Error(`Cannot approve plan in ${plan.status} status`);
    }

    // Create approval record
    await ctx.db.insert("planApprovals", {
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

    return { success: true, status: "approved" };
  },
});

/**
 * Reject shop plan
 *
 * Marks a pending plan as rejected with an optional reason.
 * Transitions plan status from: pending -> rejected
 */
export const rejectShopPlan = mutation({
  args: {
    planId: v.id("executionPlans"),
    userId: v.string(),
    rejectionReason: v.optional(v.string()),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, { planId, userId, rejectionReason, feedback }): Promise<{ success: boolean; status: string }> => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Validate plan is in pending status
    if (plan.status !== "pending") {
      throw new Error(`Cannot reject plan in ${plan.status} status`);
    }

    // Create rejection record
    await ctx.db.insert("planApprovals", {
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

    return { success: true, status: "rejected" };
  },
});

/**
 * Update shop plan execution status
 *
 * Updates plan status during execution.
 * Called by the shop search executor to track progress.
 */
export const updateShopPlanExecutionStatus = mutation({
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
    currentStepIndex: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, { planId, status, currentStepIndex, errorMessage }): Promise<void> => {
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Update plan status and progress
    await ctx.db.patch(planId, {
      status,
      ...(currentStepIndex !== undefined && { currentStepIndex }),
      ...(errorMessage !== undefined && { errorMessage }),
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get retailer priority for search ordering
 */
function getRetailerPriority(retailer: string): number {
  const priorities: Record<string, number> = {
    "eBay": 1,
    "Amazon": 2,
    "Craigslist": 3,
    "Newegg": 4,
    "Best Buy": 5,
    "B&H Photo": 6,
    "Back Market": 7,
    "Walmart": 8,
  };
  return priorities[retailer] ?? 99;
}

/**
 * Estimate shop duration based on retailer count
 */
function estimateShopDuration(retailerCount: number): number {
  // Base time: 30 seconds per retailer
  const msPerSecond = 1000;
  return retailerCount * 30 * msPerSecond;
}

// ============================================================================
// Shop Session and Listing Mutations
// ============================================================================

/**
 * Create a new shop session
 *
 * Supports both direct execution and plan-based execution.
 */
export const createShopSession = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    query: v.string(),
    condition: v.optional(v.string()),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
    retailers: v.optional(v.array(v.string())),
    planId: v.optional(v.id("executionPlans")),
    verifiedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"shopSessions">> => {
    const now = Date.now();
    const sessionId = await ctx.db.insert("shopSessions", {
      conversationId: args.conversationId,
      query: args.query,
      condition: args.condition,
      priceMin: args.priceMin,
      priceMax: args.priceMax,
      retailers: args.retailers,
      planId: args.planId,
      verifiedOnly: args.verifiedOnly,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return sessionId;
  },
});

/**
 * Update shop session status and metadata
 */
export const updateShopSession = mutation({
  args: {
    sessionId: v.id("shopSessions"),
    status: v.optional(v.string()),
    totalListings: v.optional(v.number()),
    bestDealId: v.optional(v.id("shopListings")),
    errorReason: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const { sessionId, ...updates } = args;

    // Filter out undefined values
    const filteredUpdates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    await ctx.db.patch(sessionId, filteredUpdates);
  },
});

/**
 * Complete a shop session
 */
export const completeShopSession = mutation({
  args: {
    sessionId: v.id("shopSessions"),
    status: v.string(),
    totalListings: v.optional(v.number()),
    bestDealId: v.optional(v.id("shopListings")),
    errorReason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      status: args.status,
      totalListings: args.totalListings,
      bestDealId: args.bestDealId,
      errorReason: args.errorReason,
      completedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Batch create shop listings
 *
 * Efficiently inserts multiple listings in a single transaction.
 */
export const batchCreateListings = mutation({
  args: {
    sessionId: v.id("shopSessions"),
    listings: v.array(
      v.object({
        title: v.string(),
        price: v.number(),
        originalPrice: v.optional(v.number()),
        currency: v.string(),
        condition: v.string(),
        retailer: v.string(),
        seller: v.optional(v.string()),
        sellerRating: v.optional(v.number()),
        url: v.string(),
        imageUrl: v.optional(v.string()),
        inStock: v.optional(v.boolean()),
        productHash: v.string(),
        isDuplicate: v.boolean(),
        dealScore: v.optional(v.number()),
        trustTier: v.optional(v.number()),
        sellerTrustScore: v.optional(v.number()),
        isVerifiedSeller: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args): Promise<Id<"shopListings">[]> => {
    const now = Date.now();
    const listingIds: Id<"shopListings">[] = [];

    for (const listing of args.listings) {
      const id = await ctx.db.insert("shopListings", {
        sessionId: args.sessionId,
        ...listing,
        createdAt: now,
      });
      listingIds.push(id);
    }

    return listingIds;
  },
});

/**
 * Create a single shop listing
 */
export const createListing = mutation({
  args: {
    sessionId: v.id("shopSessions"),
    title: v.string(),
    price: v.number(),
    originalPrice: v.optional(v.number()),
    currency: v.string(),
    condition: v.string(),
    retailer: v.string(),
    seller: v.optional(v.string()),
    sellerRating: v.optional(v.number()),
    url: v.string(),
    imageUrl: v.optional(v.string()),
    inStock: v.optional(v.boolean()),
    productHash: v.string(),
    isDuplicate: v.boolean(),
    dealScore: v.optional(v.number()),
    trustTier: v.optional(v.number()),
    sellerTrustScore: v.optional(v.number()),
    isVerifiedSeller: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"shopListings">> => {
    const now = Date.now();
    const { sessionId, ...listingData } = args;

    const listingId = await ctx.db.insert("shopListings", {
      sessionId,
      ...listingData,
      createdAt: now,
    });

    return listingId;
  },
});

/**
 * Delete a shop session and all its listings
 */
export const deleteShopSession = mutation({
  args: {
    sessionId: v.id("shopSessions"),
  },
  handler: async (ctx, args): Promise<void> => {
    // Delete all listings for this session
    const listings = await ctx.db
      .query("shopListings")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const listing of listings) {
      await ctx.db.delete(listing._id);
    }

    // Delete the session
    await ctx.db.delete(args.sessionId);
  },
});
