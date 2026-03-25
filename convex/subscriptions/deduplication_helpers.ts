/**
 * Helper queries for deduplication actions.
 * These run in V8 runtime and provide db access that actions need.
 */

import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get a document by ID, returning only fields needed for dedup comparison
 */
export const getDocument = internalQuery({
  args: { id: v.id("documents") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return null;
    return {
      _id: doc._id as string,
      title: doc.title,
      category: doc.category,
    };
  },
});

/**
 * Get subscription content by ID if it's in queued status
 */
export const getQueuedContent = internalQuery({
  args: { id: v.id("subscriptionContent") },
  handler: async (ctx, { id }) => {
    const content = await ctx.db.get(id);
    if (!content || content.researchStatus !== "queued") return null;
    return {
      _id: content._id as string,
      title: content.title,
      sourceId: content.sourceId as string,
    };
  },
});

/**
 * Update subscription content with embedding
 */
export const updateContentEmbedding = internalMutation({
  args: {
    contentId: v.id("subscriptionContent"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, { contentId, embedding }) => {
    await ctx.db.patch(contentId, { embedding });
  },
});
