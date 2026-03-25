import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

// Generate short random token using nanoid-like approach
function generateToken(length: number): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const result = [];
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  for (let i = 0; i < length; i++) {
    result.push(chars[bytes[i] % chars.length]);
  }

  return result.join("");
}

/**
 * Generate a subscription link
 * Creates a short, shareable token for subscriptions
 */
export const generateLink = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    // Must provide either creatorProfileId or subscriptions
    if (!args.creatorProfileId && !args.subscriptions) {
      throw new Error("Must provide either creatorProfileId or subscriptions");
    }

    // Generate unique token
    const token = generateToken(8);
    const now = Date.now();
    const expiresAt = args.expiresIn ? now + args.expiresIn * 1000 : undefined;

    // Check if token already exists (unlikely but possible)
    const existing = await ctx.db
      .query("subscriptionLinks")
      .withIndex("by_token")
      .filter((q) => q.eq(q.field("token"), token))
      .first();

    if (existing) {
      // Regenerate with different token (simple retry)
      const newToken = generateToken(8);
      const newExisting = await ctx.db
        .query("subscriptionLinks")
        .withIndex("by_token")
        .filter((q) => q.eq(q.field("token"), newToken))
        .first();

      if (newExisting) {
        throw new Error("Unable to generate unique token");
      }

      // Use new token
      const linkId = await ctx.db.insert("subscriptionLinks", {
        token: newToken,
        creatorProfileId: args.creatorProfileId,
        subscriptions: args.subscriptions,
        createdBy: "system",
        expiresAt,
        clickCount: 0,
        createdAt: now,
      });

      const url = `holocron://subscribe/${newToken}`;
      return { linkId, token: newToken, url, expiresAt };
    }

    // Create subscription link
    const linkId = await ctx.db.insert("subscriptionLinks", {
      token,
      creatorProfileId: args.creatorProfileId,
      subscriptions: args.subscriptions,
      createdBy: "system", // TODO: Add user auth when implemented
      expiresAt,
      clickCount: 0,
      createdAt: now,
    });

    // Generate full URL
    const url = `holocron://subscribe/${token}`;

    return {
      linkId,
      token,
      url,
      expiresAt,
    };
  },
});

/**
 * Resolve a subscription link token
 * Returns the subscription data for the token
 */
export const resolveLink = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("subscriptionLinks")
      .withIndex("by_token")
      .filter((q) => q.eq(q.field("token"), args.token))
      .first();

    if (!link) {
      throw new Error("Subscription link not found");
    }

    // Check if expired
    if (link.expiresAt && link.expiresAt < Date.now()) {
      throw new Error("Subscription link has expired");
    }

    // If link has creatorProfileId, fetch profile and build subscriptions
    let subscriptions = link.subscriptions;
    let creatorProfile = undefined;

    if (link.creatorProfileId) {
      const profile = await ctx.db.get(link.creatorProfileId);
      if (!profile) {
        throw new Error("Creator profile not found");
      }

      creatorProfile = {
        name: profile.name,
        handle: profile.handle,
      };

      // Build subscriptions from profile platforms
      if (!subscriptions) {
        subscriptions = [];
        for (const [platform, data] of Object.entries(profile.platforms)) {
          if (data && typeof data === "object" && "verified" in data && (data as { verified?: boolean }).verified) {
            const platformData = data as { handle?: string; url?: string };
            const handle = platformData.handle ?? platformData.url ?? platform;
            subscriptions.push({
              sourceType: "creator" as const,
              identifier: handle,
              name: `${profile.name} (${platform})`,
            });
          }
        }
      }
    }

    return {
      subscriptions: subscriptions ?? [],
      creatorProfile,
      expiresAt: link.expiresAt,
    };
  },
});

/**
 * Subscribe from a link token
 * Creates subscriptions from the link data
 */
export const subscribeFromLink = mutation({
  args: {
    token: v.string(),
    autoResearch: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get the link directly
    const link = await ctx.db
      .query("subscriptionLinks")
      .withIndex("by_token")
      .filter((q) => q.eq(q.field("token"), args.token))
      .first();

    if (!link) {
      throw new Error("Subscription link not found");
    }

    // Check if expired
    if (link.expiresAt && link.expiresAt < Date.now()) {
      throw new Error("Subscription link has expired");
    }

    // If link has creatorProfileId, build subscriptions from profile
    let subscriptions = link.subscriptions;
    if (link.creatorProfileId && !subscriptions) {
      const profile = await ctx.db.get(link.creatorProfileId);
      if (profile) {
        subscriptions = [];
        for (const [platform, data] of Object.entries(profile.platforms)) {
          if (data && typeof data === "object" && "verified" in data && (data as { verified?: boolean }).verified) {
            const platformData = data as { handle?: string; url?: string };
            const handle = platformData.handle ?? platformData.url ?? platform;
            subscriptions.push({
              sourceType: "creator" as const,
              identifier: handle,
              name: `${profile.name} (${platform})`,
            });
          }
        }
      }
    }

    // Build creator profile for response
    let creatorProfile = undefined;
    if (link.creatorProfileId) {
      const profile = await ctx.db.get(link.creatorProfileId);
      if (profile) {
        creatorProfile = {
          name: profile.name,
          handle: profile.handle,
        };
      }
    }

    const created: Array<{ subscriptionId: string; sourceType: string; identifier: string }> = [];
    const failed: Array<{ sourceType: string; identifier: string; error: string }> = [];
    const now = Date.now();
    const autoResearch = args.autoResearch ?? true;

    // Create subscriptions
    const subsToCreate = subscriptions ?? [];
    for (const sub of subsToCreate) {
      try {
        // Check if subscription already exists
        const existing = await ctx.db
          .query("subscriptionSources")
          .withIndex("by_identifier")
          .filter((q) => q.eq(q.field("identifier"), sub.identifier))
          .first();

        if (existing) {
          failed.push({
            sourceType: sub.sourceType,
            identifier: sub.identifier,
            error: "Subscription already exists",
          });
          continue;
        }

        // Create subscription
        const subscriptionId = await ctx.db.insert("subscriptionSources", {
          ...sub,
          fetchMethod: "rss",
          autoResearch,
          createdAt: now,
          updatedAt: now,
        });

        created.push({
          subscriptionId,
          sourceType: sub.sourceType,
          identifier: sub.identifier,
        });
      } catch (error) {
        failed.push({
          sourceType: sub.sourceType,
          identifier: sub.identifier,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Increment click count
    const linkRecord = await ctx.db
      .query("subscriptionLinks")
      .withIndex("by_token")
      .filter((q) => q.eq(q.field("token"), args.token))
      .first();

    if (linkRecord) {
      await ctx.db.patch(linkRecord._id, {
        clickCount: linkRecord.clickCount + 1,
      });
    }

    return {
      created,
      failed,
      creatorProfile,
    };
  },
});
