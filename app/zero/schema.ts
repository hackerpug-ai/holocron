import {
  ANYONE_CAN,
  ANYONE_CAN_DO_ANYTHING,
  boolean,
  createSchema,
  definePermissions,
  json,
  number,
  string,
  table,
} from '@rocicorp/zero';

/**
 * Integrated Zero client schema — union of S-REWRITE-01..04 clusters:
 *   01 chat (conversations, messages, tool_calls, agent_plans, research_sessions)
 *   02 documents / narration (documents, audio_jobs, audio_segments)
 *   03 subscriptions / feed / whats-new / settings
 *   04 research / assimilate / improvements / notifications / toolbelt docs
 *
 * Column names mirror Postgres under services/platform/src/db/schema.
 * Prefer the more complete column sets from later rewrites when tables overlap.
 */

const conversations = table('conversations')
  .columns({
    id: string(),
    title: string().optional(),
    title_set_by_user: boolean().optional(),
    last_message_preview: string().optional(),
    agent_busy: boolean().optional(),
    agent_busy_since: number().optional(),
    created_at: number(),
    updated_at: number(),
  })
  .primaryKey('id');

const chatMessages = table('chat_messages')
  .columns({
    id: string(),
    conversation_id: string().optional(),
    role: string(),
    content: string().optional(),
    message_type: string().optional(),
    card_data: json().optional(),
    session_id: string().optional(),
    voice_session_id: string().optional(),
    document_id: string().optional(),
    deleted: boolean().optional(),
    tool_call_id: string().optional(),
    reasoning: string().optional(),
    created_at: number(),
  })
  .primaryKey('id');

/** S-REWRITE-01 — tool call cards in chat. */
const toolCalls = table('tool_calls')
  .columns({
    id: string(),
    conversation_id: string().optional(),
    message_id: string().optional(),
    tool_name: string(),
    tool_display_name: string().optional(),
    tool_args: json().optional(),
    reasoning: string().optional(),
    status: string(),
    result_message_id: string().optional(),
    error: string().optional(),
    created_at: number(),
    resolved_at: number().optional(),
  })
  .primaryKey('id');

/** S-REWRITE-01/04 — agent activity bar (04 adds legacy_convex_id). */
const agentPlans = table('agent_plans')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    conversation_id: string().optional(),
    message_id: string().optional(),
    title: string().optional(),
    status: string(),
    current_step_index: number().optional(),
    total_steps: number().optional(),
    created_at: number(),
    updated_at: number(),
    completed_at: number().optional(),
  })
  .primaryKey('id');

/** S-REWRITE-01 — agent plan steps (zero_pub). */
const agentPlanSteps = table('agent_plan_steps')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    plan_id: string().optional(),
    step_index: number().optional(),
    tool_name: string().optional(),
    tool_display_name: string().optional(),
    tool_args: json().optional(),
    description: string().optional(),
    requires_approval: boolean().optional(),
    status: string(),
    tool_call_id: string().optional(),
    result_summary: string().optional(),
    error_message: string().optional(),
    started_at: number().optional(),
    completed_at: number().optional(),
    created_at: number(),
  })
  .primaryKey('id');

/** S-REWRITE-01/04 — research sessions (04 column set is authoritative). */
const researchSessions = table('research_sessions')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    system: string().optional(),
    query: string().optional(),
    topic: string().optional(),
    research_type: string().optional(),
    research_mode: string().optional(),
    input_type: string().optional(),
    refined_topic: string().optional(),
    status: string(),
    max_iterations: number().optional(),
    current_iteration: number().optional(),
    coverage_score: number().optional(),
    current_coverage_score: number().optional(),
    plan: json().optional(),
    findings: json().optional(),
    final_confidence_summary: json().optional(),
    output_confidence_filter: json().optional(),
    document_id: string().optional(),
    conversation_id: string().optional(),
    task_id: string().optional(),
    error_text: string().optional(),
    error_reason: string().optional(),
    created_at: number(),
    updated_at: number(),
    completed_at: number().optional(),
  })
  .primaryKey('id');

/** S-REWRITE-04 — research iteration child rows. */
const researchIterations = table('research_iterations')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    system: string().optional(),
    session_id: string().optional(),
    iteration_number: number().optional(),
    status: string().optional(),
    findings_summary: string().optional(),
    summary: string().optional(),
    sources: json().optional(),
    findings: json().optional(),
    review_score: number().optional(),
    coverage_score: number().optional(),
    review_feedback: string().optional(),
    feedback: string().optional(),
    review_gaps: json().optional(),
    refined_queries: json().optional(),
    confidence_stats: json().optional(),
    created_at: number(),
  })
  .primaryKey('id');

