import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import {
  discoverCreatorValidator,
  verifyPlatformsValidator,
} from "./validators";

/**
 * Discover a creator by looking up their platforms
 * This orchestrates multiple platform lookups in parallel
 */
export const discover = action({
  args: discoverCreatorValidator,
  handler: async (ctx, args) => {
    const { name, platformHints } = args;

    // Normalize handle from name
    const handle = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 30);

    const platforms: Record<string, any> = {};
    const errors: string[] = [];
    let totalVerified = 0;

    // Look up each platform in parallel
    const lookups: Promise<void>[] = [];

    // YouTube
    if (platformHints?.youtube || !platformHints) {
      lookups.push(
        (async () => {
          try {
            const result = await ctx.runAction(
              internal.creators.internal.lookupYouTubeChannel,
              {
                handle: platformHints?.youtube || handle,
              }
            );
            if (result.verified) {
              platforms.youtube = {
                handle: result.handle,
                channelId: result.channelId,
                verified: true,
                subscriberCount: result.subscriberCount,
              };
              totalVerified++;
            } else {
              errors.push(`YouTube: ${result.error || "Not found"}`);
            }
          } catch (error) {
            errors.push(
              `YouTube: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        })()
      );
    }

    // Twitter
    if (platformHints?.twitter || !platformHints) {
      lookups.push(
        (async () => {
          try {
            const result = await ctx.runAction(
              internal.creators.internal.lookupTwitterUser,
              {
                handle: platformHints?.twitter || handle,
              }
            );
            if (result.verified) {
              platforms.twitter = {
                handle: result.handle,
                verified: true,
              };
              totalVerified++;
            } else {
              errors.push(`Twitter: ${result.error || "Not found"}`);
            }
          } catch (error) {
            errors.push(
              `Twitter: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        })()
      );
    }

    // Bluesky
    if (platformHints?.bluesky || !platformHints) {
      lookups.push(
        (async () => {
          try {
            const blueskyHandle = platformHints?.bluesky || `${handle}.bsky.social`;
            const result = await ctx.runAction(
              internal.creators.internal.lookupBlueskyUser,
              { handle: blueskyHandle }
            );
            if (result.verified) {
              platforms.bluesky = {
                handle: result.handle,
                did: result.did,
                verified: true,
                followerCount: result.followerCount,
              };
              totalVerified++;
            } else {
              errors.push(`Bluesky: ${result.error || "Not found"}`);
            }
          } catch (error) {
            errors.push(
              `Bluesky: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        })()
      );
    }

    // GitHub
    if (platformHints?.github || !platformHints) {
      lookups.push(
        (async () => {
          try {
            const result = await ctx.runAction(
              internal.creators.internal.lookupGitHubUser,
              { handle: platformHints?.github || handle }
            );
            if (result.verified) {
              platforms.github = {
                handle: result.handle,
                userId: result.userId,
                verified: true,
                followerCount: result.followerCount,
              };
              totalVerified++;
            } else {
              errors.push(`GitHub: ${result.error || "Not found"}`);
            }
          } catch (error) {
            errors.push(
              `GitHub: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        })()
      );
    }

    // Wait for all lookups to complete
    await Promise.all(lookups);

    // Calculate confidence based on verified platforms
    const confidence = Math.min(
      100,
      Math.round((totalVerified / 4) * 100)
    );

    // Determine canonical type from GitHub result if available
    const canonicalType: "person" | "organization" =
      platforms.github?.type === "Organization" ? "organization" : "person";

    // Build profile object
    const profile = {
      name,
      handle,
      canonicalType,
      platforms,
      lastVerifiedAt: Date.now(),
    };

    return {
      profile,
      confidence,
      sources: Object.keys(platforms),
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});

/**
 * Verify all platforms for a creator profile
 * Re-validates platform data via APIs
 */
export const verifyPlatforms = action({
  args: verifyPlatformsValidator,
  handler: async (ctx, args) => {
    // First, get the current profile via query
    const profileResult = await ctx.runQuery(
      api.creators.queries.get,
      { profileId: args.profileId }
    );

    if (!profileResult.creator) {
      throw new Error("Creator profile not found");
    }

    const profile = profileResult.creator;
    const verified: string[] = [];
    const failed: Array<{ platform: string; error: string }> = [];

    // Re-verify each platform
    const lookups: Promise<void>[] = [];

    if (profile.platforms.youtube) {
      lookups.push(
        (async () => {
          try {
            const result = await ctx.runAction(
              internal.creators.internal.lookupYouTubeChannel,
              { handle: profile.platforms.youtube!.handle }
            );
            if (result.verified) {
              verified.push("youtube");
            } else {
              failed.push({
                platform: "youtube",
                error: result.error || "Verification failed",
              });
            }
          } catch (error) {
            failed.push({
              platform: "youtube",
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        })()
      );
    }

    if (profile.platforms.twitter) {
      lookups.push(
        (async () => {
          try {
            const result = await ctx.runAction(
              internal.creators.internal.lookupTwitterUser,
              { handle: profile.platforms.twitter!.handle }
            );
            if (result.verified) {
              verified.push("twitter");
            } else {
              failed.push({
                platform: "twitter",
                error: result.error || "Verification failed",
              });
            }
          } catch (error) {
            failed.push({
              platform: "twitter",
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        })()
      );
    }

    if (profile.platforms.bluesky) {
      lookups.push(
        (async () => {
          try {
            const result = await ctx.runAction(
              internal.creators.internal.lookupBlueskyUser,
              { handle: profile.platforms.bluesky!.handle }
            );
            if (result.verified) {
              verified.push("bluesky");
            } else {
              failed.push({
                platform: "bluesky",
                error: result.error || "Verification failed",
              });
            }
          } catch (error) {
            failed.push({
              platform: "bluesky",
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        })()
      );
    }

    if (profile.platforms.github) {
      lookups.push(
        (async () => {
          try {
            const result = await ctx.runAction(
              internal.creators.internal.lookupGitHubUser,
              { handle: profile.platforms.github!.handle }
            );
            if (result.verified) {
              verified.push("github");
            } else {
              failed.push({
                platform: "github",
                error: result.error || "Verification failed",
              });
            }
          } catch (error) {
            failed.push({
              platform: "github",
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        })()
      );
    }

    if (profile.platforms.website) {
      lookups.push(
        (async () => {
          try {
            const result = await ctx.runAction(
              internal.creators.internal.validateWebsiteUrl,
              { url: profile.platforms.website!.url }
            );
            if (result.validated) {
              verified.push("website");
            } else {
              failed.push({
                platform: "website",
                error: result.error || "Verification failed",
              });
            }
          } catch (error) {
            failed.push({
              platform: "website",
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        })()
      );
    }

    await Promise.all(lookups);

    // Update lastVerifiedAt timestamp via mutation
    await ctx.runMutation(
      api.creators.mutations.update,
      {
        profileId: args.profileId,
        platforms: profile.platforms, // Keep existing platforms
      }
    );

    return {
      verified,
      failed,
      totalVerified: verified.length,
      totalFailed: failed.length,
    };
  },
});
