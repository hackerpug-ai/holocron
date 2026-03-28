import { v } from "convex/values";
import { mutation } from "../_generated/server";

// ============================================================
// Notifications Mutations
// ============================================================

/**
 * Mark a single notification as read
 *
 * Sets read:true on the given notification by ID.
 */
export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    const notification = await ctx.db.get(id);
    if (!notification) {
      throw new Error(`Notification ${id} not found`);
    }

    await ctx.db.patch(id, { read: true });

    return { success: true };
  },
});

/**
 * Mark all unread notifications as read
 *
 * Bulk updates all notifications where read===false to read:true.
 */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_unread", (q) => q.eq("read", false))
      .collect();

    for (const notification of unread) {
      await ctx.db.patch(notification._id, { read: true });
    }

    return { updated: unread.length };
  },
});

/**
 * Update the last-seen timestamp for notification bell
 *
 * Creates or updates the userPreferences singleton with the current time,
 * so the bell dot knows which notifications have been "seen".
 */
export const updateLastSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const prefs = await ctx.db.query("userPreferences").first();
    const now = Date.now();
    if (prefs) {
      await ctx.db.patch(prefs._id, { notificationsLastSeenAt: now, updatedAt: now });
    } else {
      await ctx.db.insert("userPreferences", { notificationsLastSeenAt: now, updatedAt: now });
    }
    return now;
  },
});
