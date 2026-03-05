import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new conversation
 */
export const create = mutation({
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
 * Clear all conversations (for testing only - use with caution)
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const conversations = await ctx.db.query("conversations").collect();
    for (const conversation of conversations) {
      await ctx.db.delete(conversation._id);
    }
    return { deleted: conversations.length };
  },
});
