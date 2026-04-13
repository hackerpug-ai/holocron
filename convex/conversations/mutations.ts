import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new conversation
 */
export const create = mutation({
  args: {
    title: v.optional(v.string()),
    lastMessagePreview: v.optional(v.string()),
  },
  handler: async (ctx, { title = "New Chat", lastMessagePreview }) => {
    const now = Date.now();
    return await ctx.db.insert("conversations", {
      title,
      lastMessagePreview,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a conversation's title
 * @param titleSetByUser - If true, marks the title as user-set (prevents auto-generation)
 */
export const update = mutation({
  args: {
    id: v.id("conversations"),
    title: v.string(),
    titleSetByUser: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, title, titleSetByUser }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`Conversation ${id} not found`);
    }

    await ctx.db.patch(id, {
      title,
      updatedAt: Date.now(),
      // Only set titleSetByUser if explicitly passed (user is editing)
      ...(titleSetByUser !== undefined && { titleSetByUser }),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Remove a conversation (cascades to chat messages)
 */
export const remove = mutation({
  args: {
    id: v.id("conversations"),
  },
  handler: async (ctx, { id }) => {
    // Cascade delete all chat messages
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", id))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    await ctx.db.delete(id);
    return { success: true };
  },
});

/**
 * Insert a conversation from migration (preserves IDs)
 */
export const insertFromMigration = mutation({
  args: {
    title: v.string(),
    lastMessagePreview: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("conversations", args);
  },
});

/**
 * Update conversation updatedAt timestamp (used when messages are added)
 */
export const touch = mutation({
  args: {
    id: v.id("conversations"),
    lastMessagePreview: v.optional(v.string()),
  },
  handler: async (ctx, { id, lastMessagePreview }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`Conversation ${id} not found`);
    }

    await ctx.db.patch(id, {
      updatedAt: Date.now(),
      ...(lastMessagePreview !== undefined && { lastMessagePreview }),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Clear all conversations (for testing only - use with caution)
 * Requires ALLOW_CLEAR_ALL=true environment variable to be set.
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.ALLOW_CLEAR_ALL !== "true") {
      throw new Error(
        "clearAll is disabled. Set ALLOW_CLEAR_ALL=true to enable."
      );
    }
    const conversations = await ctx.db.query("conversations").collect();
    for (const conversation of conversations) {
      await ctx.db.delete(conversation._id);
    }
    return { deleted: conversations.length };
  },
});

// ---------------------------------------------------------------------------
// Pending Intent State (CLR-001)
// ---------------------------------------------------------------------------

const PENDING_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Check whether a pending intent has expired.
 * Returns true if pendingSince is undefined or older than 30 minutes.
 */
export function isPendingExpired(pendingSince: number | undefined): boolean {
  if (pendingSince === undefined) return true;
  return Date.now() - pendingSince > PENDING_EXPIRY_MS;
}

export const setPendingIntent = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    intent: v.string(),
    queryShape: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { conversationId, intent, queryShape }) => {
    const conv = await ctx.db.get(conversationId);
    if (!conv) throw new Error(`Conversation ${conversationId} not found`);
    await ctx.db.patch(conversationId, {
      pendingIntent: intent,
      pendingQueryShape: queryShape,
      pendingSince: Date.now(),
    });
    return null;
  },
});

export const clearPendingIntent = internalMutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, { conversationId }) => {
    const conv = await ctx.db.get(conversationId);
    if (!conv) throw new Error(`Conversation ${conversationId} not found`);
    await ctx.db.patch(conversationId, {
      pendingIntent: undefined,
      pendingQueryShape: undefined,
      pendingSince: undefined,
    });
    return null;
  },
});
