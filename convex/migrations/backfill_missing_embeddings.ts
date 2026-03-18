/**
 * Migration: Backfill missing embeddings
 *
 * Run with: npx convex run migrations/backfill_missing_embeddings:backfill
 */

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

"use node";

interface OrphanDoc {
  _id: Id<"documents">;
  title: string;
  category: string;
  createdAt?: number;
}

interface BackfillResult {
  success: boolean;
  processed: number;
  failed: number;
  total: number;
  message?: string;
  errors?: string[];
}

/**
 * Backfill embeddings for documents that don't have them.
 * Uses the existing updateWithEmbedding action to regenerate embeddings.
 */
export const backfill = action({
  args: {},
  handler: async (ctx): Promise<BackfillResult> => {
    // Find documents without embeddings
    const orphans = await ctx.runQuery(api.documents.queries.findDocumentsWithoutEmbeddings, {
      limit: 1000,
    }) as OrphanDoc[];

    if (orphans.length === 0) {
      return { success: true, processed: 0, failed: 0, total: 0, message: "No documents need embedding backfill" };
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process in batches of 10 to avoid rate limits
    for (let i = 0; i < orphans.length; i += 10) {
      const batch = orphans.slice(i, i + 10);

      const results = await Promise.allSettled(
        batch.map(async (doc) => {
          // Get the full document to access content
          const fullDoc = await ctx.runQuery(api.documents.queries.get, { id: doc._id });
          if (!fullDoc) {
            throw new Error(`Document ${doc._id} not found`);
          }

          // Use updateWithEmbedding with the existing content to generate embedding
          await ctx.runAction(api.documents.storage.updateWithEmbedding, {
            id: doc._id,
            content: fullDoc.content, // Pass content to trigger embedding generation
          });
          return doc._id;
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
 * Get the count of documents without embeddings (for monitoring)
 */
export const status = action({
  args: {},
  handler: async (ctx): Promise<{
    documentsWithoutEmbeddings: number;
    totalDocuments: number;
    percentComplete: number;
  }> => {
    const count = await ctx.runQuery(api.documents.queries.countDocumentsWithoutEmbeddings, {});
    const total = await ctx.runQuery(api.documents.queries.count, {});

    return {
      documentsWithoutEmbeddings: count,
      totalDocuments: total,
      percentComplete: total > 0 ? ((total - count) / total) * 100 : 100,
    };
  },
});
