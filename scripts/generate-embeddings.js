#!/usr/bin/env - node
/**
 * Generate Embeddings Script
 *
 * Local script for generating OpenAI embeddings for documents without them.
 * Useful for development and testing.
 *
 * Usage:
 *   node scripts/generate-embeddings.js [--dry-run] [--batch-size N]
 *
 * @see US-0594 - Create embeddings ETL pipeline for hybrid search
 */

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

// ============================================================
// Configuration
// ============================================================

const BATCH_SIZE = 50
const MAX_RETRIES = 3
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_TEXT_LENGTH = 8000

// ============================================================
// Setup
// ============================================================

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing Supabase credentials in .env')
  process.exit(1)
}

if (!openaiKey) {
  console.error('❌ Missing EXPO_PUBLIC_OPENAI_API_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

// ============================================================
// Embedding Generation
// ============================================================

async function generateEmbedding(text) {
  const truncatedText = text.slice(0, MAX_TEXT_LENGTH)

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
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

async function generateEmbeddingWithRetry(text, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await generateEmbedding(text)
    } catch (error) {
      if (attempt === retries - 1) throw error
      const delay = Math.pow(2, attempt) * 1000
      console.log(`  Retry ${attempt + 1}/${retries} after ${delay}ms delay`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Max retries exceeded')
}

// ============================================================
// Document Processing
// ============================================================

async function processDocument(doc) {
  try {
    console.log(`  Processing document ${doc.id}: ${doc.title}`)

    const text = `${doc.title}\n\n${doc.content}`
    const embedding = await generateEmbeddingWithRetry(text)

    const { error } = await supabase
      .from('documents')
      .update({
        embedding: `[${embedding.join(',')}]`,
        embedding_updated_at: new Date().toISOString(),
      })
      .eq('id', doc.id)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: (error).message }
  }
}

async function processBatch(documents) {
  const errors = []
  let succeeded = 0
  let failed = 0

  for (const doc of documents) {
    const result = await processDocument(doc)

    if (result.success) {
      succeeded++
      process.stdout.write('✓')
    } else {
      failed++
      errors.push({
        document_id: doc.id,
        title: doc.title,
        error: result.error || 'Unknown error',
      })
      process.stdout.write('✗')
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log() // New line after progress indicators

  return { succeeded, failed, errors }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='))
  const batchSize = batchSizeArg ? parseInt(batchArg.split('=')[1], 10) : BATCH_SIZE

  console.log('🔮 Embeddings ETL Script')
  console.log(`   Dry run: ${dryRun}`)
  console.log(`   Batch size: ${batchSize}`)
  console.log()

  // Fetch documents without embeddings
  console.log('📋 Fetching documents without embeddings...')
  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, title, content, category, embedding')
    .or('embedding.is.null,embedding.eq."[]"')
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (error) {
    console.error('❌ Failed to fetch documents:', error)
    process.exit(1)
  }

  if (!documents || documents.length === 0) {
    console.log('✅ All documents already have embeddings!')
    process.exit(0)
  }

  console.log(`   Found ${documents.length} documents without embeddings`)
  console.log()

  if (dryRun) {
    console.log(`🔍 Dry run complete. Would process ${documents.length} documents:`)
    documents.forEach(doc => {
      console.log(`   - ${doc.id}: ${doc.title}`)
    })
    process.exit(0)
  }

  // Process the batch
  console.log(`⚡ Processing ${documents.length} documents...`)
  const { succeeded, failed, errors } = await processBatch(documents)

  console.log()
  console.log('📊 Results:')
  console.log(`   ✅ Succeeded: ${succeeded}`)
  console.log(`   ❌ Failed: ${failed}`)

  if (errors.length > 0) {
    console.log()
    console.log('❌ Errors:')
    errors.forEach(({ document_id, title, error }) => {
      console.log(`   - Document ${document_id} "${title}": ${error}`)
    })
  }

  // Summary
  console.log()
  if (failed === 0) {
    console.log('✅ All embeddings generated successfully!')
  } else {
    console.log(`⚠️  Completed with ${failed} errors`)
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
