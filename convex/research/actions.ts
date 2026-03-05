/**
 * Research Actions for Deep Research Workflow (US-055)
 *
 * Implements the orchestrator-worker pattern:
 * - Lead Agent (GPT-5) for planning and synthesis
 * - Subagents (GPT-5-mini) for parallel search execution
 * - Reviewer Agent (GPT-5) for coverage assessment
 */

import { action, mutation } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import {
  planResearch,
  executeSubagentSearch,
  synthesizeFindings,
  assessCoverage,
} from "./tools";

/**
 * Start Deep Research
 *
 * AC-1: Deep research started → Lead Agent plans → Plan has 3-5 subtasks
 *
 * This is the entry point for deep research. It creates a session and starts
 * the workflow with Lead Agent (GPT-5) planning.
 */
export const startDeepResearch = action({
  args: {
    conversationId: v.id("conversations"),
    query: v.string(),
    maxIterations: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, query, maxIterations = 5 }) => {
    // Step 1: Create session record
    const sessionId = await ctx.runMutation(
      api.research.createDeepResearchSession,
      {
        conversationId,
        topic: query,
        maxIterations,
      }
    );

    // Step 2: Start research workflow (begin with iteration 1)
    await ctx.runMutation(api.research.runResearchIteration, {
      sessionId,
      query,
      iteration: 1,
      maxIterations,
      previousFindings: [],
    });

    return {
      sessionId,
      status: "started",
      message: "Deep research initiated",
    };
  },
});

/**
 * Run Research Iteration
 *
 * Executes one iteration of the deep research workflow:
 * 1. Plan research with Lead Agent (GPT-5) - AC-1
 * 2. Spawn parallel subagents (GPT-5-mini) - AC-2
 * 3. Synthesize findings with Lead Agent (GPT-5) - AC-3
 * 4. Review coverage with Reviewer Agent (GPT-5) - AC-4
 * 5. Decide whether to iterate or complete - AC-5
 */
export const runResearchIteration = mutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
    query: v.string(),
    iteration: v.number(),
    maxIterations: v.number(),
    previousFindings: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    { sessionId, query, iteration, maxIterations, previousFindings = [] }
  ) => {
    // Step 1: AC-1 - Lead Agent plans research (GPT-5)
    const plan = await planResearch(query);

    // Step 2: AC-2 - Spawn parallel subagents (GPT-5-mini)
    const findings = await Promise.all(
      plan.subtasks.map((subtask) =>
        executeSubagentSearch(subtask.objective)
      )
    );

    // Step 3: AC-3 - Synthesize with Lead Agent (GPT-5)
    const synthesis = await synthesizeFindings(findings);

    // Step 4: AC-4 - Review coverage (GPT-5)
    const review = await assessCoverage(synthesis);

    // Store iteration record
    await ctx.db.insert("deepResearchIterations", {
      sessionId,
      iterationNumber: iteration,
      coverageScore: review.score,
      feedback: review.feedback,
      findings: synthesis,
      refinedQueries: review.gaps,
      status: "completed",
      createdAt: Date.now(),
    });

    // Step 5: AC-5 - Decide iteration
    const shouldContinue =
      review.score < 4 && iteration < maxIterations;

    if (shouldContinue) {
      // Continue with next iteration
      // Note: In production, this would schedule the next iteration
      // For now, we update the session status
      await ctx.db.patch(sessionId, {
        status: "iterating",
        updatedAt: Date.now(),
      });

      // The next iteration would be triggered by the caller or a scheduler
      return {
        sessionId,
        iteration,
        coverageScore: review.score,
        shouldContinue: true,
        synthesis,
      };
    } else {
      // Complete the research
      await ctx.db.patch(sessionId, {
        status: "completed",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });

      return {
        sessionId,
        iteration,
        coverageScore: review.score,
        shouldContinue: false,
        synthesis,
        finalReport: synthesis,
      };
    }
  },
});
