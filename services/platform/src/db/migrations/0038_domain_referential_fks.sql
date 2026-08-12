-- 0038_domain_referential_fks.sql
-- DEPENDENCY-D08-03-FK: enforce catalog referential edges as real Postgres FKs.
-- Pattern matches 0003_evidence_one_open_belief (text->uuid + FK).
-- Eligible edges only (excludes storage_ref / nested_jsonb / array_ids).
-- Idempotent: skips type change when already uuid; skips FK when present.
-- zero_pub column-list tables are temporarily dropped (ALTER TYPE is blocked while published).

-- Temporarily drop column-list zero_pub members that block ALTER TYPE
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'zero_pub' AND tablename = 'improvement_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION zero_pub DROP TABLE improvement_requests';
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'zero_pub' AND tablename = 'research_findings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION zero_pub DROP TABLE research_findings';
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'zero_pub' AND tablename = 'research_iterations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION zero_pub DROP TABLE research_iterations';
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'zero_pub' AND tablename = 'subscription_content'
  ) THEN
    EXECUTE 'ALTER PUBLICATION zero_pub DROP TABLE subscription_content';
  END IF;
END
$mig$;
--> statement-breakpoint

-- agent_plan_steps
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_plan_steps' AND column_name = 'plan_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'agent_plan_steps', 'plan_id', 'plan_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_plan_steps_plan_id_fkey' AND conrelid = format('%I.%I', 'public', 'agent_plan_steps')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'agent_plan_steps', 'agent_plan_steps_plan_id_fkey', 'plan_id', 'agent_plans'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_plan_steps' AND column_name = 'tool_call_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'agent_plan_steps', 'tool_call_id', 'tool_call_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_plan_steps_tool_call_id_fkey' AND conrelid = format('%I.%I', 'public', 'agent_plan_steps')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'agent_plan_steps', 'agent_plan_steps_tool_call_id_fkey', 'tool_call_id', 'tool_calls'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- agent_plans
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_plans' AND column_name = 'conversation_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'agent_plans', 'conversation_id', 'conversation_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_plans_conversation_id_fkey' AND conrelid = format('%I.%I', 'public', 'agent_plans')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'agent_plans', 'agent_plans_conversation_id_fkey', 'conversation_id', 'conversations'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_plans' AND column_name = 'message_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'agent_plans', 'message_id', 'message_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_plans_message_id_fkey' AND conrelid = format('%I.%I', 'public', 'agent_plans')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'agent_plans', 'agent_plans_message_id_fkey', 'message_id', 'chat_messages'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- agent_telemetry
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_telemetry' AND column_name = 'conversation_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'agent_telemetry', 'conversation_id', 'conversation_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_telemetry_conversation_id_fkey' AND conrelid = format('%I.%I', 'public', 'agent_telemetry')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'agent_telemetry', 'agent_telemetry_conversation_id_fkey', 'conversation_id', 'conversations'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agent_telemetry' AND column_name = 'message_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'agent_telemetry', 'message_id', 'message_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_telemetry_message_id_fkey' AND conrelid = format('%I.%I', 'public', 'agent_telemetry')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'agent_telemetry', 'agent_telemetry_message_id_fkey', 'message_id', 'chat_messages'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- analysis_evidence
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analysis_evidence' AND column_name = 'session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'analysis_evidence', 'session_id', 'session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analysis_evidence_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'analysis_evidence')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'analysis_evidence', 'analysis_evidence_session_id_fkey', 'session_id', 'analysis_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analysis_evidence' AND column_name = 'opportunity_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'analysis_evidence', 'opportunity_id', 'opportunity_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analysis_evidence_opportunity_id_fkey' AND conrelid = format('%I.%I', 'public', 'analysis_evidence')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'analysis_evidence', 'analysis_evidence_opportunity_id_fkey', 'opportunity_id', 'analysis_items'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- analysis_items
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analysis_items' AND column_name = 'session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'analysis_items', 'session_id', 'session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analysis_items_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'analysis_items')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'analysis_items', 'analysis_items_session_id_fkey', 'session_id', 'analysis_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- analysis_sessions
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analysis_sessions' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'analysis_sessions', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analysis_sessions_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'analysis_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'analysis_sessions', 'analysis_sessions_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- assimilation_iterations
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assimilation_iterations' AND column_name = 'session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'assimilation_iterations', 'session_id', 'session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assimilation_iterations_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'assimilation_iterations')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'assimilation_iterations', 'assimilation_iterations_session_id_fkey', 'session_id', 'assimilation_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- assimilation_metadata
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assimilation_metadata' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'assimilation_metadata', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assimilation_metadata_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'assimilation_metadata')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'assimilation_metadata', 'assimilation_metadata_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- assimilation_sessions
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assimilation_sessions' AND column_name = 'conversation_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'assimilation_sessions', 'conversation_id', 'conversation_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assimilation_sessions_conversation_id_fkey' AND conrelid = format('%I.%I', 'public', 'assimilation_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'assimilation_sessions', 'assimilation_sessions_conversation_id_fkey', 'conversation_id', 'conversations'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assimilation_sessions' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'assimilation_sessions', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assimilation_sessions_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'assimilation_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'assimilation_sessions', 'assimilation_sessions_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assimilation_sessions' AND column_name = 'metadata_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'assimilation_sessions', 'metadata_id', 'metadata_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assimilation_sessions_metadata_id_fkey' AND conrelid = format('%I.%I', 'public', 'assimilation_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'assimilation_sessions', 'assimilation_sessions_metadata_id_fkey', 'metadata_id', 'assimilation_metadata'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- audio_jobs
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audio_jobs' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'audio_jobs', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audio_jobs_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'audio_jobs')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'audio_jobs', 'audio_jobs_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- audio_segments
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audio_segments' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'audio_segments', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audio_segments_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'audio_segments')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'audio_segments', 'audio_segments_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audio_segments' AND column_name = 'job_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'audio_segments', 'job_id', 'job_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audio_segments_job_id_fkey' AND conrelid = format('%I.%I', 'public', 'audio_segments')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'audio_segments', 'audio_segments_job_id_fkey', 'job_id', 'audio_jobs'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- audio_transcript_jobs
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audio_transcript_jobs' AND column_name = 'transcript_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'audio_transcript_jobs', 'transcript_id', 'transcript_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audio_transcript_jobs_transcript_id_fkey' AND conrelid = format('%I.%I', 'public', 'audio_transcript_jobs')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'audio_transcript_jobs', 'audio_transcript_jobs_transcript_id_fkey', 'transcript_id', 'audio_transcripts'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- chat_messages
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'conversation_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'chat_messages', 'conversation_id', 'conversation_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_messages_conversation_id_fkey' AND conrelid = format('%I.%I', 'public', 'chat_messages')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'chat_messages', 'chat_messages_conversation_id_fkey', 'conversation_id', 'conversations'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'chat_messages', 'session_id', 'session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_messages_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'chat_messages')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'chat_messages', 'chat_messages_session_id_fkey', 'session_id', 'research_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'voice_session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'chat_messages', 'voice_session_id', 'voice_session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_messages_voice_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'chat_messages')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'chat_messages', 'chat_messages_voice_session_id_fkey', 'voice_session_id', 'voice_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'chat_messages', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_messages_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'chat_messages')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'chat_messages', 'chat_messages_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- citations
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'citations' AND column_name = 'session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'citations', 'session_id', 'session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'citations_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'citations')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'citations', 'citations_session_id_fkey', 'session_id', 'research_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'citations' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'citations', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'citations_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'citations')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'citations', 'citations_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'citations' AND column_name = 'deep_research_session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'citations', 'deep_research_session_id', 'deep_research_session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'citations_deep_research_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'citations')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'citations', 'citations_deep_research_session_id_fkey', 'deep_research_session_id', 'research_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- feed_items
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'feed_items' AND column_name = 'creator_profile_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'feed_items', 'creator_profile_id', 'creator_profile_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feed_items_creator_profile_id_fkey' AND conrelid = format('%I.%I', 'public', 'feed_items')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'feed_items', 'feed_items_creator_profile_id_fkey', 'creator_profile_id', 'creator_profiles'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- imports
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'imports' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'imports', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'imports_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'imports')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'imports', 'imports_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- improvement_images
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'improvement_images' AND column_name = 'request_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'improvement_images', 'request_id', 'request_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'improvement_images_request_id_fkey' AND conrelid = format('%I.%I', 'public', 'improvement_images')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'improvement_images', 'improvement_images_request_id_fkey', 'request_id', 'improvement_requests'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- improvement_requests
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'improvement_requests' AND column_name = 'merged_into_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'improvement_requests', 'merged_into_id', 'merged_into_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'improvement_requests_merged_into_id_fkey' AND conrelid = format('%I.%I', 'public', 'improvement_requests')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'improvement_requests', 'improvement_requests_merged_into_id_fkey', 'merged_into_id', 'improvement_requests'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- plan_approvals
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plan_approvals' AND column_name = 'plan_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'plan_approvals', 'plan_id', 'plan_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plan_approvals_plan_id_fkey' AND conrelid = format('%I.%I', 'public', 'plan_approvals')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'plan_approvals', 'plan_approvals_plan_id_fkey', 'plan_id', 'execution_plans'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- research_findings
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'research_findings' AND column_name = 'session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'research_findings', 'session_id', 'session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'research_findings_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'research_findings')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'research_findings', 'research_findings_session_id_fkey', 'session_id', 'research_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'research_findings' AND column_name = 'iteration_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'research_findings', 'iteration_id', 'iteration_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'research_findings_iteration_id_fkey' AND conrelid = format('%I.%I', 'public', 'research_findings')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'research_findings', 'research_findings_iteration_id_fkey', 'iteration_id', 'research_iterations'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- research_iterations
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'research_iterations' AND column_name = 'session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'research_iterations', 'session_id', 'session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'research_iterations_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'research_iterations')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'research_iterations', 'research_iterations_session_id_fkey', 'session_id', 'research_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- research_sessions
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'research_sessions' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'research_sessions', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'research_sessions_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'research_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'research_sessions', 'research_sessions_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'research_sessions' AND column_name = 'conversation_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'research_sessions', 'conversation_id', 'conversation_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'research_sessions_conversation_id_fkey' AND conrelid = format('%I.%I', 'public', 'research_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'research_sessions', 'research_sessions_conversation_id_fkey', 'conversation_id', 'conversations'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'research_sessions' AND column_name = 'task_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'research_sessions', 'task_id', 'task_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'research_sessions_task_id_fkey' AND conrelid = format('%I.%I', 'public', 'research_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'research_sessions', 'research_sessions_task_id_fkey', 'task_id', 'tasks'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- shop_listings
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shop_listings' AND column_name = 'session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'shop_listings', 'session_id', 'session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_listings_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'shop_listings')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'shop_listings', 'shop_listings_session_id_fkey', 'session_id', 'shop_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- shop_sessions
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shop_sessions' AND column_name = 'conversation_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'shop_sessions', 'conversation_id', 'conversation_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_sessions_conversation_id_fkey' AND conrelid = format('%I.%I', 'public', 'shop_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'shop_sessions', 'shop_sessions_conversation_id_fkey', 'conversation_id', 'conversations'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shop_sessions' AND column_name = 'plan_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'shop_sessions', 'plan_id', 'plan_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_sessions_plan_id_fkey' AND conrelid = format('%I.%I', 'public', 'shop_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'shop_sessions', 'shop_sessions_plan_id_fkey', 'plan_id', 'execution_plans'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shop_sessions' AND column_name = 'best_deal_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'shop_sessions', 'best_deal_id', 'best_deal_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shop_sessions_best_deal_id_fkey' AND conrelid = format('%I.%I', 'public', 'shop_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'shop_sessions', 'shop_sessions_best_deal_id_fkey', 'best_deal_id', 'shop_listings'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- subscription_content
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscription_content' AND column_name = 'source_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'subscription_content', 'source_id', 'source_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_content_source_id_fkey' AND conrelid = format('%I.%I', 'public', 'subscription_content')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'subscription_content', 'subscription_content_source_id_fkey', 'source_id', 'subscription_sources'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscription_content' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'subscription_content', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_content_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'subscription_content')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'subscription_content', 'subscription_content_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscription_content' AND column_name = 'feed_item_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'subscription_content', 'feed_item_id', 'feed_item_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_content_feed_item_id_fkey' AND conrelid = format('%I.%I', 'public', 'subscription_content')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'subscription_content', 'subscription_content_feed_item_id_fkey', 'feed_item_id', 'feed_items'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- subscription_filters
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscription_filters' AND column_name = 'source_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'subscription_filters', 'source_id', 'source_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_filters_source_id_fkey' AND conrelid = format('%I.%I', 'public', 'subscription_filters')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'subscription_filters', 'subscription_filters_source_id_fkey', 'source_id', 'subscription_sources'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- subscription_links
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscription_links' AND column_name = 'creator_profile_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'subscription_links', 'creator_profile_id', 'creator_profile_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_links_creator_profile_id_fkey' AND conrelid = format('%I.%I', 'public', 'subscription_links')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'subscription_links', 'subscription_links_creator_profile_id_fkey', 'creator_profile_id', 'creator_profiles'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- subscription_sources
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscription_sources' AND column_name = 'creator_profile_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'subscription_sources', 'creator_profile_id', 'creator_profile_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_sources_creator_profile_id_fkey' AND conrelid = format('%I.%I', 'public', 'subscription_sources')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'subscription_sources', 'subscription_sources_creator_profile_id_fkey', 'creator_profile_id', 'creator_profiles'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- tasks
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'conversation_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'tasks', 'conversation_id', 'conversation_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_conversation_id_fkey' AND conrelid = format('%I.%I', 'public', 'tasks')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'tasks', 'tasks_conversation_id_fkey', 'conversation_id', 'conversations'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- tool_calls
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tool_calls' AND column_name = 'conversation_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'tool_calls', 'conversation_id', 'conversation_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tool_calls_conversation_id_fkey' AND conrelid = format('%I.%I', 'public', 'tool_calls')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'tool_calls', 'tool_calls_conversation_id_fkey', 'conversation_id', 'conversations'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tool_calls' AND column_name = 'message_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'tool_calls', 'message_id', 'message_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tool_calls_message_id_fkey' AND conrelid = format('%I.%I', 'public', 'tool_calls')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'tool_calls', 'tool_calls_message_id_fkey', 'message_id', 'chat_messages'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tool_calls' AND column_name = 'result_message_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'tool_calls', 'result_message_id', 'result_message_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tool_calls_result_message_id_fkey' AND conrelid = format('%I.%I', 'public', 'tool_calls')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'tool_calls', 'tool_calls_result_message_id_fkey', 'result_message_id', 'chat_messages'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- transcript_jobs
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transcript_jobs' AND column_name = 'transcript_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'transcript_jobs', 'transcript_id', 'transcript_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transcript_jobs_transcript_id_fkey' AND conrelid = format('%I.%I', 'public', 'transcript_jobs')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'transcript_jobs', 'transcript_jobs_transcript_id_fkey', 'transcript_id', 'video_transcripts'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- voice_commands
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'voice_commands' AND column_name = 'session_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'voice_commands', 'session_id', 'session_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voice_commands_session_id_fkey' AND conrelid = format('%I.%I', 'public', 'voice_commands')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'voice_commands', 'voice_commands_session_id_fkey', 'session_id', 'voice_sessions'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- voice_sessions
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'voice_sessions' AND column_name = 'conversation_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'voice_sessions', 'conversation_id', 'conversation_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voice_sessions_conversation_id_fkey' AND conrelid = format('%I.%I', 'public', 'voice_sessions')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      'voice_sessions', 'voice_sessions_conversation_id_fkey', 'conversation_id', 'conversations'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- whats_new_reports
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whats_new_reports' AND column_name = 'document_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'whats_new_reports', 'document_id', 'document_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whats_new_reports_document_id_fkey' AND conrelid = format('%I.%I', 'public', 'whats_new_reports')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'whats_new_reports', 'whats_new_reports_document_id_fkey', 'document_id', 'documents'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- whats_new_workflows
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whats_new_workflows' AND column_name = 'report_id'
      AND udt_name = 'text'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING NULLIF(btrim(%I), %L)::uuid',
      'whats_new_workflows', 'report_id', 'report_id', ''
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whats_new_workflows_report_id_fkey' AND conrelid = format('%I.%I', 'public', 'whats_new_workflows')::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
      'whats_new_workflows', 'whats_new_workflows_report_id_fkey', 'report_id', 'whats_new_reports'
    );
  END IF;
END
$mig$;
--> statement-breakpoint

-- Restore column-list zero_pub members
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'zero_pub' AND tablename = 'improvement_requests'
  ) AND EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'zero_pub'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'improvement_requests'
  ) THEN
    EXECUTE $sql$ALTER PUBLICATION zero_pub ADD TABLE improvement_requests (
    id,
    legacy_convex_id,
    description,
    title,
    summary,
    status,
    source_screen,
    source_component,
    agent_decision,
    merged_into_id,
    merged_from_ids,
    user_feedback,
    closure_reason,
    closure_evidence,
    closed_at,
    created_at,
    updated_at,
    processed_at
)$sql$;
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'zero_pub' AND tablename = 'research_findings'
  ) AND EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'zero_pub'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'research_findings'
  ) THEN
    EXECUTE $sql$ALTER PUBLICATION zero_pub ADD TABLE research_findings (
    id,
    legacy_convex_id,
    system,
    session_id,
    iteration_id,
    claim_text,
    claim_category,
    source_credibility_score,
    evidence_quality_score,
    corroboration_score,
    recency_score,
    expert_consensus_score,
    confidence_score,
    confidence_level,
    citation_ids,
    confidence_factors,
    caveats,
    warnings,
    created_at
)$sql$;
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'zero_pub' AND tablename = 'research_iterations'
  ) AND EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'zero_pub'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'research_iterations'
  ) THEN
    EXECUTE $sql$ALTER PUBLICATION zero_pub ADD TABLE research_iterations (
    id,
    legacy_convex_id,
    system,
    session_id,
    iteration_number,
    status,
    findings_summary,
    summary,
    sources,
    findings,
    review_score,
    coverage_score,
    review_feedback,
    feedback,
    review_gaps,
    refined_queries,
    confidence_stats,
    created_at
)$sql$;
  END IF;
END
$mig$;
--> statement-breakpoint

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'zero_pub' AND tablename = 'subscription_content'
  ) AND EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'zero_pub'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscription_content'
  ) THEN
    EXECUTE $sql$ALTER PUBLICATION zero_pub ADD TABLE subscription_content (
    id,
    legacy_convex_id,
    source_id,
    content_id,
    title,
    url,
    metadata_json,
    passed_filter,
    filter_reason,
    research_status,
    discovered_at,
    researched_at,
    document_id,
    feed_item_id,
    in_feed,
    thumbnail_url,
    duration,
    author_handle,
    likes_count,
    comments_count,
    content_category,
    ai_relevance_score,
    ai_relevance_reason,
    created_at
)$sql$;
  END IF;
END
$mig$;
--> statement-breakpoint
