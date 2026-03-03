/**
 * Embeddings ETL Edge Function
 *
 * Batch generates OpenAI embeddings for documents that don't have them.
 * Processes documents in batches to respect API rate limits.
 *
 * Usage:
 *   POST /functions/v1/embeddings-etl
 *   Body: { dry_run?: boolean, batch_size?: number }
 *
 * @see US-0594 - Create embeddings ETL pipeline for hybrid search
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ============================================================
// Configuration
// ============================================================

const BATCH_SIZE = 50 // Process 50 documents at a time
const MAX_RETRIES = 3 // Retry failed embeddings up to 3 times
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_TEXT_LENGTH = 8000 // OpenAI limit for text-embedding-3-small

// ============================================================
// Types
// ============================================================

interface ETLRequest {
  dry_run?: boolean
  batch_size?: number
}

interface ETLResponse {
  success: boolean
  message: string
  stats: {
    total_without_embeddings: number
    processed: number
    succeeded: number
    failed: number
    skipped: number
  }
  errors?: Array<{ document_id: number; title: string; error: string }>
}

interface ErrorResponse {
  error: string
}

interface Document {
  id: number
  title: string
  content: string
  category: string
  embedding?: string | null
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
// Embedding Generation
// ============================================================

/**
 * Generate embedding using OpenAI API
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('EXPO_PUBLIC_OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_OPENAI_API_KEY not set')
  }

  const truncatedText = text.slice(0, MAX_TEXT_LENGTH)

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncatedText,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${error}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

/**
 * Generate embedding with retry logic
 */
async function generateEmbeddingWithRetry(
  text: string,
  retries = MAX_RETRIES
): Promise<number[]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await generateEmbedding(text)
    } catch (error) {
      if (attempt === retries - 1) throw error
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000
      console.log(`Retry ${attempt + 1}/${retries} after ${delay}ms delay`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Max retries exceeded')
}

// ============================================================
// Document Processing
// ============================================================

/**
 * Process a single document - generate and store embedding
 */
async function processDocument(
  doc: Document,
  supabase: ReturnType<typeof createClient>
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Processing document ${doc.id}: ${doc.title}`)

    // Combine title and content for better semantic search
    const text = `${doc.title}\n\n${doc.content}`
    const embedding = await generateEmbeddingWithRetry(text)

    // Update document with embedding
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        embedding: `[${embedding.join(',')}]`,
        embedding_updated_at: new Date().toISOString(),
      })
      .eq('id', doc.id)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Process a batch of documents
 */
async function processBatch(
  documents: Document[],
  supabase: ReturnType<typeof createClient>
): Promise<{ succeeded: number; failed: number; errors: ETLResponse['errors'] }> {
  const errors: ETLResponse['errors'] = []
  let succeeded = 0
  let failed = 0

  // Process documents concurrently (but with rate limiting)
  for (const doc of documents) {
    const result = await processDocument(doc, supabase)

    if (result.success) {
      succeeded++
    } else {
      failed++
      errors.push({
        document_id: doc.id,
        title: doc.title,
        error: result.error || 'Unknown error',
      })
    }

    // Small delay between requests to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return { succeeded, failed, errors }
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
    let body: ETLRequest
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const dryRun = body.dry_run ?? false
    const batchSize = body.batch_size ?? BATCH_SIZE

    console.log(`Starting embeddings ETL (dry_run=${dryRun}, batch_size=${batchSize})`)

    // Fetch documents without embeddings
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, title, content, category, embedding')
      .or('embedding.is.null,embedding.eq."[]"')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (fetchError) {
      console.error('Failed to fetch documents:', fetchError)
      throw fetchError
    }

    if (!documents || documents.length === 0) {
      return jsonResponse<ETLResponse>({
        success: true,
        message: 'All documents already have embeddings',
        stats: {
          total_without_embeddings: 0,
          processed: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
        },
      })
    }

    console.log(`Found ${documents.length} documents without embeddings`)

    if (dryRun) {
      return jsonResponse<ETLResponse>({
        success: true,
        message: `Dry run complete. Would process ${documents.length} documents.`,
        stats: {
          total_without_embeddings: documents.length,
          processed: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
        },
      })
    }

    // Process the batch
    const { succeeded, failed, errors } = await processBatch(documents, supabase)

    return jsonResponse<ETLResponse>({
      success: true,
      message: `ETL complete: ${succeeded} succeeded, ${failed} failed`,
      stats: {
        total_without_embeddings: documents.length,
        processed: documents.length,
        succeeded,
        failed,
        skipped: 0,
      },
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (error) {
    console.error('embeddings-etl error:', error)
    return jsonResponse<ErrorResponse>({
      error: `Internal server error: ${(error as Error).message}`
    }, 500)
  }
})
