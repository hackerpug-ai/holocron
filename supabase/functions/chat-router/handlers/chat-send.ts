/**
 * Chat Send Handler
 *
 * Handles sending user messages and generating agent responses.
 * Internal handler function (not an Edge Function endpoint).
 *
 * Adapted from supabase/functions/chat-send/index.ts
 */

import { log } from '../../_shared/logging/logger-server.ts'
import { corsHeaders } from '../../_shared/cors.ts'
import {
  parseSlashCommand,
  isKnownCommand,
  generateHelpResponse,
  generateStatsResponse,
  handleDeepResearchCommand,
  handleResumeCommand,
  handleCancelCommand,
  VALID_CATEGORIES,
  type DocumentCategory,
  type StatsCardData,
  type DeepResearchConfirmationCardData,
} from './commands/slash-commands.ts'

// ============================================================
// Types
// ============================================================

type MessageRole = 'user' | 'agent' | 'system'
type MessageType = 'text' | 'slash_command' | 'result_card' | 'progress' | 'error'

export interface ChatSendRequest {
  conversation_id: string
  content: string
  message_type: 'text' | 'slash_command'
}

// Card data types for result_card messages
interface CategoryListCard {
  card_type: 'category_list'
  categories: Array<{
    name: string
    count: number
  }>
}

interface BrowseArticleCard {
  card_type: 'article'
  title: string
  date: string
  research_type?: string
  document_id: number
}

interface SearchArticleCard {
  card_type: 'article'
  title: string
  category: string
  snippet: string
  document_id: number
  metadata?: {
    relevance_score?: number
  }
}

interface NoResultsCard {
  card_type: 'no_results'
  message: string
}

interface CategoryNotFoundCard {
  card_type: 'category_not_found'
  valid_categories: string[]
}

type CardData =
  | CategoryListCard
  | BrowseArticleCard
  | SearchArticleCard
  | CategoryNotFoundCard
  | BrowseArticleCard[]
  | SearchArticleCard[]
  | NoResultsCard
  | StatsCardData
  | DeepResearchConfirmationCardData

interface AgentMessage {
  id: string
  role: 'agent'
  content: string
  message_type: 'text' | 'result_card' | 'progress' | 'error'
  card_data?: CardData
}

