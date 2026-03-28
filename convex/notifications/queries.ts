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

/**
 * Get the timestamp when the user last viewed the notification list.
 * Returns 0 if never seen (treats all notifications as new).
 */
export const getLastSeen = query({
  args: {},
  returns: v.number(),
  handler: async (_ctx) => {
    // Stub: returns 0 until user preferences tracking is implemented
    return 0;
  },
});

/**
 * Check if there are any notifications newer than a given timestamp.
 * Used by the notification bell to show/hide the new-items dot.
 */
export const hasNewSince = query({
  args: { since: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { since }) => {
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_created")
      .order("desc")
      .first();
    if (!recent) return false;
    return recent.createdAt > since;
  },
});
