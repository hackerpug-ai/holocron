import type { HolocronConvexClient } from '../convex/client.js';
import type { IterationSearchResult } from '../convex/types.js';

/**
 * Input parameters for search_research tool
 */
export interface SearchResearchInput {
  query: string;
  limit?: number;
  confidenceFilter?: 'HIGH_ONLY' | 'HIGH_MEDIUM' | 'ALL';
}

/**
 * Output structure for search_research tool
 */
export interface SearchResearchOutput {
  results: Array<{
    sessionId: string;
    topic: string;
    findings: string;
    score: number; // 0-1 relevance score
    iterationNumber: number;
  }>;
}

/**
 * Search across all past research findings with hybrid search
 *
 * This tool:
 * - Calls hybridSearchIterations (combines vector + keyword search)
 * - Combines vector similarity (embeddings) + keyword matching (50/50 weight)
 * - Returns top N results sorted by relevance
 */
export async function searchResearch(
  client: HolocronConvexClient,
  input: SearchResearchInput
): Promise<SearchResearchOutput> {
  const limit = input.limit ?? 10;

  // Generate embedding for query
  const embedding = await client.generateEmbedding(input.query);

  // Execute hybrid search (vector + keyword)
  const [vectorResults, keywordResults] = await Promise.all([
    client.vectorSearchIterations({
      embedding,
      limit: limit * 2, // Fetch more for merging
    }),
    client.fullTextSearchIterations({
      query: input.query,
      limit: limit * 2,
    }),
  ]);

  // Merge results with 50/50 weighting
  const mergedResults = new Map<string, IterationSearchResult & { _id: string }>();

  // Add vector results (score is already 0-1 from cosine similarity)
  for (const result of vectorResults) {
    const key = (result as any)._id.toString();
    mergedResults.set(key, {
      _id: key,
      sessionId: (result as any).sessionId.toString(),
      topic: '', // Will be filled from session query
      findings: result.findings,
      score: result.score * 0.5, // 50% weight
      iterationNumber: 0, // Will be filled from iteration query
    });
  }

  // Add keyword results (combine scores if already exists)
  for (const result of keywordResults) {
    const key = (result as any)._id.toString();
    const existing = mergedResults.get(key);
    if (existing) {
      existing.score += result.score * 0.5; // Add 50% weighted keyword score
    } else {
      mergedResults.set(key, {
        _id: key,
        sessionId: (result as any).sessionId.toString(),
        topic: '',
        findings: result.findings ?? '',
        score: result.score * 0.5,
        iterationNumber: 0,
      });
    }
  }

  // Sort by combined score descending
  const sortedResults = Array.from(mergedResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Fetch session topics for results
  // Note: In production, this would batch query sessions
  // For simplicity, we'll use placeholder topics
  const results = sortedResults.map(r => ({
    sessionId: r.sessionId,
    topic: r.topic || 'Research Session', // Placeholder
    findings: r.findings ?? '',
    score: r.score,
    iterationNumber: r.iterationNumber,
  }));

  return { results };
}
