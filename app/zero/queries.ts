import { createBuilder } from '@rocicorp/zero';
import { schema } from './schema';

const builder = createBuilder(schema);

/**
 * Builder-only queries: zero-cache evaluates these server-side WITHOUT a
 * ZERO_QUERY_URL (Sprint 20 S-COLDBOOT-02). Consumers call with params at the
 * call site; Zero's `useQuery` accepts a plain Query directly.
 *
 * Named to match 13-client-data-contract.yaml registry names.
 */

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

/** deep-research-session */
export const deepResearchSessionById = (sessionId: string) =>
  builder.research_sessions.where('id', sessionId).one();

/**
 * agent-activity-bar — active agent plan(s) for a conversation / thread.
 * Contract name: agentActivityByOwner; conversation-scoped in the RN client.
 */
export const agentActivityByOwner = (conversationId: string) =>
  builder.agent_plans.where('conversation_id', conversationId).orderBy('updated_at', 'desc');

/** Alias used by hooks when the call site names the conversation explicitly. */
export const agentActivityByConversation = agentActivityByOwner;
