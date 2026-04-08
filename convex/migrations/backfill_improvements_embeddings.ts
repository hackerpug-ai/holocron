/**
 * Migration: Backfill missing embeddings for improvement requests
 *
 * Run with: npx convex run migrations/backfill_improvements_embeddings:backfill
 *
 * This script backfills embeddings for:
 * - improvementRequests table
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";

"use node";

interface BackfillResult {
  success: boolean;
  processed: number;
  failed: number;
  total: number;
  message?: string;
  errors?: string[];
}

/**
 * Generate embedding for improvement request description
 */
async function generateImprovementEmbedding(description: string): Promise<number[]> {
  const MAX_LENGTH = 8000;
  const truncated = description.slice(0, MAX_LENGTH);

  const { embedding } = await embed({
    model: cohereEmbedding,
    value: truncated,
  });
  return embedding;
}

/**
 * Backfill embeddings for improvement requests that don't have them.
 */
export const backfill = action({
  args: {},
  handler: async (ctx): Promise<BackfillResult> => {
    // Find requests without embeddings
    const orphans = await ctx.runQuery(internal.migrations.backfillImprovementsEmbeddingsQueries.findImprovementRequestsWithoutEmbeddings, {});

    if (orphans.length === 0) {
      return {
        success: true,
        processed: 0,
        failed: 0,
        total: 0,
        message: "No improvement requests need embedding backfill"
      };
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process in batches of 10 to avoid rate limits
    for (let i = 0; i < orphans.length; i += 10) {
      const batch = orphans.slice(i, i + 10);

      const results = await Promise.allSettled(
        batch.map(async (request) => {
          // Generate embedding
          const embedding = await generateImprovementEmbedding(request.description);

          // Update the request with embedding using the internal mutation
          await ctx.runMutation(internal.improvements.internal.updateFromAgent, {
            requestId: request._id,
            embedding,
          });

          return request._id;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          processed++;
        } else {
          failed++;
          const reason = result.reason;
          errors.push(reason instanceof Error ? reason.message : String(reason));
        }
      }
    }

    return {
      success: true,
      processed,
      failed,
      total: orphans.length,
      errors: errors.slice(0, 10), // Return first 10 errors
    };
  },
});

/**
 * Get the count of improvement requests without embeddings (for monitoring)
 */
export const status = action({
  args: {},
  handler: async (ctx): Promise<{
    requestsWithoutEmbeddings: number;
    totalRequests: number;
    percentComplete: number;
  }> => {
    const orphans = await ctx.runQuery(internal.migrations.backfillImprovementsEmbeddingsQueries.findImprovementRequestsWithoutEmbeddings, {});
    const total = await ctx.runQuery(internal.migrations.backfillImprovementsEmbeddingsQueries.countTotalRequests, {});

    return {
      requestsWithoutEmbeddings: orphans.length,
      totalRequests: total,
      percentComplete: total > 0 ? ((total - orphans.length) / total) * 100 : 100,
    };
  },
});
