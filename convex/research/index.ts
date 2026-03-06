/**
 * Research Module Exports (US-055)
 *
 * Exports all research-related functions for the deep research workflow.
 */

// Actions
export { startDeepResearch, runResearchIteration } from "./actions";

// Mutations
export {
  createDeepResearchSession,
  createDeepResearchIteration,
  updateDeepResearchSession,
  completeDeepResearchSession,
} from "./mutations";

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
