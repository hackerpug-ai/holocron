import { boolean, createSchema, json, number, string, table } from '@rocicorp/zero';

/**
 * Sprint 20 thin surface + S-REWRITE-01 chat-cluster extensions.
 * Columns mirror Postgres names under services/platform/src/db/schema/{chat,research}.ts.
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

const agentPlans = table('agent_plans')
  .columns({
    id: string(),
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

const researchSessions = table('research_sessions')
  .columns({
    id: string(),
    system: string().optional(),
    query: string().optional(),
    topic: string().optional(),
    research_type: string().optional(),
    status: string(),
    document_id: string().optional(),
    conversation_id: string().optional(),
    created_at: number(),
    updated_at: number(),
    completed_at: number().optional(),
  })
  .primaryKey('id');

export const schema = createSchema({
  tables: [conversations, chatMessages, toolCalls, agentPlans, researchSessions],
  // S-COLDBOOT-02: enable the legacy/builder-chain query path so that
  // `app/zero/queries.ts` can ship AST-based queries that zero-cache evaluates
  // server-side WITHOUT requiring a separate ZERO_QUERY_URL process.
  enableLegacyQueries: true,
  // S-REWRITE-01: table-scoped CRUD helpers on zero.mutate.* (update/delete/insert)
  // for conversation rename/delete and message soft-delete mutators.
  enableLegacyMutators: true,
});

declare module '@rocicorp/zero' {
  interface DefaultTypes {
    schema: typeof schema;
  }
}
