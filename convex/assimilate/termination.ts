/**
 * Assimilation Loop Termination Logic
 *
 * Pure functions to evaluate whether the assimilation loop should continue.
 * No external dependencies — fully testable.
 *
 * Priority order:
 * 1. Hard stops (max iterations, cost, time)
 * 2. All dimensions saturated (novelty exhausted)
 * 3. Missing dimensions (score = 0)
 * 4. Shallow dimensions (below target)
 * 5. Quality met (all targets reached)
 */

import type {
  AssimilationTerminationCriteria,
  DimensionScores,
  AssimilationDimension,
} from "./validators";
import { ALL_DIMENSIONS, calculateOverallCoverage } from "./validators";

// ── Metrics input ────────────────────────────────────────────────────────────

export interface AssimilationMetrics {
  iteration: number;
  costUsd: number;
  durationMs: number;
  dimensionScores: DimensionScores;
  /** Per-dimension saturation tracking (novelty below threshold) */
  saturatedDimensions: AssimilationDimension[];
  /** Whether final synthesis has been completed */
  synthesisComplete: boolean;
}

// ── Decision output ──────────────────────────────────────────────────────────

export interface AssimilationTerminationDecision {
  continue: boolean;
  reason: string;
  trigger:
    | 'max_iterations'
    | 'cost_limit'
    | 'time_limit'
    | 'all_saturated'
    | 'needs_dimension'
    | 'needs_depth'
    | 'needs_synthesis'
    | 'quality_met';
  nextAction?: {
    type: 'analyze_dimension' | 'deepen_dimension' | 'synthesize' | 'stop';
    dimension?: AssimilationDimension;
    reason: string;
  };
}

// ── Main evaluator ───────────────────────────────────────────────────────────

export function evaluateTermination(
  metrics: AssimilationMetrics,
  criteria: AssimilationTerminationCriteria
): AssimilationTerminationDecision {
  // Priority 1: Hard stops
  if (metrics.iteration >= criteria.maxIterations) {
    return stop('max_iterations', `Max iterations reached (${criteria.maxIterations})`);
  }

  if (metrics.costUsd >= criteria.maxCostUsd) {
    return stop('cost_limit', `Cost limit reached ($${metrics.costUsd.toFixed(2)} >= $${criteria.maxCostUsd.toFixed(2)})`);
  }

  if (metrics.durationMs >= criteria.maxDurationMs) {
    const mins = Math.round(metrics.durationMs / 60000);
    const limitMins = Math.round(criteria.maxDurationMs / 60000);
    return stop('time_limit', `Time limit reached (${mins}m >= ${limitMins}m)`);
  }

  // Priority 2: All dimensions saturated
  if (metrics.saturatedDimensions.length >= ALL_DIMENSIONS.length) {
    return stop('all_saturated', 'All dimensions saturated — diminishing returns');
  }

  // Priority 3: Missing dimensions (score = 0)
  const missingDims = ALL_DIMENSIONS.filter(
    (d) => metrics.dimensionScores[d] === 0
  );
  if (missingDims.length > 0) {
    const target = missingDims[0];
    return continueWith('needs_dimension', target, `Dimension "${target}" not yet analyzed`);
  }

  // Priority 4: Shallow dimensions (below target coverage)
  const overallCoverage = calculateOverallCoverage(metrics.dimensionScores);
  if (overallCoverage < criteria.minOverallCoverage) {
    // Find the lowest-scoring non-saturated dimension
    const improvableDims = ALL_DIMENSIONS
      .filter((d) => !metrics.saturatedDimensions.includes(d))
      .sort((a, b) => metrics.dimensionScores[a] - metrics.dimensionScores[b]);

    if (improvableDims.length > 0) {
      const target = improvableDims[0];
      return {
        continue: true,
        reason: `Overall coverage ${overallCoverage.toFixed(0)}% < ${criteria.minOverallCoverage}%. Deepening "${target}" (score: ${metrics.dimensionScores[target]})`,
        trigger: 'needs_depth',
        nextAction: {
          type: 'deepen_dimension',
          dimension: target,
          reason: `Lowest scoring improvable dimension`,
        },
      };
    }
  }

  // Priority 5: Quality met — synthesize if not yet done
  if (overallCoverage >= criteria.minOverallCoverage && !metrics.synthesisComplete) {
    return {
      continue: true,
      reason: 'All quality targets met — ready for synthesis',
      trigger: 'needs_synthesis',
      nextAction: {
        type: 'synthesize',
        reason: 'Coverage targets met, producing final report',
      },
    };
  }

  // All done
  return stop('quality_met', `Quality met: coverage ${overallCoverage.toFixed(0)}%`);
}

// ── Novelty detection ────────────────────────────────────────────────────────

/**
 * Determine if a dimension is saturated based on novelty of latest iteration
 *
 * @param notesContribution - The distilled notes from the latest iteration
 * @param previousScore - The dimension score before this iteration
 * @param currentScore - The dimension score after this iteration
 * @param noveltyThreshold - Minimum novelty percentage (0-100)
 * @returns true if the dimension is saturated (not finding new info)
 */
export function isDimensionSaturated(
  notesContribution: string,
  previousScore: number,
  currentScore: number,
  noveltyThreshold: number
): boolean {
  // If the score improved significantly, not saturated
  if (currentScore - previousScore >= 10) return false;

  // If notes contribution is very short, likely saturated
  if (notesContribution.length < 100) return true;

  // Novelty score approximation: contribution length relative to a "full" contribution
  // A typical good contribution is ~300-500 chars
  const noveltyEstimate = Math.min(100, (notesContribution.length / 400) * 100);
  return noveltyEstimate < noveltyThreshold;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stop(
  trigger: AssimilationTerminationDecision['trigger'],
  reason: string
): AssimilationTerminationDecision {
  return {
    continue: false,
    reason,
    trigger,
    nextAction: { type: 'stop', reason },
  };
}

function continueWith(
  trigger: AssimilationTerminationDecision['trigger'],
  dimension: AssimilationDimension,
  reason: string
): AssimilationTerminationDecision {
  return {
    continue: true,
    reason,
    trigger,
    nextAction: {
      type: 'analyze_dimension',
      dimension,
      reason,
    },
  };
}
