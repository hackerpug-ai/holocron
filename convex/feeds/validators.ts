import { v } from "convex/values";

// Content type enum validator
export const contentTypeEnum = v.union(
  v.literal("video"),
  v.literal("blog"),
  v.literal("social"),
  v.literal("mixed")
);

// Feed item fields validator
export const feedItemFields = {
  groupKey: v.string(),
  title: v.string(),
  summary: v.optional(v.string()),
  contentType: v.union(
    v.literal("video"),
    v.literal("blog"),
    v.literal("social")
  ),
  itemCount: v.number(),
  itemIds: v.array(v.id("subscriptionContent")),
  creatorProfileId: v.optional(v.id("creatorProfiles")),
  subscriptionIds: v.array(v.id("subscriptionSources")),
  thumbnailUrl: v.optional(v.string()),
  viewed: v.boolean(),
  viewedAt: v.optional(v.number()),
  publishedAt: v.number(),
  discoveredAt: v.number(),
  createdAt: v.number(),
};

// Feed session fields validator
export const feedSessionFields = {
  startTime: v.number(),
  endTime: v.optional(v.number()),
  itemsViewed: v.number(),
  itemsConsumed: v.number(),
  sessionSource: v.optional(v.string()),
};

// Query argument validators
export const getFeedArgs = {
  limit: v.optional(v.number()),
  contentType: v.optional(contentTypeEnum),
  viewed: v.optional(v.boolean()),
  creatorProfileId: v.optional(v.id("creatorProfiles")),
};

export const getByCreatorArgs = {
  creatorProfileId: v.id("creatorProfiles"),
  limit: v.optional(v.number()),
};

export const getUnviewedCountArgs = {
  contentType: v.optional(contentTypeEnum),
};

export const getDigestSummaryArgs = {
  limit: v.optional(v.number()),
};

// Mutation argument validators
export const markViewedArgs = {
  feedItemIds: v.array(v.id("feedItems")),
  viewedAt: v.optional(v.number()),
};

export const markAllViewedArgs = {
  viewedAt: v.optional(v.number()),
};

export const createDigestNotificationArgs = {
  limit: v.optional(v.number()),
};