/** S-REWRITE-02/04 — articles + toolbelt document list. */
const documents = table('documents')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    title: string().optional(),
    content: string().optional(),
    category: string().optional(),
    file_path: string().optional(),
    file_type: string().optional(),
    status: string().optional(),
    date: string().optional(),
    time: string().optional(),
    research_type: string().optional(),
    iterations: number().optional(),
    is_public: boolean().optional(),
    share_token: string().optional(),
    source_run_id: string().optional(),
    published_at: number().optional(),
    publish_idempotency_key: string().optional(),
    created_at: number(),
  })
  .primaryKey('id');

/** S-REWRITE-02 — narration job status. */
const audioJobs = table('audio_jobs')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    document_id: string().optional(),
    voice_id: string().optional(),
    status: string(),
    total_segments: number().optional(),
    completed_segments: number().optional(),
    failed_segments: number().optional(),
    error_message: string().optional(),
    created_at: number(),
    updated_at: number().optional(),
  })
  .primaryKey('id');

/** S-REWRITE-02 — per-paragraph narration audio metadata. */
const audioSegments = table('audio_segments')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    document_id: string().optional(),
    paragraph_index: number().optional(),
    paragraph_hash: string().optional(),
    blob_id: string().optional(),
    file_object_id: string().optional(),
    status: string(),
    error_message: string().optional(),
    voice_id: string().optional(),
    duration_ms: number().optional(),
    job_id: string().optional(),
    retry_count: number().optional(),
    created_at: number(),
    updated_at: number().optional(),
  })
  .primaryKey('id');

/** S-REWRITE-03/04 — feed list + feedback projection. */
const feedItems = table('feed_items')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    group_key: string().optional(),
    title: string().optional(),
    summary: string().optional(),
    content_type: string().optional(),
    item_count: number().optional(),
    item_ids: json().optional(),
    creator_profile_id: string().optional(),
    subscription_ids: json().optional(),
    thumbnail_url: string().optional(),
    author_handle: string().optional(),
    creator_name: string().optional(),
    viewed: boolean().optional(),
    viewed_at: number().optional(),
    user_feedback: string().optional(),
    user_feedback_at: number().optional(),
    published_at: number().optional(),
    discovered_at: number().optional(),
    created_at: number(),
  })
  .primaryKey('id');

/** S-REWRITE-03 — subscription sources. */
const subscriptionSources = table('subscription_sources')
  .columns({
    id: string(),
    source_type: string().optional(),
    identifier: string().optional(),
    name: string().optional(),
    url: string().optional(),
    feed_url: string().optional(),
    fetch_method: string().optional(),
    config_json: json().optional(),
    auto_research: boolean().optional(),
    creator_profile_id: string().optional(),
    last_checked: number().optional(),
    created_at: number(),
    updated_at: number().optional(),
  })
  .primaryKey('id');

/** S-REWRITE-03 — subscription content rows. */
const subscriptionContent = table('subscription_content')
  .columns({
    id: string(),
    source_id: string().optional(),
    content_id: string().optional(),
    title: string().optional(),
    url: string().optional(),
    metadata_json: json().optional(),
    passed_filter: boolean().optional(),
    filter_reason: string().optional(),
    research_status: string().optional(),
    discovered_at: number().optional(),
    researched_at: number().optional(),
    document_id: string().optional(),
    feed_item_id: string().optional(),
    in_feed: boolean().optional(),
    thumbnail_url: string().optional(),
    duration: number().optional(),
    author_handle: string().optional(),
    likes_count: number().optional(),
    comments_count: number().optional(),
    content_category: string().optional(),
    ai_relevance_score: number().optional(),
    ai_relevance_reason: string().optional(),
    created_at: number(),
  })
  .primaryKey('id');

/** S-REWRITE-03/04 — what's-new reports. */
const whatsNewReports = table('whats_new_reports')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    period_start: number().optional(),
    period_end: number().optional(),
    days: number().optional(),
    focus: string().optional(),
    discovery_only: boolean().optional(),
    findings_count: number().optional(),
    discovery_count: number().optional(),
    release_count: number().optional(),
    trend_count: number().optional(),
    report_path: string().optional(),
    summary_json: json().optional(),
    document_id: string().optional(),
    tool_suggestions_json: json().optional(),
    findings_json: json().optional(),
    created_at: number(),
  })
  .primaryKey('id');

/** S-REWRITE-03 — nav tooltip / feed settings keys. */
const appSettings = table('app_settings')
  .columns({
    id: string(),
    key: string(),
    value_json: json().optional(),
    updated_at: number().optional(),
    created_at: number(),
  })
  .primaryKey('id');

