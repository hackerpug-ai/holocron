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
  const rawResults = await client.query<any[]>(
    'documents/queries:fullTextSearch' as any,
    {
      query: input.query,
      limit: input.limit ?? 20,
    }
  )

  // Transform the raw results to match expected output format
  return {
    results: rawResults.map(r => ({
      id: r._id,
      title: r.title,
      content: r.content,
      category: r.category,
      score: r.score,
    })),
    totalResults: rawResults.length,
  }
}

/**
 * Vector semantic search using embeddings
 * Note: This requires an embedding vector, not a query string.
 * Use hybridSearch for text-based semantic search.
 */
export interface SearchVectorInput {
  embedding: number[]
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
  const rawResults = await client.query<any[]>(
    'documents/queries:vectorSearch' as any,
    {
      embedding: input.embedding,
      limit: input.limit ?? 20,
    }
  )

  // Transform the raw results to match expected output format
  return {
    results: rawResults.map(r => ({
      id: r._id,
      title: r.title,
      content: r.content,
      category: r.category,
      score: r.score,
    })),
    totalResults: rawResults.length,
  }
}
