import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new citation
 */
export const create = mutation({
  args: {
    sessionId: v.optional(v.id("researchSessions")),
    documentId: v.optional(v.id("documents")),
    sourceUrl: v.string(),
    sourceTitle: v.optional(v.string()),
    sourceDomain: v.optional(v.string()),
    claimText: v.string(),
    claimMarker: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("citations", {
      ...args,
      retrievedAt: Date.now(),
    });
  },
});

/**
 * Update a citation
 */
export const update = mutation({
  args: {
    id: v.id("citations"),
    sessionId: v.optional(v.id("researchSessions")),
    documentId: v.optional(v.id("documents")),
    sourceTitle: v.optional(v.string()),
    sourceDomain: v.optional(v.string()),
    claimText: v.optional(v.string()),
    claimMarker: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`Citation ${id} not found`);
    }

    await ctx.db.patch(id, updates);

    return await ctx.db.get(id);
  },
});

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
 * Requires ALLOW_CLEAR_ALL=true environment variable to be set.
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.ALLOW_CLEAR_ALL !== "true") {
      throw new Error(
        "clearAll is disabled. Set ALLOW_CLEAR_ALL=true to enable."
      );
    }
    const citations = await ctx.db.query("citations").collect();
    for (const citation of citations) {
      await ctx.db.delete(citation._id);
    }
    return { deleted: citations.length };
  },
});
