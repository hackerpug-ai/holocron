/**
 * Conversations CRUD Handlers
 *
 * Internal handlers for conversation management operations.
 * Adapted from supabase/functions/conversations/index.ts
 *
 * @see US-003 - Build conversations CRUD Edge Functions
 * @see PRD SS11 - API Design > Conversation Management
 */

import { log } from '../../_shared/logging/logger-server.ts'
import { corsHeaders } from '../../_shared/cors.ts'

// ============================================================
// Types
// ============================================================

export interface Conversation {
  id: string
  title: string
  last_message_preview: string | null
  created_at: string
  updated_at: string
}

interface ConversationInsert {
  id?: string
  title?: string
  last_message_preview?: string | null
}

interface ConversationUpdate {
  title?: string
  last_message_preview?: string | null
  updated_at?: string
}

interface SuccessResponse {
  data: Conversation | Conversation[] | { success: boolean }
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
// Handler: List Conversations
// ============================================================

export async function handleConversationsList(
  payload: unknown,
  supabase: any
): Promise<Response> {
  const logger = log('conversations-list')

  // Extract limit from payload if it's a query string object
  const params = payload as { limit?: string }
  const limitParam = params.limit
  const limit = clampLimit(limitParam ? parseInt(limitParam, 10) : 50)

  // @ts-ignore - Supabase type inference doesn't work well with Deno
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    logger.error('Failed to list conversations', error)
    return jsonResponse<ErrorResponse>({ error: 'Failed to list conversations' }, 500)
  }

  return jsonResponse<SuccessResponse>({ data: (data as Conversation[]) ?? [] })
}

// ============================================================
// Handler: Create Conversation
// ============================================================

export async function handleConversationsCreate(
  payload: unknown,
  supabase: any
): Promise<Response> {
  const logger = log('conversations-create')

  const body = payload as Partial<ConversationInsert>

  const insertData: ConversationInsert = {
    title: body.title ?? 'New Chat',
    last_message_preview: body.last_message_preview ?? null,
  }

  // @ts-ignore - Supabase type inference doesn't work well with Deno
  const { data, error } = await supabase
    .from('conversations')
    .insert(insertData as any)
    .select()
    .single()

  if (error) {
    logger.error('Failed to create conversation', error)
    return jsonResponse<ErrorResponse>({ error: 'Failed to create conversation' }, 500)
  }

  if (!data) {
    return jsonResponse<ErrorResponse>({ error: 'Failed to create conversation' }, 500)
  }

  return jsonResponse<SuccessResponse>({ data: data as Conversation }, 201)
}

// ============================================================
// Handler: Update Conversation
// ============================================================

export async function handleConversationsUpdate(
  payload: unknown,
  supabase: any
): Promise<Response> {
  const logger = log('conversations-update')

  const body = payload as Partial<{ id: string; title: string }>

  // Validate required fields
  if (!body.id || typeof body.id !== 'string') {
    return jsonResponse<ErrorResponse>({ error: 'Missing required field: id' }, 400)
  }

  if (body.title === undefined || body.title === null || typeof body.title !== 'string') {
    return jsonResponse<ErrorResponse>({ error: 'Missing required field: title' }, 400)
  }

  if (!isValidUuid(body.id)) {
    return jsonResponse<ErrorResponse>({ error: 'Invalid conversation id format' }, 400)
  }

  const updateData: ConversationUpdate = {
    title: body.title,
    updated_at: new Date().toISOString(),
  }

  // @ts-ignore - Supabase type inference doesn't work well with Deno
  const { data, error } = await supabase
    .from('conversations')
    .update(updateData as any)
    .eq('id', body.id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return jsonResponse<ErrorResponse>({ error: 'Conversation not found' }, 404)
    }
    logger.error('Failed to update conversation', error, { conversationId: body.id })
    return jsonResponse<ErrorResponse>({ error: 'Failed to update conversation' }, 500)
  }

  if (!data) {
    return jsonResponse<ErrorResponse>({ error: 'Conversation not found' }, 404)
  }

  return jsonResponse<SuccessResponse>({ data: data as Conversation })
}

// ============================================================
// Handler: Delete Conversation
// ============================================================

export async function handleConversationsDelete(
  payload: unknown,
  supabase: any
): Promise<Response> {
  const logger = log('conversations-delete')

  const body = payload as Partial<{ id: string }>

  // Validate required fields
  if (!body.id || typeof body.id !== 'string') {
    return jsonResponse<ErrorResponse>({ error: 'Missing required field: id' }, 400)
  }

  if (!isValidUuid(body.id)) {
    return jsonResponse<ErrorResponse>({ error: 'Invalid conversation id format' }, 400)
  }

  // @ts-ignore - Supabase type inference doesn't work well with Deno
  const { error } = await supabase.from('conversations').delete().eq('id', body.id)

  if (error) {
    logger.error('Failed to delete conversation', error, { conversationId: body.id })
    return jsonResponse<ErrorResponse>({ error: 'Failed to delete conversation' }, 500)
  }

  return jsonResponse<SuccessResponse>({ data: { success: true } })
}
