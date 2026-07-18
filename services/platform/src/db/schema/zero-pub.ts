/**
 * zero_pub — Zero reactive sync publication boundary (CAP-SYNC-01).
 *
 * Publishes only the reactive UI subset. Excludes:
 * - every vector / tsvector column
 * - evidence fulcrum (sources, passages, claims, entities, relations, beliefs)
 * - citations, agent_telemetry, rate-limit tables
 * - server-only ETL (convex_id_map)
 *
 * Tables that also store embeddings are published with an explicit column list
 * that omits `embedding` (Postgres column-list publications).
 */

/** Full-table members of zero_pub (no vector columns on these relations). */
export const ZERO_PUB_FULL_TABLES = [
  // chat
  'conversations',
  'chat_messages',
  'tool_calls',
  'agent_plans',
  'agent_plan_steps',
  // tasks / documents metadata
  'tasks',
  'documents',
  // research progress (session shell — no embedding)
  'research_sessions',
  // feed + subscriptions display (non-vector relations)
  'feed_items',
  'feed_sessions',
  'creator_profiles',
  'subscription_sources',
  'subscription_filters',
  'subscription_links',
  // improvements (images only; requests are column-list)
  'improvement_images',
  // audio jobs/segments
  'audio_jobs',
  'audio_segments',
  // whats_new
  'whats_new_reports',
  'whats_new_workflows',
  // analysis / shop / assimilation sessions (+ UI children)
  'analysis_sessions',
  'analysis_items',
  'shop_sessions',
  'shop_listings',
  'assimilation_sessions',
  'assimilation_iterations',
  'assimilation_metadata',
  // plans + settings + notifications
  'execution_plans',
  'plan_approvals',
  'notifications',
  'app_settings',
] as const;

/**
 * Column-list members: reactive rows that also carry `embedding vector(1024)`.
 * Publication must omit the embedding column (Zero cannot sync pgvector).
 */
export const ZERO_PUB_COLUMN_LIST_TABLES = {
  research_iterations: [
    'id',
    'legacy_convex_id',
    'system',
    'session_id',
    'iteration_number',
    'status',
    'findings_summary',
    'summary',
    'sources',
    'findings',
    'review_score',
    'coverage_score',
    'review_feedback',
    'feedback',
    'review_gaps',
    'refined_queries',
    'confidence_stats',
    'created_at',
  ],
  research_findings: [
    'id',
    'legacy_convex_id',
    'system',
    'session_id',
    'iteration_id',
    'claim_text',
    'claim_category',
    'source_credibility_score',
    'evidence_quality_score',
    'corroboration_score',
    'recency_score',
    'expert_consensus_score',
    'confidence_score',
    'confidence_level',
    'citation_ids',
    'confidence_factors',
    'caveats',
    'warnings',
    'created_at',
  ],
  subscription_content: [
    'id',
    'legacy_convex_id',
    'source_id',
    'content_id',
    'title',
    'url',
    'metadata_json',
    'passed_filter',
    'filter_reason',
    'research_status',
    'discovered_at',
    'researched_at',
    'document_id',
    'feed_item_id',
    'in_feed',
    'thumbnail_url',
    'duration',
    'author_handle',
    'likes_count',
    'comments_count',
    'content_category',
    'ai_relevance_score',
    'ai_relevance_reason',
    'created_at',
  ],
  improvement_requests: [
    'id',
    'legacy_convex_id',
    'description',
    'title',
    'summary',
    'status',
    'source_screen',
    'source_component',
    'agent_decision',
    'merged_into_id',
    'merged_from_ids',
    'user_feedback',
    'closure_reason',
    'closure_evidence',
    'closed_at',
    'created_at',
    'updated_at',
    'processed_at',
  ],
} as const satisfies Record<string, readonly string[]>;

/** Every relation name that belongs to zero_pub (full + column-list). */
export const ZERO_PUB_TABLE_NAMES = [
  ...ZERO_PUB_FULL_TABLES,
  ...(Object.keys(ZERO_PUB_COLUMN_LIST_TABLES) as Array<keyof typeof ZERO_PUB_COLUMN_LIST_TABLES>),
] as const;

/** Tables that MUST never appear in zero_pub (evidence, vectors-only, server). */
export const ZERO_PUB_EXCLUDED_TABLES = [
  // evidence fulcrum
  'sources',
  'passages',
  'claims',
  'entities',
  'relations',
  'beliefs',
  // citations / telemetry / rate-limit
  'citations',
  'agent_telemetry',
  'rate_limit_tracking',
  'rate_limits',
  // server-only ETL + vector-only tooling table (not reactive UI)
  'convex_id_map',
  'etl_runs',
  'etl_stage',
  'upload_intents',
  'toolbelt_tools',
  // mission engine is service-internal in Sprint 15
  'mission_templates',
  'mission_template_versions',
  'mission_runs',
  'mission_stage_runs',
  'mission_checkpoints',
  'mission_commits',
  'mission_events',
  'mission_steering',
  'mission_verdicts',
  // media / voice / prefs shells not on the reactive subset
  'imports',
  'file_objects',
  'video_transcripts',
  'transcript_jobs',
  'audio_transcripts',
  'audio_transcript_jobs',
  'voice_sessions',
  'voice_commands',
  'user_preferences',
  'feed_settings',
  'analysis_evidence',
] as const;

export const ZERO_PUB_NAME = 'zero_pub' as const;

export const ZERO_PUB_EXCLUDED_COLUMN = 'embedding' as const;
