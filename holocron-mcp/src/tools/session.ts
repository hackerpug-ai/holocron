/**
 * Session management tools for Holocron MCP
 * Implements get_research_session and search_research
 */

import type { HolocronConvexClient } from '../convex/client.ts'
import type { ResearchSession } from '../convex/types.ts'

/**
 * Get research session by ID
 */
export interface GetResearchSessionInput {
  sessionId: string
}

export async function getResearchSession(
  client: HolocronConvexClient,
  input: GetResearchSessionInput
): Promise<ResearchSession | null> {
  return await client.query<ResearchSession | null>(
    'research/queries:getDeepResearchSession' as any,
    { sessionId: input.sessionId }
  )
}

/**
 * Search across research sessions and findings
 * Uses fullTextSearchIterations to find matching research iterations
 */
export interface SearchResearchInput {
  query: string
  limit?: number
}

export interface SearchResearchOutput {
  sessions: Array<{
    sessionId: string
    topic: string
    relevanceScore: number
    status: string
    createdAt: number
  }>
  totalResults: number
}

export async function searchResearch(
  client: HolocronConvexClient,
  input: SearchResearchInput
): Promise<SearchResearchOutput> {
  // Search for iterations matching the query
  const iterations = await client.query<any[]>(
    'research/queries:fullTextSearchIterations' as any,
    {
      query: input.query,
      limit: input.limit ?? 10,
    }
  )

  // Get unique sessions from the iterations
  const sessionMap = new Map<string, any>()
  for (const iter of iterations) {
    if (!sessionMap.has(iter.sessionId)) {
      sessionMap.set(iter.sessionId, iter)
    }
  }

  const sessions = Array.from(sessionMap.values()).map((iter, index) => ({
    sessionId: iter.sessionId,
    topic: iter.findings?.slice(0, 100) || 'Research session',
    relevanceScore: iter.score || (1 - index / sessionMap.size),
    status: 'completed',
    createdAt: iter.createdAt || Date.now(),
  }))

  return {
    sessions,
    totalResults: sessions.length,
  }
}
