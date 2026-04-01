/**
 * Subscription management tools for Holocron MCP
 * Implements tools for adding, removing, and managing subscription sources
 */

import type { HolocronConvexClient } from "../convex/client.ts";

// ============================================================================
// Types
// ============================================================================

export interface AddSubscriptionInput {
  sourceType:
    | "youtube"
    | "newsletter"
    | "changelog"
    | "reddit"
    | "ebay"
    | "whats-new"
    | "creator"
    | "github";
  identifier: string;
  name: string;
  url?: string;
  feedUrl?: string;
  configJson?: {
    platforms?: {
      twitter?: string;
      bluesky?: string;
      youtube?: string;
      github?: string;
    };
  };
}

export interface RemoveSubscriptionInput {
  subscriptionId: string;
}

export interface ListSubscriptionsInput {
  sourceType?:
    | "youtube"
    | "newsletter"
    | "changelog"
    | "reddit"
    | "ebay"
    | "whats-new"
    | "creator"
    | "github";
  autoResearchOnly?: boolean;
  limit?: number;
}

export interface CheckSubscriptionsInput {
  sourceType?:
    | "youtube"
    | "newsletter"
    | "changelog"
    | "reddit"
    | "ebay"
    | "whats-new"
    | "creator"
    | "github";
}

export interface GetSubscriptionContentInput {
  subscriptionId: string;
  researchStatus?: "pending" | "queued" | "researched" | "skipped";
  limit?: number;
}

export interface SetSubscriptionFilterInput {
  sourceId?: string;
  sourceType?: string;
  ruleName: string;
  ruleType: string;
  ruleValue: unknown;
  weight?: number;
}

export interface GetSubscriptionFiltersInput {
  subscriptionId?: string;
  sourceType?: string;
}

export interface AddSubscriptionOutput {
  subscriptionId: string;
  sourceType: string;
  identifier: string;
  name: string;
  createdAt: number;
}

export interface RemoveSubscriptionOutput {
  deleted: boolean;
  subscription: {
    _id: string;
    sourceType: string;
    identifier: string;
    name: string;
  };
}

export interface ListSubscriptionsOutput {
  subscriptions: Array<{
    _id: string;
    sourceType: string;
    identifier: string;
    name: string;
    autoResearch: boolean;
    lastChecked?: number;
    createdAt: number;
  }>;
}

export interface CheckSubscriptionsOutput {
  sourcesChecked: number;
  totalFetched: number;
  totalQueued: number;
  errors: Array<{ source: string; error: string }>;
}

export interface GetSubscriptionContentOutput {
  content: Array<{
    _id: string;
    sourceId: string;
    contentId: string;
    title: string;
    url?: string;
    researchStatus: string;
    passedFilter: boolean;
    filterReason?: string;
    discoveredAt: number;
  }>;
}

export interface SetSubscriptionFilterOutput {
  filterId: string;
  ruleName: string;
  ruleType: string;
  ruleValue: unknown;
  weight: number;
}

