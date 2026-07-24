import { boolean, createSchema, json, number, string, table } from '@rocicorp/zero';

/**
 * Client Zero schema. Columns intentionally mirror Postgres names under
 * services/platform/src/db/schema. Sprint 20 shipped chat; Sprint 24 extends
 * the documents / narration surface for the articles cluster rewrite.
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

/** documents — articles list/detail/share (S-REWRITE-02). */
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

/** audio_jobs — narration job status for a document. */
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

/** audio_segments — per-paragraph narration audio metadata. */
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

export const schema = createSchema({
  tables: [conversations, chatMessages, documents, audioJobs, audioSegments],
  // S-COLDBOOT-02: enable the legacy/builder-chain query path so that
  // `app/zero/queries.ts` can ship AST-based queries that zero-cache evaluates
  // server-side WITHOUT requiring a separate ZERO_QUERY_URL process.
  enableLegacyQueries: true,
  // S-REWRITE-02: allow client mutators for publish / import document writes.
  enableLegacyMutators: true,
});

declare module '@rocicorp/zero' {
  interface DefaultTypes {
    schema: typeof schema;
  }
}
