import { query } from "../_generated/server";
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
 * Get a document by title (for flexible lookups from MCP/tools)
 * Returns null if not found. Use this when you have a title/slug instead of an ID.
 */
export const getByTitle = query({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    // Search for document by title (case-insensitive)
    const doc = await ctx.db
      .query("documents")
      .withSearchIndex("by_title_content", (q) =>
        q.search("title", args.title)
      )
      .first();

    return doc;
  },
});

/**
 * List all documents with optional filtering
 * Returns documents ordered by creation time (newest first)
 * Includes metadata with total count for pagination
 */
export const list = query({
  args: {
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { category, limit = 100 } = args;

    // Use withIndex to order by creation time descending
    let query = ctx.db
      .query("documents")
      .withIndex("by_creationTime")
      .order("desc");

    // Apply category filter if specified
    if (category) {
      query = query.filter((q) => q.eq(q.field("category"), category));
    }

    // Use take() to limit results
    const results = await query.take(limit);

    // Get total count using counters (BP-005)
    const counterName = category ?? "total";
    const counter = await ctx.db
      .query("documentCounters")
      .withIndex("by_name", (q) => q.eq("name", counterName))
      .first();

    const totalCount = counter?.count ?? 0;

    return {
      documents: results,
      metadata: {
        totalCount,
        hasMore: results.length === limit,
      },
    };
  },
});

/**
 * Get document count (for validation)
 * BP-005: Uses denormalized counter instead of .collect().length
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const counter = await ctx.db
      .query("documentCounters")
      .withIndex("by_name", (q) => q.eq("name", "total"))
      .first();
    return counter?.count ?? 0;
  },
});

/**
 * Get document count with optional category filter
 * Used for displaying total counts in the articles screen
 * BP-005: Uses denormalized counters instead of .collect().length
 */
export const countWithFilter = query({
  args: {
    category: v.optional(v.string()),
  },
  handler: async (ctx, { category }) => {
    if (!category) {
      // Return total count
      const counter = await ctx.db
        .query("documentCounters")
        .withIndex("by_name", (q) => q.eq("name", "total"))
        .first();
      return counter?.count ?? 0;
    }

    // Return category-specific count
    const counter = await ctx.db
      .query("documentCounters")
      .withIndex("by_name", (q) => q.eq("name", category))
      .first();
    return counter?.count ?? 0;
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
 * BP-005: Uses denormalized counters instead of .collect().length
 */
export const countByCategory = query({
  args: {},
  handler: async (ctx) => {
    // Get all category counters
    const counters = await ctx.db
      .query("documentCounters")
      .collect();

    const counts: Record<string, number> = {};
    for (const counter of counters) {
      if (counter.name !== "total" && counter.name !== "withoutEmbeddings") {
        counts[counter.name] = counter.count;
      }
    }

    return counts;
  },
});

/**
 * AC-1: Vector search using cosine similarity
 * Performs semantic similarity search using document embeddings
 * Supports optional category filtering
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
        score: doc.embedding ? cosineSimilarity(embedding, doc.embedding) : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  },
});

/**
 * AC-2: Full-text search using Convex searchIndex
 * Performs keyword-based search across title field
 * Supports optional category filtering
 */
export const fullTextSearch = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { query: searchQuery, limit = 10, category }) => {
    // Use search index for efficient text search
    let results = await ctx.db
      .query("documents")
      .withSearchIndex("by_title_content", (q) => q.search("title", searchQuery))
      .take(limit);

    // Apply category filter if specified
    if (category) {
      results = results.filter((doc) => doc.category === category);
    }

    // Return with search scores (simple relevance based on position)
    return results.map((doc, index) => ({
      _id: doc._id,
      title: doc.title,
      content: doc.content,
      category: doc.category,
      // Score based on position (earlier results = higher score)
      score: results.length > 0 ? 1 - index / results.length : 0,
    }));
  },
});

/**
 * Find documents that don't have embeddings
 * Used for backfill and monitoring
 */
export const findDocumentsWithoutEmbeddings = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 100 }) => {
    const documents = await ctx.db
      .query("documents")
      .filter((q) => q.eq(q.field("embedding"), undefined))
      .take(limit);

    return documents.map(doc => ({
      _id: doc._id,
      title: doc.title,
      category: doc.category,
      createdAt: doc.createdAt,
    }));
  },
});

/**
 * Count documents without embeddings
 * BP-005: Uses denormalized counter instead of .collect().length
 */
export const countDocumentsWithoutEmbeddings = query({
  args: {},
  handler: async (ctx) => {
    const counter = await ctx.db
      .query("documentCounters")
      .withIndex("by_name", (q) => q.eq("name", "withoutEmbeddings"))
      .first();
    return counter?.count ?? 0;
  },
});

/**
 * Get a publicly shared document by its share token
 * Returns null if not found or not public
 */
export const getByShareToken = query({
  args: { shareToken: v.string() },
  handler: async (ctx, { shareToken }) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_shareToken", (q) => q.eq("shareToken", shareToken))
      .first();

    if (!doc || doc.isPublic !== true) return null;

    return {
      title: doc.title,
      content: doc.content,
      category: doc.category,
      date: doc.date,
      createdAt: doc.createdAt,
      researchType: doc.researchType,
    };
  },
});

/**
 * Get a section of a document by ID with optional block-level retrieval
 * Returns the full document when blockIndex is omitted.
 * When blockIndex is provided, returns that block plus one block of surrounding context.
 */
export const getSection = query({
  args: {
    id: v.id("documents"),
    blockIndex: v.optional(v.number()),
  },
  handler: async (ctx, { id, blockIndex }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return null;

    if (blockIndex === undefined) {
      return {
        _id: doc._id,
        title: doc.title,
        category: doc.category,
        content: doc.content,
      };
    }

    // Split by double newline (rough paragraph/block boundary)
    const blocks = doc.content.split(/\n\n+/);
    if (blockIndex < 0 || blockIndex >= blocks.length) {
      return {
        _id: doc._id,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        blockNotFound: true,
      };
    }

    // Return the block and surrounding context (1 block before, 1 after)
    const start = Math.max(0, blockIndex - 1);
    const end = Math.min(blocks.length, blockIndex + 2);
    const sectionContent = blocks.slice(start, end).join('\n\n');

    return {
      _id: doc._id,
      title: doc.title,
      category: doc.category,
      content: sectionContent,
      blockIndex,
      totalBlocks: blocks.length,
    };
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
