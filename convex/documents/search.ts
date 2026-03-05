/**
 * AC-3: Hybrid search action combining vector + FTS
 * Combines semantic search with keyword matching for optimal results
 *
 * This is an action (not a query) because it needs to combine results
 * from multiple queries and perform client-side scoring/reranking.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";

/**
 * "use node" directive - runs in Node.js environment (not V8 isolate)
 * Required for complex operations that don't fit in the V8 function model.
 */
"use node";

export const hybridSearch = action({
  args: {
    query: v.string(),
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { query, embedding, limit = 10 }) => {
    // Import the API types dynamically
    const api = await import("../_generated/api");

    // Run both searches in parallel
    const [vectorResults, ftsResults] = await Promise.all([
      ctx.runQuery(api.default.documents.vectorSearch, { embedding, limit }),
      ctx.runQuery(api.default.documents.fullTextSearch, { query, limit }),
    ]);

    // Create a map to track scores and avoid duplicates
    const resultScore = new Map<string, number>();
    const resultMap = new Map<string, any>();

    // Score vector results (higher weight for semantic similarity)
    for (let i = 0; i < vectorResults.length; i++) {
      const doc = vectorResults[i];
      const id = doc._id.toString();
      // Vector search results are ranked by similarity, give them higher weight
      const score = (vectorResults.length - i) * 2;
      resultScore.set(id, (resultScore.get(id) || 0) + score);
      resultMap.set(id, doc);
    }

    // Score FTS results (lower weight but still valuable)
    for (let i = 0; i < ftsResults.length; i++) {
      const doc = ftsResults[i];
      const id = doc._id.toString();
      const score = ftsResults.length - i;
      resultScore.set(id, (resultScore.get(id) || 0) + score);
      resultMap.set(id, doc);
    }

    // Sort by combined score and return top results
    const sortedResults = Array.from(resultMap.entries())
      .sort((a, b) => resultScore.get(b[0])! - resultScore.get(a[0])!)
      .slice(0, limit)
      .map(([_, doc]) => ({
        ...doc,
        score: resultScore.get(doc._id.toString())!,
      }));

    return sortedResults;
  },
});
