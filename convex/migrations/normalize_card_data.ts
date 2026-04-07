/**
 * Migration: Normalize chatMessages.cardData from array to object
 *
 * Some cardData values are arrays (search/browse results) while others are objects.
 * This migration wraps array cardData into { card_type: "search_results", items: [...] }
 * so the schema can use v.record(v.string(), v.any()) consistently.
 *
 * Run with: npx convex run migrations/normalize_card_data:run
 * Dry run:  npx convex run migrations/normalize_card_data:run '{"dryRun": true}'
 * Status:   npx convex run migrations/normalize_card_data:status
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Check how many array cardData documents exist
 */
export const status = query({
  handler: async (ctx) => {
    const messages = await ctx.db.query("chatMessages").collect();
    let arrayCount = 0;
    let objectCount = 0;
    let nullCount = 0;

    for (const m of messages) {
      if (m.cardData === undefined || m.cardData === null) {
        nullCount++;
      } else if (Array.isArray(m.cardData)) {
        arrayCount++;
      } else {
        objectCount++;
      }
    }

    return {
      total: messages.length,
      arrayCardData: arrayCount,
      objectCardData: objectCount,
      noCardData: nullCount,
      needsMigration: arrayCount > 0,
    };
  },
});

/**
 * Migrate array cardData to { card_type: "search_results", items: [...] }
 */
export const run = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { dryRun = false }) => {
    const messages = await ctx.db.query("chatMessages").collect();
    let migrated = 0;
    let skipped = 0;
    const migratedIds: string[] = [];

    for (const m of messages) {
      if (!Array.isArray(m.cardData)) {
        skipped++;
        continue;
      }

      if (!dryRun) {
        await ctx.db.patch(m._id, {
          cardData: {
            card_type: "search_results",
            items: m.cardData,
          },
        });
      }

      migrated++;
      migratedIds.push(m._id);
    }

    return {
      dryRun,
      migrated,
      skipped,
      migratedIds,
    };
  },
});
