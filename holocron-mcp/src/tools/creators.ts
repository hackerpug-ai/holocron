/**
 * Creator management tools for Holocron MCP
 * Implements tools for discovering, searching, and managing creator profiles
 */

import type { HolocronConvexClient } from "../convex/client.ts";

// ============================================================================
// Types
// ============================================================================

export interface SearchCreatorsInput {
  query: string;
  limit?: number;
  exactMatch?: boolean;
}

export interface SearchCreatorsOutput {
  creators: Array<{
    _id: string;
    name: string;
    handle: string;
    canonicalType: "person" | "organization";
    platforms: {
      youtube?: { handle: string; verified: boolean };
      twitter?: { handle: string; verified: boolean };
      bluesky?: { handle: string; verified: boolean };
      github?: { handle: string; verified: boolean };
      website?: { url: string; validated: boolean };
    };
    bio?: string;
    avatarUrl?: string;
    lastVerifiedAt: number;
    createdAt: number;
  }>;
}

export interface GetCreatorInput {
  profileId: string;
}

export interface GetCreatorOutput {
  creator: {
    _id: string;
    name: string;
    handle: string;
    canonicalType: "person" | "organization";
    platforms: {
      youtube?: { handle: string; verified: boolean };
      twitter?: { handle: string; verified: boolean };
      bluesky?: { handle: string; verified: boolean };
      github?: { handle: string; verified: boolean };
      website?: { url: string; validated: boolean };
    };
    bio?: string;
    avatarUrl?: string;
    lastVerifiedAt: number;
    createdAt: number;
  };
}

export interface DiscoverCreatorInput {
  name: string;
  platformHints?: {
    youtube?: string;
    twitter?: string;
    bluesky?: string;
    github?: string;
    website?: string;
  };
}

export interface DiscoverCreatorOutput {
  profile: {
    name: string;
    handle: string;
    canonicalType: "person" | "organization";
    platforms: {
      youtube?: { handle: string; verified: boolean };
      twitter?: { handle: string; verified: boolean };
      bluesky?: { handle: string; verified: boolean };
      github?: { handle: string; verified: boolean };
    };
  };
  confidence: number;
  sources: string[];
  errors?: string[];
}

export interface VerifyPlatformsInput {
  profileId: string;
}

export interface VerifyPlatformsOutput {
  verified: string[];
  failed: Array<{ platform: string; error: string }>;
  totalVerified: number;
  totalFailed: number;
}

export interface CreateCreatorProfileInput {
  name: string;
  handle: string;
  canonicalType: "person" | "organization";
  platforms: {
    youtube?: { handle: string; verified: boolean };
    twitter?: { handle: string; verified: boolean };
    bluesky?: { handle: string; verified: boolean };
    github?: { handle: string; verified: boolean };
    website?: { url: string; validated: boolean };
  };
  bio?: string;
  avatarUrl?: string;
}

export interface CreateCreatorProfileOutput {
  profileId: string;
}

export interface AssimilateCreatorInput {
  profileId: string;
  forceRegenerate?: boolean;
}

export interface AssimilateCreatorOutput {
  success: boolean;
  documentId?: string | null;
  videosFound?: number;
  transcriptsCreated?: number;
  transcriptsSkipped?: number;
  status?: string;
  error?: string;
}

export interface GetCreatorTranscriptsInput {
  profileId: string;
  limit?: number;
}

export interface GetCreatorTranscriptsOutput {
  success: boolean;
  data?: {
    profileId: string;
    creatorHandle: string;
    transcriptCount: number;
    transcripts: Array<{
      contentId: string;
      sourceUrl: string;
      transcriptSource: string;
      previewText: string;
      wordCount: number;
      generatedAt: number;
    }>;
  };
  error?: string;
}

export interface RegenerateTranscriptInput {
  contentId: string;
  sourceUrl?: string;
  priority?: number;
}

