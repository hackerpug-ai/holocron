/**
 * Competitive Analysis Queries
 *
 * Read operations for competitive analysis sessions, competitors, and features.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export type SessionWithDetails = {
  session: Doc<"competitiveAnalysisSessions">;
  competitors: Doc<"competitiveAnalysisCompetitors">[];
  features: Doc<"competitiveAnalysisFeatures">[];
};

/**
 * Get a session by ID
 */
export const getSession = query({
  args: {
    sessionId: v.id("competitiveAnalysisSessions"),
  },
  handler: async (
    ctx,
    args
  ): Promise<Doc<"competitiveAnalysisSessions"> | null> => {
    return await ctx.db.get(args.sessionId);
  },
});

/**
 * Get a session along with all its competitors and features
 */
export const getSessionWithDetails = query({
  args: {
    sessionId: v.id("competitiveAnalysisSessions"),
  },
  handler: async (ctx, args): Promise<SessionWithDetails | null> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const competitors = await ctx.db
      .query("competitiveAnalysisCompetitors")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const features = await ctx.db
      .query("competitiveAnalysisFeatures")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return { session, competitors, features };
  },
});

/**
 * List all sessions, most recent first
 */
export const listSessions = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<Doc<"competitiveAnalysisSessions">[]> => {
    if (args.status) {
      return await ctx.db
        .query("competitiveAnalysisSessions")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(args.limit ?? 20);
    }

    return await ctx.db
      .query("competitiveAnalysisSessions")
      .withIndex("by_created")
      .order("desc")
      .take(args.limit ?? 20);
  },
});
