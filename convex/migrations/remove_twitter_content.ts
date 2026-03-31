/**
 * Migration: Remove all Twitter content from the system
 *
 * Twitter/X has been completely removed as a content source.
 * This migration cleans up existing Twitter data:
 * 1. Deletes subscriptionContent with platform: "twitter" or x.com/twitter.com URLs
 * 2. Deletes feedItems that reference deleted content
 * 3. Deletes subscriptionSources that were twitter-only creators
 * 4. Removes twitter platform config from remaining creator sources
 *
 * Run:
 *   npx convex run migrations/remove_twitter_content:dryRun     (preview)
 *   npx convex run migrations/remove_twitter_content:execute     (delete)
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ============================================================================
// Helpers
// ============================================================================

function isTwitterContent(record: {
  url?: string;
  metadataJson?: unknown;
  contentCategory?: string;
}): boolean {
  const meta = record.metadataJson as Record<string, unknown> | undefined;
  const platform = meta?.platform as string | undefined;
  if (platform === "twitter") return true;

  const url = record.url ?? "";
  if (url.includes("twitter.com") || url.includes("x.com")) return true;

  return false;
}

function isTwitterOnlySource(source: {
  configJson?: unknown;
  url?: string;
}): boolean {
  const config = source.configJson as Record<string, unknown> | undefined;
  const platforms = config?.platforms as Record<string, unknown> | undefined;
  if (!platforms) return false;

  // If the only platform configured is twitter, this is a twitter-only source
  const nonTwitterPlatforms = Object.keys(platforms).filter(
    (p) => p !== "twitter"
  );
  return nonTwitterPlatforms.length === 0 && "twitter" in platforms;
}

function hasTwitterPlatform(source: {
  configJson?: unknown;
}): boolean {
  const config = source.configJson as Record<string, unknown> | undefined;
  const platforms = config?.platforms as Record<string, unknown> | undefined;
  return !!platforms?.twitter;
}

// ============================================================================
// Dry Run
// ============================================================================

export const dryRun = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Count twitter content
    const allContent = await ctx.db.query("subscriptionContent").collect();
    const twitterContent = allContent.filter(isTwitterContent);

    // Count twitter-only sources
    const allSources = await ctx.db
      .query("subscriptionSources")
      .withIndex("by_type", (q) => q.eq("sourceType", "creator"))
      .collect();
    const twitterOnlySources = allSources.filter(isTwitterOnlySource);
    const sourcesWithTwitter = allSources.filter(
      (s) => hasTwitterPlatform(s) && !isTwitterOnlySource(s)
    );

    // Count feed items referencing twitter content
    const twitterContentIds = new Set(
      twitterContent.map((c) => c._id.toString())
    );
    const allFeedItems = await ctx.db.query("feedItems").collect();
    const affectedFeedItems = allFeedItems.filter((item) =>
      item.itemIds?.some((id: unknown) =>
        twitterContentIds.has((id as Id<"subscriptionContent">).toString())
      )
    );

    return {
      twitterContentToDelete: twitterContent.length,
      twitterOnlySourcesToDelete: twitterOnlySources.length,
      sourcesToStripTwitterFrom: sourcesWithTwitter.length,
      feedItemsToDelete: affectedFeedItems.length,
      sampleContent: twitterContent.slice(0, 5).map((c) => ({
        title: c.title.slice(0, 100),
        url: c.url,
      })),
      sampleSources: twitterOnlySources.slice(0, 5).map((s) => ({
        name: s.name,
        identifier: s.identifier,
      })),
    };
  },
});

// ============================================================================
// Execute (paginated to avoid timeout)
// ============================================================================

export const execute = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    let deletedContent = 0;
    let deletedFeedItems = 0;
    let deletedSources = 0;
    let strippedSources = 0;

    // Step 1: Delete twitter subscriptionContent (in batches)
    const allContent = await ctx.db.query("subscriptionContent").collect();
    const twitterContent = allContent.filter(isTwitterContent);
    const batch = twitterContent.slice(0, batchSize);

    const deletedContentIds = new Set<string>();
    for (const content of batch) {
      deletedContentIds.add(content._id.toString());
      await ctx.db.delete(content._id);
      deletedContent++;
    }

    // Step 2: Delete feedItems that reference deleted content
    if (deletedContentIds.size > 0) {
      const allFeedItems = await ctx.db.query("feedItems").collect();
      for (const item of allFeedItems) {
        const hasDeletedContent = item.itemIds?.some((id: unknown) =>
          deletedContentIds.has((id as Id<"subscriptionContent">).toString())
        );
        if (hasDeletedContent) {
          await ctx.db.delete(item._id);
          deletedFeedItems++;
        }
      }
    }

    // Step 3: Delete twitter-only sources
    const allSources = await ctx.db
      .query("subscriptionSources")
      .withIndex("by_type", (q) => q.eq("sourceType", "creator"))
      .collect();

    for (const source of allSources) {
      if (isTwitterOnlySource(source)) {
        await ctx.db.delete(source._id);
        deletedSources++;
      } else if (hasTwitterPlatform(source)) {
        // Step 4: Strip twitter from multi-platform sources
        const config = (source.configJson ?? {}) as Record<string, unknown>;
        const platforms = { ...(config.platforms as Record<string, unknown>) };
        delete platforms.twitter;
        await ctx.db.patch(source._id, {
          configJson: { ...config, platforms },
          // If the URL was an x.com URL, clear it
          ...(source.url?.includes("x.com") || source.url?.includes("twitter.com")
            ? { url: undefined }
            : {}),
        });
        strippedSources++;
      }
    }

    const remaining = twitterContent.length - batch.length;

    return {
      deletedContent,
      deletedFeedItems,
      deletedSources,
      strippedSources,
      remaining,
      message:
        remaining > 0
          ? `Deleted ${deletedContent} content items. Run again to process ${remaining} more.`
          : `Migration complete. Deleted ${deletedContent} content, ${deletedFeedItems} feed items, ${deletedSources} sources. Stripped twitter from ${strippedSources} sources.`,
    };
  },
});
