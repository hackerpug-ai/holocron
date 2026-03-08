import type { HolocronConvexClient } from '../convex/client.js';
import type { HolocronConfig } from '../config/env.js';
import { pollUntilComplete, filterFindingsByConfidence } from '../polling/strategies.js';

/**
 * Input parameters for research_topic tool
 */
export interface ResearchTopicInput {
  topic: string;
  maxIterations?: number;
  confidenceFilter?: 'HIGH_ONLY' | 'HIGH_MEDIUM' | 'ALL';
}

/**
 * Output structure for research_topic tool
 */
export interface ResearchTopicOutput {
  sessionId: string;
  topic: string;
  status: 'completed' | 'error';
  iterations: number;
  coverageScore: number;
  confidenceStats: {
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
    averageConfidenceScore: number;
    claimsWithMultipleSources: number;
    totalClaims: number;
  };
  findings: Array<{
    claimText: string;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    confidenceScore: number;
    citations: Array<{ url: string; title: string }>;
    caveats: string[];
    warnings: string[];
  }>;
}

/**
 * Start deep research and wait synchronously for completion
 *
 * This tool:
 * 1. Calls startDeepResearch Convex action (returns immediately with sessionId)
 * 2. Polls getDeepResearchSession query every 2 seconds
 * 3. Returns when status === "completed" || status === "error"
 * 4. Applies confidence filter to findings before returning
 * 5. Timeout after 5 minutes (configurable via env)
 */
export async function researchTopic(
  client: HolocronConvexClient,
  config: HolocronConfig,
  input: ResearchTopicInput
): Promise<ResearchTopicOutput> {
  // Start research session
  const { sessionId } = await client.startResearch({
    topic: input.topic,
    maxIterations: input.maxIterations ?? 5,
  });

  // Poll until complete
  const result = await pollUntilComplete(client, sessionId, {
    pollIntervalMs: config.pollIntervalMs,
    timeoutMs: config.timeoutMs,
  });

  // Apply confidence filter
  const confidenceFilter = input.confidenceFilter ?? 'ALL';
  const filteredFindings = filterFindingsByConfidence(result.findings, confidenceFilter);

  // Format output
  return {
    sessionId: result.sessionId,
    topic: result.topic,
    status: result.status === 'completed' ? 'completed' : 'error',
    iterations: result.iterations,
    coverageScore: result.coverageScore,
    confidenceStats: result.confidenceStats,
    findings: filteredFindings.map(f => ({
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

/**
 * Input parameters for simple_research tool
 */
export interface SimpleResearchInput {
  topic: string;
}

/**
 * Output structure for simple_research tool
 */
export interface SimpleResearchOutput {
  sessionId: string;
  topic: string;
  status: 'completed' | 'error';
  summary: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  durationMs: number;
}

/**
 * Start simple research and return immediately
 *
 * This tool:
 * 1. Calls startSimpleResearch Convex action
 * 2. Returns immediately with results (no polling)
 * 3. Completes in 15-30 seconds
 */
export async function simpleResearch(
  client: HolocronConvexClient,
  input: SimpleResearchInput
): Promise<SimpleResearchOutput> {
  const result = await client.startSimpleResearch({
    topic: input.topic,
  });

  return {
    sessionId: result.sessionId,
    topic: input.topic,
    status: result.status,
    summary: result.summary,
    confidence: result.confidence,
    durationMs: result.durationMs,
  };
}
