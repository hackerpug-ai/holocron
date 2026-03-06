/**
 * Research Module Exports (US-055)
 *
 * Exports all research-related functions for the deep research workflow.
 */

// Actions
export { startDeepResearch } from "./actions";

// Mutations
export {
  createDeepResearchSession,
  createDeepResearchIteration,
  completeDeepResearchSession,
} from "./mutations";

// Mutations from actions file
export { runResearchIteration } from "./actions";

// Tools (for prototype testing)
export {
  planResearch,
  executeSubagentSearch,
  synthesizeFindings,
  assessCoverage,
} from "./tools";

// Types
export type { ResearchPlan, SubagentResult } from "./tools";

// Agent factory functions
export { createLeadAgent, createReviewerAgent } from "./agents";
