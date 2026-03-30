/**
 * Migration: Clean up irrelevant Twitter content
 *
 * Queries and mutations (non-Node.js) for the twitter cleanup migration.
 * The action orchestrators live in cleanup_irrelevant_twitter_actions.ts.
 *
 * Run:
 *   npx convex run migrations/cleanup_irrelevant_twitter_actions:collectTwitterDocuments  (dry run)
 *   npx convex run migrations/cleanup_irrelevant_twitter_actions:cleanupIrrelevantTwitter (execute)
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// ============================================================================
// Queries
// ============================================================================

export const getTwitterContentWithDocuments = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allContent = await ctx.db.query("subscriptionContent").collect();

    const twitterContent: Array<{
      subscriptionContentId: string;
      documentId: string;
      title: string;
    }> = [];

    for (const record of allContent) {
      const meta = record.metadataJson as Record<string, unknown> | undefined;
      const platform = meta?.platform as string | undefined;

      if (platform !== "twitter") continue;

      twitterContent.push({
        subscriptionContentId: record._id.toString(),
        documentId: record.documentId?.toString() ?? "",
        title: record.title,
      });
    }

    return twitterContent;
  },
});

export const getTwitterPrefixedDocuments = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("documents").collect();
    return allDocs
      .filter((doc) => doc.title.startsWith("[TWITTER]"))
      .map((doc) => ({
        documentId: doc._id.toString(),
        title: doc.title,
        content: doc.content.slice(0, 500),
      }));
  },
});

export const getFeedItemsByContentIds = internalQuery({
  args: { contentIds: v.array(v.string()) },
  handler: async (ctx, { contentIds }) => {
    if (contentIds.length === 0) return [];

    const contentIdSet = new Set(contentIds);
    const allFeedItems = await ctx.db.query("feedItems").collect();

    return allFeedItems
      .filter((item) =>
        item.itemIds?.some((id: any) => contentIdSet.has(id.toString()))
      )
      .map((item) => item._id.toString());
  },
});

// ============================================================================
// Mutations
// ============================================================================

export const deleteIrrelevantContent = internalMutation({
  args: {
    subscriptionContentIds: v.array(v.string()),
    documentIds: v.array(v.string()),
    feedItemIds: v.array(v.string()),
  },
  handler: async (ctx, { subscriptionContentIds, documentIds, feedItemIds }) => {
    let deletedDocs = 0;
    let deletedContent = 0;
    let deletedFeedItems = 0;

    for (const docId of documentIds) {
      try {
        const id = ctx.db.normalizeId("documents", docId);
        if (id) { await ctx.db.delete(id); deletedDocs++; }
      } catch { /* already deleted */ }
    }

    for (const contentId of subscriptionContentIds) {
      try {
        const id = ctx.db.normalizeId("subscriptionContent", contentId);
        if (id) { await ctx.db.delete(id); deletedContent++; }
      } catch { /* already deleted */ }
    }

    for (const feedItemId of feedItemIds) {
      try {
        const id = ctx.db.normalizeId("feedItems", feedItemId);
        if (id) { await ctx.db.delete(id); deletedFeedItems++; }
      } catch { /* already deleted */ }
    }

    console.log(
      `[cleanup] Deleted ${deletedDocs} docs, ${deletedContent} content, ${deletedFeedItems} feedItems`
    );

    return { deletedDocs, deletedContent, deletedFeedItems };
  },
});
