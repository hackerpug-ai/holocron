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

interface AgentMessage {
  id: string
  role: 'agent'
  content: string
  message_type: 'text' | 'result_card' | 'progress' | 'error'
  card_data?: unknown
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
// Agent Response Generator (Stub for MVP)
// ============================================================

function generateAgentResponse(userContent: string): string {
  // Basic stub response for MVP - will be replaced with real AI in future epics
  if (userContent.toLowerCase().includes('hello')) {
    return "Hello! I'm your research assistant. How can I help you today?"
  }
  if (userContent.toLowerCase().includes('help')) {
    return "I can help you search your knowledge base, conduct research, and manage articles. Try asking me a question!"
  }
  return `I received your message. Full AI responses will be available soon!`
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

    // Insert user message
    const { data: userMessage, error: userError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: body.conversation_id,
        role: 'user' as MessageRole,
        content: body.content,
        message_type: body.message_type || 'text',
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

    // Generate basic agent response (stub for MVP)
    const agentContent = generateAgentResponse(body.content)

    const { data: agentMessage, error: agentError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: body.conversation_id,
        role: 'agent' as MessageRole,
        content: agentContent,
        message_type: 'text' as MessageType,
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
