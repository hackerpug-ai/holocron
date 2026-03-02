/**
 * Chat History Edge Function
 *
 * Returns paginated chat messages for a conversation with cursor-based pagination.
 * Enables infinite scroll in the ChatThread component.
 *
 * @see US-012 - Build chat-history Edge Function with cursor-based pagination
 * @see PRD SS11 - API Design > GET /functions/v1/chat-history
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ============================================================
// Types
// ============================================================

interface ChatMessage {
  id: string
  conversation_id: string
  role: 'user' | 'agent' | 'system'
  content: string
  message_type: 'text' | 'slash_command' | 'result_card' | 'progress' | 'error'
  card_data?: Record<string, unknown> | null
  session_id?: string | null
  document_id?: number | null
  created_at: string
}

interface SuccessResponse {
  messages: ChatMessage[]
  has_more: boolean
  next_cursor: string | null
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
// Validation Helpers
// ============================================================

function clampLimit(value: number, min = 1, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function isValidUuid(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Only accept GET requests
  if (req.method !== 'GET') {
    return jsonResponse<ErrorResponse>({ error: 'Method not allowed' }, 405)
  }

  // Parse query parameters
  const url = new URL(req.url)
  const conversationId = url.searchParams.get('conversation_id')
  const limitParam = url.searchParams.get('limit')
  const before = url.searchParams.get('before')

  // Validate required parameters
  if (!conversationId) {
    return jsonResponse<ErrorResponse>({ error: 'conversation_id is required' }, 400)
  }

  if (!isValidUuid(conversationId)) {
    return jsonResponse<ErrorResponse>({ error: 'Invalid conversation_id format' }, 400)
  }

  // Clamp limit between 1 and 100, default 20
  let limit = 20
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed)) {
      limit = clampLimit(parsed)
    }
  }

  // Get environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse<ErrorResponse>({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

  try {
    // Verify conversation exists
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      return jsonResponse<ErrorResponse>({ error: 'Conversation not found' }, 404)
    }

    // Build query for messages
    // Fetch limit + 1 to determine if there are more messages
    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit + 1)

    // Apply cursor filter if provided
    if (before) {
      query = query.lt('created_at', before)
    }

    const { data: messages, error: msgError } = await query

    if (msgError) {
      console.error('Error fetching messages:', msgError)
      throw msgError
    }

    // Determine pagination state
    const hasMore = messages && messages.length > limit
    const resultMessages = hasMore ? messages.slice(0, limit) : (messages || [])
    const nextCursor = hasMore && resultMessages.length > 0
      ? resultMessages[resultMessages.length - 1].created_at
      : null

    return jsonResponse<SuccessResponse>({
      messages: resultMessages as ChatMessage[],
      has_more: hasMore,
      next_cursor: nextCursor,
    })

  } catch (error) {
    console.error('chat-history error:', error)
    return jsonResponse<ErrorResponse>({ error: 'Internal server error' }, 500)
  }
})
