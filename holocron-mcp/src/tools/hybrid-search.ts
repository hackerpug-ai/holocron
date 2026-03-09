/**
 * Hybrid search tool for Holocron MCP
 * Combines FTS and vector search with intelligent ranking
 *
 * Note: The Convex hybridSearch action requires an embedding parameter.
 * Since MCP tools receive text queries, we use FTS as the primary search method.
 * For true hybrid search with embeddings, use searchVector with a pre-computed embedding.
 */

import type { HolocronConvexClient } from '../convex/client.ts'
import type { SearchResult } from '../convex/types.ts'

/**
 * Hybrid search combining keyword and semantic search
 * Currently uses FTS-only as the primary method since we don't have
 * embedding generation in the MCP server.
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
  // Use FTS as the primary search method
  // The Convex hybridSearch action requires embeddings which we don't generate here
  const rawResults = await client.query<any[]>(
    'documents/queries:fullTextSearch' as any,
    {
      query: input.query,
      limit: input.limit ?? 20,
    }
  )

  // Transform results to match expected output format
  const results = rawResults.map(r => ({
    id: r._id,
    title: r.title,
    content: r.content,
    category: r.category,
    score: r.score,
  }))

  return {
    results,
    totalResults: rawResults.length,
    searchMethod: 'fts_only',
  }
}
