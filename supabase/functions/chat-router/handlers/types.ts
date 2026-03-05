/**
 * Handler Types
 *
 * Shared type definitions for chat-router handlers.
 * This file consolidates types used across multiple handler functions.
 */

import type {
  StatsCardData,
  DeepResearchConfirmationCardData,
} from './commands/slash-commands.ts'

// ============================================================
// Database Types
// ============================================================

export type MessageRole = 'user' | 'agent' | 'system'
export type MessageType = 'text' | 'slash_command' | 'result_card' | 'progress' | 'error'

// ============================================================
// Card Data Types
// ============================================================

export interface CategoryListCard {
  card_type: 'category_list'
  categories: Array<{
    name: string
    count: number
  }>
}

export interface BrowseArticleCard {
  card_type: 'article'
  title: string
  date: string
  research_type?: string
  document_id: number
}

export interface SearchArticleCard {
  card_type: 'article'
  title: string
  category: string
  snippet: string
  document_id: number
  metadata?: {
    relevance_score?: number
  }
}

export interface NoResultsCard {
  card_type: 'no_results'
  message: string
}

export interface CategoryNotFoundCard {
  card_type: 'category_not_found'
  valid_categories: string[]
}

// Card data union type
export type CardData =
  | CategoryListCard
  | BrowseArticleCard
  | SearchArticleCard
  | CategoryNotFoundCard
  | BrowseArticleCard[]
  | SearchArticleCard[]
  | NoResultsCard
  | StatsCardData
  | DeepResearchConfirmationCardData

// ============================================================
// Message Types
// ============================================================

export interface AgentMessage {
  id: string
  role: 'agent'
  content: string
  message_type: 'text' | 'result_card' | 'progress' | 'error'
  card_data?: CardData
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  message_type: MessageType
  card_data: unknown | null
  session_id: string | null
  document_id: number | null
  created_at: string
}

// ============================================================
// Request / Response Types
// ============================================================

export interface ChatSendRequest {
  conversation_id: string
  content: string
  message_type: 'text' | 'slash_command'
}

export interface ChatSendResponse {
  user_message_id: string
  agent_messages: AgentMessage[]
}

// ============================================================
// Internal Types
// ============================================================

export interface AgentResponse {
  content: string
  message_type: 'text' | 'result_card' | 'error'
  card_data?: CardData
}
