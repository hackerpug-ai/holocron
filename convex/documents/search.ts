/**
 * AC-3: Hybrid search action combining vector + FTS
 * Combines semantic search with keyword matching for optimal results
 *
 * This is an action (not a query) because it needs to combine results
 * from multiple queries and perform client-side scoring/reranking.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

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
    category: v.optional(v.string()),
  },
  handler: async (ctx, { query, embedding, limit = 10, category }) => {
    // Run both searches in parallel with category filter
    const searchLimit = Math.max(limit * 2, 50); // Get more candidates for better merging

    const [vectorResults, ftsResults] = await Promise.all([
      ctx.runQuery(api.documents.queries.vectorSearch, {
        embedding,
        limit: searchLimit,
        category,
      }),
      ctx.runQuery(api.documents.queries.fullTextSearch, {
        query,
        limit: searchLimit,
        category,
      }),
    ]);

    // Create a map to track scores and avoid duplicates
    const resultScore = new Map<string, number>();
    const resultMap = new Map<string, any>();

    // Score vector results (equal weight for semantic similarity - 0.5)
    // Normalize scores to 0-1 range based on the actual similarity scores
    const maxVectorScore = vectorResults.length > 0 ? vectorResults[0].score : 1;

    for (const doc of vectorResults) {
      const id = doc._id.toString();
      // Normalize the score and apply vector weight (0.5)
      const normalizedScore = maxVectorScore > 0 ? doc.score / maxVectorScore : 0;
      const weightedScore = normalizedScore * 0.5;
      resultScore.set(id, (resultScore.get(id) || 0) + weightedScore);
      resultMap.set(id, doc);
    }

    // Score FTS results (equal weight for keyword matching - 0.5)
    for (const doc of ftsResults) {
      const id = doc._id.toString();
      // Apply FTS weight (0.5)
      const weightedScore = (doc.score || 0) * 0.5;
      resultScore.set(id, (resultScore.get(id) || 0) + weightedScore);
      if (!resultMap.has(id)) {
        resultMap.set(id, doc);
      }
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
