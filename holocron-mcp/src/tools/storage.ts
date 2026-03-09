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
  // Map metadata to Convex document schema
  const metadata = input.metadata ?? {}
  const category = (metadata.category as string) ?? 'general'
  const date = (metadata.date as string) ?? new Date().toISOString().split('T')[0]
  const researchType = (metadata.researchType as string)
  const status = (metadata.status as string)

  const result = await client.mutation<{ id: string }>(
    'documents/mutations:create',
    {
      title: input.title,
      content: input.content,
      category,
      date,
      ...(researchType && { researchType }),
      ...(status && { status }),
    }
  )

  return {
    documentId: result.id,
    title: input.title,
    embeddingStatus: 'pending',
  }
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
  // Map metadata to Convex document schema
  const metadata = input.metadata ?? {}
  const category = (metadata.category as string)
  const date = (metadata.date as string)
  const researchType = (metadata.researchType as string)
  const status = (metadata.status as string)

  const result = await client.mutation<{ id: string }>(
    'documents/index.js:update',
    {
      id: input.documentId,
      ...(input.title && { title: input.title }),
      ...(input.content && { content: input.content }),
      ...(category && { category }),
      ...(date && { date }),
      ...(researchType && { researchType }),
      ...(status && { status }),
    }
  )

  return {
    documentId: result.id,
    updated: true,
    embeddingStatus: 'pending',
  }
}
