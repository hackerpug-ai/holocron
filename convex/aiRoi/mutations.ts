/**
 * AI ROI Analysis — Mutations
 *
 * CRUD operations for aiRoiSessions, aiRoiOpportunities, and aiRoiEvidence.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

// ============================================================================
// Session Mutations
// ============================================================================

/**
 * Create a new AI ROI analysis session.
 * Initializes with status "pending".
 */
export const createSession = mutation({
  args: {
    company: v.string(),
    documentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args): Promise<Id<"aiRoiSessions">> => {
    const now = Date.now();
    const sessionId = await ctx.db.insert("aiRoiSessions", {
      company: args.company,
      status: "pending",
      documentId: args.documentId,
      createdAt: now,
      updatedAt: now,
    });
    return sessionId;
  },
});

/**
 * Update mutable fields on an AI ROI session.
 * Only provided (non-undefined) fields are written.
 */
export const updateSession = mutation({
  args: {
    sessionId: v.id("aiRoiSessions"),
    status: v.optional(v.string()),
    executiveSummary: v.optional(v.string()),
    sourceCount: v.optional(v.number()),
    topOpportunityName: v.optional(v.string()),
    topOpportunitySavings: v.optional(v.string()),
    topOpportunityConfidence: v.optional(v.string()),
    documentId: v.optional(v.id("documents")),
    errorReason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const { sessionId, ...updates } = args;

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
 * Mark an AI ROI session as completed.
 * Sets status to "completed" and stamps completedAt.
 */
export const completeSession = mutation({
  args: {
    sessionId: v.id("aiRoiSessions"),
    executiveSummary: v.optional(v.string()),
    sourceCount: v.optional(v.number()),
    topOpportunityName: v.optional(v.string()),
    topOpportunitySavings: v.optional(v.string()),
    topOpportunityConfidence: v.optional(v.string()),
    documentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args): Promise<void> => {
    const { sessionId, ...rest } = args;
    const now = Date.now();

    const updates: Record<string, unknown> = {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    };

    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }

    await ctx.db.patch(sessionId, updates);
  },
});

/**
 * Mark an AI ROI session as failed with an error reason.
 */
export const failSession = mutation({
  args: {
    sessionId: v.id("aiRoiSessions"),
    errorReason: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      status: "failed",
      errorReason: args.errorReason,
      updatedAt: now,
    });
  },
});

// ============================================================================
// Opportunity Mutations
// ============================================================================

/**
 * Add a ranked opportunity to an AI ROI session.
 */
export const addOpportunity = mutation({
  args: {
    sessionId: v.id("aiRoiSessions"),
    rank: v.number(),
    name: v.string(),
    confidence: v.string(),
    currentProcess: v.optional(v.string()),
    proposedAutomation: v.optional(v.string()),
    currentTimePerWeek: v.optional(v.string()),
    automatedTimePerWeek: v.optional(v.string()),
    currentCostPerYear: v.optional(v.string()),
    automatedCostPerYear: v.optional(v.string()),
    savingsPerYear: v.optional(v.string()),
    errorRateBefore: v.optional(v.string()),
    errorRateAfter: v.optional(v.string()),
    phase: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"aiRoiOpportunities">> => {
    const { sessionId, ...opportunityData } = args;
    const opportunityId = await ctx.db.insert("aiRoiOpportunities", {
      sessionId,
      ...opportunityData,
      createdAt: Date.now(),
    });
    return opportunityId;
  },
});

// ============================================================================
// Evidence Mutations
// ============================================================================

/**
 * Add an evidence row to an AI ROI session.
 */
export const addEvidence = mutation({
  args: {
    sessionId: v.id("aiRoiSessions"),
    opportunityId: v.optional(v.id("aiRoiOpportunities")),
    claim: v.string(),
    tier: v.number(),
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    challengeStatus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"aiRoiEvidence">> => {
    const { sessionId, ...evidenceData } = args;
    const evidenceId = await ctx.db.insert("aiRoiEvidence", {
      sessionId,
      ...evidenceData,
      createdAt: Date.now(),
    });
    return evidenceId;
  },
});
