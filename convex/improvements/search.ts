/**
 * Hybrid similarity search for improvement request deduplication.
 * Combines semantic vector search with full-text search for optimal matching.
 *
 * This is an action (not a query) because it needs to:
 * - Generate embeddings (requires Node.js runtime)
 * - Combine results from multiple queries
 * - Perform client-side scoring and reranking
 */

"use node";

import { action } from "../_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";
import type { Id } from "../_generated/dataModel";

// Direct function references avoid the regenerated-api requirement for new modules.
const improvementsQueriesFullTextSearch = makeFunctionReference<
  "query",
  { query: string; limit?: number },
  Array<{ _id: Id<"improvementRequests">; [key: string]: unknown }>
>("improvements/queries:fullTextSearch");

const improvementsQueriesGet = makeFunctionReference<
  "query",
  { id: Id<"improvementRequests"> },
  | ({ _id: Id<"improvementRequests">; status: string; mergedIntoId?: Id<"improvementRequests">; title?: string; description: string; [key: string]: unknown })
  | null
>("improvements/queries:get");

export const findSimilar = action({
  args: {
    description: v.string(),
    embedding: v.optional(v.array(v.float64())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { description, embedding, limit = 5 }) => {
    // Generate embedding for description if not provided
    if (!embedding) {
      const { embedding: gen } = await embed({
        model: cohereEmbedding,
        value: description,
      });
      embedding = gen;
    }

    const searchLimit = Math.max(limit * 2, 20);

    // Run vector search and FTS in parallel
    const [vectorResults, ftsResults] = await Promise.all([
      ctx.vectorSearch("improvementRequests", "by_embedding", {
        vector: embedding,
        limit: searchLimit,
      }),
      ctx.runQuery(improvementsQueriesFullTextSearch, {
        query: description.slice(0, 200), // truncate for FTS
        limit: searchLimit,
      }),
    ]);

    // Fetch full documents for vector results (they only return _id + _score)
    const vectorDocs = await Promise.all(
      vectorResults.map(async (result: { _id: Id<"improvementRequests">; _score: number }) => {
        const doc = await ctx.runQuery(improvementsQueriesGet, {
          id: result._id,
        });
        return doc ? { ...doc, score: result._score } : null;
      })
    );
    const hydratedVectorResults = vectorDocs.filter(Boolean) as Array<{
      _id: any;
      description: string;
      title?: string;
      status: string;
      mergedIntoId?: any;
      score: number;
      [key: string]: any;
    }>;

    // Weighted merge: vector results rank higher to prefer semantic matches
    const VECTOR_WEIGHT = 0.7;
    const FTS_WEIGHT = 0.3;

    const resultScore = new Map<string, number>();
    const resultMap = new Map<string, any>();

    // Score vector results - normalize to 0-1 range
    const maxVectorScore =
      hydratedVectorResults.length > 0 ? hydratedVectorResults[0].score : 1;

    for (const doc of hydratedVectorResults) {
      const id = doc._id.toString();
      const normalizedScore =
        maxVectorScore > 0 ? doc.score / maxVectorScore : 0;
      const weightedScore = normalizedScore * VECTOR_WEIGHT;
      resultScore.set(id, (resultScore.get(id) || 0) + weightedScore);
      resultMap.set(id, doc);
    }

    // Score FTS results - Convex search index returns results in relevance order
    // but does not expose a numeric score, so we derive one from position
    for (let i = 0; i < ftsResults.length; i++) {
      const doc = ftsResults[i];
      const id = doc._id.toString();
      const positionalScore =
        ftsResults.length > 0 ? 1 - i / ftsResults.length : 0;
      const weightedScore = positionalScore * FTS_WEIGHT;
      resultScore.set(id, (resultScore.get(id) || 0) + weightedScore);
      if (!resultMap.has(id)) {
        resultMap.set(id, doc);
      }
    }

    // Sort by combined score, filter out merged requests, return top results
    const sortedResults = Array.from(resultMap.entries())
      .sort((a, b) => resultScore.get(b[0])! - resultScore.get(a[0])!)
      .map(([_, doc]) => ({
        ...doc,
        score: resultScore.get(doc._id.toString())!,
      }))
      .filter(
        (doc) => doc.status !== "merged" && doc.mergedIntoId === undefined
      )
      .slice(0, limit);

    return sortedResults;
  },
});