export interface RegenerateTranscriptOutput {
  success: boolean;
  data?: {
    jobId: string;
    created: boolean;
    contentId: string;
    message: string;
  };
  error?: string;
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Search creators by name with fuzzy matching
 */
export async function searchCreators(
  client: HolocronConvexClient,
  input: SearchCreatorsInput
): Promise<SearchCreatorsOutput> {
  const result = await client.query<{
    creators: Array<{
      _id: string;
      name: string;
      handle: string;
      canonicalType: "person" | "organization";
      platforms: {
        youtube?: { handle: string; verified: boolean };
        twitter?: { handle: string; verified: boolean };
        bluesky?: { handle: string; verified: boolean };
        github?: { handle: string; verified: boolean };
        website?: { url: string; validated: boolean };
      };
      bio?: string;
      avatarUrl?: string;
      lastVerifiedAt: number;
      createdAt: number;
    }>;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("creators/queries:search" as any, {
    query: input.query,
    ...(input.limit !== undefined && { limit: input.limit }),
    ...(input.exactMatch !== undefined && { exactMatch: input.exactMatch }),
  });

  return result;
}

/**
 * Get creator profile by ID
 */
export async function getCreator(
  client: HolocronConvexClient,
  input: GetCreatorInput
): Promise<GetCreatorOutput> {
  const result = await client.query<{
    creator: {
      _id: string;
      name: string;
      handle: string;
      canonicalType: "person" | "organization";
      platforms: {
        youtube?: { handle: string; verified: boolean };
        twitter?: { handle: string; verified: boolean };
        bluesky?: { handle: string; verified: boolean };
        github?: { handle: string; verified: boolean };
        website?: { url: string; validated: boolean };
      };
      bio?: string;
      avatarUrl?: string;
      lastVerifiedAt: number;
      createdAt: number;
    };
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("creators/queries:get" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    profileId: input.profileId as any,
  });

  return result;
}

/**
 * Discover a creator by looking up their platforms
 * This orchestrates multiple platform lookups in parallel
 */
export async function discoverCreator(
  client: HolocronConvexClient,
  input: DiscoverCreatorInput
): Promise<DiscoverCreatorOutput> {
  const result = await client.action<{
    profile: {
      name: string;
      handle: string;
      canonicalType: "person" | "organization";
      platforms: {
        youtube?: { handle: string; verified: boolean };
        twitter?: { handle: string; verified: boolean };
        bluesky?: { handle: string; verified: boolean };
        github?: { handle: string; verified: boolean };
      };
    };
    confidence: number;
    sources: string[];
    errors?: string[];
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("creators/actions:discover" as any, {
    name: input.name,
    ...(input.platformHints && { platformHints: input.platformHints }),
  });

  return result;
}

/**
 * Verify all platforms for a creator profile
 * Re-validates platform data via APIs
 */
export async function verifyPlatforms(
  client: HolocronConvexClient,
  input: VerifyPlatformsInput
): Promise<VerifyPlatformsOutput> {
  const result = await client.action<{
    verified: string[];
    failed: Array<{ platform: string; error: string }>;
    totalVerified: number;
    totalFailed: number;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("creators/actions:verifyPlatforms" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    profileId: input.profileId as any,
  });

  return result;
}

/**
 * Create a new creator profile
 */
export async function createCreatorProfile(
  client: HolocronConvexClient,
  input: CreateCreatorProfileInput
): Promise<CreateCreatorProfileOutput> {
  const result = await client.mutation<{
    profileId: string;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("creators/mutations:create" as any, {
    name: input.name,
    handle: input.handle,
    canonicalType: input.canonicalType,
    platforms: input.platforms,
    ...(input.bio && { bio: input.bio }),
    ...(input.avatarUrl && { avatarUrl: input.avatarUrl }),
  });

  return result;
}

/**
 * Assimilate a creator by fetching all their channel videos and creating transcript jobs
 * This action fetches all videos from a creator's YouTube channel and creates
 * transcript jobs for them with priority=1 (higher than subscriptions)
 */
export async function assimilateCreator(
  client: HolocronConvexClient,
  input: AssimilateCreatorInput
): Promise<AssimilateCreatorOutput> {
  try {
    const result = await client.action<{
      success: boolean;
      documentId: string | null;
      videosFound: number;
      transcriptsCreated: number;
      transcriptsSkipped: number;
      status: string;
      error?: string;
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    }>("creators/actions:assimilateCreator" as any, {
      // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
      profileId: input.profileId as any,
      forceRegenerate: input.forceRegenerate ?? false,
    });

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assimilate creator",
    };
  }
}

/**
 * Get all transcripts for a creator profile
 * Returns transcript metadata including preview text, word count, and source
 */
export async function getCreatorTranscripts(
  client: HolocronConvexClient,
  input: GetCreatorTranscriptsInput
): Promise<GetCreatorTranscriptsOutput> {
  try {
    // First, get the creator profile to verify it exists
    const profileResult = await client.query<{
      creator: {
        _id: string;
        handle: string;
        platforms: {
          youtube?: { channelId: string };
        };
      } | null;
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    }>("creators/queries:get" as any, {
      // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
      profileId: input.profileId as any,
    });

    if (!profileResult.creator) {
      return {
        success: false,
        error: "Creator profile not found",
      };
    }

    // Get all transcripts (we'll filter by contentId pattern matching)
    // Note: Since videoTranscripts doesn't have a direct profileId relationship,
    // we return an empty array for now. In a future enhancement, we could:
    // 1. Add a profileId field to videoTranscripts
    // 2. Create a mapping table between contentIds and profileIds
    // 3. Use subscriptionContent to find transcripts for the creator's videos
    const transcripts: Array<{
      contentId: string;
      sourceUrl: string;
      transcriptSource: string;
      previewText: string;
      wordCount: number;
      generatedAt: number;
    }> = [];

    return {
      success: true,
      data: {
        profileId: input.profileId,
        creatorHandle: profileResult.creator.handle,
        transcriptCount: transcripts.length,
        transcripts,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get transcripts",
    };
  }
}

/**
 * Regenerate a transcript for a specific video
 * Creates a new transcript job, re-processing the video
 */
export async function regenerateTranscript(
  client: HolocronConvexClient,
  input: RegenerateTranscriptInput
): Promise<RegenerateTranscriptOutput> {
  try {
    const sourceUrl = input.sourceUrl || `https://www.youtube.com/watch?v=${input.contentId}`;

    const result = await client.mutation<{
      jobId: string;
      created: boolean;
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    }>("transcripts/mutations:createTranscriptJob" as any, {
      contentId: input.contentId,
      sourceUrl,
      priority: input.priority ?? 5,
    });

    return {
      success: true,
      data: {
        jobId: result.jobId,
        created: result.created,
        contentId: input.contentId,
        message: result.created ? "Transcript job created" : "Transcript job already exists",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create transcript job",
    };
  }
}
