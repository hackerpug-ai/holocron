-- ============================================================
-- Chat Tables for Holocron
-- ============================================================

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent', 'system')),
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  card_data JSONB,
  session_id TEXT,
  document_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Enable all access for conversations" ON conversations;
CREATE POLICY "Enable all access for conversations" ON conversations FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all access for chat_messages" ON chat_messages;
CREATE POLICY "Enable all access for chat_messages" ON chat_messages FOR ALL USING (true);
