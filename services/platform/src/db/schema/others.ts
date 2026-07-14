/**
 * remaining domain groups:
 * whats_new, toolbelt, shop, assimilation, plans/tasks, improvements,
 * voice, notifications, settings, rate limits, etl convex_id_map
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  createdAtColumn,
  hnswEmbeddingIndex,
  idColumn,
  legacyConvexIdColumn,
  legacyConvexIdIndex,
  searchVectorColumn,
  searchVectorGinIndex,
  timestamptz,
  typedJsonb,
  updatedAtColumn,
  vector,
  weightedSearchVectorSql,
} from '../columns';
import { lifecycleStatusValues, sqlInList, workStatusValues } from '../enums';

// ── whats_new ──────────────────────────────────────────────────────────────
export const whatsNewReports = pgTable(
  'whats_new_reports',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    periodStart: timestamptz('period_start'),
    periodEnd: timestamptz('period_end'),
    days: integer('days'),
    focus: text('focus'),
    discoveryOnly: boolean('discovery_only'),
    findingsCount: integer('findings_count'),
    discoveryCount: integer('discovery_count'),
    releaseCount: integer('release_count'),
    trendCount: integer('trend_count'),
    reportPath: text('report_path'),
    summaryJson: typedJsonb('summary_json'),
    documentId: text('document_id'),
    toolSuggestionsJson: typedJsonb('tool_suggestions_json'),
    findingsJson: typedJsonb('findings_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('whats_new_reports', t.legacyConvexId)]
);

export const whatsNewWorkflows = pgTable(
  'whats_new_workflows',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    phase: text('phase'),
    days: integer('days'),
    force: boolean('force'),
    startedAt: timestamptz('started_at'),
    updatedAt: updatedAtColumn(),
    completedAt: timestamptz('completed_at'),
    findingsCount: integer('findings_count'),
    findingsJson: typedJsonb('findings_json'),
    error: text('error'),
    reportId: text('report_id'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('whats_new_workflows', t.legacyConvexId)]
);

// ── toolbelt ───────────────────────────────────────────────────────────────
export const toolbeltTools = pgTable(
  'toolbelt_tools',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    title: text('title'),
    description: text('description'),
    content: text('content'),
    category: text('category'),
    status: text('status').notNull().default('draft'),
    sourceUrl: text('source_url'),
    sourceType: text('source_type'),
    tags: typedJsonb('tags'),
    useCases: typedJsonb('use_cases'),
    keywords: typedJsonb('keywords'),
    language: text('language'),
    date: text('date'),
    time: text('time'),
    embedding: vector('embedding', { dimensions: 1024 }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    searchVector: searchVectorColumn(weightedSearchVectorSql('title', 'description', 'content')),
  },
  (t) => [
    legacyConvexIdIndex('toolbelt_tools', t.legacyConvexId),
    hnswEmbeddingIndex('toolbelt_tools_embedding_hnsw', t.embedding),
    searchVectorGinIndex('toolbelt_tools_search_vector_gin', t.searchVector),
    check(
      'toolbelt_tools_status_check',
      sql`status IN (${sql.raw(sqlInList(lifecycleStatusValues))})`
    ),
  ]
);

// ── shop ───────────────────────────────────────────────────────────────────
export const shopSessions = pgTable(
  'shop_sessions',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    conversationId: text('conversation_id'),
    query: text('query'),
    condition: text('condition'),
    priceMin: doublePrecision('price_min'),
    priceMax: doublePrecision('price_max'),
    retailers: typedJsonb('retailers'),
    planId: text('plan_id'),
    verifiedOnly: boolean('verified_only'),
    status: text('status').notNull().default('pending'),
    totalListings: integer('total_listings'),
    bestDealId: text('best_deal_id'),
    errorReason: text('error_reason'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    completedAt: timestamptz('completed_at'),
  },
  (t) => [
    legacyConvexIdIndex('shop_sessions', t.legacyConvexId),
    check(
      'shop_sessions_status_check',
      sql`status IN (${sql.raw(sqlInList(lifecycleStatusValues))})`
    ),
  ]
);

export const shopListings = pgTable(
  'shop_listings',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sessionId: text('session_id'),
    title: text('title'),
    price: doublePrecision('price'),
    originalPrice: doublePrecision('original_price'),
    currency: text('currency'),
    condition: text('condition'),
    retailer: text('retailer'),
    seller: text('seller'),
    sellerRating: doublePrecision('seller_rating'),
    url: text('url'),
    imageUrl: text('image_url'),
    inStock: boolean('in_stock'),
    productHash: text('product_hash'),
    isDuplicate: boolean('is_duplicate'),
    dealScore: doublePrecision('deal_score'),
    trustTier: text('trust_tier'),
    sellerTrustScore: doublePrecision('seller_trust_score'),
    isVerifiedSeller: boolean('is_verified_seller'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('shop_listings', t.legacyConvexId)]
);

// ── assimilation ───────────────────────────────────────────────────────────
export const assimilationMetadata = pgTable(
  'assimilation_metadata',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    documentId: text('document_id'),
    repositoryUrl: text('repository_url'),
    repositoryName: text('repository_name'),
    primaryLanguage: text('primary_language'),
    stars: integer('stars'),
    sophisticationRating: doublePrecision('sophistication_rating'),
    trackRatings: typedJsonb('track_ratings'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('assimilation_metadata', t.legacyConvexId)]
);

export const assimilationSessions = pgTable(
  'assimilation_sessions',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    conversationId: text('conversation_id'),
    repositoryUrl: text('repository_url'),
    repositoryName: text('repository_name'),
    profile: text('profile'),
    status: text('status').notNull().default('pending'),
    currentIteration: integer('current_iteration'),
    maxIterations: integer('max_iterations'),
    planContent: text('plan_content'),
    planSummary: text('plan_summary'),
    planFeedback: text('plan_feedback'),
    autoApprove: boolean('auto_approve'),
    accumulatedNotes: typedJsonb('accumulated_notes'),
    coveragePlan: typedJsonb('coverage_plan'),
    nextDimension: text('next_dimension'),
    failureConstraints: typedJsonb('failure_constraints'),
    dimensionScores: typedJsonb('dimension_scores'),
    terminationCriteria: typedJsonb('termination_criteria'),
    steeringNote: text('steering_note'),
    estimatedCostUsd: doublePrecision('estimated_cost_usd'),
    startedAt: timestamptz('started_at'),
    documentId: text('document_id'),
    metadataId: text('metadata_id'),
    errorReason: text('error_reason'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    completedAt: timestamptz('completed_at'),
  },
  (t) => [
    legacyConvexIdIndex('assimilation_sessions', t.legacyConvexId),
    check(
      'assimilation_sessions_status_check',
      sql`status IN (${sql.raw(sqlInList(lifecycleStatusValues))})`
    ),
  ]
);

export const assimilationIterations = pgTable(
  'assimilation_iterations',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sessionId: text('session_id'),
    iterationNumber: integer('iteration_number'),
    dimension: text('dimension'),
    iterationType: text('iteration_type'),
    findings: typedJsonb('findings'),
    notesContribution: typedJsonb('notes_contribution'),
    summary: text('summary'),
    dimensionCoverageScore: doublePrecision('dimension_coverage_score'),
    gapsIdentified: typedJsonb('gaps_identified'),
    noveltyScore: doublePrecision('novelty_score'),
    nextAction: text('next_action'),
    status: text('status').notNull().default('pending'),
    durationMs: integer('duration_ms'),
    estimatedCostUsd: doublePrecision('estimated_cost_usd'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('assimilation_iterations', t.legacyConvexId),
    check(
      'assimilation_iterations_status_check',
      sql`status IN (${sql.raw(sqlInList(lifecycleStatusValues))})`
    ),
  ]
);

// ── plans / tasks ──────────────────────────────────────────────────────────
export const tasks = pgTable(
  'tasks',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    conversationId: text('conversation_id'),
    taskType: text('task_type'),
    status: text('status').notNull().default('pending'),
    config: typedJsonb('config'),
    currentStep: integer('current_step'),
    totalSteps: integer('total_steps'),
    progressMessage: text('progress_message'),
    result: typedJsonb('result'),
    errorMessage: text('error_message'),
    errorDetails: typedJsonb('error_details'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('tasks', t.legacyConvexId),
    index('tasks_conversation_id_idx').on(t.conversationId),
    check('tasks_status_check', sql`status IN (${sql.raw(sqlInList(workStatusValues))})`),
  ]
);

export const executionPlans = pgTable(
  'execution_plans',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    type: text('type'),
    status: text('status').notNull().default('pending'),
    content: text('content'),
    metadata: typedJsonb('metadata'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('execution_plans', t.legacyConvexId),
    check('execution_plans_status_check', sql`status IN (${sql.raw(sqlInList(workStatusValues))})`),
  ]
);

export const planApprovals = pgTable(
  'plan_approvals',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    planId: text('plan_id'),
    approvedBy: text('approved_by'),
    approvedAt: timestamptz('approved_at'),
    decision: text('decision'),
    rejectionReason: text('rejection_reason'),
    feedback: text('feedback'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('plan_approvals', t.legacyConvexId)]
);

// ── improvements ───────────────────────────────────────────────────────────
export const improvementRequests = pgTable(
  'improvement_requests',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    description: text('description'),
    title: text('title'),
    summary: text('summary'),
    status: text('status').notNull().default('pending'),
    sourceScreen: text('source_screen'),
    sourceComponent: text('source_component'),
    agentDecision: typedJsonb('agent_decision'),
    mergedIntoId: text('merged_into_id'),
    mergedFromIds: typedJsonb('merged_from_ids'),
    userFeedback: text('user_feedback'),
    embedding: vector('embedding', { dimensions: 1024 }),
    closureReason: text('closure_reason'),
    closureEvidence: typedJsonb('closure_evidence'),
    closedAt: timestamptz('closed_at'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    processedAt: timestamptz('processed_at'),
    searchVector: searchVectorColumn(weightedSearchVectorSql('title', 'description', 'summary')),
  },
  (t) => [
    legacyConvexIdIndex('improvement_requests', t.legacyConvexId),
    hnswEmbeddingIndex('improvement_requests_embedding_hnsw', t.embedding),
    searchVectorGinIndex('improvement_requests_search_vector_gin', t.searchVector),
    check(
      'improvement_requests_status_check',
      sql`status IN (${sql.raw(sqlInList(lifecycleStatusValues))})`
    ),
  ]
);

export const improvementImages = pgTable(
  'improvement_images',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    requestId: text('request_id'),
    blobId: text('blob_id'),
    fileObjectId: text('file_object_id'),
    caption: text('caption'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('improvement_images', t.legacyConvexId)]
);

// ── voice ──────────────────────────────────────────────────────────────────
export const voiceSessions = pgTable(
  'voice_sessions',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    conversationId: text('conversation_id'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    turnCount: integer('turn_count'),
    totalDurationMs: integer('total_duration_ms'),
    metadata: typedJsonb('metadata'),
    errorMessage: text('error_message'),
    blobId: text('blob_id'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [legacyConvexIdIndex('voice_sessions', t.legacyConvexId)]
);

export const voiceCommands = pgTable(
  'voice_commands',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sessionId: text('session_id'),
    transcript: text('transcript'),
    intent: text('intent'),
    entities: typedJsonb('entities'),
    actionType: text('action_type'),
    actionParams: typedJsonb('action_params'),
    result: typedJsonb('result'),
    success: boolean('success'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [legacyConvexIdIndex('voice_commands', t.legacyConvexId)]
);

// ── notifications ──────────────────────────────────────────────────────────
export const notifications = pgTable(
  'notifications',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    type: text('type'),
    title: text('title'),
    body: text('body'),
    route: text('route'),
    referenceId: text('reference_id'),
    read: boolean('read').default(false),
    importance: text('importance'),
    feedItemIds: typedJsonb('feed_item_ids'),
    digestCount: integer('digest_count'),
    digestSummary: text('digest_summary'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('notifications', t.legacyConvexId),
    index('notifications_created_at_idx').on(t.createdAt),
  ]
);

// ── settings ───────────────────────────────────────────────────────────────
export const userPreferences = pgTable(
  'user_preferences',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    notificationsLastSeenAt: timestamptz('notifications_last_seen_at'),
    voiceLanguage: text('voice_language'),
    hasSeenNavTooltip: boolean('has_seen_nav_tooltip'),
    updatedAt: updatedAtColumn(),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('user_preferences', t.legacyConvexId)]
);

export const feedSettings = pgTable(
  'feed_settings',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    enablePushNotifications: boolean('enable_push_notifications'),
    enableInAppNotifications: boolean('enable_in_app_notifications'),
    showThumbnails: boolean('show_thumbnails'),
    autoPlayVideos: boolean('auto_play_videos'),
    contentFilter: text('content_filter'),
    updatedAt: updatedAtColumn(),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('feed_settings', t.legacyConvexId)]
);

/** Merged app settings surface (userPreferences + feedSettings). */
export const appSettings = pgTable(
  'app_settings',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    key: text('key').notNull(),
    valueJson: typedJsonb('value_json'),
    updatedAt: updatedAtColumn(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('app_settings', t.legacyConvexId),
    uniqueIndex('app_settings_key_uidx').on(t.key),
  ]
);