export interface GetSubscriptionFiltersOutput {
  filters: Array<{
    _id: string;
    sourceId?: string;
    sourceType?: string;
    ruleName: string;
    ruleType: string;
    ruleValue: unknown;
    weight: number;
  }>;
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Add a new subscription source
 */
export async function addSubscription(
  client: HolocronConvexClient,
  input: AddSubscriptionInput
): Promise<AddSubscriptionOutput> {
  const result = await client.mutation<{
    _id: string;
    sourceType: string;
    identifier: string;
    name: string;
    createdAt: number;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("subscriptions/mutations:add" as any, {
    sourceType: input.sourceType,
    identifier: input.identifier,
    name: input.name,
    ...(input.url && { url: input.url }),
    ...(input.feedUrl && { feedUrl: input.feedUrl }),
    ...(input.configJson && { configJson: input.configJson }),
  });

  return {
    subscriptionId: result._id,
    sourceType: result.sourceType,
    identifier: result.identifier,
    name: result.name,
    createdAt: result.createdAt,
  };
}

/**
 * Remove a subscription source
 */
export async function removeSubscription(
  client: HolocronConvexClient,
  input: RemoveSubscriptionInput
): Promise<RemoveSubscriptionOutput> {
  const result = await client.mutation<{
    deleted: boolean;
    subscription: {
      _id: string;
      sourceType: string;
      identifier: string;
      name: string;
    };
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("subscriptions/mutations:remove" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    subscriptionId: input.subscriptionId as any,
  });

  return result;
}

/**
 * List subscription sources
 */
export async function listSubscriptions(
  client: HolocronConvexClient,
  input: ListSubscriptionsInput = {}
): Promise<ListSubscriptionsOutput> {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference and result type
  const result = await client.query<any[]>("subscriptions/queries:list" as any, {
    ...(input.sourceType && { sourceType: input.sourceType }),
    ...(input.autoResearchOnly !== undefined && { autoResearchOnly: input.autoResearchOnly }),
    ...(input.limit && { limit: input.limit }),
  });

  return {
    subscriptions: result.map((s) => ({
      _id: s._id,
      sourceType: s.sourceType,
      identifier: s.identifier,
      name: s.name,
      autoResearch: s.autoResearch,
      lastChecked: s.lastChecked,
      createdAt: s.createdAt,
    })),
  };
}

/**
 * Check subscriptions for new content
 */
export async function checkSubscriptions(
  client: HolocronConvexClient,
  input: CheckSubscriptionsInput = {}
): Promise<CheckSubscriptionsOutput> {
  const result = await client.action<{
    sourcesChecked: number;
    totalFetched: number;
    totalQueued: number;
    errors: Array<{ source: string; error: string }>;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("subscriptions/actions:check" as any, {
    ...(input.sourceType && { sourceType: input.sourceType }),
  });

  return result;
}

/**
 * Get subscription content
 */
export async function getSubscriptionContent(
  client: HolocronConvexClient,
  input: GetSubscriptionContentInput
): Promise<GetSubscriptionContentOutput> {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference and result type
  const result = await client.query<any[]>("subscriptions/queries:listContent" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    subscriptionId: input.subscriptionId as any,
    ...(input.researchStatus && { researchStatus: input.researchStatus }),
    ...(input.limit && { limit: input.limit }),
  });

  return {
    content: result.map((c) => ({
      _id: c._id,
      sourceId: c.sourceId,
      contentId: c.contentId,
      title: c.title,
      url: c.url,
      researchStatus: c.researchStatus,
      passedFilter: c.passedFilter,
      filterReason: c.filterReason,
      discoveredAt: c.discoveredAt,
    })),
  };
}

/**
 * Set a subscription filter
 */
export async function setSubscriptionFilter(
  client: HolocronConvexClient,
  input: SetSubscriptionFilterInput
): Promise<SetSubscriptionFilterOutput> {
  const result = await client.mutation<{
    _id: string;
    ruleName: string;
    ruleType: string;
    ruleValue: unknown;
    weight: number;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("subscriptions/mutations:setFilter" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    ...(input.sourceId && { sourceId: input.sourceId as any }),
    ...(input.sourceType && { sourceType: input.sourceType }),
    ruleName: input.ruleName,
    ruleType: input.ruleType,
    ruleValue: input.ruleValue,
    ...(input.weight !== undefined && { weight: input.weight }),
  });

  return {
    filterId: result._id,
    ruleName: result.ruleName,
    ruleType: result.ruleType,
    ruleValue: result.ruleValue,
    weight: result.weight,
  };
}

/**
 * Get subscription filters
 */
export async function getSubscriptionFilters(
  client: HolocronConvexClient,
  input: GetSubscriptionFiltersInput = {}
): Promise<GetSubscriptionFiltersOutput> {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference and result type
  const result = await client.query<any[]>("subscriptions/queries:getFilters" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    ...(input.subscriptionId && { subscriptionId: input.subscriptionId as any }),
    ...(input.sourceType && { sourceType: input.sourceType }),
  });

  return {
    filters: result.map((f) => ({
      _id: f._id,
      sourceId: f.sourceId,
      sourceType: f.sourceType,
      ruleName: f.ruleName,
      ruleType: f.ruleType,
      ruleValue: f.ruleValue,
      weight: f.weight,
    })),
  };
}

// ============================================================================
// Creator Subscription Helpers
// ============================================================================

export interface AddCreatorSubscriptionInput {
  name: string;
  twitter?: string;
  bluesky?: string;
  youtube?: string;
  github?: string;
}

/**
 * Convenience function for adding creator subscriptions with platform handles
 */
export async function addCreatorSubscription(
  client: HolocronConvexClient,
  input: AddCreatorSubscriptionInput
): Promise<AddSubscriptionOutput> {
  const { name, twitter, bluesky, youtube, github } = input;

  // Generate identifier from name
  const identifier = name.toLowerCase().replace(/\s+/g, "-");

  // Build platforms config
  const platforms: Record<string, string> = {};
  if (twitter) platforms.twitter = twitter;
  if (bluesky) platforms.bluesky = bluesky;
  if (youtube) platforms.youtube = youtube;
  if (github) platforms.github = github;

  return addSubscription(client, {
    sourceType: "creator",
    identifier,
    name,
    configJson: { platforms },
  });
}

// ============================================================================
// Batch Subscribe & Link Tools (Easy Subscribe Feature)
// ============================================================================

export interface BatchSubscribeInput {
  creatorProfileId: string;
  platforms: Array<"youtube" | "twitter" | "bluesky" | "github" | "website">;
  autoResearch?: boolean;
}

export interface BatchSubscribeOutput {
  created: Array<{
    subscriptionId: string;
    platform: string;
    identifier: string;
  }>;
  failed: Array<{
    platform: string;
    error: string;
  }>;
}

/**
 * Batch subscribe to multiple platforms for a creator
 * Creates subscriptions transactionally with detailed error handling
 */
export async function batchSubscribe(
  client: HolocronConvexClient,
  input: BatchSubscribeInput
): Promise<BatchSubscribeOutput> {
  const result = await client.mutation<{
    created: Array<{ subscriptionId: string; platform: string; identifier: string }>;
    failed: Array<{ platform: string; error: string }>;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("subscriptions/mutations:batchSubscribe" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    creatorProfileId: input.creatorProfileId as any,
    platforms: input.platforms,
    ...(input.autoResearch !== undefined && { autoResearch: input.autoResearch }),
  });

  return result;
}

export interface GenerateSubscriptionLinkInput {
  creatorProfileId?: string;
  subscriptions?: Array<{
    sourceType:
      | "youtube"
      | "newsletter"
      | "changelog"
      | "reddit"
      | "ebay"
      | "whats-new"
      | "creator";
    identifier: string;
    name: string;
    url?: string;
    feedUrl?: string;
    configJson?: unknown;
  }>;
  expiresIn?: number; // seconds
}

export interface GenerateSubscriptionLinkOutput {
  linkId: string;
  token: string;
  url: string;
  expiresAt?: number;
}

/**
 * Generate a shareable subscription link
 * Creates a short token for easy subscription sharing
 */
export async function generateSubscriptionLink(
  client: HolocronConvexClient,
  input: GenerateSubscriptionLinkInput
): Promise<GenerateSubscriptionLinkOutput> {
  const result = await client.mutation<{
    linkId: string;
    token: string;
    url: string;
    expiresAt?: number;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("subscriptions/links:generateLink" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    ...(input.creatorProfileId && { creatorProfileId: input.creatorProfileId as any }),
    ...(input.subscriptions && { subscriptions: input.subscriptions }),
    ...(input.expiresIn !== undefined && { expiresIn: input.expiresIn }),
  });

  return result;
}

export interface ResolveSubscriptionLinkInput {
  token: string;
}

export interface ResolveSubscriptionLinkOutput {
  subscriptions: Array<{
    sourceType: string;
    identifier: string;
    name: string;
    url?: string;
    feedUrl?: string;
  }>;
  creatorProfile?: {
    name: string;
    handle: string;
  };
  expiresAt?: number;
}

/**
 * Resolve a subscription link token
 * Returns the subscription data for the token
 */
export async function resolveSubscriptionLink(
  client: HolocronConvexClient,
  input: ResolveSubscriptionLinkInput
): Promise<ResolveSubscriptionLinkOutput> {
  const result = await client.query<{
    subscriptions: Array<{
      sourceType: string;
      identifier: string;
      name: string;
      url?: string;
      feedUrl?: string;
    }>;
    creatorProfile?: {
      name: string;
      handle: string;
    };
    expiresAt?: number;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("subscriptions/links:resolveLink" as any, {
    token: input.token,
  });

  return result;
}

export interface SubscribeFromLinkInput {
  token: string;
  autoResearch?: boolean;
}

export interface SubscribeFromLinkOutput {
  created: Array<{
    subscriptionId: string;
    sourceType: string;
    identifier: string;
  }>;
  failed: Array<{
    sourceType: string;
    identifier: string;
    error: string;
  }>;
  creatorProfile?: {
    name: string;
    handle: string;
  };
}

/**
 * Subscribe from a link token
 * Creates subscriptions from the link data
 */
export async function subscribeFromLink(
  client: HolocronConvexClient,
  input: SubscribeFromLinkInput
): Promise<SubscribeFromLinkOutput> {
  const result = await client.mutation<{
    created: Array<{ subscriptionId: string; sourceType: string; identifier: string }>;
    failed: Array<{ sourceType: string; identifier: string; error: string }>;
    creatorProfile?: { name: string; handle: string };
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("subscriptions/links:subscribeFromLink" as any, {
    token: input.token,
    ...(input.autoResearch !== undefined && { autoResearch: input.autoResearch }),
  });

  return result;
}
