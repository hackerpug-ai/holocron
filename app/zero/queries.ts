import { createBuilder } from '@rocicorp/zero';
import { schema } from './schema';

const builder = createBuilder(schema);

/**
 * Builder-only queries: zero-cache evaluates these server-side WITHOUT a
 * ZERO_QUERY_URL. Named after the client-data-contract registry entries
 * (13-client-data-contract.yaml / client-data-contract-author.ts).
 */

export const chatMessagesByConversation = (conversationId: string) =>
  builder.chat_messages.where('conversation_id', conversationId).orderBy('created_at', 'asc');

/** researchSessionById — api.researchSessions.queries.get */
export const researchSessionById = (sessionId: string) =>
  builder.research_sessions.where('id', sessionId).one();

/** deepResearchSessionById — api.research.queries.getDeepResearchSession */
export const deepResearchSessionById = (sessionId: string) =>
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
export const toolbeltDocumentsByOwner = (limit = 100) =>
  builder.documents.orderBy('created_at', 'desc').limit(limit);

/** notificationsUnread — api.notifications.queries.listUnread */
export const notificationsUnread = (limit = 10) =>
  builder.notifications.where('read', false).orderBy('created_at', 'desc').limit(limit);

/** latestWhatsNewReports — api.whatsNew.queries.getLatestFindings */
export const latestWhatsNewReports = (limit = 5) =>
  builder.whats_new_reports.orderBy('created_at', 'desc').limit(limit);

/** feedItemsByOwner — api.feeds.queries.getFeed */
export const feedItemsByOwner = (limit = 20) =>
  builder.feed_items.orderBy('created_at', 'desc').limit(limit);

/** agentActivityByOwner — api.db.agentActivity.get (via agent_plans) */
export const agentActivityByOwner = (conversationId: string) =>
  builder.agent_plans
    .where('conversation_id', conversationId)
    .orderBy('updated_at', 'desc')
    .limit(1);
