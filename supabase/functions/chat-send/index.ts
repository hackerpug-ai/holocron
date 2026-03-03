/**
 * Chat Send Edge Function
 *
 * Handles sending user messages and generating agent responses.
 * - POST: Accepts user message, persists it, generates agent response, returns both
 * - OPTIONS: CORS preflight
 *
 * @see US-011 - Build chat-send Edge Function with basic agent response routing
 * @see PRD SS11 - API Design > POST /chat-send
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  parseSlashCommand,
  isKnownCommand,
  generateHelpResponse,
  generateStatsResponse,
  VALID_CATEGORIES,
  type DocumentCategory,
  type StatsCardData,
} from './slash-commands.ts'

// ============================================================
// Types
// ============================================================

type MessageRole = 'user' | 'agent' | 'system'
type MessageType = 'text' | 'slash_command' | 'result_card' | 'progress' | 'error'

interface ChatSendRequest {
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

type CardData = CategoryListCard | BrowseArticleCard | SearchArticleCard | CategoryNotFoundCard | BrowseArticleCard[] | SearchArticleCard[] | NoResultsCard | StatsCardData

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

interface ChatSendResponse {
  user_message_id: string
  agent_messages: AgentMessage[]
}

interface ErrorResponse {
  error: string
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

async function handleSearchCommand(
  query: string,
  supabase: ReturnType<typeof createClient>
): Promise<AgentResponse> {
  console.log('handleSearchCommand called with query:', query)

  // Call hybrid_search RPC function
  const { data: searchResults, error: searchError } = await supabase.rpc('hybrid_search', {
    query_text: query,
    match_threshold: 0.5,
    result_count: 10,
  })

  if (searchError) {
    console.error('Search error:', searchError)
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
    snippet: doc.content ? doc.content.substring(0, 150) + (doc.content.length > 150 ? '...' : '') : '',
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
  supabase: ReturnType<typeof createClient>
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
      // Get external holocron database credentials
      const holocronUrl = Deno.env.get('HOLOCRON_URL')
      const holocronKey = Deno.env.get('HOLOCRON_SERVICE_ROLE_KEY')

      if (!holocronUrl || !holocronKey) {
        console.error('Holocron database credentials not configured')
        return {
          content: 'Sorry, the knowledge base is not configured. Please contact support.',
          message_type: 'error',
        }
      }

      // Create client for external holocron database
      const holocronClient = createClient(holocronUrl, holocronKey)

      // Generate stats response
      const statsResponse = await generateStatsResponse(holocronClient)

      return {
        content: statsResponse.content,
        message_type: statsResponse.message_type as 'text' | 'result_card' | 'error',
        card_data: statsResponse.card_data,
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
        documents?.forEach((doc) => {
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

      const articleCards: BrowseArticleCard[] = articles.map((doc) => ({
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
      content: 'I can help you search your knowledge base, conduct research, and manage articles. Try asking me a question!',
      message_type: 'text',
    }
  }
  return {
    content: 'I received your message. Full AI responses will be available soon!',
    message_type: 'text',
  }
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return jsonResponse<ErrorResponse>({ error: 'Method not allowed' }, 405)
  }

  // Get environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse<ErrorResponse>({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

  try {
    // Parse request body
    let body: ChatSendRequest
    try {
      body = await req.json()
    } catch {
      return jsonResponse<ErrorResponse>({ error: 'Invalid JSON body' }, 400)
    }

    // Validate required fields
    if (!body.conversation_id) {
      return jsonResponse<ErrorResponse>({ error: 'conversation_id is required' }, 400)
    }
    if (!body.content || body.content.trim() === '') {
      return jsonResponse<ErrorResponse>({ error: 'Message content cannot be empty' }, 400)
    }

    // Check conversation exists
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', body.conversation_id)
      .single()

    if (convError || !conversation) {
      return jsonResponse<ErrorResponse>({ error: 'Conversation not found' }, 404)
    }

    // Parse message to detect slash commands
    const parsed = parseSlashCommand(body.content)
    const messageType = parsed.isCommand ? 'slash_command' : (body.message_type || 'text')

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
      console.error('Failed to insert user message:', userError)
      throw userError
    }

    if (!userMessage) {
      return jsonResponse<ErrorResponse>({ error: 'Failed to create user message' }, 500)
    }

    // Update conversation metadata
    const preview = body.content.length > 100
      ? body.content.slice(0, 97) + '...'
      : body.content

    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
        last_message_preview: preview,
      })
      .eq('id', body.conversation_id)

    if (updateError) {
      console.error('Failed to update conversation:', updateError)
      // Don't fail the request if metadata update fails
    }

    // Generate agent response
    const agentResponse = await generateAgentResponse(body.content, supabase)

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
      console.error('Failed to insert agent message:', agentError)
      throw agentError
    }

    if (!agentMessage) {
      return jsonResponse<ErrorResponse>({ error: 'Failed to create agent message' }, 500)
    }

    const typedAgentMessage = agentMessage as ChatMessage

    return jsonResponse<ChatSendResponse>({
      user_message_id: userMessage.id,
      agent_messages: [{
        id: typedAgentMessage.id,
        role: 'agent',
        content: typedAgentMessage.content,
        message_type: typedAgentMessage.message_type as 'text' | 'result_card' | 'progress' | 'error',
        card_data: typedAgentMessage.card_data || undefined,
      }],
    })

  } catch (error) {
    console.error('chat-send error:', error)
    return jsonResponse<ErrorResponse>({ error: 'Internal server error' }, 500)
  }
})
