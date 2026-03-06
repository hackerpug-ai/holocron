import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Insert a citation from migration
 */
export const insertFromMigration = mutation({
  args: {
    sessionId: v.optional(v.id("researchSessions")),
    documentId: v.optional(v.id("documents")),
    sourceUrl: v.string(),
    sourceTitle: v.optional(v.string()),
    sourceDomain: v.optional(v.string()),
    claimText: v.string(),
    claimMarker: v.optional(v.string()),
    retrievedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("citations", args);
  },
});

/**
 * Clear all citations (for testing only - use with caution)
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const citations = await ctx.db.query("citations").collect();
    for (const citation of citations) {
      await ctx.db.delete(citation._id);
    }
    return { deleted: citations.length };
  },
});
