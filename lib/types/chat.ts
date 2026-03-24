/**
 * Chat Message Types
 *
 * TypeScript types for chat messages matching the database schema.
 * @see db/migrations/*_create_chat_messages.sql
 * @see PRD SS11 - Data Schema > chat_messages
 */

export type MessageRole = 'user' | 'agent' | 'system'
export type MessageType = 'text' | 'slash_command' | 'result_card' | 'progress' | 'error'

// ============================================================
// Card Data Types (Discriminated Union)
// ============================================================
// These types must match the backend Edge Function card data
// @see db/functions/chat-send/index.ts
// @see db/functions/chat-send/slash-commands.ts

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

// Deep research loading card - displayed while research initializes
export interface DeepResearchLoadingCardData {
  card_type: 'deep_research_loading'
  query: string
  message?: string
}

// Deep research confirmation card - confirms session creation
export interface DeepResearchConfirmationCardData {
  card_type: 'deep_research_confirmation'
  session_id: string
  topic: string
  max_iterations: number
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

// Shop listing card - individual product listing
export interface ShopListingCardData {
  card_type: 'shop_listing'
  listing_id: string
  title: string
  price: number // in cents
  original_price?: number // in cents
  currency: string
  condition: string
  retailer: string
  seller?: string
  seller_rating?: number
  url: string
  image_url?: string
  in_stock: boolean
  deal_score?: number // 0-100
}

// Shop results card - summary with listings
export interface ShopResultsCardData {
  card_type: 'shop_results'
  session_id: string
  query: string
  total_listings: number
  best_deal_id?: string
  listings: ShopListingCardData[]
  status: 'searching' | 'completed' | 'failed'
  duration_ms?: number
}

// Shop loading card - searching state
export interface ShopLoadingCardData {
  card_type: 'shop_loading'
  session_id: string
  query: string
  message?: string
}

// Subscription added card - confirmation after /subscribe
export interface SubscriptionAddedCardData {
  card_type: 'subscription_added'
  subscription_id: string
  source_type: string
  identifier: string
  name: string
  url?: string
}

// Subscription list card - list view for /subscriptions
export interface SubscriptionListCardData {
  card_type: 'subscription_list'
  subscriptions: Array<{
    id: string
    source_type: string
    identifier: string
    name: string
    auto_research: boolean
    created_at: number
  }>
  filter_type?: string
}

// What's New report card - AI news briefing display
export interface WhatsNewReportCardData {
  card_type: 'whats_new_report'
  report_id: string
  period_start: number
  period_end: number
  days: number
  findings_count: number
  discovery_count: number
  release_count: number
  trend_count: number
  content?: string
  is_from_today: boolean
}

// What's New loading card - generating briefing
export interface WhatsNewLoadingCardData {
  card_type: 'whats_new_loading'
  message?: string
}

// Tool search results card - toolbelt search display
export interface ToolSearchResultsCardData {
  card_type: 'tool_search_results'
  query: string
  results: Array<{
    id: string
    title: string
    description?: string
    category: string
    source_type: string
    language?: string
    tags?: string[]
    score: number
  }>
}

// Tool adding card - loading state while adding from URL
export interface ToolAddingCardData {
  card_type: 'tool_adding'
  url: string
  message?: string
}

// Tool added card - confirmation after adding tool
export interface ToolAddedCardData {
  card_type: 'tool_added'
  tool_id: string
  title: string
  description?: string
  category: string
  source_type: string
  url: string
}

// Document saved card - confirmation after /save
export interface DocumentSavedCardData {
  card_type: 'document_saved'
  document_id: string
  title: string
  category?: string
}

// Document context card - document reference added to chat from document viewer
export interface DocumentContextCardData {
  card_type: 'document_context'
  document_id: string
  title: string
  category?: string
  /** 'full' = entire document, 'excerpt' = selected text block */
  scope: 'full' | 'excerpt'
  /** The excerpt text when scope is 'excerpt' */
  excerpt?: string
}

// Discriminated union of all card data types
// Also supports arrays of article cards for multiple search results
export type CardData =
  | ArticleCardData
  | StatsCardData
  | CategoryListCardData
  | NoResultsCardData
  | CategoryNotFoundCardData
  | DeepResearchLoadingCardData
  | DeepResearchConfirmationCardData
  | FinalResultCardData
  | ShopListingCardData
  | ShopResultsCardData
  | ShopLoadingCardData
  | SubscriptionAddedCardData
  | SubscriptionListCardData
  | WhatsNewReportCardData
  | WhatsNewLoadingCardData
  | ToolSearchResultsCardData
  | ToolAddingCardData
  | ToolAddedCardData
  | DocumentSavedCardData
  | DocumentContextCardData
  | ArticleCardData[]
  | ShopListingCardData[]

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
