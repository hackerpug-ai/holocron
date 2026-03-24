/**
 * AC-3: Hybrid search action combining vector + FTS
 * Combines semantic search with keyword matching for optimal results
 *
 * This is an action (not a query) because it needs to combine results
 * from multiple queries, perform client-side scoring/reranking, and generate embeddings.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";

/**
 * "use node" directive - runs in Node.js environment (not V8 isolate)
 * Required for complex operations that don't fit in the V8 function model.
 */
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

    const searchLimit = Math.max(limit * 2, 50);

    // Use native Convex vector search (action-level API) + FTS in parallel
    const [nativeVectorResults, ftsResults] = await Promise.all([
      ctx.vectorSearch("documents", "by_embedding", {
        vector: embedding,
        limit: searchLimit,
        ...(category ? { filter: (q: any) => q.eq("category", category) } : {}),
      }),
      ctx.runQuery(api.documents.queries.fullTextSearch, {
        query,
        limit: searchLimit,
        category,
      }),
    ]);

    // Fetch full documents for vector results (native search only returns _id + _score)
    const vectorDocs = await Promise.all(
      nativeVectorResults.map(async (result: { _id: any; _score: number }) => {
        const doc = await ctx.runQuery(api.documents.queries.get, {
          id: result._id,
        });
        return doc ? { ...doc, score: result._score } : null;
      })
    );
    const vectorResults = vectorDocs.filter(Boolean) as Array<{
      _id: any;
      title: string;
      content: string;
      category: string;
      score: number;
    }>;

    // Create a map to track scores and avoid duplicates
    const resultScore = new Map<string, number>();
    const resultMap = new Map<string, any>();

    // Vector weight higher (0.7) so semantic matches rank above keyword-only hits
    // This ensures "RL" finds "reinforcement learning" articles via embeddings
    const VECTOR_WEIGHT = 0.7;
    const FTS_WEIGHT = 0.3;

    // Score vector results - normalize to 0-1 range
    const maxVectorScore = vectorResults.length > 0 ? vectorResults[0].score : 1;

    for (const doc of vectorResults) {
      const id = doc._id.toString();
      const normalizedScore = maxVectorScore > 0 ? doc.score / maxVectorScore : 0;
      const weightedScore = normalizedScore * VECTOR_WEIGHT;
      resultScore.set(id, (resultScore.get(id) || 0) + weightedScore);
      resultMap.set(id, doc);
    }

    // Score FTS results
    for (const doc of ftsResults) {
      const id = doc._id.toString();
      const weightedScore = (doc.score || 0) * FTS_WEIGHT;
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
