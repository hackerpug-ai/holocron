/**
 * Subscriptions internal helpers.
 *
 * Agentic pipeline runners (checkAllSubscriptions / processQueuedContent) are
 * MIGRATED_TO_MISSION_ENGINE stubs (pipes-3 NEVER residual).
 *
 * Pure internalQuery/internalMutation data helpers remain for RN/CRUD and tests.
 */
import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import { migratedToMissionEngineError } from '../lib/migratedToMissionEngine';

const HINT = 'holo mission run subscriptions --claims <path> [--topic <text>]';

// ── Agentic residual (disabled) ────────────────────────────────────────────

export const checkAllSubscriptions = internalAction({
  args: {},
  handler: async () => {
    // Cron-safe no-op soak: do not run legacy pipeline work.
    return {
      ok: true,
      migrated: true,
      marker: 'MIGRATED_TO_MISSION_ENGINE',
      sourcesChecked: 0,
      newItems: 0,
    };
  },
});

export const processQueuedContent = internalAction({
  args: {},
  handler: async () => {
    return {
      ok: true,
      migrated: true,
      marker: 'MIGRATED_TO_MISSION_ENGINE',
      processed: 0,
    };
  },
});

export const runLegacyPipeline = internalAction({
  args: { reason: v.optional(v.string()) },
  handler: async () => {
    throw migratedToMissionEngineError('subscriptions/internal', HINT);
  },
});

// ── Pure read/write surfaces (not agentic pipelines) ───────────────────────

export const getActiveSources = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('subscriptionSources').collect();
  },
});

export const getContentBySourceAndId = internalQuery({
  args: {
    sourceId: v.id('subscriptionSources'),
    contentId: v.string(),
  },
  handler: async (ctx, args) => {
    const content = await ctx.db
      .query('subscriptionContent')
      .withIndex('by_source_content', (q) =>
        q.eq('sourceId', args.sourceId).eq('contentId', args.contentId)
      )
      .first();
    return content;
  },
});

export const getFiltersForSource = internalQuery({
  args: {
    sourceId: v.id('subscriptionSources'),
    sourceType: v.union(
      v.literal('youtube'),
      v.literal('newsletter'),
      v.literal('changelog'),
      v.literal('reddit'),
      v.literal('ebay'),
      v.literal('whats-new'),
      v.literal('creator'),
      v.literal('github')
    ),
  },
  handler: async (ctx, args) => {
    const filters = await ctx.db
      .query('subscriptionFilters')
      .withIndex('by_source', (q) => q.eq('sourceId', args.sourceId))
      .collect();
    const globalFilters = await ctx.db
      .query('subscriptionFilters')
      .withIndex('by_type', (q) => q.eq('sourceType', args.sourceType))
      .collect();
    return [...filters, ...globalFilters];
  },
});

export const insertContent = internalMutation({
  args: {
    sourceId: v.id('subscriptionSources'),
    contentId: v.string(),
    title: v.string(),
    url: v.string(),
    relevancyScore: v.number(),
    relevancyReason: v.string(),
    passedFilter: v.boolean(),
    metadataJson: v.optional(v.any()),
    embedding: v.optional(v.array(v.float64())),
    contentCategory: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    authorHandle: v.optional(v.string()),
    duration: v.optional(v.number()),
    aiRelevanceScore: v.optional(v.number()),
    aiRelevanceReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert('subscriptionContent', {
      sourceId: args.sourceId,
      contentId: args.contentId,
      title: args.title,
      url: args.url,
      metadataJson: args.metadataJson,
      passedFilter: args.passedFilter,
      filterReason: args.passedFilter ? args.relevancyReason : undefined,
      researchStatus: args.passedFilter ? 'queued' : 'skipped',
      discoveredAt: now,
      researchedAt: undefined,
      embedding: args.embedding,
      inFeed: false,
      contentCategory: args.contentCategory,
      thumbnailUrl: args.thumbnailUrl,
      authorHandle: args.authorHandle,
      duration: args.duration,
      aiRelevanceScore: args.aiRelevanceScore,
      aiRelevanceReason: args.aiRelevanceReason,
    });
    return id;
  },
});

export const updateSourceLastChecked = internalMutation({
  args: {
    sourceId: v.id('subscriptionSources'),
    lastChecked: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, { lastChecked: args.lastChecked });
  },
});
