import { v } from 'convex/values';
import { fencedInternalAction as internalAction } from '../lib/migrationFence';
import { asRecord } from '../lib/unknown';

// Handle normalization patterns
const YOUTUBE_HANDLE_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
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
    const normalized = handle.trim().toLowerCase().replace(/^@/, '');

    const valid = (() => {
      switch (platform) {
        case 'youtube':
          return YOUTUBE_HANDLE_REGEX.test(normalized);
        case 'bluesky':
          // Bluesky handles must include domain
          return BLUESKY_HANDLE_REGEX.test(normalized);
        case 'github':
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
      console.warn('YOUTUBE_API_KEY not set, returning unverified');
      return {
        handle: args.handle,
        verified: false,
        error: 'YouTube API key not configured',
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
            error: 'Channel not found',
          };
        }
        throw new Error(`YouTube API error: ${response.status}`);
      }

      const data = asRecord(await response.json());
      const items = Array.isArray(data?.items) ? data.items : [];

      if (items.length === 0) {
        return {
          handle: args.handle,
          verified: false,
          error: 'Channel not found',
        };
      }

      const channel = asRecord(items[0]);
      const statistics = asRecord(channel?.statistics);
      const snippet = asRecord(channel?.snippet);
      if (!channel || !snippet) {
        throw new Error('YouTube API returned an invalid channel');
      }
      return {
        handle: args.handle,
        channelId: typeof channel.id === 'string' ? channel.id : undefined,
        verified: true,
        subscriberCount: Number.parseInt(
          typeof statistics?.subscriberCount === 'string' ? statistics.subscriberCount : '',
          10
        ),
        title: typeof snippet.title === 'string' ? snippet.title : undefined,
        description: typeof snippet.description === 'string' ? snippet.description : undefined,
        thumbnails: snippet.thumbnails,
      };
    } catch (error) {
      console.error('YouTube lookup error:', error);
      return {
        handle: args.handle,
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
            error: 'Profile not found or invalid handle',
          };
        }
        throw new Error(`Bluesky API error: ${response.status}`);
      }

      const data = asRecord(await response.json());
      if (!data) {
        throw new Error('Bluesky API returned an invalid profile');
      }

      return {
        handle: typeof data.handle === 'string' ? data.handle : undefined,
        did: typeof data.did === 'string' ? data.did : undefined,
        verified: true,
        followerCount: typeof data.followersCount === 'number' ? data.followersCount : 0,
        displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
        description: typeof data.description === 'string' ? data.description : undefined,
        avatar: typeof data.avatar === 'string' ? data.avatar : undefined,
      };
    } catch (error) {
      console.error('Bluesky lookup error:', error);
      return {
        handle: args.handle,
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
      Accept: 'application/vnd.github.v3+json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`https://api.github.com/users/${args.handle}`, { headers });

      if (!response.ok) {
        if (response.status === 404) {
          return {
            handle: args.handle,
            verified: false,
            error: 'User not found',
          };
        }
        if (response.status === 403) {
          return {
            handle: args.handle,
            verified: false,
            error: 'GitHub API rate limit exceeded',
          };
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = asRecord(await response.json());
      if (!data) {
        throw new Error('GitHub API returned an invalid profile');
      }

      return {
        handle: typeof data.login === 'string' ? data.login : undefined,
        userId: typeof data.id === 'number' ? data.id : undefined,
        verified: true,
        followerCount: typeof data.followers === 'number' ? data.followers : 0,
        name: typeof data.name === 'string' || data.name === null ? data.name : undefined,
        bio: typeof data.bio === 'string' || data.bio === null ? data.bio : undefined,
        avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : undefined,
        type: typeof data.type === 'string' ? data.type : undefined, // User or Organization
      };
    } catch (error) {
      console.error('GitHub lookup error:', error);
      return {
        handle: args.handle,
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });

      return {
        url,
        validated: response.ok,
        statusCode: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      console.error('Website validation error:', error);
      return {
        url: args.url,
        validated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});
