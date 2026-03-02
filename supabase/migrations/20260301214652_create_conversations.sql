-- Migration: Create conversations table and supporting ENUM types
-- PRD Reference: SS11 Data Schema - conversations, message_role, message_type
-- Task: US-002 - Create conversations table migration and Supabase types

-- ============================================================
-- Create ENUM types for future chat_messages table
-- ============================================================
-- These types are created now to avoid migration ordering issues
-- and ensure they're available when the chat_messages table is created
CREATE TYPE message_role AS ENUM ('user', 'agent', 'system');
CREATE TYPE message_type AS ENUM ('text', 'slash_command', 'result_card', 'progress', 'error');

-- ============================================================
-- Create conversations table
-- ============================================================
-- Stores conversation metadata for the drawer navigation
-- Each conversation can have multiple chat_messages (created in later epic)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New Chat',
  last_message_preview TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Index for drawer list (most recent first)
-- ============================================================
-- This index optimizes the query that fetches conversations for the drawer
-- sorted by updated_at DESC to show most recently updated conversations first
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);

-- ============================================================
-- Down migration
-- ============================================================
-- To rollback this migration, run:
-- DROP INDEX IF EXISTS idx_conversations_updated;
-- DROP TABLE IF EXISTS conversations;
-- DROP TYPE IF EXISTS message_type;
-- DROP TYPE IF EXISTS message_role;
