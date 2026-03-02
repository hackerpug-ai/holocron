/**
 * Conversations CRUD Edge Function
 *
 * Handles all conversation management operations:
 * - GET: List conversations (with optional limit)
 * - POST: Create a new conversation
 * - PATCH: Rename a conversation
 * - DELETE: Delete a conversation
 *
 * @see US-003 - Build conversations CRUD Edge Functions
 * @see PRD SS11 - API Design > Conversation Management
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================
// Types
// ============================================================

interface Conversation {
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
// CORS Headers
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
// Handler: GET (List conversations)
// ============================================================

async function handleList(
  req: Request,
  supabase: any,
): Promise<Response> {
  const url = new URL(req.url)
  const limitParam = url.searchParams.get('limit')
  const limit = clampLimit(limitParam ? parseInt(limitParam, 10) : 50)

  // @ts-ignore
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    return jsonResponse<ErrorResponse>({ error: 'Failed to list conversations' }, 500)
  }

  return jsonResponse<SuccessResponse>({ data: (data as Conversation[]) ?? [] })
}

// ============================================================
// Handler: POST (Create conversation)
// ============================================================

async function handleCreate(
  req: Request,
  supabase: any,
): Promise<Response> {
  let body: Partial<ConversationInsert>

  try {
    body = await req.json()
  } catch {
    return jsonResponse<ErrorResponse>({ error: 'Invalid JSON body' }, 400)
  }

  const insertData: ConversationInsert = {
    title: body.title ?? 'New Chat',
    last_message_preview: body.last_message_preview ?? null,
  }

  // @ts-ignore
  const { data, error } = await (supabase
    .from('conversations')
    .insert(insertData as any)
    .select()
    .single())

  if (error) {
    return jsonResponse<ErrorResponse>({ error: 'Failed to create conversation' }, 500)
  }

  if (!data) {
    return jsonResponse<ErrorResponse>({ error: 'Failed to create conversation' }, 500)
  }

  return jsonResponse<SuccessResponse>({ data: data as Conversation }, 201)
}

// ============================================================
// Handler: PATCH (Rename conversation)
// ============================================================

async function handleRename(
  req: Request,
  supabase: any,
): Promise<Response> {
  let body: Partial<{ id: string; title: string }>

  try {
    body = await req.json()
  } catch {
    return jsonResponse<ErrorResponse>({ error: 'Invalid JSON body' }, 400)
  }

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

  // @ts-ignore
  const { data, error } = await (supabase
    .from('conversations')
    .update(updateData as any)
    .eq('id', body.id)
    .select()
    .single())

  if (error) {
    if (error.code === 'PGRST116') {
      return jsonResponse<ErrorResponse>({ error: 'Conversation not found' }, 404)
    }
    return jsonResponse<ErrorResponse>({ error: 'Failed to update conversation' }, 500)
  }

  if (!data) {
    return jsonResponse<ErrorResponse>({ error: 'Conversation not found' }, 404)
  }

  return jsonResponse<SuccessResponse>({ data: data as Conversation })
}

// ============================================================
// Handler: DELETE (Delete conversation)
// ============================================================

async function handleDelete(
  req: Request,
  supabase: any,
): Promise<Response> {
  let body: Partial<{ id: string }>

  try {
    body = await req.json()
  } catch {
    return jsonResponse<ErrorResponse>({ error: 'Invalid JSON body' }, 400)
  }

  // Validate required fields
  if (!body.id || typeof body.id !== 'string') {
    return jsonResponse<ErrorResponse>({ error: 'Missing required field: id' }, 400)
  }

  if (!isValidUuid(body.id)) {
    return jsonResponse<ErrorResponse>({ error: 'Invalid conversation id format' }, 400)
  }

  // @ts-ignore
  const { error } = await supabase.from('conversations').delete().eq('id', body.id)

  if (error) {
    return jsonResponse<ErrorResponse>({ error: 'Failed to delete conversation' }, 500)
  }

  return jsonResponse<SuccessResponse>({ data: { success: true } })
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Get environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse<ErrorResponse>({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

  try {
    switch (req.method) {
      case 'GET':
        return await handleList(req, supabase)
      case 'POST':
        return await handleCreate(req, supabase)
      case 'PATCH':
        return await handleRename(req, supabase)
      case 'DELETE':
        return await handleDelete(req, supabase)
      default:
        return jsonResponse<ErrorResponse>({ error: 'Method not allowed' }, 405)
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    return jsonResponse<ErrorResponse>({ error: 'Internal server error' }, 500)
  }
})
