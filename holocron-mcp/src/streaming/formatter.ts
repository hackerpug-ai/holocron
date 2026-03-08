import type { ResearchSession, IterationFinding } from '../convex/types.ts'

/**
 * Format research session progress for stderr streaming
 */
export function formatProgress(session: ResearchSession): string {
  const { currentIteration, maxIterations, status } = session
  const percentage = Math.round((currentIteration / maxIterations) * 100)

  return `[Research Progress] ${currentIteration}/${maxIterations} iterations (${percentage}%) - Status: ${status}`
}

/**
 * Format individual iteration finding
 */
export function formatIteration(iteration: IterationFinding): string {
  return `
  [Iteration Finding]
  Topic: ${iteration.topic}
  Confidence: ${iteration.confidence}
  Summary: ${iteration.summary}
  Sources: ${iteration.sources.length}
  `
}

/**
 * Format final research results summary
 */
export function formatFinalResults(session: ResearchSession): string {
  const { confidenceStats, findings } = session
  return `
  [Research Complete]
  Total Findings: ${findings.length}
  High Confidence: ${confidenceStats.high}
  Medium Confidence: ${confidenceStats.medium}
  Low Confidence: ${confidenceStats.low}
  `
}

/**
 * Format error messages for stderr
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `[ERROR] ${error.message}`
  }
  return `[ERROR] ${String(error)}`
}
