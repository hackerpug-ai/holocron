import { v } from "convex/values";
import { query } from "../_generated/server";

// ============================================================
// Notifications Queries
// ============================================================

/**
 * List unread notifications
 *
 * Returns up to 10 notifications where read===false,
 * ordered by createdAt descending (most recent first).
 */
export const listUnread = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_unread", (q) => q.eq("read", false))
      .order("desc")
      .take(10);
  },
});

/**
 * List recent notifications
 *
 * Returns the last N notifications ordered by createdAt descending.
 * Defaults to 20 if no limit is provided.
 */
export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_created")
      .order("desc")
      .take(limit ?? 20);
  },
});
