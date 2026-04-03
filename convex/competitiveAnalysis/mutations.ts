/**
 * Competitive Analysis Mutations
 *
 * CRUD operations for competitive analysis sessions, competitors, and features.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  createSessionArgsValidator,
  updateSessionArgsValidator,
  addCompetitorArgsValidator,
  addFeatureArgsValidator,
} from "./validators";

/**
 * Create a new competitive analysis session with status "pending"
 */
export const createSession = mutation({
  args: createSessionArgsValidator.fields,
  handler: async (ctx, args): Promise<Id<"competitiveAnalysisSessions">> => {
    const now = Date.now();
    return await ctx.db.insert("competitiveAnalysisSessions", {
      market: args.market,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update session fields (Porter ratings, market verdict, status, etc.)
 */
export const updateSession = mutation({
  args: updateSessionArgsValidator.fields,
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
 * Mark a session as completed and set completedAt timestamp
 */
export const completeSession = mutation({
  args: {
    sessionId: v.id("competitiveAnalysisSessions"),
    marketVerdict: v.optional(v.string()),
    sourceCount: v.optional(v.number()),
    documentId: v.optional(v.id("documents")),
    porterRivalry: v.optional(v.string()),
    porterNewEntrants: v.optional(v.string()),
    porterSubstitutes: v.optional(v.string()),
    porterBuyerPower: v.optional(v.string()),
    porterSupplierPower: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    const { sessionId, ...rest } = args;

    const patch: Record<string, unknown> = {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    };

    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch(sessionId, patch);
  },
});

/**
 * Mark a session as failed with an error reason
 */
export const failSession = mutation({
  args: {
    sessionId: v.id("competitiveAnalysisSessions"),
    errorReason: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.sessionId, {
      status: "failed",
      errorReason: args.errorReason,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Add a competitor profile to a session
 */
export const addCompetitor = mutation({
  args: addCompetitorArgsValidator.fields,
  handler: async (ctx, args): Promise<Id<"competitiveAnalysisCompetitors">> => {
    const { sessionId, ...competitorData } = args;
    return await ctx.db.insert("competitiveAnalysisCompetitors", {
      sessionId,
      name: competitorData.name,
      focus: competitorData.focus,
      founded: competitorData.founded,
      funding: competitorData.funding,
      strengths: competitorData.strengths,
      weaknesses: competitorData.weaknesses,
      url: competitorData.url,
      createdAt: Date.now(),
    });
  },
});

/**
 * Add a feature comparison row to a session
 */
export const addFeature = mutation({
  args: addFeatureArgsValidator.fields,
  handler: async (ctx, args): Promise<Id<"competitiveAnalysisFeatures">> => {
    return await ctx.db.insert("competitiveAnalysisFeatures", {
      sessionId: args.sessionId,
      featureName: args.featureName,
      ourSupport: args.ourSupport,
      competitorSupport: args.competitorSupport,
      createdAt: Date.now(),
    });
  },
});
