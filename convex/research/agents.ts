/**
 * Research Agents for Deep Research Workflow (US-047)
 *
 * Implements the orchestrator-worker pattern:
 * - Lead Researcher (GPT-5): Planning, synthesis, review
 * - Web Searcher (GPT-5-mini): Parallel search execution
 */

// import { components } from "../_generated/components";
// import { Agent } from "@convex-dev/agent";
// Note: Production implementation will use @convex-dev/agent
// This prototype uses simple TypeScript objects for testing

/**
 * Lead Researcher Agent - Uses GPT-5 for planning and synthesis
 *
 * Role: Research coordinator that decomposes queries, delegates to subagents,
 * and synthesizes findings into comprehensive reports.
 */
export const leadResearcher: {
  name: string;
  model: string;
} = {
  name: "Lead Researcher",
  model: "gpt-5", // Uses GPT-5 for complex planning and synthesis
};

/**
 * Web Searcher Agent - Uses GPT-5-mini for cost-effective search
 *
 * Role: Focused research worker that executes specific search tasks.
 * Uses cheaper GPT-5-mini model to reduce costs by ~67%.
 */
export const webSearcher: {
  name: string;
  model: string;
} = {
  name: "Web Searcher",
  model: "gpt-5-mini", // Uses GPT-5-mini for cost-effective parallel execution
};

/**
 * Reviewer Agent - Uses GPT-5 for quality assessment
 *
 * Role: Assesses research coverage, identifies gaps, and decides
 * whether to iterate or complete the research.
 */
export const reviewerAgent: {
  name: string;
  model: string;
} = {
  name: "Reviewer",
  model: "gpt-5", // Uses GPT-5 for nuanced quality assessment
};
