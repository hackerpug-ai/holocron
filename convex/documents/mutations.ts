import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new document (for testing and future use)
 */
export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    category: v.string(),
    filePath: v.optional(v.string()),
    fileType: v.optional(v.string()),
    status: v.optional(v.string()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
    researchType: v.optional(v.string()),
    iterations: v.optional(v.number()),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("documents", {
      ...args,
      createdAt: now,
    });
  },
});

/**
 * Insert a document with embedding (used by migration script)
 */
export const insertFromMigration = mutation({
  args: {
    title: v.string(),
    content: v.optional(v.string()),
    category: v.string(),
    filePath: v.optional(v.string()),
    fileType: v.optional(v.string()),
    status: v.optional(v.string()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
    researchType: v.optional(v.string()),
    iterations: v.optional(v.number()),
    createdAt: v.number(),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      ...args,
      content: args.content ?? "",
    });
  },
});

/**
 * Clear all documents (for testing only - use with caution)
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const documents = await ctx.db.query("documents").collect();
    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }
    return { deleted: documents.length };
  },
});
