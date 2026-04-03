/**
 * Flights Queries
 *
 * Read operations for flight sessions, routes, and price calendar entries.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

// ============================================================================
// Session Queries
// ============================================================================

/**
 * Get a flights session by ID
 */
export const getSession = query({
  args: {
    sessionId: v.id("flightsSessions"),
  },
  handler: async (ctx, args): Promise<Doc<"flightsSessions"> | null> => {
    return await ctx.db.get(args.sessionId);
  },
});

/**
 * Get a flights session with routes (sorted by price) and price calendar entries
 */
export const getSessionWithDetails = query({
  args: {
    sessionId: v.id("flightsSessions"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    session: Doc<"flightsSessions">;
    routes: Doc<"flightsRoutes">[];
    priceCalendar: Doc<"flightsPriceCalendar">[];
  } | null> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    // Fetch routes sorted by price (ascending)
    const routes = await ctx.db
      .query("flightsRoutes")
      .withIndex("by_price", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();

    // Fetch price calendar entries
    const priceCalendar = await ctx.db
      .query("flightsPriceCalendar")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return { session, routes, priceCalendar };
  },
});

/**
 * List all flights sessions, ordered by creation date descending
 */
export const listSessions = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"flightsSessions">[]> => {
    if (args.status) {
      return await ctx.db
        .query("flightsSessions")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(args.limit ?? 20);
    }

    return await ctx.db
      .query("flightsSessions")
      .withIndex("by_created")
      .order("desc")
      .take(args.limit ?? 20);
  },
});
