import { query, action } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get a document by ID
 */
export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * List all documents with optional filtering
 */
export const list = query({
  args: {
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { category, limit = 100 } = args;

    let documents;
    if (category) {
      // For category filtering, we need to use the index
      documents = await ctx.db
        .query("documents")
        .withIndex("by_category", (q) => q.eq("category", category))
        .take(limit);
    } else {
      documents = await ctx.db.query("documents").take(limit);
    }

    return documents;
  },
});

/**
 * Get document count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const documents = await ctx.db.query("documents").collect();
    return documents.length;
  },
});

/**
 * Get a sample document to validate embedding dimensions
 */
export const getSampleWithEmbedding = query({
  args: {},
  handler: async (ctx) => {
    const documents = await ctx.db
      .query("documents")
      .filter((q) => q.neq(q.field("embedding"), undefined))
      .first();

    if (!documents || !documents.embedding) {
      return null;
    }

    return {
      id: documents._id,
      title: documents.title,
      embeddingDimension: documents.embedding.length,
      firstFiveValues: documents.embedding.slice(0, 5),
    };
  },
});

/**
 * Get documents count by category
 */
export const countByCategory = query({
  args: {},
  handler: async (ctx) => {
    const documents = await ctx.db.query("documents").collect();
    const counts: Record<string, number> = {};

    for (const doc of documents) {
      const category = doc.category;
      counts[category] = (counts[category] || 0) + 1;
    }

    return counts;
  },
});

/**
 * AC-1: Vector search using Convex vectorIndex
 * Performs semantic similarity search using document embeddings
 */
export const vectorSearch = query({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { embedding, limit = 10 }) => {
    // Use Convex's vector search with the by_embedding index
    const results = await ctx.db
      .query("documents")
      .withSearchIndex("by_embedding", (q) =>
        q("vector", embedding, { limit })
      )
      .take(limit);

    return results.map((doc) => ({
      _id: doc._id,
      title: doc.title,
      content: doc.content,
      category: doc.category,
    }));
  },
});

/**
 * AC-2: Full-text search using Convex searchIndex
 * Performs keyword-based search using the by_category search index
 */
export const fullTextSearch = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { query, limit = 10 }) => {
    // Use Convex's full-text search with the by_category index
    const results = await ctx.db
      .query("documents")
      .withSearchIndex("by_category", (q) =>
        q.search("category", query).take(limit)
      );

    return results.map((doc) => ({
      _id: doc._id,
      title: doc.title,
      content: doc.content,
      category: doc.category,
    }));
  },
});
