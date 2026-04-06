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
 * Update a document
 */
export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    category: v.optional(v.string()),
    filePath: v.optional(v.string()),
    fileType: v.optional(v.string()),
    status: v.optional(v.string()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
    researchType: v.optional(v.string()),
    iterations: v.optional(v.number()),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, { id, ...updates }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`Document ${id} not found`);
    }

    await ctx.db.patch(id, updates);

    return await ctx.db.get(id);
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
 * Publish a document as a public web page with a shareable URL
 */
export const publishDocument = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) throw new Error(`Document ${id} not found`);

    const shareToken = doc.shareToken ?? crypto.randomUUID();
    await ctx.db.patch(id, { isPublic: true, shareToken });

    return { shareToken };
  },
});

/**
 * Unpublish a document, removing public access
 */
export const unpublishDocument = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) throw new Error(`Document ${id} not found`);

    await ctx.db.patch(id, { isPublic: false });
    return { shareToken: doc.shareToken };
  },
});

/**
 * Clear all documents (for testing only - use with caution)
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
    const documents = await ctx.db.query("documents").collect();
    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }
    return { deleted: documents.length };
  },
});

/**
 * Append text to an existing document
 * Used for importing text from external sources (ChatGPT, Claude, etc.)
 */
export const appendText = mutation({
  args: {
    documentId: v.id("documents"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error(`Document ${args.documentId} not found`);
    }

    // Append text with double newline separator
    const updatedContent = doc.content + "\n\n" + args.text;

    await ctx.db.patch(args.documentId, {
      content: updatedContent,
    });

    return args.documentId;
  },
});
