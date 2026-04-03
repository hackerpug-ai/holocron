/**
 * Revenue Validation Queries
 *
 * Read operations for revenue validation sessions, evidence, and competitors.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionWithDetails = {
  session: Doc<"revenueValidationSessions">;
  evidence: Doc<"revenueValidationEvidence">[];
  competitors: Doc<"revenueValidationCompetitors">[];
};

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Get a revenue validation session by ID.
 */
export const getSession = query({
  args: {
    sessionId: v.id("revenueValidationSessions"),
  },
  handler: async (ctx, args): Promise<Doc<"revenueValidationSessions"> | null> => {
    return await ctx.db.get(args.sessionId);
  },
});

/**
 * Get a session with all its evidence and competitors.
 */
export const getSessionWithDetails = query({
  args: {
    sessionId: v.id("revenueValidationSessions"),
  },
  handler: async (ctx, args): Promise<SessionWithDetails | null> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const evidence = await ctx.db
      .query("revenueValidationEvidence")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const competitors = await ctx.db
      .query("revenueValidationCompetitors")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return { session, evidence, competitors };
  },
});

/**
 * List all sessions ordered by most recent first.
 */
export const listSessions = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"revenueValidationSessions">[]> => {
    if (args.status) {
      return await ctx.db
        .query("revenueValidationSessions")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(args.limit ?? 20);
    }

    return await ctx.db
      .query("revenueValidationSessions")
      .withIndex("by_created")
      .order("desc")
      .take(args.limit ?? 20);
  },
});
