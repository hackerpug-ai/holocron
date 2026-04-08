import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new document (for testing and future use)
 * BP-005: Maintains document counters
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
    // REQUIRED: All documents must have embeddings for semantic search
    // Use createWithEmbedding action instead of calling this mutation directly
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("documents", {
      ...args,
      createdAt: now,
    });

    // Update counters
    await updateDocumentCounters(ctx, args.category, args.embedding);

    return id;
  },
});

/**
 * Helper: Update document counters after insert/delete
 * BP-005: Maintains denormalized counters for efficient counting
 */
async function updateDocumentCounters(
  ctx: any,
  category: string | undefined,
  embedding: number[] | undefined,
  increment: number = 1
) {
  // Update total counter
  const totalCounter = await ctx.db
    .query("documentCounters")
    .withIndex("by_name", (q: any) => q.eq("name", "total"))
    .first();

  if (totalCounter) {
    await ctx.db.patch(totalCounter._id, { count: totalCounter.count + increment });
  } else {
    await ctx.db.insert("documentCounters", { name: "total", count: increment });
  }

  // Update category counter
  if (category) {
    const categoryCounter = await ctx.db
      .query("documentCounters")
      .withIndex("by_name", (q: any) => q.eq("name", category))
      .first();

    if (categoryCounter) {
      await ctx.db.patch(categoryCounter._id, { count: categoryCounter.count + increment });
    } else {
      await ctx.db.insert("documentCounters", { name: category, count: increment });
    }
  }

  // Update withoutEmbeddings counter
  if (!embedding) {
    const withoutEmbeddingsCounter = await ctx.db
      .query("documentCounters")
      .withIndex("by_name", (q: any) => q.eq("name", "withoutEmbeddings"))
      .first();

    if (withoutEmbeddingsCounter) {
      await ctx.db.patch(withoutEmbeddingsCounter._id, {
        count: withoutEmbeddingsCounter.count + increment,
      });
    } else {
      await ctx.db.insert("documentCounters", {
        name: "withoutEmbeddings",
        count: increment,
      });
    }
  }
}

/**
 * Delete a document
 * BP-005: Maintains document counters
 */
export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) {
      throw new Error(`Document ${id} not found`);
    }

    await ctx.db.delete(id);

    // Update counters (decrement)
    await updateDocumentCounters(ctx, doc.category, doc.embedding, -1);

    return { success: true };
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
 * BP-005: Maintains document counters
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
    const id = await ctx.db.insert("documents", {
      ...args,
      content: args.content ?? "",
    });

    // Update counters
    await updateDocumentCounters(ctx, args.category, args.embedding);

    return id;
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
 * BP-005: Resets document counters
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

    // Reset all counters to 0
    const counters = await ctx.db.query("documentCounters").collect();
    for (const counter of counters) {
      await ctx.db.patch(counter._id, { count: 0 });
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
