/**
 * Research tools for Holocron MCP
 * Implements research_topic and simple_research MCP tools
 */

import type { HolocronConvexClient } from '../convex/client.ts'
import type { ResearchSession } from '../convex/types.ts'
import { formatProgress, formatFinalResults } from '../streaming/formatter.ts'
import { streamProgress, subscriptionManager } from '../streaming/subscription-manager.ts'

/**
 * Deep research with streaming progress updates
 */
export interface ResearchTopicInput {
  topic: string
  maxIterations?: number
  confidenceFilter?: 'HIGH_ONLY' | 'HIGH_MEDIUM' | 'ALL'
}

export interface ResearchTopicOutput {
  sessionId: string
  topic: string
  status: 'running' | 'completed' | 'failed'
  iterations: number
  findings: unknown[]
  confidenceStats: {
    high: number
    medium: number
    low: number
  }
}

export async function researchTopic(
  client: HolocronConvexClient,
  input: ResearchTopicInput
): Promise<ResearchTopicOutput> {
  // Start deep research via Convex action
  const startResult = await client.action<{ sessionId: string }>(
    'research/index:startDeepResearch' as any,
    {
      topic: input.topic,
      maxIterations: input.maxIterations ?? 5,
    }
  )

  const { sessionId } = startResult

  // Set up subscription for progress updates
  const unsubscribe = client.subscribe<ResearchSession>(
    'research/queries:getDeepResearchSession' as any,
    { sessionId },
    (session) => {
      if (session) {
        streamProgress(session)

        // Cleanup on completion
        if (session.status === 'completed' || session.status === 'failed') {
          console.error(formatFinalResults(session))
          subscriptionManager.remove(sessionId)
        }
      }
    }
  )

  // Track subscription for cleanup
  subscriptionManager.add(sessionId, unsubscribe)

  // Poll for completion
  let session: ResearchSession | null = null
  const maxWaitMs = 600000 // 10 minutes
  const pollIntervalMs = 2000
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    session = await client.query<ResearchSession>(
      'research/queries:getDeepResearchSession' as any,
      { sessionId }
    )

    if (session && (session.status === 'completed' || session.status === 'failed')) {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  if (!session) {
    throw new Error('Research session not found or timed out')
  }

  // Cleanup subscription
  subscriptionManager.remove(sessionId)

  return {
    sessionId: session._id,
    topic: session.topic,
    status: session.status,
    iterations: session.currentIteration,
    findings: session.findings,
    confidenceStats: session.confidenceStats,
  }
}

/**
 * Simple research without streaming (single iteration)
 */
export interface SimpleResearchInput {
  topic: string
}

export interface SimpleResearchOutput {
  sessionId: string
  topic: string
  status: 'completed' | 'error'
  summary: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  durationMs: number
}

export async function simpleResearch(
  client: HolocronConvexClient,
  input: SimpleResearchInput
): Promise<SimpleResearchOutput> {
  const result = await client.action<SimpleResearchOutput>(
    'research/index:startSimpleResearch' as any,
    {
      topic: input.topic,
    }
  )

  return result
}
