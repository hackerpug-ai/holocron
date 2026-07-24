import { createBuilder } from '@rocicorp/zero';
import { schema } from './schema';

const builder = createBuilder(schema);

/**
 * Builder-only queries: zero-cache evaluates these server-side WITHOUT a
 * ZERO_QUERY_URL (legacy named-query registry requires a separate process).
 *
 * Names match 13-client-data-contract.yaml targets for the subscriptions cluster.
 */

/** Chat messages for a conversation (Sprint 20 reference flow). */
export const chatMessagesByConversation = (conversationId: string) =>
  builder.chat_messages.where('conversation_id', conversationId).orderBy('created_at', 'asc');

/** Feed list — feedItemsByOwner (api.feeds.queries.getFeed). */
export const feedItemsByOwner = (limit = 50) =>
  builder.feed_items.orderBy('created_at', 'desc').limit(limit);

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
