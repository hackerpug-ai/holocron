/**
 * Assimilation Validators and Profile Presets
 *
 * Shared types and configuration for the server-side assimilation Ralph Loop.
 */

// ── Dimension types ──────────────────────────────────────────────────────────

export const ALL_DIMENSIONS = [
  'architecture',
  'patterns',
  'documentation',
  'dependencies',
  'testing',
] as const;

export type AssimilationDimension = typeof ALL_DIMENSIONS[number];

export type IterationDimension = AssimilationDimension | 'planning';

export type IterationType = 'plan' | 'analyze' | 'deep_dive';

// ── Status types ─────────────────────────────────────────────────────────────

export type AssimilationStatus =
  | 'pending_approval'
  | 'planning'
  | 'approved'
  | 'in_progress'
  | 'synthesizing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export type AssimilationProfile = 'fast' | 'standard' | 'thorough';

// ── Termination criteria ─────────────────────────────────────────────────────

export interface AssimilationTerminationCriteria {
  maxIterations: number;
  minOverallCoverage: number;     // 0-100
  maxCostUsd: number;
  maxDurationMs: number;
  noveltyThreshold: number;       // 0-100, below = saturated
}

// ── Dimension scores ─────────────────────────────────────────────────────────

export interface DimensionScores {
  architecture: number;
  patterns: number;
  documentation: number;
  dependencies: number;
  testing: number;
}

export const INITIAL_DIMENSION_SCORES: DimensionScores = {
  architecture: 0,
  patterns: 0,
  documentation: 0,
  dependencies: 0,
  testing: 0,
};

// ── Next action (evaluator output) ───────────────────────────────────────────

export interface AssimilationNextAction {
  shouldContinue: boolean;
  nextDimension?: string;
  reason: string;
  trigger?: string;
}

// ── Profile presets ──────────────────────────────────────────────────────────

export const PROFILE_CRITERIA: Record<AssimilationProfile, AssimilationTerminationCriteria> = {
  fast: {
    maxIterations: 4,
    minOverallCoverage: 60,
    maxCostUsd: 0.50,
    maxDurationMs: 5 * 60 * 1000,   // 5 min
    noveltyThreshold: 20,
  },
  standard: {
    maxIterations: 7,
    minOverallCoverage: 75,
    maxCostUsd: 2.00,
    maxDurationMs: 15 * 60 * 1000,  // 15 min
    noveltyThreshold: 15,
  },
  thorough: {
    maxIterations: 12,
    minOverallCoverage: 90,
    maxCostUsd: 5.00,
    maxDurationMs: 30 * 60 * 1000,  // 30 min
    noveltyThreshold: 10,
  },
};

// ── Dimension sequence ───────────────────────────────────────────────────────

/** Fixed dimension order for first pass (Phase 1) */
export const DEFAULT_DIMENSION_SEQUENCE: AssimilationDimension[] = [
  'dependencies',    // grounds tech stack knowledge
  'architecture',    // structural understanding
  'patterns',        // code conventions
  'documentation',   // quality assessment
  'testing',         // coverage/CI analysis
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a profile string to termination criteria */
export function resolveProfile(profile: string): AssimilationTerminationCriteria {
  const key = profile as AssimilationProfile;
  if (key in PROFILE_CRITERIA) {
    return { ...PROFILE_CRITERIA[key] };
  }
  return { ...PROFILE_CRITERIA.standard };
}

/** Validate a GitHub repository URL */
export function isValidGitHubUrl(url: string): boolean {
  return /^https?:\/\/github\.com\/[^/]+\/[^/]+/.test(url);
}

/** Extract repo name from GitHub URL */
export function extractRepoName(url: string): string {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1] : url;
}

/** Calculate weighted average of dimension scores */
export function calculateOverallCoverage(scores: DimensionScores): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
