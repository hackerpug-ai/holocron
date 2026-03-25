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