/** S-REWRITE-04 — improvement requests. */
const improvementRequests = table('improvement_requests')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    description: string().optional(),
    title: string().optional(),
    summary: string().optional(),
    status: string(),
    source_screen: string().optional(),
    source_component: string().optional(),
    agent_decision: json().optional(),
    merged_into_id: string().optional(),
    merged_from_ids: json().optional(),
    user_feedback: string().optional(),
    closure_reason: string().optional(),
    closure_evidence: json().optional(),
    closed_at: number().optional(),
    created_at: number(),
    updated_at: number(),
    processed_at: number().optional(),
  })
  .primaryKey('id');

/** S-REWRITE-04 — assimilate sessions. */
const assimilationSessions = table('assimilation_sessions')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    conversation_id: string().optional(),
    repository_url: string().optional(),
    repository_name: string().optional(),
    profile: string().optional(),
    status: string(),
    current_iteration: number().optional(),
    max_iterations: number().optional(),
    plan_content: string().optional(),
    plan_summary: string().optional(),
    plan_feedback: string().optional(),
    auto_approve: boolean().optional(),
    accumulated_notes: json().optional(),
    coverage_plan: json().optional(),
    next_dimension: string().optional(),
    failure_constraints: json().optional(),
    dimension_scores: json().optional(),
    termination_criteria: json().optional(),
    steering_note: string().optional(),
    estimated_cost_usd: number().optional(),
    started_at: number().optional(),
    document_id: string().optional(),
    metadata_id: string().optional(),
    error_reason: string().optional(),
    created_at: number(),
    updated_at: number(),
    completed_at: number().optional(),
  })
  .primaryKey('id');

/** S-REWRITE-04 — in-app notifications. */
const notifications = table('notifications')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    type: string().optional(),
    title: string().optional(),
    body: string().optional(),
    route: string().optional(),
    reference_id: string().optional(),
    read: boolean().optional(),
    importance: string().optional(),
    feed_item_ids: json().optional(),
    digest_count: number().optional(),
    digest_summary: string().optional(),
    created_at: number(),
  })
  .primaryKey('id');

/**
 * S-UPLOAD-01 — content-addressed file_objects (Postgres media.file_objects).
 * CAS lookup by content_hash (unique index file_objects_content_hash_uidx).
 * Column names mirror services/platform/src/db/schema/media.ts.
 */
const fileObjects = table('file_objects')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    content_hash: string(),
    mime_type: string().optional(),
    byte_size: number().optional(),
    storage_path: string().optional(),
    original_name: string().optional(),
    metadata_json: json().optional(),
    created_at: number(),
  })
  .primaryKey('id');

export const schema = createSchema({
  tables: [
    conversations,
    chatMessages,
    toolCalls,
    agentPlans,
    agentPlanSteps,
    researchSessions,
    researchIterations,
    documents,
    audioJobs,
    audioSegments,
    feedItems,
    subscriptionSources,
    subscriptionContent,
    whatsNewReports,
    appSettings,
    improvementRequests,
    assimilationSessions,
    notifications,
    fileObjects,
  ],
  // S-COLDBOOT-02: builder-chain queries evaluate server-side without ZERO_QUERY_URL.
  enableLegacyQueries: true,
  // S-REWRITE-01/02/03: table-scoped CRUD helpers on zero.mutate.*
  enableLegacyMutators: true,
});

/**
 * Holocron is currently a single-operator application and does not issue Zero
 * auth tokens. Keep reads available for the complete client schema and permit
 * writes only on tables that have an in-app Zero mutator call site. Server-only
 * and upload metadata tables remain read-only through Zero.
 */
export const permissions = definePermissions(schema, () => ({
  conversations: ANYONE_CAN_DO_ANYTHING,
  chat_messages: ANYONE_CAN_DO_ANYTHING,
  tool_calls: { row: { select: ANYONE_CAN } },
  agent_plans: ANYONE_CAN_DO_ANYTHING,
  agent_plan_steps: ANYONE_CAN_DO_ANYTHING,
  research_sessions: ANYONE_CAN_DO_ANYTHING,
  research_iterations: { row: { select: ANYONE_CAN } },
  documents: ANYONE_CAN_DO_ANYTHING,
  audio_jobs: { row: { select: ANYONE_CAN } },
  audio_segments: { row: { select: ANYONE_CAN } },
  feed_items: { row: { select: ANYONE_CAN } },
  subscription_sources: { row: { select: ANYONE_CAN } },
  subscription_content: { row: { select: ANYONE_CAN } },
  whats_new_reports: { row: { select: ANYONE_CAN } },
  app_settings: ANYONE_CAN_DO_ANYTHING,
  improvement_requests: { row: { select: ANYONE_CAN } },
  assimilation_sessions: ANYONE_CAN_DO_ANYTHING,
  notifications: ANYONE_CAN_DO_ANYTHING,
  file_objects: { row: { select: ANYONE_CAN } },
}));

declare module '@rocicorp/zero' {
  interface DefaultTypes {
    schema: typeof schema;
  }
}
