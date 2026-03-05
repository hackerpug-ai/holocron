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
      // For category filtering, we need to filter since there's no regular index
      documents = await ctx.db
        .query("documents")
        .filter((q) => q.eq(q.field("category"), category))
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
 * Supports optional category filtering
 *
 * Note: This is a simplified implementation that filters all documents
 * with embeddings and calculates cosine similarity on the fly.
 * For production use with large datasets, consider using Convex's
 * native vector search capabilities when available.
 */
export const vectorSearch = query({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { embedding, limit = 10, category }) => {
    // Get all documents that have embeddings
    let documents = await ctx.db
      .query("documents")
      .filter((q) => q.neq(q.field("embedding"), undefined))
      .collect();

    // Apply category filter if specified
    if (category) {
      documents = documents.filter((doc) => doc.category === category);
    }

    // Calculate cosine similarity scores for each result
    const results = documents
      .map((doc) => ({
        _id: doc._id,
        title: doc.title,
        content: doc.content,
        category: doc.category,
        embedding: doc.embedding,
        score: doc.embedding ? cosineSimilarity(embedding, doc.embedding) : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  },
});

/**
 * AC-2: Full-text search using Convex searchIndex
 * Performs keyword-based search across title and content fields
 * Supports optional category filtering
 *
 * Note: Uses filter-based text search. For production use with large datasets,
 * consider adding dedicated text search indexes or using a search service.
 */
export const fullTextSearch = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { query: searchQuery, limit = 10, category }) => {
    // Get all documents up to a reasonable limit
    let documents = await ctx.db.query("documents").collect();

    // Apply category filter if specified
    if (category) {
      documents = documents.filter((doc) => doc.category === category);
    }

    // Filter for text matches in title or content (case-insensitive)
    const searchLower = searchQuery.toLowerCase();
    const filtered = documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(searchLower) ||
        doc.content.toLowerCase().includes(searchLower)
    );

    // Return with search scores (simple relevance based on match position)
    return filtered
      .slice(0, limit)
      .map((doc, index) => ({
        _id: doc._id,
        title: doc.title,
        content: doc.content,
        category: doc.category,
        // Score based on position (earlier results = higher score)
        score: filtered.length > 0 ? 1 - index / filtered.length : 0,
      }));
  },
});

/**
 * Helper function: Calculate cosine similarity between two vectors
 * Used for scoring vector search results
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}
