import { boolean, createSchema, json, number, string, table } from '@rocicorp/zero';

/**
 * Sprint 24 research/assimilate/improvements/toolbelt/notifications cluster
 * extends the Sprint 20 thin chat surface. Column names mirror Postgres
 * (services/platform/src/db/schema/*) so Zero WAL-replay matches zero_pub.
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

const researchSessions = table('research_sessions')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    system: string(),
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

const researchIterations = table('research_iterations')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    system: string(),
    session_id: string().optional(),
    iteration_number: number().optional(),
    status: string(),
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

const documents = table('documents')
  .columns({
    id: string(),
    legacy_convex_id: string().optional(),
    title: string().optional(),
    content: string().optional(),
    category: string().optional(),
    file_path: string().optional(),
    file_type: string().optional(),
    status: string(),
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

export const schema = createSchema({
  tables: [
    conversations,
    chatMessages,
    researchSessions,
    researchIterations,
    improvementRequests,
    assimilationSessions,
    documents,
    notifications,
    whatsNewReports,
    feedItems,
    agentPlans,
  ],
  // S-COLDBOOT-02 / S-REWRITE-04: builder-chain queries evaluated by zero-cache
  // without a separate ZERO_QUERY_URL process.
  enableLegacyQueries: true,
  enableLegacyMutators: true,
});

declare module '@rocicorp/zero' {
  interface DefaultTypes {
    schema: typeof schema;
  }
}
