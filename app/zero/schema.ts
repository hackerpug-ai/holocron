import { boolean, createSchema, json, number, string, table } from '@rocicorp/zero';

/**
 * Sprint 20's thin synced surface. Columns intentionally mirror the
 * Postgres names in services/platform/src/db/schema/chat.ts; broader app
 * surfaces are added only after the reference flow is green.
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

export const schema = createSchema({
  tables: [conversations, chatMessages],
  // S-COLDBOOT-02: enable the legacy/builder-chain query path so that
  // `app/zero/queries.ts` can ship AST-based queries (e.g.
  // `chatMessagesByConversation`) that zero-cache evaluates server-side
  // WITHOUT requiring a separate ZERO_QUERY_URL process. The default
  // (`enableLegacyQueries: false`) silently no-ops builder-chain queries
  // on the client, which is why chatMessagesByConversation never reached
  // zero-cache even after the defineQuery refactor.
  enableLegacyQueries: true,
});

declare module '@rocicorp/zero' {
  interface DefaultTypes {
    schema: typeof schema;
  }
}
