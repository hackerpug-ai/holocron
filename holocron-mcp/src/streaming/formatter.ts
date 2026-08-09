/**
 * Format research progress for stderr-only diagnostics (stdio must stay JSON-RPC clean).
 */

export type ResearchSession = {
  currentIteration: number;
  maxIterations: number;
  status: string;
  confidenceStats: { high: number; medium: number; low: number };
  findings: unknown[];
};

export type IterationFinding = {
  topic: string;
  confidence: string;
  summary: string;
  sources: unknown[];
};

export function formatProgress(session: ResearchSession): string {
  const { currentIteration, maxIterations, status } = session;
  const percentage =
    maxIterations > 0 ? Math.round((currentIteration / maxIterations) * 100) : 0;
  return `[Research Progress] ${currentIteration}/${maxIterations} iterations (${percentage}%) - Status: ${status}`;
}

export function formatIteration(iteration: IterationFinding): string {
  return `
  [Iteration Finding]
  Topic: ${iteration.topic}
  Confidence: ${iteration.confidence}
  Summary: ${iteration.summary}
  Sources: ${iteration.sources.length}
  `;
}

export function formatFinalResults(session: ResearchSession): string {
  const { confidenceStats, findings } = session;
  return `
  [Research Complete]
  Total Findings: ${findings.length}
  High Confidence: ${confidenceStats.high}
  Medium Confidence: ${confidenceStats.medium}
  Low Confidence: ${confidenceStats.low}
  `;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
