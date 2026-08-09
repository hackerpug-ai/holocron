-- schema-4: zero_pub logical replication publication (CAP-SYNC-01)
-- Reactive UI subset only. Vectors / passages / evidence / citations /
-- telemetry / rate-limit are excluded. Every published table: single-column
-- uuid PK + REPLICA IDENTITY DEFAULT.

-- ── REPLICA IDENTITY DEFAULT on every zero_pub member ──────────────────────
ALTER TABLE conversations REPLICA IDENTITY DEFAULT;
ALTER TABLE chat_messages REPLICA IDENTITY DEFAULT;
ALTER TABLE tool_calls REPLICA IDENTITY DEFAULT;
ALTER TABLE agent_plans REPLICA IDENTITY DEFAULT;
ALTER TABLE agent_plan_steps REPLICA IDENTITY DEFAULT;
ALTER TABLE tasks REPLICA IDENTITY DEFAULT;
ALTER TABLE documents REPLICA IDENTITY DEFAULT;
ALTER TABLE research_sessions REPLICA IDENTITY DEFAULT;
ALTER TABLE research_iterations REPLICA IDENTITY DEFAULT;
ALTER TABLE research_findings REPLICA IDENTITY DEFAULT;
ALTER TABLE feed_items REPLICA IDENTITY DEFAULT;
ALTER TABLE feed_sessions REPLICA IDENTITY DEFAULT;
ALTER TABLE creator_profiles REPLICA IDENTITY DEFAULT;
ALTER TABLE subscription_sources REPLICA IDENTITY DEFAULT;
ALTER TABLE subscription_content REPLICA IDENTITY DEFAULT;
ALTER TABLE subscription_filters REPLICA IDENTITY DEFAULT;
ALTER TABLE subscription_links REPLICA IDENTITY DEFAULT;
ALTER TABLE improvement_requests REPLICA IDENTITY DEFAULT;
ALTER TABLE improvement_images REPLICA IDENTITY DEFAULT;
ALTER TABLE audio_jobs REPLICA IDENTITY DEFAULT;
ALTER TABLE audio_segments REPLICA IDENTITY DEFAULT;
ALTER TABLE whats_new_reports REPLICA IDENTITY DEFAULT;
ALTER TABLE whats_new_workflows REPLICA IDENTITY DEFAULT;
ALTER TABLE analysis_sessions REPLICA IDENTITY DEFAULT;
ALTER TABLE analysis_items REPLICA IDENTITY DEFAULT;
ALTER TABLE shop_sessions REPLICA IDENTITY DEFAULT;
ALTER TABLE shop_listings REPLICA IDENTITY DEFAULT;
ALTER TABLE assimilation_sessions REPLICA IDENTITY DEFAULT;
ALTER TABLE assimilation_iterations REPLICA IDENTITY DEFAULT;
ALTER TABLE assimilation_metadata REPLICA IDENTITY DEFAULT;
ALTER TABLE execution_plans REPLICA IDENTITY DEFAULT;
ALTER TABLE plan_approvals REPLICA IDENTITY DEFAULT;
ALTER TABLE notifications REPLICA IDENTITY DEFAULT;
ALTER TABLE app_settings REPLICA IDENTITY DEFAULT;

-- ── Publication (recreate for idempotent re-apply after DROP) ──────────────
DROP PUBLICATION IF EXISTS zero_pub;

CREATE PUBLICATION zero_pub FOR TABLE
  -- chat
  conversations,
  chat_messages,
  tool_calls,
  agent_plans,
  agent_plan_steps,
  -- tasks / documents (vector-free metadata)
  tasks,
  documents,
  -- research progress (sessions full; iterations/findings omit embedding)
  research_sessions,
  research_iterations (
    id,
    legacy_convex_id,
    system,
    session_id,
    iteration_number,
    status,
    findings_summary,
    summary,
    sources,
    findings,
    review_score,
    coverage_score,
    review_feedback,
    feedback,
    review_gaps,
    refined_queries,
    confidence_stats,
    created_at
  ),
  research_findings (
    id,
    legacy_convex_id,
    system,
    session_id,
    iteration_id,
    claim_text,
    claim_category,
    source_credibility_score,
    evidence_quality_score,
    corroboration_score,
    recency_score,
    expert_consensus_score,
    confidence_score,
    confidence_level,
    citation_ids,
    confidence_factors,
    caveats,
    warnings,
    created_at
  ),
  -- feed + subscriptions display
  feed_items,
  feed_sessions,
  creator_profiles,
  subscription_sources,
  subscription_content (
    id,
    legacy_convex_id,
    source_id,
    content_id,
    title,
    url,
    metadata_json,
    passed_filter,
    filter_reason,
    research_status,
    discovered_at,
    researched_at,
    document_id,
    feed_item_id,
    in_feed,
    thumbnail_url,
    duration,
    author_handle,
    likes_count,
    comments_count,
    content_category,
    ai_relevance_score,
    ai_relevance_reason,
    created_at
  ),
  subscription_filters,
  subscription_links,
  -- improvements (requests omit embedding)
  improvement_requests (
    id,
    legacy_convex_id,
    description,
    title,
    summary,
    status,
    source_screen,
    source_component,
    agent_decision,
    merged_into_id,
    merged_from_ids,
    user_feedback,
    closure_reason,
    closure_evidence,
    closed_at,
    created_at,
    updated_at,
    processed_at
  ),
  improvement_images,
  -- audio jobs/segments
  audio_jobs,
  audio_segments,
  -- whats_new
  whats_new_reports,
  whats_new_workflows,
  -- analysis / shop / assimilation sessions
  analysis_sessions,
  analysis_items,
  shop_sessions,
  shop_listings,
  assimilation_sessions,
  assimilation_iterations,
  assimilation_metadata,
  -- plans + notifications + settings
  execution_plans,
  plan_approvals,
  notifications,
  app_settings;
