import { v } from "convex/values";

// Platform-specific validators
export const youtubePlatformValidator = v.object({
  handle: v.string(),
  channelId: v.optional(v.string()),
  verified: v.boolean(),
  subscriberCount: v.optional(v.number()),
});

export const twitterPlatformValidator = v.object({
  handle: v.string(),
  userId: v.optional(v.string()),
  verified: v.boolean(),
  followerCount: v.optional(v.number()),
});

export const blueskyPlatformValidator = v.object({
  handle: v.string(),
  did: v.optional(v.string()),
  verified: v.boolean(),
  followerCount: v.optional(v.number()),
});

export const githubPlatformValidator = v.object({
  handle: v.string(),
  userId: v.optional(v.number()),
  verified: v.boolean(),
  followerCount: v.optional(v.number()),
});

export const websitePlatformValidator = v.object({
  url: v.string(),
  validated: v.boolean(),
});

// Combined platforms validator
export const platformsValidator = v.object({
  youtube: v.optional(youtubePlatformValidator),
  twitter: v.optional(twitterPlatformValidator),
  bluesky: v.optional(blueskyPlatformValidator),
  github: v.optional(githubPlatformValidator),
  website: v.optional(websitePlatformValidator),
});

// Creator profile validators
export const createCreatorProfileValidator = v.object({
  name: v.string(),
  handle: v.string(),
  canonicalType: v.union(v.literal("person"), v.literal("organization")),
  platforms: platformsValidator,
  bio: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
});

export const updateCreatorProfileValidator = v.object({
  profileId: v.id("creatorProfiles"),
  platforms: v.optional(platformsValidator),
  bio: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
});

// Search validators
export const searchCreatorsValidator = v.object({
  query: v.string(),
  limit: v.optional(v.number()),
  exactMatch: v.optional(v.boolean()),
});

// Batch subscribe validators
export const batchSubscribeValidator = v.object({
  creatorProfileId: v.id("creatorProfiles"),
  platforms: v.array(
    v.union(
      v.literal("youtube"),
      v.literal("twitter"),
      v.literal("bluesky"),
      v.literal("github"),
      v.literal("website")
    )
  ),
  autoResearch: v.optional(v.boolean()),
});

// Subscription link validators
export const generateLinkValidator = v.object({
  creatorProfileId: v.optional(v.id("creatorProfiles")),
  subscriptions: v.optional(
    v.array(
      v.object({
        sourceType: v.union(
          v.literal("youtube"),
          v.literal("newsletter"),
          v.literal("changelog"),
          v.literal("reddit"),
          v.literal("ebay"),
          v.literal("whats-new"),
          v.literal("creator")
        ),
        identifier: v.string(),
        name: v.string(),
        url: v.optional(v.string()),
        feedUrl: v.optional(v.string()),
        configJson: v.optional(v.any()),
      })
    )
  ),
  expiresIn: v.optional(v.number()), // seconds
});

export const resolveLinkValidator = v.object({
  token: v.string(),
});

export const subscribeFromLinkValidator = v.object({
  token: v.string(),
  autoResearch: v.optional(v.boolean()),
});

// Discovery validators
export const discoverCreatorValidator = v.object({
  name: v.string(),
  platformHints: v.optional(
    v.object({
      youtube: v.optional(v.string()),
      twitter: v.optional(v.string()),
      bluesky: v.optional(v.string()),
      github: v.optional(v.string()),
      website: v.optional(v.string()),
    })
  ),
});

export const verifyPlatformsValidator = v.object({
  profileId: v.id("creatorProfiles"),
});
