/**
 * Revenue Validation Mutations
 *
 * CRUD mutations for revenueValidationSessions, revenueValidationEvidence,
 * and revenueValidationCompetitors tables.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  createSessionArgsValidator,
  updateSessionArgsValidator,
  addEvidenceArgsValidator,
  addCompetitorArgsValidator,
} from "./validators";

// ── Sessions ──────────────────────────────────────────────────────────────────

/**
 * Create a new revenue validation session with status "pending".
 */
export const createSession = mutation({
  args: createSessionArgsValidator.fields,
  handler: async (ctx, args): Promise<Id<"revenueValidationSessions">> => {
    const now = Date.now();
    return await ctx.db.insert("revenueValidationSessions", {
      productName: args.productName,
      codebaseUrl: args.codebaseUrl,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update session fields (scores, verdict, market sizing, etc.).
 */
export const updateSession = mutation({
  args: updateSessionArgsValidator.fields,
  handler: async (ctx, args): Promise<void> => {
    const { sessionId, ...updates } = args;

    // Filter out undefined values before patching
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch(sessionId, patch);
  },
});

/**
 * Mark a session as completed and set completedAt timestamp.
 */
export const completeSession = mutation({
  args: {
    sessionId: v.id("revenueValidationSessions"),
    verdict: v.optional(v.union(v.literal("GO"), v.literal("CAUTION"), v.literal("NO-GO"))),
    executiveSummary: v.optional(v.string()),
    documentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      status: "completed",
      ...(args.verdict !== undefined && { verdict: args.verdict }),
      ...(args.executiveSummary !== undefined && { executiveSummary: args.executiveSummary }),
      ...(args.documentId !== undefined && { documentId: args.documentId }),
      completedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Mark a session as failed with an error reason.
 */
export const failSession = mutation({
  args: {
    sessionId: v.id("revenueValidationSessions"),
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

// ── Evidence ──────────────────────────────────────────────────────────────────

/**
 * Add an evidence row to a session.
 */
export const addEvidence = mutation({
  args: addEvidenceArgsValidator.fields,
  handler: async (ctx, args): Promise<Id<"revenueValidationEvidence">> => {
    return await ctx.db.insert("revenueValidationEvidence", {
      sessionId: args.sessionId,
      claim: args.claim,
      tier: args.tier,
      sourceTitle: args.sourceTitle,
      sourceUrl: args.sourceUrl,
      dimension: args.dimension,
      challengeStatus: args.challengeStatus,
      createdAt: Date.now(),
    });
  },
});

// ── Competitors ───────────────────────────────────────────────────────────────

/**
 * Add a competitor row to a session.
 */
export const addCompetitor = mutation({
  args: addCompetitorArgsValidator.fields,
  handler: async (ctx, args): Promise<Id<"revenueValidationCompetitors">> => {
    return await ctx.db.insert("revenueValidationCompetitors", {
      sessionId: args.sessionId,
      name: args.name,
      pricing: args.pricing,
      differentiator: args.differentiator,
      url: args.url,
      createdAt: Date.now(),
    });
  },
});
