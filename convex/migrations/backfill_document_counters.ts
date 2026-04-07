/**
 * BP-005: Initialize document counters
 *
 * This migration creates denormalized counter documents for efficient counting.
 * It scans all existing documents and creates counters for:
 * - total: Total number of documents
 * - withoutEmbeddings: Documents without embeddings
 * - {category}: Count per category
 */

import { mutation } from "../_generated/server";

export const backfillDocumentCounters = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all existing documents
    const documents = await ctx.db.query("documents").collect();

    const counts: Record<string, number> = {
      total: documents.length,
      withoutEmbeddings: 0,
    };

    // Count by category and embedding status
    for (const doc of documents) {
      // Count by category
      const category = doc.category;
      counts[category] = (counts[category] || 0) + 1;

      // Count documents without embeddings
      if (!doc.embedding) {
        counts.withoutEmbeddings++;
      }
    }

    // Create counter documents
    for (const [name, count] of Object.entries(counts)) {
      // Check if counter already exists
      const existing = await ctx.db
        .query("documentCounters")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();

      if (existing) {
        // Update existing counter
        await ctx.db.patch(existing._id, { count });
      } else {
        // Create new counter
        await ctx.db.insert("documentCounters", { name, count });
      }
    }

    return {
      totalDocuments: documents.length,
      countersCreated: Object.keys(counts).length,
      counts,
    };
  },
});
