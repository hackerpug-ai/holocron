import { createBuilder } from '@rocicorp/zero';
import { schema } from './schema';

const builder = createBuilder(schema);

/**
 * Builder-only queries: zero-cache evaluates these server-side WITHOUT a
 * ZERO_QUERY_URL (Sprint 20 S-COLDBOOT-02). Consumers call with params at the
 * call site; Zero's `useQuery` accepts a plain Query directly.
 *
 * Names match 13-client-data-contract.yaml registry entries.
 * Union of S-REWRITE-01..04 cluster queries.
 */

// ── S-REWRITE-01: chat cluster ──────────────────────────────────────────────

/** drawer-conversation-list — conversations ordered by recency */
export const conversationsByOwner = () => builder.conversations.orderBy('updated_at', 'desc');

/** drawer-conversation-search — title ILIKE match (client passes term) */
export const conversationsBySearchTerm = (term: string) =>
  builder.conversations.where('title', 'ILIKE', `%${term}%`).orderBy('updated_at', 'desc');

/** chat-thread-header — single conversation by id */
export const conversationById = (id: string) => builder.conversations.where('id', id).one();

/**
 * chat-history-list — messages for a conversation, oldest→newest.
 * Soft-deleted rows are filtered client-side (deleted === true).
 */
export const chatMessagesByConversation = (conversationId: string) =>
  builder.chat_messages.where('conversation_id', conversationId).orderBy('created_at', 'asc');

/** chat-tool-call-card */
export const toolCallById = (id: string) => builder.tool_calls.where('id', id).one();

/** deep-research-session (alias: researchSessionById) */
export const deepResearchSessionById = (sessionId: string) =>
  builder.research_sessions.where('id', sessionId).one();

/**
 * agent-activity-bar — active agent plan(s) for a conversation / thread.
 * Contract name: agentActivityByOwner; conversation-scoped in the RN client.
 */
export const agentActivityByOwner = (conversationId: string) =>
  builder.agent_plans
    .where('conversation_id', conversationId)
    .orderBy('updated_at', 'desc')
    .limit(1);

/** Alias used by hooks when the call site names the conversation explicitly. */
export const agentActivityByConversation = agentActivityByOwner;

/** Single agent plan by id (chat agent_plan message cards). */
export const agentPlanById = (id: string) => builder.agent_plans.where('id', id).one();

/** Steps for an agent plan, ordered by step_index. */
export const agentPlanStepsByPlan = (planId: string) =>
  builder.agent_plan_steps.where('plan_id', planId).orderBy('step_index', 'asc');

// ── S-REWRITE-02: documents / narration cluster ─────────────────────────────

/**
 * All documents ordered by created_at desc (contract: documentsByOwner).
 * Owner scoping is enforced by zero-cache permissions / scoped key; the
 * documents table has no owner_id column in Postgres.
 */
export const documentsByOwner = () => builder.documents.orderBy('created_at', 'desc');

/** Optional category filter for the articles list. */
export const documentsByCategory = (category: string) =>
  builder.documents.where('category', category).orderBy('created_at', 'desc');

/** Single document by id (contract: documentById). */
export const documentById = (id: string) => builder.documents.where('id', id).one();

/** Also accept legacy Convex ids during soak (legacy_convex_id alias). */
export const documentByLegacyId = (legacyId: string) =>
  builder.documents.where('legacy_convex_id', legacyId).one();

/** Audio segments for a document (contract: audioSegmentsByDocument). */
export const audioSegmentsByDocument = (documentId: string) =>
  builder.audio_segments.where('document_id', documentId).orderBy('paragraph_index', 'asc');

/** Audio jobs for a document (contract: audioJobByDocument). */
export const audioJobByDocument = (documentId: string) =>
  builder.audio_jobs.where('document_id', documentId).orderBy('created_at', 'desc');

// ── S-REWRITE-03: subscriptions / feed / whats-new / settings ───────────────

/** Feed list — feedItemsByOwner (api.feeds.queries.getFeed). */
export const feedItemsByOwner = (limit = 50) =>
  builder.feed_items.orderBy('created_at', 'desc').limit(limit);

