/**
 * Declared index catalog for schema-3 — HNSW, GIN search_vector, covering btree.
 * Consumed by holo db:verify --indexes against live Postgres.
 */

/** HNSW indexes: exact names + host table. NEVER IVFFlat. */
export const HNSW_INDEXES = [
  { name: 'passages_embedding_hnsw', table: 'passages', column: 'embedding' },
  {
    name: 'research_findings_embedding_hnsw',
    table: 'research_findings',
    column: 'embedding',
  },
  {
    name: 'research_iterations_embedding_hnsw',
    table: 'research_iterations',
    column: 'embedding',
  },
  {
    name: 'subscription_content_embedding_hnsw',
    table: 'subscription_content',
    column: 'embedding',
  },
  {
    name: 'toolbelt_tools_embedding_hnsw',
    table: 'toolbelt_tools',
    column: 'embedding',
  },
  {
    name: 'improvement_requests_embedding_hnsw',
    table: 'improvement_requests',
    column: 'embedding',
  },
] as const;

/** FTS tables with generated search_vector + GIN. */
export const FTS_SEARCH_VECTOR_TARGETS = [
  { table: 'documents', ginIndex: 'documents_search_vector_gin' },
  { table: 'sources', ginIndex: 'sources_search_vector_gin' },
  { table: 'passages', ginIndex: 'passages_search_vector_gin' },
  { table: 'claims', ginIndex: 'claims_search_vector_gin' },
  { table: 'toolbelt_tools', ginIndex: 'toolbelt_tools_search_vector_gin' },
  {
    table: 'research_findings',
    ginIndex: 'research_findings_search_vector_gin',
  },
  {
    table: 'subscription_content',
    ginIndex: 'subscription_content_search_vector_gin',
  },
  {
    table: 'improvement_requests',
    ginIndex: 'improvement_requests_search_vector_gin',
  },
] as const;

/** Covering btree (and partial) indexes for common query paths. */
export const COVERING_BTREE_INDEXES = [
  { name: 'passages_source_id_idx', table: 'passages' },
  { name: 'passages_document_id_idx', table: 'passages' },
  { name: 'sources_document_id_idx', table: 'sources' },
  { name: 'claims_source_id_idx', table: 'claims' },
  { name: 'claims_passage_id_idx', table: 'claims' },
  { name: 'relations_current_idx', table: 'relations' },
  { name: 'beliefs_current_idx', table: 'beliefs' },
  { name: 'chat_messages_conversation_id_idx', table: 'chat_messages' },
  { name: 'research_iterations_session_id_idx', table: 'research_iterations' },
  { name: 'research_findings_session_id_idx', table: 'research_findings' },
  {
    name: 'subscription_content_source_id_idx',
    table: 'subscription_content',
  },
  { name: 'documents_status_idx', table: 'documents' },
  { name: 'documents_category_idx', table: 'documents' },
  { name: 'tasks_conversation_id_idx', table: 'tasks' },
  { name: 'notifications_created_at_idx', table: 'notifications' },
] as const;
