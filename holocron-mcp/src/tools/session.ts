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
    'research/queries:getResearchSession' as any,
    { sessionId: input.sessionId }
  )
}

/**
 * Search across research sessions and findings
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
  const result = await client.query<SearchResearchOutput>(
    'research/queries:searchResearchSessions' as any,
    {
      query: input.query,
      limit: input.limit ?? 10,
    }
  )

  return result
}
