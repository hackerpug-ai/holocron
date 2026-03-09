/**
 * Research Loop Termination Logic
 *
 * Extracted termination criteria to make the research loop configurable
 * and testable. Supports multiple stop conditions:
 * - Quality thresholds (coverage + confidence)
 * - Iteration limits
 * - Cost limits
 * - Time limits
 */

export interface TerminationCriteria {
  /** Maximum number of iterations before stopping */
  maxIterations: number;

  /** Minimum coverage score (0-5) required to stop */
  minCoverage: number;

  /** Minimum confidence percentage (0-100) required to stop */
  minConfidence: number;

  /** Optional maximum cost in USD before stopping */
  maxCostUsd?: number;

  /** Optional maximum duration in milliseconds before stopping */
  maxDurationMs?: number;
}

export interface LoopMetrics {
  /** Current iteration number */
  iteration: number;

  /** Current coverage score (0-5) */
  coverage: number;

  /** Current confidence percentage (0-100) */
  confidence: number;

  /** Total cost in USD so far */
  costUsd: number;

  /** Total duration in milliseconds so far */
  durationMs: number;
}

export interface TerminationDecision {
  /** Whether to continue the research loop */
  continue: boolean;

  /** Reason for the decision */
  reason: string;

  /** Type of termination condition that triggered */
  trigger?: 'max_iterations' | 'quality_met' | 'cost_limit' | 'time_limit';
}

/**
 * Default termination criteria (matches current behavior)
 */
export const DEFAULT_CRITERIA: TerminationCriteria = {
  maxIterations: 5,
  minCoverage: 4,
  minConfidence: 70,
};

/**
 * Determines whether the research loop should continue
 *
 * Checks termination conditions in priority order:
 * 1. Max iterations (hard stop)
 * 2. Quality thresholds (desired outcome)
 * 3. Cost limit (optional budget constraint)
 * 4. Time limit (optional time constraint)
 *
 * @param metrics - Current loop metrics
 * @param criteria - Termination criteria to evaluate
 * @returns Decision on whether to continue and reason
 */
export function shouldContinueResearch(
  metrics: LoopMetrics,
  criteria: TerminationCriteria = DEFAULT_CRITERIA
): TerminationDecision {
  // Priority 1: Max iterations (hard stop)
  if (metrics.iteration >= criteria.maxIterations) {
    return {
      continue: false,
      reason: `Max iterations reached (${criteria.maxIterations})`,
      trigger: 'max_iterations',
    };
  }

  // Priority 2: Quality thresholds (desired outcome)
  if (
    metrics.coverage >= criteria.minCoverage &&
    metrics.confidence >= criteria.minConfidence
  ) {
    return {
      continue: false,
      reason: `Quality thresholds met (coverage: ${metrics.coverage}/${criteria.minCoverage}, confidence: ${metrics.confidence}%/${criteria.minConfidence}%)`,
      trigger: 'quality_met',
    };
  }

  // Priority 3: Cost limit (optional budget constraint)
  if (criteria.maxCostUsd !== undefined && metrics.costUsd >= criteria.maxCostUsd) {
    return {
      continue: false,
      reason: `Cost limit reached ($${metrics.costUsd.toFixed(2)} >= $${criteria.maxCostUsd.toFixed(2)})`,
      trigger: 'cost_limit',
    };
  }

  // Priority 4: Time limit (optional time constraint)
  if (
    criteria.maxDurationMs !== undefined &&
    metrics.durationMs >= criteria.maxDurationMs
  ) {
    const durationMin = Math.round(metrics.durationMs / 60000);
    const limitMin = Math.round(criteria.maxDurationMs / 60000);
    return {
      continue: false,
      reason: `Time limit reached (${durationMin}m >= ${limitMin}m)`,
      trigger: 'time_limit',
    };
  }

  // Continue research
  return {
    continue: true,
    reason: `Quality not yet met (coverage: ${metrics.coverage}/${criteria.minCoverage}, confidence: ${metrics.confidence}%/${criteria.minConfidence}%)`,
  };
}

/**
 * Create cost-aware criteria (limit by budget)
 */
export function createCostAwareCriteria(maxCostUsd: number): TerminationCriteria {
  return {
    ...DEFAULT_CRITERIA,
    maxCostUsd,
  };
}

/**
 * Create time-aware criteria (limit by duration)
 */
export function createTimeAwareCriteria(maxDurationMs: number): TerminationCriteria {
  return {
    ...DEFAULT_CRITERIA,
    maxDurationMs,
  };
}

/**
 * Create fast research criteria (fewer iterations, lower thresholds)
 */
export function createFastCriteria(): TerminationCriteria {
  return {
    maxIterations: 3,
    minCoverage: 3,
    minConfidence: 60,
  };
}

/**
 * Create thorough research criteria (more iterations, higher thresholds)
 */
export function createThoroughCriteria(): TerminationCriteria {
  return {
    maxIterations: 8,
    minCoverage: 5,
    minConfidence: 80,
  };
}
