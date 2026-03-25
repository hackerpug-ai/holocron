import { internalAction } from "../_generated/server";
import { v } from "convex/values";

// Handle normalization patterns
const YOUTUBE_HANDLE_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
const TWITTER_HANDLE_REGEX = /^[a-zA-Z0-9_]{1,15}$/;
const BLUESKY_HANDLE_REGEX = /^[a-zA-Z0-9.-]+\.([a-zA-Z]{2,})$/;
const GITHUB_HANDLE_REGEX = /^[a-zA-Z0-9-]{1,39}$/;

/**
 * Normalize and validate a platform handle
 */
export const normalizeHandle = internalAction({
  args: {
    platform: v.string(),
    handle: v.string(),
  },
  handler: async (_, args) => {
    const { platform, handle } = args;
    const normalized = handle.trim().toLowerCase().replace(/^@/, "");

     
    const valid = (() => {
      switch (platform) {
        case "youtube":
          return YOUTUBE_HANDLE_REGEX.test(normalized);
        case "twitter":
          return TWITTER_HANDLE_REGEX.test(normalized);
        case "bluesky":
          // Bluesky handles must include domain
          return BLUESKY_HANDLE_REGEX.test(normalized);
        case "github":
          return GITHUB_HANDLE_REGEX.test(normalized);
        default:
          return normalized.length > 0;
      }
    })();

    if (!valid) {
      throw new Error(`Invalid ${platform} handle: ${handle}`);
    }

    return { normalized, valid };
  },
});

/**
 * Lookup YouTube channel via YouTube Data API v3
 */
export const lookupYouTubeChannel = internalAction({
  args: {
    handle: v.string(),
  },
  handler: async (_, args) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.warn("YOUTUBE_API_KEY not set, returning unverified");
      return {
        handle: args.handle,
        verified: false,
        error: "YouTube API key not configured",
      };
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${args.handle}&key=${apiKey}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return {
            handle: args.handle,
            verified: false,
            error: "Channel not found",
          };
        }
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        return {
          handle: args.handle,
          verified: false,
          error: "Channel not found",
        };
      }

      const channel = data.items[0];
      return {
        handle: args.handle,
        channelId: channel.id,
        verified: true,
        subscriberCount: parseInt(channel.statistics.subscriberCount, 10),
        title: channel.snippet.title,
        description: channel.snippet.description,
        thumbnails: channel.snippet.thumbnails,
      };
    } catch (error) {
      console.error("YouTube lookup error:", error);
      return {
        handle: args.handle,
        verified: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Lookup Twitter/X user via Jina Reader (already integrated)
 */
export const lookupTwitterUser = internalAction({
  args: {
    handle: v.string(),
  },
  handler: async (_, args) => {
    try {
      // Use Jina Reader to fetch Twitter profile
      const url = `https://x.com/${args.handle}`;
      const response = await fetch(`https://r.jina.ai/http://${url}`);

      if (!response.ok) {
        return {
          handle: args.handle,
          verified: false,
          error: `Twitter fetch failed: ${response.status}`,
        };
      }

      const content = await response.text();

      // Parse basic info from the page content
      // Jina Reader returns cleaned text, so we look for profile indicators
      const hasProfile = content.includes(args.handle) || content.includes("@");

      return {
        handle: args.handle,
        verified: hasProfile,
        // Note: Jina Reader doesn't provide user ID or follower count
        // For a production app, you'd use the Twitter API
      };
    } catch (error) {
      console.error("Twitter lookup error:", error);
      return {
        handle: args.handle,
        verified: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Lookup Bluesky user via AT Protocol API
 */
export const lookupBlueskyUser = internalAction({
  args: {
    handle: v.string(),
  },
  handler: async (_, args) => {
    try {
      // Bluesky public API for profile lookup
      const response = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${args.handle}`
      );

      if (!response.ok) {
        if (response.status === 400) {
          return {
            handle: args.handle,
            verified: false,
            error: "Profile not found or invalid handle",
          };
        }
        throw new Error(`Bluesky API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        handle: data.handle,
        did: data.did,
        verified: true,
        followerCount: data.followersCount || 0,
        displayName: data.displayName,
        description: data.description,
        avatar: data.avatar,
      };
    } catch (error) {
      console.error("Bluesky lookup error:", error);
      return {
        handle: args.handle,
        verified: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Lookup GitHub user via GitHub REST API
 */
export const lookupGitHubUser = internalAction({
  args: {
    handle: v.string(),
  },
  handler: async (_, args) => {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(
        `https://api.github.com/users/${args.handle}`,
        { headers }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return {
            handle: args.handle,
            verified: false,
            error: "User not found",
          };
        }
        if (response.status === 403) {
          return {
            handle: args.handle,
            verified: false,
            error: "GitHub API rate limit exceeded",
          };
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        handle: data.login,
        userId: data.id,
        verified: true,
        followerCount: data.followers || 0,
        name: data.name,
        bio: data.bio,
        avatarUrl: data.avatar_url,
        type: data.type, // User or Organization
      };
    } catch (error) {
      console.error("GitHub lookup error:", error);
      return {
        handle: args.handle,
        verified: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Validate website URL (HTTP 200 check)
 */
export const validateWebsiteUrl = internalAction({
  args: {
    url: v.string(),
  },
  handler: async (_, args) => {
    try {
      // Basic URL validation
      let url = args.url;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `https://${url}`;
      }

      const response = await fetch(url, { method: "HEAD", redirect: "follow" });

      return {
        url,
        validated: response.ok,
        statusCode: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      console.error("Website validation error:", error);
      return {
        url: args.url,
        validated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
