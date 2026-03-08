import type { HolocronConvexClient } from '../convex/client.js';
import type { ResearchTopicOutput } from './research.js';

/**
 * Input parameters for get_research_session tool
 */
export interface GetSessionInput {
  sessionId: string;
}

/**
 * Get existing research session by ID
 *
 * This tool:
 * - Single query call to getDeepResearchSession
 * - No polling required (one-shot retrieval)
 * - Returns null if session not found
 */
export async function getResearchSession(
  client: HolocronConvexClient,
  input: GetSessionInput
): Promise<ResearchTopicOutput | null> {
  // Fetch session
  const session = await client.getSession(input.sessionId);

  if (!session) {
    return null;
  }

  // Fetch findings
  const findings = await client.getFindings({
    sessionId: input.sessionId,
    confidenceFilter: 'ALL',
  });

  // Get confidence summary
  const summary = await client.getConfidenceSummary(input.sessionId);

  // Determine final coverage score from last iteration
  const lastIteration = session.iterations[session.iterations.length - 1];
  const coverageScore = lastIteration?.coverageScore ?? 0;

  // Format output (same structure as research_topic)
  return {
    sessionId: session.id,
    topic: session.topic,
    status: session.status === 'completed' ? 'completed' : 'error',
    iterations: session.iterations.length,
    coverageScore,
    confidenceStats: summary?.stats ?? {
      highConfidenceCount: 0,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      averageConfidenceScore: 0,
      claimsWithMultipleSources: 0,
      totalClaims: 0,
    },
    findings: findings.map(f => ({
      claimText: f.claimText,
      confidenceLevel: f.confidenceLevel,
      confidenceScore: f.confidenceScore,
      citations: f.citations.map(c => ({
        url: c.url,
        title: c.title,
      })),
      caveats: f.caveats,
      warnings: f.warnings,
    })),
  };
}
