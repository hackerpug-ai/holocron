import { mutation } from "../_generated/server";
import { v } from "convex/values";
import {
  createCreatorProfileValidator,
  updateCreatorProfileValidator,
} from "./validators";

/**
 * Create a new creator profile
 */
export const create = mutation({
  args: createCreatorProfileValidator,
  handler: async (ctx, args) => {
    // Check if handle already exists
    // Scan index range and filter in-memory for exact handle match
    const results = await ctx.db
      .query("creatorProfiles")
      .withIndex("by_handle")
      .take(1);

    const existing = results.find(c => c.handle === args.handle);

    if (existing) {
      throw new Error(`Creator with handle "${args.handle}" already exists`);
    }

    const now = Date.now();
    const profileId = await ctx.db.insert("creatorProfiles", {
      name: args.name,
      handle: args.handle,
      canonicalType: args.canonicalType,
      platforms: args.platforms,
      bio: args.bio,
      avatarUrl: args.avatarUrl,
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { profileId };
  },
});

/**
 * Update an existing creator profile
 */
export const update = mutation({
  args: updateCreatorProfileValidator,
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) {
      throw new Error("Creator profile not found");
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.platforms) {
      updates.platforms = args.platforms;
    }

    if (args.bio !== undefined) {
      updates.bio = args.bio;
    }

    if (args.avatarUrl !== undefined) {
      updates.avatarUrl = args.avatarUrl;
    }

    await ctx.db.patch(args.profileId, updates);

    return { profileId: args.profileId };
  },
});

/**
 * Delete a creator profile
 */
export const remove = mutation({
  args: {
    profileId: v.id("creatorProfiles"),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) {
      throw new Error("Creator profile not found");
    }

    // Note: We don't cascade delete subscriptions
    // Users may want to keep subscriptions even if profile is deleted

    await ctx.db.delete(args.profileId);

    return { deleted: true };
  },
});
