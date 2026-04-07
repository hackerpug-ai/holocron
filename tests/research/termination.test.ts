/**
 * Edge case tests for research loop termination logic
 *
 * Tests all termination criteria independently and verifies priority ordering
 * when multiple conditions are met simultaneously.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldContinueResearch,
  DEFAULT_CRITERIA,
  createCostAwareCriteria,
  createTimeAwareCriteria,
  createFastCriteria,
  createThoroughCriteria,
  type TerminationCriteria,
  type LoopMetrics,
} from '../../convex/research/termination';

describe('Research Termination Logic', () => {
  describe('Max Iterations', () => {
    it('terminates when max iterations reached', () => {
      const metrics: LoopMetrics = {
        iteration: 5,
        coverage: 2,
        confidence: 50,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('max_iterations');
      expect(result.reason).toContain('Max iterations reached');
    });

    it('does not terminate below max iterations', () => {
      const metrics: LoopMetrics = {
        iteration: 3,
        coverage: 2,
        confidence: 50,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
      expect(result.trigger).toBeUndefined();
    });

    it('handles boundary at max iterations - 1', () => {
      const metrics: LoopMetrics = {
        iteration: 4,
        coverage: 2,
        confidence: 50,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
      expect(result.trigger).toBeUndefined();
    });

    it('terminates at exactly max iterations', () => {
      const metrics: LoopMetrics = {
        iteration: 5,
        coverage: 2,
        confidence: 50,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('max_iterations');
    });

    it('continues at iteration 0', () => {
      const metrics: LoopMetrics = {
        iteration: 0,
        coverage: 0,
        confidence: 0,
        costUsd: 0,
        durationMs: 0,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
    });

    it('handles large iteration counts', () => {
      const criteria: TerminationCriteria = {
        maxIterations: 1000,
        minCoverage: 4,
        minConfidence: 70,
      };

      const metrics: LoopMetrics = {
        iteration: 999,
        coverage: 3,
        confidence: 65,
        costUsd: 50,
        durationMs: 30000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(true);
    });
  });

  describe('Quality Thresholds (Coverage + Confidence)', () => {
    it('terminates when both coverage and confidence thresholds met', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 4,
        confidence: 70,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('quality_met');
      expect(result.reason).toContain('Quality thresholds met');
    });

    it('terminates when coverage exceeds threshold', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 5,
        confidence: 75,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('quality_met');
    });

    it('does not terminate when only coverage threshold met', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 4,
        confidence: 65,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
      expect(result.reason).toContain('Quality not yet met');
    });

    it('does not terminate when only confidence threshold met', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 70,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
      expect(result.reason).toContain('Quality not yet met');
    });

    it('does not terminate when both thresholds below minimum', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 2,
        confidence: 50,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
      expect(result.reason).toContain('Quality not yet met');
    });

    it('handles boundary at coverage threshold exactly', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 4,
        confidence: 70,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(false);
    });

    it('handles boundary at confidence threshold exactly', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 4,
        confidence: 70,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(false);
    });

    it('handles maximum coverage and confidence values', () => {
      const metrics: LoopMetrics = {
        iteration: 1,
        coverage: 5,
        confidence: 100,
        costUsd: 0.1,
        durationMs: 500,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('quality_met');
    });
  });

  describe('Cost Limit (Optional Constraint)', () => {
    it('terminates when cost limit reached', () => {
      const criteria = createCostAwareCriteria(1.0);

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 1.0,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('cost_limit');
      expect(result.reason).toContain('Cost limit reached');
    });

    it('terminates when cost limit exceeded', () => {
      const criteria = createCostAwareCriteria(1.0);

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 1.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('cost_limit');
    });

    it('does not terminate before cost limit', () => {
      const criteria = createCostAwareCriteria(1.0);

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 0.99,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(true);
    });

    it('continues when cost limit not set', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 999.99,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
    });

    it('handles very small cost limit', () => {
      const criteria = createCostAwareCriteria(0.01);

      const metrics: LoopMetrics = {
        iteration: 1,
        coverage: 2,
        confidence: 40,
        costUsd: 0.01,
        durationMs: 500,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('cost_limit');
    });

    it('handles zero cost', () => {
      const criteria = createCostAwareCriteria(0.5);

      const metrics: LoopMetrics = {
        iteration: 1,
        coverage: 2,
        confidence: 40,
        costUsd: 0,
        durationMs: 500,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(true);
    });
  });

  describe('Time Limit (Optional Constraint)', () => {
    it('terminates when time limit reached', () => {
      const criteria = createTimeAwareCriteria(5000);

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 0.5,
        durationMs: 5000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('time_limit');
      expect(result.reason).toContain('Time limit reached');
    });

    it('terminates when time limit exceeded', () => {
      const criteria = createTimeAwareCriteria(5000);

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 0.5,
        durationMs: 6000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('time_limit');
    });

    it('does not terminate before time limit', () => {
      const criteria = createTimeAwareCriteria(5000);

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 0.5,
        durationMs: 4999,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(true);
    });

    it('continues when time limit not set', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 0.5,
        durationMs: 9999999,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
    });

    it('handles very short time limit', () => {
      const criteria = createTimeAwareCriteria(100);

      const metrics: LoopMetrics = {
        iteration: 1,
        coverage: 2,
        confidence: 40,
        costUsd: 0.1,
        durationMs: 100,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('time_limit');
    });

    it('handles zero duration', () => {
      const criteria = createTimeAwareCriteria(5000);

      const metrics: LoopMetrics = {
        iteration: 0,
        coverage: 0,
        confidence: 0,
        costUsd: 0,
        durationMs: 0,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(true);
    });

    it('formats time in minutes in reason message', () => {
      const criteria = createTimeAwareCriteria(120000); // 2 minutes

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 0.5,
        durationMs: 120000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.reason).toContain('2m');
    });
  });

  describe('Priority Ordering (Multiple Conditions Met)', () => {
    it('prioritizes max iterations over quality thresholds', () => {
      const metrics: LoopMetrics = {
        iteration: 5,
        coverage: 5,
        confidence: 100,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('max_iterations');
      expect(result.reason).toContain('Max iterations reached');
    });

    it('prioritizes max iterations over cost limit', () => {
      const criteria = createCostAwareCriteria(0.1);

      const metrics: LoopMetrics = {
        iteration: 5,
        coverage: 2,
        confidence: 50,
        costUsd: 0.2,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('max_iterations');
    });

    it('prioritizes max iterations over time limit', () => {
      const criteria = createTimeAwareCriteria(1000);

      const metrics: LoopMetrics = {
        iteration: 5,
        coverage: 2,
        confidence: 50,
        costUsd: 0.5,
        durationMs: 2000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('max_iterations');
    });

    it('prioritizes quality thresholds over cost limit', () => {
      const criteria = createCostAwareCriteria(0.1);

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 4,
        confidence: 70,
        costUsd: 0.2,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('quality_met');
    });

    it('prioritizes quality thresholds over time limit', () => {
      const criteria = createTimeAwareCriteria(1000);

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 4,
        confidence: 70,
        costUsd: 0.5,
        durationMs: 2000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('quality_met');
    });

    it('prioritizes cost limit over time limit', () => {
      const criteria: TerminationCriteria = {
        ...DEFAULT_CRITERIA,
        maxCostUsd: 0.5,
        maxDurationMs: 1000,
      };

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 0.5,
        durationMs: 2000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('cost_limit');
    });

    it('handles all conditions met simultaneously', () => {
      const criteria: TerminationCriteria = {
        maxIterations: 3,
        minCoverage: 3,
        minConfidence: 60,
        maxCostUsd: 0.5,
        maxDurationMs: 1000,
      };

      const metrics: LoopMetrics = {
        iteration: 3,
        coverage: 4,
        confidence: 70,
        costUsd: 0.6,
        durationMs: 1500,
      };

      const result = shouldContinueResearch(metrics, criteria);

      // Max iterations should win
      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('max_iterations');
    });
  });

  describe('Factory Functions', () => {
    it('createCostAwareCriteria adds cost limit to defaults', () => {
      const criteria = createCostAwareCriteria(2.5);

      expect(criteria.maxCostUsd).toBe(2.5);
      expect(criteria.maxIterations).toBe(DEFAULT_CRITERIA.maxIterations);
      expect(criteria.minCoverage).toBe(DEFAULT_CRITERIA.minCoverage);
      expect(criteria.minConfidence).toBe(DEFAULT_CRITERIA.minConfidence);
    });

    it('createTimeAwareCriteria adds time limit to defaults', () => {
      const criteria = createTimeAwareCriteria(30000);

      expect(criteria.maxDurationMs).toBe(30000);
      expect(criteria.maxIterations).toBe(DEFAULT_CRITERIA.maxIterations);
      expect(criteria.minCoverage).toBe(DEFAULT_CRITERIA.minCoverage);
      expect(criteria.minConfidence).toBe(DEFAULT_CRITERIA.minConfidence);
    });

    it('createFastCriteria reduces iterations and thresholds', () => {
      const criteria = createFastCriteria();

      expect(criteria.maxIterations).toBeLessThan(DEFAULT_CRITERIA.maxIterations);
      expect(criteria.minCoverage).toBeLessThan(DEFAULT_CRITERIA.minCoverage);
      expect(criteria.minConfidence).toBeLessThan(DEFAULT_CRITERIA.minConfidence);
    });

    it('createThoroughCriteria increases iterations and thresholds', () => {
      const criteria = createThoroughCriteria();

      expect(criteria.maxIterations).toBeGreaterThan(DEFAULT_CRITERIA.maxIterations);
      expect(criteria.minCoverage).toBeGreaterThan(DEFAULT_CRITERIA.minCoverage);
      expect(criteria.minConfidence).toBeGreaterThan(DEFAULT_CRITERIA.minConfidence);
    });

    it('fast criteria terminates earlier than default', () => {
      const criteria = createFastCriteria();

      const metrics: LoopMetrics = {
        iteration: 3,
        coverage: 3,
        confidence: 60,
        costUsd: 0.3,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(false);
    });

    it('thorough criteria continues longer than default', () => {
      const criteria = createThoroughCriteria();

      const metrics: LoopMetrics = {
        iteration: 5,
        coverage: 4,
        confidence: 70,
        costUsd: 0.5,
        durationMs: 2000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(true);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('handles zero values gracefully', () => {
      const metrics: LoopMetrics = {
        iteration: 0,
        coverage: 0,
        confidence: 0,
        costUsd: 0,
        durationMs: 0,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
      expect(result.reason).toContain('Quality not yet met');
    });

    it('handles negative values as valid input', () => {
      const metrics: LoopMetrics = {
        iteration: 1,
        coverage: -1,
        confidence: -10,
        costUsd: 0,
        durationMs: 0,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
    });

    it('handles fractional confidence values', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 4,
        confidence: 69.9,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
    });

    it('handles fractional coverage values', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3.9,
        confidence: 70,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.continue).toBe(true);
    });

    it('handles very high cost values', () => {
      const criteria = createCostAwareCriteria(1000);

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 999.99,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(true);
    });

    it('handles very long duration values', () => {
      const criteria = createTimeAwareCriteria(3600000); // 1 hour

      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 60,
        costUsd: 0.5,
        durationMs: 3599999,
      };

      const result = shouldContinueResearch(metrics, criteria);

      expect(result.continue).toBe(true);
    });

    it('includes detailed metrics in reason message', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 65,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics, DEFAULT_CRITERIA);

      expect(result.reason).toContain('3/4'); // coverage
      expect(result.reason).toContain('65%/70%'); // confidence
    });
  });

  describe('Default Criteria Behavior', () => {
    it('uses default criteria when none provided', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 3,
        confidence: 65,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics);

      expect(result.continue).toBe(true);
      expect(result.reason).toContain('3/4');
      expect(result.reason).toContain('65%/70%');
    });

    it('default criteria terminate at 5 iterations', () => {
      const metrics: LoopMetrics = {
        iteration: 5,
        coverage: 2,
        confidence: 50,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('max_iterations');
    });

    it('default criteria require coverage 4 and confidence 70%', () => {
      const metrics: LoopMetrics = {
        iteration: 2,
        coverage: 4,
        confidence: 70,
        costUsd: 0.5,
        durationMs: 1000,
      };

      const result = shouldContinueResearch(metrics);

      expect(result.continue).toBe(false);
      expect(result.trigger).toBe('quality_met');
    });
  });
});
