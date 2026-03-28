/**
 * Chat Message Types
 *
 * TypeScript types for chat messages matching the database schema.
 * @see db/migrations/*_create_chat_messages.sql
 * @see PRD SS11 - Data Schema > chat_messages
 */

export type MessageRole = 'user' | 'agent' | 'system'
export type MessageType = 'text' | 'slash_command' | 'result_card' | 'progress' | 'error' | 'tool_approval' | 'agent_plan'

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

// Subscription suggestion card - AI suggests creator to follow
export interface SubscriptionSuggestionCardData {
  card_type: 'subscription_suggestion'
  creator_id: string
  name: string
  handle: string
  bio?: string
  avatar_url?: string
  platforms: {
    youtube?: { handle: string; verified?: boolean }
    twitter?: { handle: string; verified?: boolean }
    bluesky?: { handle: string; verified?: boolean }
    github?: { handle: string; verified?: boolean }
    website?: { url: string; verified?: boolean }
  }
  existing_subscriptions?: Array<'youtube' | 'twitter' | 'bluesky' | 'github' | 'website'>
}

// Subscription progress card - real-time subscription progress
export interface SubscriptionProgressCardData {
  card_type: 'subscription_progress'
  creator_name: string
  platforms: Array<{
    platform: string
    status: 'pending' | 'in_progress' | 'success' | 'error'
    error?: string
  }>
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
  // Extended fields for enhanced filtering and ranking
  top_engagement_velocity?: number // Highest engagement score in this report
  total_corroboration_count?: number // Total cross-source mentions
  sources?: string[] // List of sources in this report
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

// Assimilation plan card - approval gate for repository analysis
export interface AssimilationPlanCardData {
  card_type: 'assimilation_plan'
  session_id: string
  repository_name: string
  repository_url: string
  profile: string                    // fast | standard | thorough
  plan_summary: string               // "5 dimensions, 7 iterations, ~$2.00"
  status: 'pending_approval' | 'approved' | 'rejected' | 'in_progress' | 'completed'
  dimension_scores?: Record<string, number>  // live progress when in_progress
  current_iteration?: number
  max_iterations?: number
}

// Assimilation progress card - iteration progress display
export interface AssimilationProgressCardData {
  card_type: 'assimilation_progress'
  session_id: string
  repository_name: string
  profile: string
  status: 'in_progress' | 'synthesizing' | 'completed' | 'failed'
  current_iteration: number
  max_iterations: number
  dimension_scores: Record<string, number>
  current_dimension?: string
  estimated_cost_usd?: number
  document_id?: string              // set when completed
}

// Agent plan card - displayed when an agent plan is created
export interface AgentPlanCardData {
  card_type: 'agent_plan'
  plan_id: string
  title: string
  total_steps: number
}

// Deep research plan card - displayed when a deep research plan is created
export interface DeepResearchPlanCardData {
  card_type: 'deep_research_plan'
  plan_id: string
  session_id: string
  topic: string
  max_iterations: number
  total_steps: number
  query?: string
}

// Shop plan card - displayed when a shopping search plan is created
export interface ShopPlanCardData {
  card_type: 'shop_plan'
  plan_id: string
  session_id: string
  query: string
  total_steps: number
  retailers?: string[]
  max_results?: number
  price_range?: {
    min_cents?: number
    max_cents?: number
  }
}

// Universal plan card - displayed for any plan type (unified format)
export interface UniversalPlanCardData {
  card_type: 'universal_plan'
  plan_id: string
  plan_type: 'deep-research' | 'shop' | 'assimilation' | 'agent'
  title: string
  status: 'created' | 'pending_approval' | 'approved' | 'executing' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'rejected'
  total_steps: number
  current_step?: number
  metadata?: {
    session_id?: string
    conversation_id?: string
    repository_name?: string
    repository_url?: string
    profile?: string
    plan_summary?: string
    estimated_cost_usd?: number
    [key: string]: unknown
  }
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
  /** Root MDAST child index of the excerpt block - used for scroll-to-highlight */
  blockIndex?: number
}

// Document full card - complete document content display
export interface DocumentFullCardData {
  card_type: 'document_full'
  document_id: string
  title: string
  category?: string
  content: string
  metadata?: {
    date?: string
    researchType?: string
    createdAt?: number
  }
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
  | SubscriptionSuggestionCardData
  | SubscriptionProgressCardData
  | WhatsNewReportCardData
  | WhatsNewLoadingCardData
  | ToolSearchResultsCardData
  | ToolAddingCardData
  | ToolAddedCardData
  | DocumentSavedCardData
  | DocumentContextCardData
  | DocumentFullCardData
  | AssimilationPlanCardData
  | AssimilationProgressCardData
  | AgentPlanCardData
  | DeepResearchPlanCardData
  | ShopPlanCardData
  | UniversalPlanCardData
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
