import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new chat message
 */
export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    content: v.string(),
    messageType: v.union(
      v.literal("text"),
      v.literal("slash_command"),
      v.literal("result_card"),
      v.literal("progress"),
      v.literal("error")
    ),
    cardData: v.optional(v.any()),
    sessionId: v.optional(v.id("researchSessions")),
    documentId: v.optional(v.id("documents")),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chatMessages", {
      ...args,
      createdAt: args.createdAt ?? Date.now(),
    });
  },
});

/**
 * Update a chat message
 */
export const update = mutation({
  args: {
    id: v.id("chatMessages"),
    content: v.optional(v.string()),
    messageType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("slash_command"),
        v.literal("result_card"),
        v.literal("progress"),
        v.literal("error")
      )
    ),
    cardData: v.optional(v.any()),
    sessionId: v.optional(v.id("researchSessions")),
    documentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, { id, ...updates }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`ChatMessage ${id} not found`);
    }

    await ctx.db.patch(id, updates);

    return await ctx.db.get(id);
  },
});

/**
 * Insert a chat message from migration
 */
export const insertFromMigration = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    content: v.string(),
    messageType: v.union(
      v.literal("text"),
      v.literal("slash_command"),
      v.literal("result_card"),
      v.literal("progress"),
      v.literal("error")
    ),
    cardData: v.optional(v.any()),
    sessionId: v.optional(v.id("researchSessions")),
    documentId: v.optional(v.id("documents")),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chatMessages", args);
  },
});

/**
 * Clear all chat messages (for testing only - use with caution)
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db.query("chatMessages").collect();
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    return { deleted: messages.length };
  },
});
