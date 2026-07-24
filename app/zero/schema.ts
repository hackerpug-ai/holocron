import { boolean, createSchema, json, number, string, table } from '@rocicorp/zero';

/**
 * Zero client schema for reactive UI reads.
 *
 * Sprint 20: chat vertical (conversations + chat_messages).
 * Sprint 24 S-REWRITE-03: subscriptions / feed / whats-new / settings cluster.
 * Column names mirror Postgres (snake_case) from services/platform/src/db/schema.
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

const feedItems = table('feed_items')
  .columns({
    id: string(),
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

const whatsNewReports = table('whats_new_reports')
  .columns({
    id: string(),
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

const appSettings = table('app_settings')
  .columns({
    id: string(),
    key: string(),
    value_json: json().optional(),
    updated_at: number().optional(),
    created_at: number(),
  })
  .primaryKey('id');

export const schema = createSchema({
  tables: [
    conversations,
    chatMessages,
    feedItems,
    subscriptionSources,
    subscriptionContent,
    whatsNewReports,
    appSettings,
  ],
  // Builder-chain queries evaluate server-side without ZERO_QUERY_URL.
  enableLegacyQueries: true,
  // CRUD mutators (e.g. subscription_sources.update for auto_research toggle).
  enableLegacyMutators: true,
});

declare module '@rocicorp/zero' {
  interface DefaultTypes {
    schema: typeof schema;
  }
}
