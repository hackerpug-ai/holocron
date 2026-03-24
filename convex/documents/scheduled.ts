/**
 * Scheduled document maintenance jobs
 *
 * These internal actions are called by cron jobs for periodic maintenance.
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";

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
 * Scheduled job to backfill missing document embeddings.
 * Runs every hour to catch any documents that were created without embeddings.
 *
 * Called by: crons.ts (hourly interval)
 */
export const backfillOrphanedEmbeddings = action({
  args: {},
  handler: async (ctx): Promise<BackfillResult> => {
    const count = await ctx.runQuery((internal as any).documents.queries.countDocumentsWithoutEmbeddings, {});

    if (count === 0) {
      return { success: true, processed: 0, failed: 0, total: 0, message: "No orphaned embeddings" };
    }

    // Process up to 50 per run to avoid timeouts
    const result = await ctx.runAction(
      (internal as any).migrations.backfill_missing_embeddings.backfill,
      {}
    ) as BackfillResult;

    return result;
  },
});
