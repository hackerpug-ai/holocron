/**
 * subscriptions group — sources/content/filters/links, creator_profiles, feed_*
 */
import { boolean, doublePrecision, integer, pgTable, text } from 'drizzle-orm/pg-core';
import {
  createdAtColumn,
  idColumn,
  legacyConvexIdColumn,
  legacyConvexIdIndex,
  timestamptz,
  typedJsonb,
  updatedAtColumn,
  vector,
} from '../columns';

export const creatorProfiles = pgTable(
  'creator_profiles',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    name: text('name'),
    handle: text('handle'),
    canonicalType: text('canonical_type'),
    platforms: typedJsonb('platforms'),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    lastVerifiedAt: timestamptz('last_verified_at'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [legacyConvexIdIndex('creator_profiles', t.legacyConvexId)]
);

export const subscriptionSources = pgTable(
  'subscription_sources',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sourceType: text('source_type'),
    identifier: text('identifier'),
    name: text('name'),
    url: text('url'),
    feedUrl: text('feed_url'),
    fetchMethod: text('fetch_method'),
    /** Typed jsonb config */
    configJson: typedJsonb<Record<string, unknown>>('config_json'),
    autoResearch: boolean('auto_research').default(false),
    creatorProfileId: text('creator_profile_id'),
    lastChecked: timestamptz('last_checked'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [legacyConvexIdIndex('subscription_sources', t.legacyConvexId)]
);

export const subscriptionContent = pgTable(
  'subscription_content',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sourceId: text('source_id'),
    contentId: text('content_id'),
    title: text('title'),
    url: text('url'),
    metadataJson: typedJsonb('metadata_json'),
    passedFilter: boolean('passed_filter'),
    filterReason: text('filter_reason'),
    researchStatus: text('research_status'),
    discoveredAt: timestamptz('discovered_at'),
    researchedAt: timestamptz('researched_at'),
    documentId: text('document_id'),
    embedding: vector('embedding', { dimensions: 1024 }),
    feedItemId: text('feed_item_id'),
    inFeed: boolean('in_feed').default(false),
    thumbnailUrl: text('thumbnail_url'),
    duration: integer('duration'),
    authorHandle: text('author_handle'),
    likesCount: integer('likes_count'),
    commentsCount: integer('comments_count'),
    contentCategory: text('content_category'),
    aiRelevanceScore: doublePrecision('ai_relevance_score'),
    aiRelevanceReason: text('ai_relevance_reason'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('subscription_content', t.legacyConvexId)]
);

export const subscriptionFilters = pgTable(
  'subscription_filters',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sourceId: text('source_id'),
    sourceType: text('source_type'),
    ruleName: text('rule_name'),
    ruleType: text('rule_type'),
    ruleValue: text('rule_value'),
    weight: doublePrecision('weight'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('subscription_filters', t.legacyConvexId)]
);

export const subscriptionLinks = pgTable(
  'subscription_links',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    token: text('token'),
    creatorProfileId: text('creator_profile_id'),
    subscriptions: typedJsonb('subscriptions'),
    createdBy: text('created_by'),
    expiresAt: timestamptz('expires_at'),
    clickCount: integer('click_count').default(0),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('subscription_links', t.legacyConvexId)]
);

export const feedItems = pgTable(
  'feed_items',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    groupKey: text('group_key'),
    title: text('title'),
    summary: text('summary'),
    contentType: text('content_type'),
    itemCount: integer('item_count'),
    itemIds: typedJsonb('item_ids'),
    creatorProfileId: text('creator_profile_id'),
    subscriptionIds: typedJsonb('subscription_ids'),
    thumbnailUrl: text('thumbnail_url'),
    authorHandle: text('author_handle'),
    creatorName: text('creator_name'),
    viewed: boolean('viewed').default(false),
    viewedAt: timestamptz('viewed_at'),
    userFeedback: text('user_feedback'),
    userFeedbackAt: timestamptz('user_feedback_at'),
    publishedAt: timestamptz('published_at'),
    discoveredAt: timestamptz('discovered_at'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('feed_items', t.legacyConvexId)]
);

export const feedSessions = pgTable(
  'feed_sessions',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    startTime: timestamptz('start_time'),
    endTime: timestamptz('end_time'),
    itemsViewed: integer('items_viewed'),
    itemsConsumed: integer('items_consumed'),
    sessionSource: text('session_source'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('feed_sessions', t.legacyConvexId)]
);
