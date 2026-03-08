/**
 * Hybrid search tool for Holocron MCP
 * Combines FTS and vector search with intelligent ranking
 */

import type { HolocronConvexClient } from '../convex/client.ts'
import type { SearchResult } from '../convex/types.ts'

/**
 * Hybrid search combining keyword and semantic search
 */
export interface HybridSearchInput {
  query: string
  limit?: number
}

export interface HybridSearchOutput {
  results: SearchResult[]
  totalResults: number
  searchMethod: 'hybrid' | 'fts_only' | 'vector_only'
}

export async function hybridSearch(
  client: HolocronConvexClient,
  input: HybridSearchInput
): Promise<HybridSearchOutput> {
  const result = await client.query<HybridSearchOutput>(
    'documents/search:hybridSearch' as any,
    {
      query: input.query,
      limit: input.limit ?? 20,
    }
  )

  return result
}
