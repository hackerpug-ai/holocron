/**
 * AI ROI Analysis — Queries
 *
 * Read operations for aiRoiSessions, aiRoiOpportunities, and aiRoiEvidence.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

// ============================================================================
// Types
// ============================================================================

export type AiRoiSessionWithDetails = {
  session: Doc<"aiRoiSessions">;
  opportunities: Doc<"aiRoiOpportunities">[];
  evidence: Doc<"aiRoiEvidence">[];
};

// ============================================================================
// Session Queries
// ============================================================================

/**
 * Get a single AI ROI session by ID.
 */
export const getSession = query({
  args: {
    sessionId: v.id("aiRoiSessions"),
  },
  handler: async (ctx, args): Promise<Doc<"aiRoiSessions"> | null> => {
    return await ctx.db.get(args.sessionId);
  },
});

/**
 * Get a session with all associated opportunities (sorted by rank) and evidence.
 */
export const getSessionWithDetails = query({
  args: {
    sessionId: v.id("aiRoiSessions"),
  },
  handler: async (ctx, args): Promise<AiRoiSessionWithDetails | null> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const opportunities = await ctx.db
      .query("aiRoiOpportunities")
      .withIndex("by_rank", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Sort by rank ascending
    opportunities.sort((a, b) => a.rank - b.rank);

    const evidence = await ctx.db
      .query("aiRoiEvidence")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return { session, opportunities, evidence };
  },
});

/**
 * List all AI ROI sessions, ordered by creation time (newest first).
 */
export const listSessions = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"aiRoiSessions">[]> => {
    let q;

    if (args.status) {
      q = ctx.db
        .query("aiRoiSessions")
        .withIndex("by_status", (q) => q.eq("status", args.status!));
    } else {
      q = ctx.db
        .query("aiRoiSessions")
        .withIndex("by_created");
    }

    return await q.order("desc").take(args.limit ?? 20);
  },
});
