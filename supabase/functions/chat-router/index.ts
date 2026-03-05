/**
 * Chat Router Edge Function
 *
 * Central router for all chat-related operations.
 * Routes requests to appropriate handlers based on action field.
 *
 * Supported actions:
 * - chat:send - Send chat message and get agent response
 * - conversations:create - Create new conversation
 * - conversations:list - List user's conversations
 * - conversations:get - Get conversation by ID
 * - conversations:delete - Delete conversation
 * - task:status - Get task status
 * - task:cancel - Cancel running task
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { log } from '../_shared/logging/logger-server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import {
  handleChatSend,
  handleConversationsList,
  handleConversationsCreate,
  handleConversationsUpdate,
  handleConversationsDelete,
  handleDeepResearchStart,
  handleDeepResearchIterate,
} from './handlers/index.ts'

// ============================================================
// Types
// ============================================================

// Router request with action field
interface RouterRequest {
  action:
    | 'chat:send'
    | 'conversations:create'
    | 'conversations:list'
    | 'conversations:update'
    | 'conversations:delete'
    | 'task:deep-research-start'
    | 'task:deep-research-iterate'
    | 'task:status'
    | 'task:cancel'
  payload: unknown
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
// Stub Handlers (for actions not yet implemented)
// ============================================================

async function handleTaskStatus(payload: unknown, supabase: any): Promise<Response> {
  // TODO: Import and delegate to handlers/tasks.ts
  return jsonResponse({ error: 'Not implemented yet' }, 501)
}

async function handleTaskCancel(payload: unknown, supabase: any): Promise<Response> {
  // TODO: Import and delegate to handlers/tasks.ts
  return jsonResponse({ error: 'Not implemented yet' }, 501)
}

// ============================================================
// Main Handler
// ============================================================

async function handleRequest(req: Request): Promise<Response> {
  const logger = log('chat-router')

  // Get environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    logger.error('Missing environment variables', null, {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseServiceRoleKey,
    })
    return jsonResponse<ErrorResponse>({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

  // Parse request body
  let body: RouterRequest
  try {
    body = await req.json()
  } catch (error) {
    logger.error('Invalid JSON body', error)
    return jsonResponse<ErrorResponse>({ error: 'Invalid JSON body' }, 400)
  }

  // Validate action field
  if (!body.action) {
    return jsonResponse<ErrorResponse>({ error: 'action field is required' }, 400)
  }

  logger.info('Routing request', { action: body.action })

  // Route to appropriate handler
  try {
    switch (body.action) {
      case 'chat:send':
        return await handleChatSend(body.payload, supabase)

      case 'conversations:create':
        return await handleConversationsCreate(body.payload, supabase)

      case 'conversations:list':
        return await handleConversationsList(body.payload, supabase)

      case 'conversations:update':
        return await handleConversationsUpdate(body.payload, supabase)

      case 'conversations:delete':
        return await handleConversationsDelete(body.payload, supabase)

      case 'task:deep-research-start':
        return await handleDeepResearchStart(body.payload, supabase)

      case 'task:deep-research-iterate':
        return await handleDeepResearchIterate(body.payload, supabase)

      case 'task:status':
        return await handleTaskStatus(body.payload, supabase)

      case 'task:cancel':
        return await handleTaskCancel(body.payload, supabase)

      default:
        logger.warn('Unknown action', { action: body.action })
        return jsonResponse<ErrorResponse>(
          { error: `Unknown action: ${body.action}` },
          400
        )
    }
  } catch (error) {
    logger.error('Handler threw exception', error, {
      action: body.action,
    })
    return jsonResponse<ErrorResponse>({ error: 'Internal server error' }, 500)
  }
}

// ============================================================
// Deno Serve Entry Point
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

  return await handleRequest(req)
})
