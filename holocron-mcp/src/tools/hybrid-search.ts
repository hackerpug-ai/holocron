/**
 * Hybrid search tool for Holocron MCP
 * Combines FTS and vector search with intelligent ranking
 *
 * Generates query embeddings using the Convex backend and performs true hybrid search.
 */

import type { HolocronConvexClient } from "../convex/client.ts";
import type { SearchResult } from "../convex/types.ts";

/**
 * Hybrid search combining keyword and semantic search
 * Generates query embedding via Convex action and performs true hybrid search
 */
export interface HybridSearchInput {
  query: string;
  limit?: number;
  category?: string;
}

export interface HybridSearchOutput {
  results: SearchResult[];
  totalResults: number;
  searchMethod: "hybrid" | "fts_only" | "vector_only";
}

export async function hybridSearch(
  client: HolocronConvexClient,
  input: HybridSearchInput
): Promise<HybridSearchOutput> {
  try {
    // Use the Convex hybridSearch action which will generate the query embedding
    // and perform both vector and FTS search, then combine results
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference and result type
    const rawResults = await client.action<any[]>("documents/search:hybridSearch" as any, {
      query: input.query,
      limit: input.limit ?? 20,
      ...(input.category && { category: input.category }),
    });

    // Transform results to match expected output format
    const results: SearchResult[] = rawResults.map((r) => ({
      _id: r._id,
      title: r.title,
      score: r.score,
      content: r.content,
    }));

    return {
      results,
      totalResults: rawResults.length,
      searchMethod: "hybrid",
    };
  } catch (error) {
    // Fallback to FTS if hybrid search fails
    console.error("Hybrid search failed, falling back to FTS:", error);

    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference and result type
    const rawResults = await client.query<any[]>("documents/queries:fullTextSearch" as any, {
      query: input.query,
      limit: input.limit ?? 20,
      ...(input.category && { category: input.category }),
    });

    const results: SearchResult[] = rawResults.map((r) => ({
      _id: r._id,
      title: r.title,
      score: r.score,
      content: r.content,
    }));

    return {
      results,
      totalResults: rawResults.length,
      searchMethod: "fts_only",
    };
  }
}