/** Single feed item feedback projection (api.feeds.queries.getFeedItemFeedback). */
export const feedItemFeedbackById = (feedItemId: string) =>
  builder.feed_items.where('id', feedItemId).one();

/** Subscription sources list (api.subscriptions.queries.list). */
export const subscriptionSourcesList = (limit = 100) =>
  builder.subscription_sources.orderBy('created_at', 'desc').limit(limit);

/**
 * Grouped-by-creator projection is assembled client-side from sources.
 * Contract name: subscriptionContentGroupedByCreator — sources carry the
 * auto_research toggle the settings UI needs.
 */
export const subscriptionContentGroupedByCreator = (limit = 100) => subscriptionSourcesList(limit);

/** Subscription content by group (api.subscriptions.queries.list). */
export const subscriptionContentByGroup = (limit = 200) =>
  builder.subscription_content.orderBy('created_at', 'desc').limit(limit);

/**
 * Full-text-ish search over subscription_content (api.subscriptions.queries.searchContent).
 * Client filters the reactive Zero result set by title/author.
 */
export const subscriptionContentSearch = (limit = 200) => subscriptionContentByGroup(limit);

/** Latest what's-new reports (api.whatsNew.queries.getLatestFindings). */
export const latestWhatsNewReports = (limit = 10) =>
  builder.whats_new_reports.orderBy('created_at', 'desc').limit(limit);

/** Single what's-new report (api.whatsNew.queries.getReportById). */
export const whatsNewReportById = (reportId: string) =>
  builder.whats_new_reports.where('id', reportId).one();

/** Nav tooltip preference (api.notifications.queries.getHasSeenNavTooltip). */
export const hasSeenNavTooltip = () =>
  builder.app_settings.where('key', 'has_seen_nav_tooltip').one();

/** Feed settings row (api.feeds.queries.getFeedSettings). */
export const feedSettings = () => builder.app_settings.where('key', 'feed_settings').one();

/** Voice language preference (api.voice.queries.getVoiceLanguage). */
export const voiceLanguage = () => builder.app_settings.where('key', 'voice_language').one();

// ── S-REWRITE-04: research / assimilate / improvements / notifications ──────

/** researchSessionById — api.researchSessions.queries.get */
export const researchSessionById = (sessionId: string) =>
  builder.research_sessions.where('id', sessionId).one();

/** researchIterationsBySession — child rows for a research session */
export const researchIterationsBySession = (sessionId: string) =>
  builder.research_iterations.where('session_id', sessionId).orderBy('iteration_number', 'asc');

/** improvementRequestsByOwner — api.improvements.queries.list */
export const improvementRequestsByOwner = (limit = 50) =>
  builder.improvement_requests.orderBy('created_at', 'desc').limit(limit);

/** improvementRequestById — api.improvements.queries.get */
export const improvementRequestById = (id: string) =>
  builder.improvement_requests.where('id', id).one();

/** assimilationSessionById — api.assimilate.queries.getAssimilationSession */
export const assimilationSessionById = (sessionId: string) =>
  builder.assimilation_sessions.where('id', sessionId).one();

/**
 * toolbeltDocumentsByOwner — api.toolbelt.queries.list
 * toolbelt_tools is excluded from zero_pub; entries surface as documents.
 */
const TOOLBELT_CATEGORIES = [
  'libraries',
  'cli',
  'framework',
  'service',
  'database',
  'tool',
] as const;

export const toolbeltDocumentsByOwner = (limit = 100) =>
  builder.documents
    .where('category', 'IN', TOOLBELT_CATEGORIES)
    .orderBy('created_at', 'desc')
    .limit(limit);

/** notificationsUnread — api.notifications.queries.listUnread */
export const notificationsUnread = (limit = 10) =>
  builder.notifications.where('read', false).orderBy('created_at', 'desc').limit(limit);

/** notificationsRecent — api.notifications.queries.listRecent */
export const notificationsRecent = (limit = 20) =>
  builder.notifications.orderBy('created_at', 'desc').limit(limit);

export { builder as zeroBuilder };
