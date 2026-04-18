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

/** Plan-based research with user approval workflow (Task #302) */
/** Smart research router - selects optimal strategy automatically */
export {
  analyzeResearchStrategy,
  executeApprovedResearchPlan,
  type ResearchStrategy,
  startDeepResearchWithPlan,
  startSmartResearch,
} from './actions';

/** Fast-path parallel fan-out strategy */
export {
  decomposeIntoDomainsStatic,
  decomposeIntoSubQuestions,
  executeParallelFanOut,
  type ParallelFanOutResult,
  runParallelFanOut,
  type SubQuestion,
} from './parallel';

/** Parallel iteration strategy for deep research */
export {
  executeParallelIteration,
  generateQueryVariants,
  type ParallelIterationResult,
  type QueryVariant,
  runParallelIteration,
} from './parallel_iteration';

// =============================================================================
// PARALLEL SEARCH UTILITIES
// =============================================================================

/** Parallel search execution with retry and deduplication */
export {
  executeParallelSearchWithRetry,
  generateDiverseQueries,
  type ParallelSearchOptions,
  type ParallelSearchResult,
  type StructuredSearchResult,
} from './search';

// =============================================================================
// INTERNAL / ADVANCED USE
// =============================================================================

/** @internal Full iterative research implementation (use startSmartResearch instead) */
/**
 * @deprecated Use startSmartResearch instead.
 * This function is kept for backwards compatibility but will be removed in a future version.
 */
export { hybridSearchIterations, runIterativeResearch, startDeepResearch } from './actions';

// =============================================================================
// MUTATIONS
// =============================================================================

export {
  cancelResearchSession,
  completeDeepResearchSession,
  createDeepResearchIteration,
  createDeepResearchSession,
  retryResearchSession,
  updateDeepResearchSession,
} from './mutations';

// =============================================================================
// QUERIES
// =============================================================================

export {
  getDeepResearchSession,
  listDeepResearchIterations,
} from './queries';

// =============================================================================
// SCHEDULED FUNCTIONS
// =============================================================================

export { processDeepResearchIteration } from './scheduled';

// =============================================================================
// SEARCH TOOLS (Used by runIterativeResearch)
// =============================================================================

export {
  exaSearchTool,
  jinaReaderTool,
  jinaSearchTool,
  jinaSiteSearchTool,
} from './tools';

// =============================================================================
// TYPES
// =============================================================================

export type {
  ConfidenceFactors,
  ConfidenceLevel,
  ConfidenceResult,
  ConfidenceStats,
} from './confidence';
export type { ResearchContext, StructuredFinding } from './prompts';
export type { ResearchPlan, SubagentResult } from './tools';

// =============================================================================
// WORKER DISPATCHER (Plan-based parallel research)
// =============================================================================

export {
  aggregateTrackResults,
  type DispatcherResult,
  executePlanBasedResearch,
  parsePlanIntoTracks,
  type ResearchTrack,
  runPlanBasedResearch,
  selectTracksForTopic,
  type TrackConfig,
  type TrackWorkerResult,
} from './dispatcher';
