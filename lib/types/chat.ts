/**
 * Chat Message Types
 *
 * TypeScript types for chat messages matching the database schema.
 * @see supabase/migrations/*_create_chat_messages.sql
 * @see PRD SS11 - Data Schema > chat_messages
 */

export type MessageRole = 'user' | 'agent' | 'system'
export type MessageType = 'text' | 'slash_command' | 'result_card' | 'progress' | 'error'

export interface CardData {
  card_type: 'article' | 'research_result' | 'stats' | 'session' | 'category_list'
  title: string
  snippet?: string
  category?: string
  confidence_score?: number
  source_count?: number
  document_id?: number
  session_id?: string
  metadata?: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  message_type: MessageType
  card_data: CardData | null
  session_id: string | null
  document_id: number | null
  created_at: string
}

export interface ChatMessageInsert {
  conversation_id: string
  role: MessageRole
  content: string
  message_type: MessageType
  card_data?: CardData | null
  session_id?: string | null
  document_id?: number | null
}
