import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Toolbelt category type
 */
export type ToolbeltCategory =
  | "libraries"
  | "cli"
  | "framework"
  | "service"
  | "database"
  | "tool";

/**
 * Toolbelt source type
 */
export type ToolbeltSourceType =
  | "github"
  | "npm"
  | "pypi"
  | "website"
  | "cargo"
  | "go"
  | "other";

/**
 * Toolbelt status type
 */
export type ToolbeltStatus = "complete" | "draft" | "archived";

/**
 * Get a tool by ID
 */
export const get = query({
  args: { id: v.id("toolbeltTools") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * List all tools with optional filtering
 * Returns tools ordered by creation time (newest first)
 */
export const list = query({
  args: {
    category: v.optional(v.union(
      v.literal("libraries"),
      v.literal("cli"),
      v.literal("framework"),
      v.literal("service"),
      v.literal("database"),
      v.literal("tool")
    )),
    sourceType: v.optional(v.union(
      v.literal("github"),
      v.literal("npm"),
      v.literal("pypi"),
      v.literal("website"),
      v.literal("cargo"),
      v.literal("go"),
      v.literal("other")
    )),
    status: v.optional(v.union(
      v.literal("complete"),
      v.literal("draft"),
      v.literal("archived")
    )),
    language: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { category, sourceType, status, language, limit = 100 } = args;

    // Use withIndex to order by creation time descending
    let query = ctx.db
      .query("toolbeltTools")
      .withIndex("by_creationTime");

    // Apply filters
    const results = await query.collect();

    let filtered = results;

    if (category) {
      filtered = filtered.filter((tool) => tool.category === category);
    }

    if (sourceType) {
      filtered = filtered.filter((tool) => tool.sourceType === sourceType);
    }

    if (status) {
      filtered = filtered.filter((tool) => tool.status === status);
    }

    if (language) {
      filtered = filtered.filter((tool) => tool.language === language);
    }

    return filtered.slice(0, limit);
  },
});

/**
 * Get tool count
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("toolbeltTools").collect();
    return tools.length;
  },
});

/**
 * Get tools count by category
 */
export const countByCategory = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("toolbeltTools").collect();
    const counts: Record<string, number> = {};

    for (const tool of tools) {
      const category = tool.category;
      counts[category] = (counts[category] || 0) + 1;
    }

    return counts;
  },
});

/**
 * Vector search using Convex vectorIndex
 * Performs semantic similarity search using tool embeddings
 */
export const vectorSearch = query({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { embedding, limit = 10, category }) => {
    // Get all tools that have embeddings
    let tools = await ctx.db
      .query("toolbeltTools")
      .filter((q) => q.neq(q.field("embedding"), undefined))
      .collect();

    // Apply category filter if specified
    if (category) {
      tools = tools.filter((tool) => tool.category === category);
    }

    // Calculate cosine similarity scores for each result
    const results = tools
      .map((tool) => ({
        _id: tool._id,
        title: tool.title,
        description: tool.description,
        category: tool.category,
        sourceType: tool.sourceType,
        language: tool.language,
        tags: tool.tags,
        useCases: tool.useCases,
        embedding: tool.embedding,
        score: tool.embedding ? cosineSimilarity(embedding, tool.embedding) : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  },
});

/**
 * Full-text search across title, description, tags, and keywords
 */
export const fullTextSearch = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { query: searchQuery, limit = 10, category }) => {
    // Get all tools
    let tools = await ctx.db.query("toolbeltTools").collect();

    // Apply category filter if specified
    if (category) {
      tools = tools.filter((tool) => tool.category === category);
    }

    // Filter for text matches (case-insensitive)
    const searchLower = searchQuery.toLowerCase();
    const filtered = tools.filter((tool) => {
      const titleMatch = tool.title.toLowerCase().includes(searchLower);
      const descMatch = tool.description?.toLowerCase().includes(searchLower) ?? false;
      const tagsMatch = tool.tags?.some(t => t.toLowerCase().includes(searchLower)) ?? false;
      const keywordsMatch = tool.keywords?.some(k => k.toLowerCase().includes(searchLower)) ?? false;
      const useCasesMatch = tool.useCases?.some(u => u.toLowerCase().includes(searchLower)) ?? false;

      return titleMatch || descMatch || tagsMatch || keywordsMatch || useCasesMatch;
    });

    // Return with search scores (simple relevance based on match position)
    return filtered
      .slice(0, limit)
      .map((tool, index) => ({
        _id: tool._id,
        title: tool.title,
        description: tool.description,
        category: tool.category,
        sourceType: tool.sourceType,
        language: tool.language,
        tags: tool.tags,
        useCases: tool.useCases,
        // Score based on position (earlier results = higher score)
        score: filtered.length > 0 ? 1 - index / filtered.length : 0,
      }));
  },
});

/**
 * Find tools that don't have embeddings
 * Used for backfill and monitoring
 */
export const findToolsWithoutEmbeddings = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 100 }) => {
    const tools = await ctx.db
      .query("toolbeltTools")
      .filter((q) => q.eq(q.field("embedding"), undefined))
      .take(limit);

    return tools.map(tool => ({
      _id: tool._id,
      title: tool.title,
      category: tool.category,
      createdAt: tool.createdAt,
    }));
  },
});

/**
 * Count tools without embeddings
 */
export const countToolsWithoutEmbeddings = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("toolbeltTools").collect();
    return all.filter(tool => !tool.embedding).length;
  },
});

/**
 * Helper function: Calculate cosine similarity between two vectors
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
