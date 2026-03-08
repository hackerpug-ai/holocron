/**
 * Document retrieval tools for Holocron MCP
 * Implements get_document and list_documents
 */

import type { HolocronConvexClient } from '../convex/client.ts'
import type { Document } from '../convex/types.ts'

/**
 * Get a document by ID
 */
export interface GetDocumentInput {
  documentId: string
}

export async function getDocument(
  client: HolocronConvexClient,
  input: GetDocumentInput
): Promise<Document | null> {
  return await client.query<Document | null>(
    'documents/queries:getDocument' as any,
    { documentId: input.documentId }
  )
}

/**
 * List documents with pagination
 */
export interface ListDocumentsInput {
  limit?: number
  cursor?: string
}

export interface ListDocumentsOutput {
  documents: Document[]
  nextCursor: string | null
  hasMore: boolean
}

export async function listDocuments(
  client: HolocronConvexClient,
  input: ListDocumentsInput
): Promise<ListDocumentsOutput> {
  const result = await client.query<ListDocumentsOutput>(
    'documents/queries:listDocuments' as any,
    {
      limit: input.limit ?? 50,
      cursor: input.cursor,
    }
  )

  return result
}
