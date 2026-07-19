import { createBuilder } from '@rocicorp/zero';
import { schema } from './schema';

const builder = createBuilder(schema);

/**
 * Builder-only query: zero-cache can evaluate this server-side WITHOUT a
 * ZERO_QUERY_URL. The legacy named-query registry form (define-queries /
 * define-query) requires a separate zero-query-server process that is NOT
 * deployed in the sprint-20 substrate.
 *
 * Returns the un-parametrized builder; the consumer calls it with the
 * conversationId at the call site. Zero's `useQuery` accepts a plain
 * `Query<TTable, TSchema, TReturn>` directly (see QueryOrQueryRequest in
 * @rocicorp/zero/out/zql/src/query/query-registry.d.ts), so no named-query
 * wrapper is required.
 *
 * Pre-refactor (S-COLDBOOT-02 root cause): zero-cache logged
 *   "Custom/named queries were requested but no `ZERO_QUERY_URL` is
 *    configured for Zero Cache."
 * and returned 0 rows for the chat-messages-by-conversation read, which
 * blocked the chat-assistant-message from mounting even though Postgres had
 * the row.
 */
export const chatMessagesByConversation = (conversationId: string) =>
  builder.chat_messages
    .where('conversation_id', conversationId)
    .orderBy('created_at', 'asc');