// ── rate limits ────────────────────────────────────────────────────────────
export const rateLimitTracking = pgTable(
  'rate_limit_tracking',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    provider: text('provider'),
    quotaLimit: integer('quota_limit'),
    quotaUsed: integer('quota_used'),
    quotaResetAt: timestamptz('quota_reset_at'),
    concurrentRequests: integer('concurrent_requests'),
    maxConcurrent: integer('max_concurrent'),
    status: text('status').notNull().default('active'),
    lastError: text('last_error'),
    lastErrorTime: timestamptz('last_error_time'),
    tokenBudget: integer('token_budget'),
    tokensUsed: integer('tokens_used'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('rate_limit_tracking', t.legacyConvexId),
    check(
      'rate_limit_tracking_status_check',
      sql`status IN (${sql.raw(sqlInList(lifecycleStatusValues))})`
    ),
  ]
);

export const rateLimits = pgTable(
  'rate_limits',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    key: text('key'),
    timestamp: timestamptz('timestamp'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('rate_limits', t.legacyConvexId)]
);

// ── ETL ────────────────────────────────────────────────────────────────────
/** Whole-graph convex `_id` → uuidv7 map built before load. */
export const convexIdMap = pgTable(
  'convex_id_map',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    oldId: text('old_id').notNull(),
    newId: text('new_id').notNull(),
    tableName: text('table_name').notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('convex_id_map', t.legacyConvexId),
    uniqueIndex('convex_id_map_old_id_uidx').on(t.oldId),
  ]
);
