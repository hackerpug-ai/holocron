/**
 * Research Module Exports (US-055)
 *
 * Exports all research-related functions for the deep research workflow.
 *
 * ## Entry Points (Recommended Usage)
 *
 * - `startSmartResearch` - NEW DEFAULT: Intelligent router that selects optimal strategy
 * - `runParallelFanOut` - Fast-path for simple queries (~15-25s)
 * - `runIterativeResearch` - Deep research for complex topics (~45-90s)
 *
 * ## Deprecated
 *
 * - `startDeepResearch` - Use `startSmartResearch` instead
 */

// =============================================================================
// NEW ENTRY POINTS (Recommended)
// =============================================================================

/** Smart research router - selects optimal strategy automatically */
export { startSmartResearch, analyzeResearchStrategy, type ResearchStrategy } from "./actions";

/** Fast-path parallel fan-out strategy */
export { runParallelFanOut, executeParallelFanOut, decomposeIntoDomains, type ParallelFanOutResult } from "./parallel";

/** Parallel iteration strategy for deep research */
export {
  runParallelIteration,
  executeParallelIteration,
  generateQueryVariants,
  type ParallelIterationResult,
  type QueryVariant,
} from "./parallel_iteration";

// =============================================================================
// PARALLEL SEARCH UTILITIES
// =============================================================================

/** Parallel search execution with retry and deduplication */
export {
  executeParallelSearchWithRetry,
  generateDiverseQueries,
  type StructuredSearchResult,
  type ParallelSearchOptions,
  type ParallelSearchResult,
} from "./search";

// =============================================================================
// INTERNAL / ADVANCED USE
// =============================================================================

/** @internal Full iterative research implementation (use startSmartResearch instead) */
export { runIterativeResearch, hybridSearchIterations } from "./actions";

/**
 * @deprecated Use startSmartResearch instead.
 * This function is kept for backwards compatibility but will be removed in a future version.
 */
export { startDeepResearch } from "./actions";

// =============================================================================
// MUTATIONS
// =============================================================================

export {
  createDeepResearchSession,
  createDeepResearchIteration,
  updateDeepResearchSession,
  completeDeepResearchSession,
  cancelResearchSession,
} from "./mutations";

// =============================================================================
// QUERIES
// =============================================================================

export {
  getDeepResearchSession,
  listDeepResearchIterations,
} from "./queries";

// =============================================================================
// SCHEDULED FUNCTIONS
// =============================================================================

export {
  processDeepResearchIteration,
} from "./scheduled";

// =============================================================================
// SEARCH TOOLS (Used by runIterativeResearch)
// =============================================================================

export {
  exaSearchTool,
  jinaSearchTool,
  jinaSiteSearchTool,
  jinaReaderTool,
} from "./tools";

// =============================================================================
// TYPES
// =============================================================================

export type { ResearchPlan, SubagentResult } from "./tools";
export type { ResearchContext, StructuredFinding } from "./prompts";
export type { ConfidenceFactors, ConfidenceLevel, ConfidenceResult, ConfidenceStats } from "./confidence";
