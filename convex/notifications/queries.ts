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
 * Check if any notifications exist after a given timestamp
 *
 * Used by the notification bell to show a red dot indicator.
 */
export const hasNewSince = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const newer = await ctx.db
      .query("notifications")
      .withIndex("by_created")
      .filter((q) => q.gt(q.field("createdAt"), since))
      .first();
    return newer !== null;
  },
});

/**
 * Get the last-seen timestamp from user preferences
 *
 * Returns 0 if no preferences have been saved yet.
 */
export const getLastSeen = query({
  args: {},
  handler: async (ctx) => {
    const prefs = await ctx.db.query("userPreferences").first();
    return prefs?.notificationsLastSeenAt ?? 0;
  },
});

/**
 * Check if user has seen the navigation tooltip
 *
 * Returns false if no preferences have been saved yet.
 */
export const getHasSeenNavTooltip = query({
  args: {},
  handler: async (ctx) => {
    const prefs = await ctx.db.query("userPreferences").first();
    return prefs?.hasSeenNavTooltip ?? false;
  },
});
