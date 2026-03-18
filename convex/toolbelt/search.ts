/**
 * Hybrid search action for toolbelt tools
 * Combines FTS and vector search with intelligent ranking
 *
 * "use node" directive - runs in Node.js environment (not V8 isolate)
 * Required for complex operations and embedding generation.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";

"use node";

export const hybridSearch = action({
  args: {
    query: v.string(),
    embedding: v.optional(v.array(v.float64())), // Optional - will be generated if not provided
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { query, embedding, limit = 10, category }) => {
    // Generate embedding for query if not provided
    if (!embedding) {
      const { embedding: generatedEmbedding } = await embed({
        model: cohereEmbedding,
        value: query,
      });
      embedding = generatedEmbedding;
    }

    // Run both searches in parallel with category filter
    const searchLimit = Math.max(limit * 2, 50); // Get more candidates for better merging

    const [vectorResults, ftsResults] = await Promise.all([
      ctx.runQuery(api.toolbelt.queries.vectorSearch, {
        embedding,
        limit: searchLimit,
        category,
      }),
      ctx.runQuery(api.toolbelt.queries.fullTextSearch, {
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

    for (const tool of vectorResults) {
      const id = tool._id.toString();
      // Normalize the score and apply vector weight (0.5)
      const normalizedScore = maxVectorScore > 0 ? tool.score / maxVectorScore : 0;
      const weightedScore = normalizedScore * 0.5;
      resultScore.set(id, (resultScore.get(id) || 0) + weightedScore);
      resultMap.set(id, tool);
    }

    // Score FTS results (equal weight for keyword matching - 0.5)
    for (const tool of ftsResults) {
      const id = tool._id.toString();
      // Apply FTS weight (0.5)
      const weightedScore = (tool.score || 0) * 0.5;
      resultScore.set(id, (resultScore.get(id) || 0) + weightedScore);
      if (!resultMap.has(id)) {
        resultMap.set(id, tool);
      }
    }

    // Sort by combined score and return top results
    const sortedResults = Array.from(resultMap.entries())
      .sort((a, b) => resultScore.get(b[0])! - resultScore.get(a[0])!)
      .slice(0, limit)
      .map(([_, tool]) => ({
        ...tool,
        score: resultScore.get(tool._id.toString())!,
      }));

    return sortedResults;
  },
});
