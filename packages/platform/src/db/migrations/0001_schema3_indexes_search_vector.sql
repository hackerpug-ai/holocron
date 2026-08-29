-- schema-3: HNSW (vector_cosine_ops) + generated search_vector + GIN + covering btree
-- NEVER IVFFlat. Dimensions fixed at vector(1024).

-- ── Generated search_vector tsvector columns ───────────────────────────────
ALTER TABLE "documents" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B')
) STORED;--> statement-breakpoint

ALTER TABLE "sources" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(url, '')), 'B')
) STORED;--> statement-breakpoint

ALTER TABLE "passages" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(text, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(situating_header, '')), 'B')
) STORED;--> statement-breakpoint

ALTER TABLE "claims" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(claim_text, '')), 'A')
) STORED;--> statement-breakpoint

ALTER TABLE "toolbelt_tools" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B')
) STORED;--> statement-breakpoint

ALTER TABLE "research_findings" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(claim_text, '')), 'A')
) STORED;--> statement-breakpoint

ALTER TABLE "subscription_content" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A')
) STORED;--> statement-breakpoint

ALTER TABLE "improvement_requests" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'B')
) STORED;--> statement-breakpoint

-- ── HNSW indexes (vector_cosine_ops) — 1 passages + 5 inline ───────────────
CREATE INDEX "passages_embedding_hnsw" ON "passages" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "research_findings_embedding_hnsw" ON "research_findings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "research_iterations_embedding_hnsw" ON "research_iterations" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "subscription_content_embedding_hnsw" ON "subscription_content" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "toolbelt_tools_embedding_hnsw" ON "toolbelt_tools" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "improvement_requests_embedding_hnsw" ON "improvement_requests" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint

-- ── GIN indexes on generated search_vector ─────────────────────────────────
CREATE INDEX "documents_search_vector_gin" ON "documents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "sources_search_vector_gin" ON "sources" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "passages_search_vector_gin" ON "passages" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "claims_search_vector_gin" ON "claims" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "toolbelt_tools_search_vector_gin" ON "toolbelt_tools" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "research_findings_search_vector_gin" ON "research_findings" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "subscription_content_search_vector_gin" ON "subscription_content" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "improvement_requests_search_vector_gin" ON "improvement_requests" USING gin ("search_vector");--> statement-breakpoint

-- ── Covering btree / partial indexes for common queries ────────────────────
CREATE INDEX "passages_source_id_idx" ON "passages" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "passages_document_id_idx" ON "passages" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "sources_document_id_idx" ON "sources" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "claims_source_id_idx" ON "claims" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "claims_passage_id_idx" ON "claims" USING btree ("passage_id");--> statement-breakpoint
CREATE INDEX "relations_current_idx" ON "relations" USING btree ("relation_type","subject_id","object_id") WHERE "tx_to" IS NULL;--> statement-breakpoint
CREATE INDEX "beliefs_current_idx" ON "beliefs" USING btree ("claim_id") WHERE "tx_to" IS NULL;--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_id_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "research_iterations_session_id_idx" ON "research_iterations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "research_findings_session_id_idx" ON "research_findings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "subscription_content_source_id_idx" ON "subscription_content" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_category_idx" ON "documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tasks_conversation_id_idx" ON "tasks" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