interface ChatMessage {
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

export interface ChatSendResponse {
  user_message_id: string
  agent_messages: AgentMessage[]
}

// ============================================================
// Response Helper
// ============================================================

function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ============================================================
// Search Command Handler
// ============================================================

async function handleSearchCommand(query: string, supabase: any): Promise<AgentResponse> {
  const logger = log('chat-send-search')
  logger.info('handleSearchCommand called', { query })

  // Call hybrid_search RPC function
  // @ts-ignore - Supabase RPC type inference doesn't work well with Deno
  const { data: searchResults, error: searchError } = await supabase.rpc('hybrid_search', {
    query_text: query,
    match_threshold: 0.5,
    result_count: 10,
  })

  if (searchError) {
    logger.error('Hybrid search failed', searchError, { query })
    return {
      content: `Sorry, I encountered an error while searching: ${searchError.message}`,
      message_type: 'error',
      card_data: {
        card_type: 'no_results',
        message: `Search error: ${searchError.message}`,
      } as NoResultsCard,
    }
  }

  // No results found
  if (!searchResults || searchResults.length === 0) {
    return {
      content: `No results found`,
      message_type: 'result_card',
      card_data: {
        card_type: 'no_results',
        message: `No articles found matching "${query}"`,
      } as NoResultsCard,
    }
  }

  // Results found - build card data
  const articleCards: SearchArticleCard[] = searchResults.map((doc: any) => ({
    card_type: 'article',
    title: doc.title,
    category: doc.category,
    snippet: doc.content
      ? doc.content.substring(0, 150) + (doc.content.length > 150 ? '...' : '')
      : '',
    document_id: doc.id,
    metadata: {
      relevance_score: doc.similarity || doc.rank,
    },
  }))

  return {
    content: `Found ${searchResults.length} article${searchResults.length === 1 ? '' : 's'} matching "${query}"`,
    message_type: 'result_card',
    card_data: articleCards,
  }
}

// ============================================================
// Agent Response Generator (with Database Access)
// ============================================================

interface AgentResponse {
  content: string
  message_type: 'text' | 'result_card' | 'error'
  card_data?: CardData
}

async function generateAgentResponse(
  userContent: string,
  supabase: any,
  conversationId: string
): Promise<AgentResponse> {
  // Parse for slash commands
  const parsed = parseSlashCommand(userContent)

  if (parsed.isCommand) {
    // Handle /help command
    if (parsed.command === 'help') {
      return {
        content: generateHelpResponse(),
        message_type: 'text',
      }
    }

    // Handle /search command
    if (parsed.command === 'search') {
      const query = parsed.args || ''

      if (!query) {
        return {
          content: 'Please provide a search query. Usage: /search <query>',
          message_type: 'text',
        }
      }

      return await handleSearchCommand(query, supabase)
    }

    // Handle /stats command
    if (parsed.command === 'stats') {
      // Generate stats response using the same supabase client
      // (documents table is in the same database as chat_messages)
      const statsResponse = await generateStatsResponse(supabase)

      return {
        content: statsResponse.content,
        message_type: statsResponse.message_type as 'text' | 'result_card' | 'error',
        card_data: statsResponse.card_data,
      }
    }

    // Handle /deep-research command
    if (parsed.command === 'deep-research') {
      const deepResearchResponse = await handleDeepResearchCommand(
        parsed.args,
        supabase,
        conversationId
      )

      return {
        content: deepResearchResponse.content,
        message_type: deepResearchResponse.message_type as 'text' | 'result_card' | 'error',
        card_data: deepResearchResponse.card_data,
      }
    }

    // Handle /cancel command
    if (parsed.command === 'cancel') {
      const cancelResponse = await handleCancelCommand(parsed.args || '', supabase, conversationId)

      return {
        content: cancelResponse.content,
        message_type: cancelResponse.message_type as 'text' | 'result_card' | 'error',
      }
    }

    // Handle /browse command
    if (parsed.command === 'browse') {
      const categoryArg = parsed.args?.toLowerCase().trim()

      // No category arg - list all categories with counts
      if (!categoryArg) {
        const { data: documents } = await supabase
          .from('documents')
          .select('category')
          .not('category', 'is', null)

        const categoryCounts: Record<string, number> = {}
        ;(documents || []).forEach((doc: any) => {
          if (doc.category) {
            categoryCounts[doc.category] = (categoryCounts[doc.category] || 0) + 1
          }
        })

        const categories = Object.entries(categoryCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)

        return {
          content: 'Browse articles by category',
          message_type: 'result_card',
          card_data: {
            card_type: 'category_list',
            categories,
          } as CategoryListCard,
        }
      }

      // Validate category
      if (!VALID_CATEGORIES.includes(categoryArg as DocumentCategory)) {
        return {
          content: `Category "${categoryArg}" not found. Valid categories: ${VALID_CATEGORIES.join(', ')}`,
          message_type: 'result_card',
          card_data: {
            card_type: 'category_not_found',
            valid_categories: [...VALID_CATEGORIES],
          } as CategoryNotFoundCard,
        }
      }

      // Filter by category
      const { data: articles } = await supabase
        .from('documents')
        .select('id, title, date, research_type')
        .eq('category', categoryArg)
        .order('created_at', { ascending: false })
        .limit(10)

      if (!articles || articles.length === 0) {
        return {
          content: `No articles found in category "${categoryArg}"`,
          message_type: 'text',
        }
      }

      const articleCards: BrowseArticleCard[] = articles.map((doc: any) => ({
        card_type: 'article',
        title: doc.title,
        date: doc.date || '',
        research_type: doc.research_type,
        document_id: doc.id,
      }))

      return {
        content: `Found ${articles.length} article${articles.length === 1 ? '' : 's'} in ${categoryArg}`,
        message_type: 'result_card',
        card_data: articleCards,
      }
    }

    // Check if command is known
    if (parsed.command && isKnownCommand(parsed.command)) {
      // Command is recognized but execution is deferred to future epics
      return {
        content: `Command /${parsed.command} recognized. Full command execution will be available soon!`,
        message_type: 'text',
      }
    }

    // Unknown command - treat as regular text with helpful message
    return {
      content: `Unknown command: /${parsed.command}. Type /help to see available commands.`,
      message_type: 'text',
    }
  }

  // Natural language questions that look like searches
  // (Question mark, "what is", "how do", etc.)
  const searchPatterns = [
    /^(what|how|who|where|when|why|which|can you|tell me|explain)/i,
    /\?$/,
  ]
  const looksLikeSearch = searchPatterns.some((pattern) => pattern.test(userContent.trim()))

  if (looksLikeSearch) {
    return await handleSearchCommand(userContent, supabase)
  }

  // Regular text message handling
  if (userContent.toLowerCase().includes('hello')) {
    return {
      content: "Hello! I'm your research assistant. How can I help you today?",
      message_type: 'text',
    }
  }
  if (userContent.toLowerCase().includes('help')) {
    return {
      content:
        'I can help you search your knowledge base, conduct research, and manage articles. Try asking me a question!',
      message_type: 'text',
    }
  }
  return {
    content: 'I received your message. Full AI responses will be available soon!',
    message_type: 'text',
  }
}

// ============================================================
// Main Handler Function
// ============================================================

export async function handleChatSend(payload: unknown, supabase: any): Promise<Response> {
  const logger = log('chat-send-handler')

  // Validate and parse payload
  const body = payload as ChatSendRequest

  try {
    // Validate required fields
    if (!body.conversation_id) {
      return jsonResponse({ error: 'conversation_id is required' }, 400)
    }
    if (!body.content || body.content.trim() === '') {
      return jsonResponse({ error: 'Message content cannot be empty' }, 400)
    }

    // Check conversation exists
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', body.conversation_id)
      .single()

    if (convError || !conversation) {
      return jsonResponse({ error: 'Conversation not found' }, 404)
    }

    // Parse message to detect slash commands
    const parsed = parseSlashCommand(body.content)
    const messageType = parsed.isCommand ? 'slash_command' : body.message_type || 'text'

    // Insert user message
    const { data: userMessage, error: userError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: body.conversation_id,
        role: 'user' as MessageRole,
        content: body.content,
        message_type: messageType,
      })
      .select()
      .single()

    if (userError) {
      logger.error('Failed to insert user message', userError, {
        conversationId: body.conversation_id,
      })
      throw userError
    }

    if (!userMessage) {
      return jsonResponse({ error: 'Failed to create user message' }, 500)
    }

    // Update conversation metadata
    const preview =
      body.content.length > 100 ? body.content.slice(0, 97) + '...' : body.content

    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
        last_message_preview: preview,
      })
      .eq('id', body.conversation_id)

    if (updateError) {
      logger.warn('Failed to update conversation metadata', {
        error: updateError,
        conversationId: body.conversation_id,
      })
      // Don't fail the request if metadata update fails
    }

    // Generate agent response
    const agentResponse = await generateAgentResponse(
      body.content,
      supabase,
      body.conversation_id
    )

    const { data: agentMessage, error: agentError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: body.conversation_id,
        role: 'agent' as MessageRole,
        content: agentResponse.content,
        message_type: agentResponse.message_type as MessageType,
        card_data: agentResponse.card_data || null,
      })
      .select()
      .single()

    if (agentError) {
      logger.error('Failed to insert agent message', agentError, {
        conversationId: body.conversation_id,
      })
      throw agentError
    }

    if (!agentMessage) {
      return jsonResponse({ error: 'Failed to create agent message' }, 500)
    }

    const typedAgentMessage = agentMessage as ChatMessage

    return jsonResponse<ChatSendResponse>({
      user_message_id: userMessage.id,
      agent_messages: [
        {
          id: typedAgentMessage.id,
          role: 'agent',
          content: typedAgentMessage.content,
          message_type: typedAgentMessage.message_type as
            | 'text'
            | 'result_card'
            | 'progress'
            | 'error',
          card_data: (typedAgentMessage.card_data as CardData) || undefined,
        },
      ],
    })
  } catch (error) {
    logger.error('Request failed', error, {
      conversationId: body.conversation_id,
      messageType: body.message_type,
    })
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
}
