/**
 * Migration: Backfill inFeed field on subscriptionContent records
 *
 * Finds all subscriptionContent records where inFeed is undefined and
 * patches them with { inFeed: false } so they are visible to the feed builder.
 *
 * Run with: npx convex run migrations/backfill_infeed:backfill
 * Run with dry run: npx convex run migrations/backfill_infeed:backfill '{"dryRun": true}'
 * Check status: npx convex run migrations/backfill_infeed:status
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Backfill inFeed: false on subscriptionContent records missing the field
 *
 * Processes records in batches to avoid timeout. Safe to re-run idempotently.
 */
export const backfill = mutation({
  args: {
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { batchSize = 200, dryRun = false }
  ): Promise<{
    status: "complete" | "partial";
    patched: number;
    remaining: number;
    message: string;
  }> => {
    

    // Take batchSize + 1 to detect whether more records exist beyond the batch
    const sample = await ctx.db
      .query("subscriptionContent")
      .take(batchSize + 1);

    const missing = sample.filter((c) => c.inFeed === undefined);
    const batch = missing.slice(0, batchSize);

    

    if (batch.length === 0) {
      return {
        status: "complete",
        patched: 0,
        remaining: 0,
        message: "All subscriptionContent records already have inFeed set",
      };
    }

    if (dryRun) {
      return {
        status: missing.length > batchSize ? "partial" : "complete",
        patched: 0,
        remaining: missing.length,
        message: `DRY RUN: Would patch ${batch.length} records. Run with dryRun: false to execute.`,
      };
    }

    let patched = 0;
    for (const record of batch) {
      await ctx.db.patch(record._id, { inFeed: false });
      patched++;
    }

    const hasMore = missing.length > batchSize;

    const message = hasMore
      ? `Patched ${patched} records. More records may remain — run again to continue.`
      : `Patched ${patched} records. Migration complete.`;

    

    return {
      status: hasMore ? "partial" : "complete",
      patched,
      remaining: hasMore ? missing.length - batchSize : 0,
      message,
    };
  },
});

/**
 * Check how many subscriptionContent records are missing inFeed
 */
export const status = mutation({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    totalSampled: number;
    missingInFeed: number;
    message: string;
  }> => {
    // Sample up to 1000 records to estimate scope
    const sample = await ctx.db
      .query("subscriptionContent")
      .take(1000);

    const missing = sample.filter((c) => c.inFeed === undefined);

    return {
      totalSampled: sample.length,
      missingInFeed: missing.length,
      message:
        missing.length === 0
          ? "All sampled records have inFeed set"
          : `${missing.length} of ${sample.length} sampled records are missing inFeed`,
    };
  },
});
