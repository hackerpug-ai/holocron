import type { HolocronConvexClient } from '../convex/client.js';
import type {
  ProgressUpdate,
  ResearchSessionResult,
  ResearchFinding
} from '../convex/types.js';

/**
 * Polling configuration options
 */
export interface PollingOptions {
  pollIntervalMs: number;
  timeoutMs: number;
  onProgress?: (update: ProgressUpdate) => void;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if session is in a terminal state
 */
function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'error' || status === 'cancelled';
}

/**
 * Poll Convex until research session completes
 *
 * Algorithm:
 * 1. Start timer for timeout tracking
 * 2. Loop:
 *    - Query getDeepResearchSession(sessionId)
 *    - Check status: if "completed" or "error", return session
 *    - Call onProgress callback if provided (for streaming updates)
 *    - Sleep for pollIntervalMs
 *    - Check if timeout exceeded, throw if so
 * 3. Return final session with all iterations and findings
 *
 * @throws Error on timeout or network failure after retries
 */
export async function pollUntilComplete(
  client: HolocronConvexClient,
  sessionId: string,
  options: PollingOptions
): Promise<ResearchSessionResult> {
  const startTime = Date.now();
  let retryCount = 0;
  const maxRetries = 3;

  while (true) {
    try {
      // Query session status
      const session = await client.getSession(sessionId);

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Check if completed or errored
      if (isTerminalStatus(session.status)) {
        // Fetch findings with confidence data
        const findings = await client.getFindings({
          sessionId,
          confidenceFilter: 'ALL',
        });

        // Get confidence summary
        const summary = await client.getConfidenceSummary(sessionId);

        // Determine final coverage score from last iteration
        const lastIteration = session.iterations[session.iterations.length - 1];
        const coverageScore = lastIteration?.coverageScore ?? 0;

        // Build final result
        const result: ResearchSessionResult = {
          sessionId: session.id,
          topic: session.topic,
          status: session.status,
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
          findings,
        };

        // Send final progress update
        if (options.onProgress) {
          options.onProgress({
            type: session.status === 'completed' ? 'complete' : 'error',
            result,
            error: session.status === 'error' ? 'Research failed' : undefined,
          });
        }

        return result;
      }

      // Send progress update
      if (options.onProgress) {
        const lastIteration = session.iterations[session.iterations.length - 1];
        options.onProgress({
          type: 'progress',
          iteration: session.iterations.length,
          maxIterations: session.maxIterations,
          coverageScore: lastIteration?.coverageScore ?? undefined,
          status: session.status,
        });
      }

      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= options.timeoutMs) {
        // Get partial results
        const findings = await client.getFindings({
          sessionId,
          confidenceFilter: 'ALL',
        });

        const summary = await client.getConfidenceSummary(sessionId);
        const lastIteration = session.iterations[session.iterations.length - 1];

        const result: ResearchSessionResult = {
          sessionId: session.id,
          topic: session.topic,
          status: 'error',
          iterations: session.iterations.length,
          coverageScore: lastIteration?.coverageScore ?? 0,
          confidenceStats: summary?.stats ?? {
            highConfidenceCount: 0,
            mediumConfidenceCount: 0,
            lowConfidenceCount: 0,
            averageConfidenceScore: 0,
            claimsWithMultipleSources: 0,
            totalClaims: 0,
          },
          findings,
        };

        if (options.onProgress) {
          options.onProgress({
            type: 'error',
            error: `Timeout after ${options.timeoutMs}ms`,
            result,
          });
        }

        throw new Error(
          `Research timeout after ${options.timeoutMs}ms. Session ${sessionId} status: ${session.status}`
        );
      }

      // Sleep before next poll
      await sleep(options.pollIntervalMs);

      // Reset retry count on successful query
      retryCount = 0;

    } catch (error) {
      // Network or query error
      if (retryCount >= maxRetries) {
        throw new Error(
          `Failed to poll session after ${maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      retryCount++;
      // Exponential backoff: 1s, 2s, 4s
      const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 4000);
      await sleep(backoffMs);
    }
  }
}

/**
 * Filter findings by confidence level
 */
export function filterFindingsByConfidence(
  findings: ResearchFinding[],
  filter: 'HIGH_ONLY' | 'HIGH_MEDIUM' | 'ALL'
): ResearchFinding[] {
  switch (filter) {
    case 'HIGH_ONLY':
      return findings.filter(f => f.confidenceLevel === 'HIGH');
    case 'HIGH_MEDIUM':
      return findings.filter(f =>
        f.confidenceLevel === 'HIGH' || f.confidenceLevel === 'MEDIUM'
      );
    case 'ALL':
    default:
      return findings;
  }
}
