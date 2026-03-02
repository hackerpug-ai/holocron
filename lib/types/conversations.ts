/**
 * Conversation type definitions for Supabase conversations table
 *
 * These types mirror the SQL schema in:
 * supabase/migrations/YYYYMMDDHHMMSS_create_conversations.sql
 *
 * @see US-002 - Create conversations table migration and Supabase types
 */

/** Row type for the conversations table (SELECT result) */
export interface Conversation {
  id: string
  title: string
  last_message_preview: string | null
  created_at: string
  updated_at: string
}

/** Insert type - fields with defaults are optional */
export interface ConversationInsert {
  id?: string
  title?: string
  last_message_preview?: string | null
}

/** Update type - all fields optional */
export interface ConversationUpdate {
  title?: string
  last_message_preview?: string | null
  updated_at?: string
}

/** ENUM type for message roles (used by future chat_messages table) */
export type MessageRole = 'user' | 'agent' | 'system'

/** ENUM type for message types (used by future chat_messages table) */
export type MessageType = 'text' | 'slash_command' | 'result_card' | 'progress' | 'error'
