/**
 * Document storage tools for Holocron MCP
 * Implements store_document and update_document
 */

import type { HolocronConvexClient } from '../convex/client.ts'
import type { Document } from '../convex/types.ts'

/**
 * Store a new document
 */
export interface StoreDocumentInput {
  title: string
  content: string
  metadata?: Record<string, unknown>
}

export interface StoreDocumentOutput {
  documentId: string
  title: string
  embeddingStatus: 'pending' | 'completed' | 'failed'
}

export async function storeDocument(
  client: HolocronConvexClient,
  input: StoreDocumentInput
): Promise<StoreDocumentOutput> {
  const result = await client.mutation<StoreDocumentOutput>(
    'documents/mutations:storeDocument' as any,
    {
      title: input.title,
      content: input.content,
      metadata: input.metadata ?? {},
    }
  )

  return result
}

/**
 * Update an existing document
 */
export interface UpdateDocumentInput {
  documentId: string
  title?: string
  content?: string
  metadata?: Record<string, unknown>
}

export interface UpdateDocumentOutput {
  documentId: string
  updated: boolean
  embeddingStatus: 'pending' | 'completed' | 'failed'
}

export async function updateDocument(
  client: HolocronConvexClient,
  input: UpdateDocumentInput
): Promise<UpdateDocumentOutput> {
  const result = await client.mutation<UpdateDocumentOutput>(
    'documents/mutations:updateDocument' as any,
    {
      documentId: input.documentId,
      title: input.title,
      content: input.content,
      metadata: input.metadata,
    }
  )

  return result
}
