/**
 * Search tools for Holocron MCP
 * Implements search_fts (full-text) and search_vector (semantic)
 */

import type { HolocronConvexClient } from '../convex/client.ts'
import type { SearchResult } from '../convex/types.ts'

/**
 * Full-text search using FTS5
 */
export interface SearchFtsInput {
  query: string
  limit?: number
}

export interface SearchFtsOutput {
  results: SearchResult[]
  totalResults: number
}

export async function searchFts(
  client: HolocronConvexClient,
  input: SearchFtsInput
): Promise<SearchFtsOutput> {
  const result = await client.query<SearchFtsOutput>(
    'documents/search:searchFts' as any,
    {
      query: input.query,
      limit: input.limit ?? 20,
    }
  )

  return result
}

/**
 * Vector semantic search using embeddings
 */
export interface SearchVectorInput {
  query: string
  limit?: number
}

export interface SearchVectorOutput {
  results: SearchResult[]
  totalResults: number
}

export async function searchVector(
  client: HolocronConvexClient,
  input: SearchVectorInput
): Promise<SearchVectorOutput> {
  const result = await client.query<SearchVectorOutput>(
    'documents/search:searchVector' as any,
    {
      query: input.query,
      limit: input.limit ?? 20,
    }
  )

  return result
}
