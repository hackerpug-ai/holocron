CREATE TABLE "agent_plan_steps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"plan_id" text,
	"step_index" integer DEFAULT 0 NOT NULL,
	"tool_name" text,
	"tool_display_name" text,
	"tool_args" jsonb,
	"description" text,
	"requires_approval" boolean DEFAULT false,
	"status" text DEFAULT 'pending' NOT NULL,
	"tool_call_id" text,
	"result_summary" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_plan_steps_status_check" CHECK (status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'awaiting_approval', 'approved', 'rejected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "agent_plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"conversation_id" text,
	"message_id" text,
	"title" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_step_index" integer DEFAULT 0,
	"total_steps" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "agent_plans_status_check" CHECK (status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'awaiting_approval', 'approved', 'rejected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "agent_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"conversation_id" text,
	"message_id" text,
	"intent" text,
	"query_shape" jsonb,
	"confidence" double precision,
	"reasoning" text,
	"classification_source" text,
	"regex_match_pattern" text,
	"raw_llm_response" text,
	"llm_duration_ms" integer,
	"specialist_used" text,
	"tools_called" jsonb,
	"ambiguous_intents" jsonb,
	"clarification_question" text,
	"total_duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"conversation_id" text,
	"role" text NOT NULL,
	"content" text,
	"message_type" text,
	"card_data" jsonb,
	"session_id" text,
	"voice_session_id" text,
	"document_id" text,
	"deleted" boolean DEFAULT false,
	"tool_call_id" text,
	"reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"title" text,
	"title_set_by_user" boolean DEFAULT false,
	"last_message_preview" text,
	"agent_busy" boolean DEFAULT false,
	"agent_busy_since" timestamp with time zone,
	"pending_intent" text,
	"pending_query_shape" jsonb,
	"pending_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"conversation_id" text,
	"message_id" text,
	"tool_name" text NOT NULL,
	"tool_display_name" text,
	"tool_args" jsonb,
	"reasoning" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "tool_calls_status_check" CHECK (status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'awaiting_approval', 'approved', 'rejected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"session_id" text,
	"document_id" text,
	"deep_research_session_id" text,
	"source_url" text,
	"source_title" text,
	"source_domain" text,
	"claim_text" text,
	"claim_marker" text,
	"source_type" text,
	"credibility_score" integer,
	"evidence_type" text,
	"published_date" text,
	"author_credentials" text,
	"retrieved_at" timestamp with time zone,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"title" text,
	"content" text,
	"category" text,
	"file_path" text,
	"file_type" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"date" text,
	"time" text,
	"research_type" text,
	"iterations" integer,
	"is_public" boolean DEFAULT false,
	"share_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_status_check" CHECK (status IN ('draft', 'pending', 'processing', 'in_progress', 'ready', 'published', 'failed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"document_id" text,
	"source" text,
	"text" text,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_findings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"system" text DEFAULT 'deep' NOT NULL,
	"session_id" text,
	"iteration_id" text,
	"claim_text" text,
	"claim_category" text,
	"source_credibility_score" double precision,
	"evidence_quality_score" double precision,
	"corroboration_score" double precision,
	"recency_score" double precision,
	"expert_consensus_score" double precision,
	"confidence_score" double precision,
	"confidence_level" text,
	"citation_ids" jsonb,
	"confidence_factors" jsonb,
	"caveats" jsonb,
	"warnings" jsonb,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_findings_system_check" CHECK (system IN ('simple', 'deep'))
);
--> statement-breakpoint
CREATE TABLE "research_iterations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"system" text DEFAULT 'simple' NOT NULL,
	"session_id" text,
	"iteration_number" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"findings_summary" text,
	"summary" text,
	"sources" jsonb,
	"findings" jsonb,
	"review_score" double precision,
	"coverage_score" double precision,
	"review_feedback" text,
	"feedback" text,
	"review_gaps" jsonb,
	"refined_queries" jsonb,
	"confidence_stats" jsonb,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_iterations_system_check" CHECK (system IN ('simple', 'deep')),
	CONSTRAINT "research_iterations_status_check" CHECK (status IN ('pending', 'queued', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'paused', 'draft', 'active', 'archived', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "research_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"system" text DEFAULT 'simple' NOT NULL,
	"query" text,
	"topic" text,
	"research_type" text,
	"research_mode" text,
	"input_type" text,
	"refined_topic" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"max_iterations" integer,
	"current_iteration" integer,
	"coverage_score" double precision,
	"current_coverage_score" double precision,
	"plan" jsonb,
	"findings" jsonb,
	"final_confidence_summary" jsonb,
	"output_confidence_filter" jsonb,
	"document_id" text,
	"conversation_id" text,
	"task_id" text,
	"error_text" text,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "research_sessions_system_check" CHECK (system IN ('simple', 'deep')),
	CONSTRAINT "research_sessions_status_check" CHECK (status IN ('pending', 'queued', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'paused', 'draft', 'active', 'archived', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "analysis_evidence" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"session_id" text,
	"kind" text NOT NULL,
	"claim" text,
	"tier" text,
	"source_title" text,
	"source_url" text,
	"dimension" text,
	"challenge_status" text,
	"opportunity_id" text,
	"source" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_evidence_kind_check" CHECK (kind IN ('revenue_validation', 'ai_roi'))
);
--> statement-breakpoint
CREATE TABLE "analysis_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"session_id" text,
	"kind" text NOT NULL,
	"name" text,
	"rank" integer,
	"confidence" double precision,
	"url" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_items_kind_check" CHECK (kind IN ('revenue_validation_competitor', 'competitive_analysis_competitor', 'competitive_analysis_feature', 'ai_roi_opportunity', 'flights_route', 'flights_price_calendar'))
);
--> statement-breakpoint
CREATE TABLE "analysis_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"product_name" text,
	"company" text,
	"market" text,
	"codebase_url" text,
	"document_id" text,
	"desirability_score" double precision,
	"viability_score" double precision,
	"feasibility_score" double precision,
	"total_score" double precision,
	"verdict" text,
	"confidence_level" text,
	"agent_count" integer,
	"source_count" integer,
	"error_reason" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "analysis_sessions_type_check" CHECK (type IN ('revenue_validation', 'competitive_analysis', 'ai_roi', 'flights')),
	CONSTRAINT "analysis_sessions_status_check" CHECK (status IN ('pending', 'queued', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'paused', 'draft', 'active', 'archived', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"name" text,
	"handle" text,
	"canonical_type" text,
	"platforms" jsonb,
	"bio" text,
	"avatar_url" text,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"group_key" text,
	"title" text,
	"summary" text,
	"content_type" text,
	"item_count" integer,
	"item_ids" jsonb,
	"creator_profile_id" text,
	"subscription_ids" jsonb,
	"thumbnail_url" text,
	"author_handle" text,
	"creator_name" text,
	"viewed" boolean DEFAULT false,
	"viewed_at" timestamp with time zone,
	"user_feedback" text,
	"user_feedback_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"discovered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"items_viewed" integer,
	"items_consumed" integer,
	"session_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_content" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"source_id" text,
	"content_id" text,
	"title" text,
	"url" text,
	"metadata_json" jsonb,
	"passed_filter" boolean,
	"filter_reason" text,
	"research_status" text,
	"discovered_at" timestamp with time zone,
	"researched_at" timestamp with time zone,
	"document_id" text,
	"embedding" vector(1024),
	"feed_item_id" text,
	"in_feed" boolean DEFAULT false,
	"thumbnail_url" text,
	"duration" integer,
	"author_handle" text,
	"likes_count" integer,
	"comments_count" integer,
	"content_category" text,
	"ai_relevance_score" double precision,
	"ai_relevance_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_filters" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"source_id" text,
	"source_type" text,
	"rule_name" text,
	"rule_type" text,
	"rule_value" text,
	"weight" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"token" text,
	"creator_profile_id" text,
	"subscriptions" jsonb,
	"created_by" text,
	"expires_at" timestamp with time zone,
	"click_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_sources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"source_type" text,
	"identifier" text,
	"name" text,
	"url" text,
	"feed_url" text,
	"fetch_method" text,
	"config_json" jsonb,
	"auto_research" boolean DEFAULT false,
	"creator_profile_id" text,
	"last_checked" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"document_id" text,
	"voice_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_segments" integer,
	"completed_segments" integer,
	"failed_segments" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_jobs_status_check" CHECK (status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'awaiting_approval', 'approved', 'rejected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "audio_segments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"document_id" text,
	"paragraph_index" integer,
	"paragraph_hash" text,
	"blob_id" text,
	"file_object_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"voice_id" text,
	"duration_ms" integer,
	"job_id" text,
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_segments_status_check" CHECK (status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'awaiting_approval', 'approved', 'rejected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "audio_transcript_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"content_id" text,
	"source_url" text,
	"platform" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer,
	"retry_count" integer DEFAULT 0,
	"error_message" text,
	"transcript_id" text,
	"audio_storage_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_transcript_jobs_status_check" CHECK (status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'awaiting_approval', 'approved', 'rejected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "audio_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"content_id" text,
	"source_url" text,
	"transcript_type" text,
	"transcript_source" text,
	"blob_id" text,
	"file_object_id" text,
	"preview_text" text,
	"word_count" integer,
	"duration_ms" integer,
	"language" text,
	"metadata_json" jsonb,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_objects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"content_hash" text NOT NULL,
	"mime_type" text,
	"byte_size" integer,
	"storage_path" text,
	"original_name" text,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"content_id" text,
	"source_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer,
	"retry_count" integer DEFAULT 0,
	"error_message" text,
	"transcript_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_jobs_status_check" CHECK (status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'awaiting_approval', 'approved', 'rejected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "video_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"content_id" text,
	"source_url" text,
	"transcript_type" text,
	"transcript_source" text,
	"blob_id" text,
	"file_object_id" text,
	"preview_text" text,
	"word_count" integer,
	"duration_ms" integer,
	"language" text,
	"metadata_json" jsonb,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beliefs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"claim_id" text,
	"statement" text NOT NULL,
	"confidence" double precision,
	"supersedes_id" text,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"tx_from" timestamp with time zone DEFAULT now(),
	"tx_to" timestamp with time zone,
	"actor" text,
	"run_id" text,
	"idempotency_key" text,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"source_id" text,
	"passage_id" text,
	"claim_text" text NOT NULL,
	"claim_category" text,
	"confidence" double precision,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"entity_type" text,
	"name" text NOT NULL,
	"canonical_name" text,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"source_id" text NOT NULL,
	"document_id" text,
	"ordinal" integer DEFAULT 0,
	"text" text NOT NULL,
	"token_count" integer,
	"situating_header" text,
	"embedding" vector(1024),
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"relation_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"subject_kind" text,
	"object_id" text NOT NULL,
	"object_kind" text,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"tx_from" timestamp with time zone DEFAULT now(),
	"tx_to" timestamp with time zone,
	"confidence" double precision,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relations_type_check" CHECK (relation_type IN ('supports', 'contradicts', 'refines', 'derived_from', 'about'))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"source_kind" text DEFAULT 'other' NOT NULL,
	"document_id" text,
	"content_hash" text,
	"title" text,
	"url" text,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_kind_check" CHECK (source_kind IN ('self_sourced', 'web', 'document', 'subscription', 'import', 'other'))
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"key" text NOT NULL,
	"value_json" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assimilation_iterations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"session_id" text,
	"iteration_number" integer,
	"dimension" text,
	"iteration_type" text,
	"findings" jsonb,
	"notes_contribution" jsonb,
	"summary" text,
	"dimension_coverage_score" double precision,
	"gaps_identified" jsonb,
	"novelty_score" double precision,
	"next_action" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"duration_ms" integer,
	"estimated_cost_usd" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assimilation_iterations_status_check" CHECK (status IN ('pending', 'queued', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'paused', 'draft', 'active', 'archived', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "assimilation_metadata" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"document_id" text,
	"repository_url" text,
	"repository_name" text,
	"primary_language" text,
	"stars" integer,
	"sophistication_rating" double precision,
	"track_ratings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assimilation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"conversation_id" text,
	"repository_url" text,
	"repository_name" text,
	"profile" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_iteration" integer,
	"max_iterations" integer,
	"plan_content" text,
	"plan_summary" text,
	"plan_feedback" text,
	"auto_approve" boolean,
	"accumulated_notes" jsonb,
	"coverage_plan" jsonb,
	"next_dimension" text,
	"failure_constraints" jsonb,
	"dimension_scores" jsonb,
	"termination_criteria" jsonb,
	"steering_note" text,
	"estimated_cost_usd" double precision,
	"started_at" timestamp with time zone,
	"document_id" text,
	"metadata_id" text,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "assimilation_sessions_status_check" CHECK (status IN ('pending', 'queued', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'paused', 'draft', 'active', 'archived', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "convex_id_map" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"old_id" text NOT NULL,
	"new_id" text NOT NULL,
	"table_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"content" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execution_plans_status_check" CHECK (status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'awaiting_approval', 'approved', 'rejected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "feed_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"enable_push_notifications" boolean,
	"enable_in_app_notifications" boolean,
	"show_thumbnails" boolean,
	"auto_play_videos" boolean,
	"content_filter" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "improvement_images" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"request_id" text,
	"blob_id" text,
	"file_object_id" text,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "improvement_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"description" text,
	"title" text,
	"summary" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_screen" text,
	"source_component" text,
	"agent_decision" jsonb,
	"merged_into_id" text,
	"merged_from_ids" jsonb,
	"user_feedback" text,
	"embedding" vector(1024),
	"closure_reason" text,
	"closure_evidence" jsonb,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "improvement_requests_status_check" CHECK (status IN ('pending', 'queued', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'paused', 'draft', 'active', 'archived', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"type" text,
	"title" text,
	"body" text,
	"route" text,
	"reference_id" text,
	"read" boolean DEFAULT false,
	"importance" text,
	"feed_item_ids" jsonb,
	"digest_count" integer,
	"digest_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_approvals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"plan_id" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"decision" text,
	"rejection_reason" text,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_tracking" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"provider" text,
	"quota_limit" integer,
	"quota_used" integer,
	"quota_reset_at" timestamp with time zone,
	"concurrent_requests" integer,
	"max_concurrent" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_error_time" timestamp with time zone,
	"token_budget" integer,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_tracking_status_check" CHECK (status IN ('pending', 'queued', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'paused', 'draft', 'active', 'archived', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"key" text,
	"timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_listings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"session_id" text,
	"title" text,
	"price" double precision,
	"original_price" double precision,
	"currency" text,
	"condition" text,
	"retailer" text,
	"seller" text,
	"seller_rating" double precision,
	"url" text,
	"image_url" text,
	"in_stock" boolean,
	"product_hash" text,
	"is_duplicate" boolean,
	"deal_score" double precision,
	"trust_tier" text,
	"seller_trust_score" double precision,
	"is_verified_seller" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"conversation_id" text,
	"query" text,
	"condition" text,
	"price_min" double precision,
	"price_max" double precision,
	"retailers" jsonb,
	"plan_id" text,
	"verified_only" boolean,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_listings" integer,
	"best_deal_id" text,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "shop_sessions_status_check" CHECK (status IN ('pending', 'queued', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'paused', 'draft', 'active', 'archived', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"conversation_id" text,
	"task_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"config" jsonb,
	"current_step" integer,
	"total_steps" integer,
	"progress_message" text,
	"result" jsonb,
	"error_message" text,
	"error_details" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_status_check" CHECK (status IN ('pending', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'awaiting_approval', 'approved', 'rejected', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "toolbelt_tools" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"title" text,
	"description" text,
	"content" text,
	"category" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_url" text,
	"source_type" text,
	"tags" jsonb,
	"use_cases" jsonb,
	"keywords" jsonb,
	"language" text,
	"date" text,
	"time" text,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "toolbelt_tools_status_check" CHECK (status IN ('pending', 'queued', 'in_progress', 'running', 'completed', 'failed', 'cancelled', 'canceled', 'paused', 'draft', 'active', 'archived', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"notifications_last_seen_at" timestamp with time zone,
	"voice_language" text,
	"has_seen_nav_tooltip" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_commands" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"session_id" text,
	"transcript" text,
	"intent" text,
	"entities" jsonb,
	"action_type" text,
	"action_params" jsonb,
	"result" jsonb,
	"success" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"conversation_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"turn_count" integer,
	"total_duration_ms" integer,
	"metadata" jsonb,
	"error_message" text,
	"blob_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whats_new_reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"days" integer,
	"focus" text,
	"discovery_only" boolean,
	"findings_count" integer,
	"discovery_count" integer,
	"release_count" integer,
	"trend_count" integer,
	"report_path" text,
	"summary_json" jsonb,
	"document_id" text,
	"tool_suggestions_json" jsonb,
	"findings_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whats_new_workflows" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legacy_convex_id" text,
	"phase" text,
	"days" integer,
	"force" boolean,
	"started_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"findings_count" integer,
	"findings_json" jsonb,
	"error" text,
	"report_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_plan_steps_legacy_convex_id_idx" ON "agent_plan_steps" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "agent_plans_legacy_convex_id_idx" ON "agent_plans" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "agent_telemetry_legacy_convex_id_idx" ON "agent_telemetry" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "chat_messages_legacy_convex_id_idx" ON "chat_messages" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "conversations_legacy_convex_id_idx" ON "conversations" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "tool_calls_legacy_convex_id_idx" ON "tool_calls" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "citations_legacy_convex_id_idx" ON "citations" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "documents_legacy_convex_id_idx" ON "documents" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "imports_legacy_convex_id_idx" ON "imports" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "research_findings_legacy_convex_id_idx" ON "research_findings" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "research_iterations_legacy_convex_id_idx" ON "research_iterations" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "research_sessions_legacy_convex_id_idx" ON "research_sessions" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "analysis_evidence_legacy_convex_id_idx" ON "analysis_evidence" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "analysis_items_legacy_convex_id_idx" ON "analysis_items" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "analysis_sessions_legacy_convex_id_idx" ON "analysis_sessions" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "creator_profiles_legacy_convex_id_idx" ON "creator_profiles" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "feed_items_legacy_convex_id_idx" ON "feed_items" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "feed_sessions_legacy_convex_id_idx" ON "feed_sessions" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "subscription_content_legacy_convex_id_idx" ON "subscription_content" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "subscription_filters_legacy_convex_id_idx" ON "subscription_filters" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "subscription_links_legacy_convex_id_idx" ON "subscription_links" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "subscription_sources_legacy_convex_id_idx" ON "subscription_sources" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "audio_jobs_legacy_convex_id_idx" ON "audio_jobs" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "audio_segments_legacy_convex_id_idx" ON "audio_segments" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "audio_transcript_jobs_legacy_convex_id_idx" ON "audio_transcript_jobs" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "audio_transcripts_legacy_convex_id_idx" ON "audio_transcripts" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "file_objects_legacy_convex_id_idx" ON "file_objects" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "transcript_jobs_legacy_convex_id_idx" ON "transcript_jobs" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "video_transcripts_legacy_convex_id_idx" ON "video_transcripts" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "beliefs_legacy_convex_id_idx" ON "beliefs" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "claims_legacy_convex_id_idx" ON "claims" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "entities_legacy_convex_id_idx" ON "entities" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "passages_legacy_convex_id_idx" ON "passages" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "relations_legacy_convex_id_idx" ON "relations" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "sources_legacy_convex_id_idx" ON "sources" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_content_hash_uidx" ON "sources" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "app_settings_legacy_convex_id_idx" ON "app_settings" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_settings_key_uidx" ON "app_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "assimilation_iterations_legacy_convex_id_idx" ON "assimilation_iterations" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "assimilation_metadata_legacy_convex_id_idx" ON "assimilation_metadata" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "assimilation_sessions_legacy_convex_id_idx" ON "assimilation_sessions" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "convex_id_map_legacy_convex_id_idx" ON "convex_id_map" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE UNIQUE INDEX "convex_id_map_old_id_uidx" ON "convex_id_map" USING btree ("old_id");--> statement-breakpoint
CREATE INDEX "execution_plans_legacy_convex_id_idx" ON "execution_plans" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "feed_settings_legacy_convex_id_idx" ON "feed_settings" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "improvement_images_legacy_convex_id_idx" ON "improvement_images" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "improvement_requests_legacy_convex_id_idx" ON "improvement_requests" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "notifications_legacy_convex_id_idx" ON "notifications" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "plan_approvals_legacy_convex_id_idx" ON "plan_approvals" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "rate_limit_tracking_legacy_convex_id_idx" ON "rate_limit_tracking" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "rate_limits_legacy_convex_id_idx" ON "rate_limits" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "shop_listings_legacy_convex_id_idx" ON "shop_listings" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "shop_sessions_legacy_convex_id_idx" ON "shop_sessions" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "tasks_legacy_convex_id_idx" ON "tasks" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "toolbelt_tools_legacy_convex_id_idx" ON "toolbelt_tools" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "user_preferences_legacy_convex_id_idx" ON "user_preferences" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "voice_commands_legacy_convex_id_idx" ON "voice_commands" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "voice_sessions_legacy_convex_id_idx" ON "voice_sessions" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "whats_new_reports_legacy_convex_id_idx" ON "whats_new_reports" USING btree ("legacy_convex_id");--> statement-breakpoint
CREATE INDEX "whats_new_workflows_legacy_convex_id_idx" ON "whats_new_workflows" USING btree ("legacy_convex_id");