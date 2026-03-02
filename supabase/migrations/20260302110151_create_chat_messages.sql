-- Migration: Create chat_messages table with types and indexes
-- PRD Reference: SS11 Data Schema - chat_messages table
-- Task: US-010 - Create chat_messages table migration and Supabase types

-- ============================================================
-- NOTE: ENUM types already created in conversations migration
-- ============================================================
-- message_role and message_type ENUMs were created in 20260301214652_create_conversations.sql
-- to avoid migration ordering issues

-- ============================================================
-- Create chat_messages table
-- ============================================================
-- Stores individual messages within conversations
-- Each message belongs to one conversation (FK with CASCADE delete)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  message_type message_type NOT NULL DEFAULT 'text',
  card_data JSONB,
  session_id UUID,
  document_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- Index for paginated history queries
-- ============================================================
-- This index optimizes queries that fetch messages for a conversation
-- sorted by created_at DESC (newest first) for chat history display
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at DESC);

-- ============================================================
-- Down migration
-- ============================================================
-- To rollback this migration, run:
-- DROP INDEX IF EXISTS idx_chat_messages_conversation;
-- DROP TABLE IF EXISTS chat_messages;
