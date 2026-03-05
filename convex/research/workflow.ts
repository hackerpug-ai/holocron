/**
 * Deep Research Workflow (US-047)
 *
 * Orchestrates the multi-agent research process:
 * Lead Agent (GPT-5) → Parallel Subagents (GPT-5-mini) → Lead Agent Synthesis → Review
 *
 * This is a prototype implementation for testing the orchestrator-worker pattern.
 * Production implementation will use @convex-dev/workflow and @convex-dev/agent.
 */

import { planResearch, executeSubagentSearch, synthesizeFindings, assessCoverage } from "./tools";
import type { ResearchPlan, SubagentResult } from "./tools";

/**
 * Deep Research Result Schema
 */
export interface DeepResearchResult {
  plan: ResearchPlan;
  findings: SubagentResult[];
  synthesis: string;
  review: {
    score: number;
    gaps: string[];
    feedback: string;
  };
  iterations: number;
}

/**
 * Deep Research Prototype - Tests the orchestrator-worker pattern
 *
 * This is a synchronous prototype for testing. Production will use Convex workflows.
 *
 * @param query - The research query to investigate
 * @param maxIterations - Maximum number of research iterations (default: 3)
 * @returns Complete research result with plan, findings, synthesis, and review
 */
export async function deepResearchPrototype(
  query: string,
  maxIterations = 3
): Promise<DeepResearchResult> {
  let iteration = 0;
  let currentQuery = query;
  let coverageScore = 0;

  while (iteration < maxIterations && coverageScore < 4) {
    iteration++;

    // Step 1: Plan research with Lead Agent (GPT-5)
    const plan = await planResearch(currentQuery);

    // Step 2: Execute parallel subagents (GPT-5-mini)
    const findings = await Promise.all(
      plan.subtasks.map(async (subtask: { id: string; objective: string; searchTerms: string[] }) => {
        return await executeSubagentSearch(subtask.objective);
      })
    );

    // Step 3: Synthesize with Lead Agent (GPT-5)
    const synthesis = await synthesizeFindings(findings);

    // Step 4: Review coverage with Reviewer Agent (GPT-5)
    const review = await assessCoverage(synthesis);
    coverageScore = review.score;

    // If coverage is sufficient, return results
    if (coverageScore >= 4) {
      return {
        plan,
        findings,
        synthesis,
        review,
        iterations: iteration,
      };
    }

    // Prepare for next iteration if there are gaps
    if (review.gaps.length > 0 && iteration < maxIterations) {
      currentQuery = `Address gaps: ${review.gaps.join(", ")}`;
    }
  }

  // Return final results after max iterations or sufficient coverage
  const finalPlan = await planResearch(currentQuery);
  const finalFindings = await Promise.all(
    finalPlan.subtasks.map((subtask: { id: string; objective: string; searchTerms: string[] }) => executeSubagentSearch(subtask.objective))
  );
  const finalSynthesis = await synthesizeFindings(finalFindings);
  const finalReview = await assessCoverage(finalSynthesis);

  return {
    plan: finalPlan,
    findings: finalFindings,
    synthesis: finalSynthesis,
    review: finalReview,
    iterations: iteration,
  };
}

/**
 * Simplified deep research for testing - executes one iteration
 *
 * This is a minimal implementation for AC-4 end-to-end testing.
 * Production will use the full iterative workflow.
 */
export async function deepResearchPrototypeSimple(query: string): Promise<{
  plan: ResearchPlan;
  findings: SubagentResult[];
  synthesis: string;
  iterations: number;
}> {
  // Step 1: Plan research
  const plan = await planResearch(query);

  // Step 2: Execute parallel subagents
  const findings = await Promise.all(
    plan.subtasks.map((subtask: { id: string; objective: string; searchTerms: string[] }) => executeSubagentSearch(subtask.objective))
  );

  // Step 3: Synthesize findings
  const synthesis = await synthesizeFindings(findings);

  return {
    plan,
    findings,
    synthesis,
    iterations: 1,
  };
}
