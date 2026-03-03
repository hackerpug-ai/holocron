/**
 * Chat Message Types
 *
 * TypeScript types for chat messages matching the database schema.
 * @see supabase/migrations/*_create_chat_messages.sql
 * @see PRD SS11 - Data Schema > chat_messages
 */

export type MessageRole = 'user' | 'agent' | 'system'
export type MessageType = 'text' | 'slash_command' | 'result_card' | 'progress' | 'error'

// ============================================================
// Card Data Types (Discriminated Union)
// ============================================================
// These types must match the backend Edge Function card data
// @see supabase/functions/chat-send/index.ts
// @see supabase/functions/chat-send/slash-commands.ts

// Article card - displayed in search/browse results
export interface ArticleCardData {
  card_type: 'article'
  title: string
  category?: string
  snippet?: string
  date?: string
  research_type?: string
  document_id: number
  metadata?: {
    relevance_score?: number
  }
}

// Stats card - knowledge base statistics
export interface StatsCardData {
  card_type: 'stats'
  total_count: number
  category_breakdown?: Array<{
    category: string
    count: number
  }>
  recent_count?: number
}

// Category list card - lists categories with counts
export interface CategoryListCardData {
  card_type: 'category_list'
  categories: Array<{
    name: string
    count: number
  }>
}

// No results card - empty search results
export interface NoResultsCardData {
  card_type: 'no_results'
  message?: string
}

// Category not found card - error with valid categories
export interface CategoryNotFoundCardData {
  card_type: 'category_not_found'
  category?: string
  valid_categories: string[]
}

// Deep research confirmation card - confirms session creation
export interface DeepResearchConfirmationCardData {
  card_type: 'deep_research_confirmation'
  session_id: string
  topic: string
  max_iterations: number
}

// Resume session list card - displays incomplete research sessions
export interface ResumeSessionListCardData {
  card_type: 'resume_session_list'
  sessions: Array<{
    session_id: string
    topic: string
    current_iteration: number
    max_iterations: number
    status: string
  }>
}

// Final result card - displayed when deep research completes
export interface FinalResultCardData {
  card_type: 'final_result'
  session_id: string
  topic: string
  total_iterations: number
  final_coverage_score: number
  findings_summary: string
}

// Discriminated union of all card data types
// Also supports arrays of article cards for multiple search results
export type CardData =
  | ArticleCardData
  | StatsCardData
  | CategoryListCardData
  | NoResultsCardData
  | CategoryNotFoundCardData
  | DeepResearchConfirmationCardData
  | ResumeSessionListCardData
  | FinalResultCardData
  | ArticleCardData[]

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
