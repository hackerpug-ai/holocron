/**
 * Research Actions for Deep Research Workflow (US-055)
 *
 * Implements the orchestrator-worker pattern:
 * - Lead Agent (GPT-5) for planning and synthesis
 * - Subagents (GPT-5-mini) for parallel search execution
 * - Reviewer Agent (GPT-5) for coverage assessment
 */

"use node";

import { action, mutation } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  planResearch,
  executeSubagentSearch,
  synthesizeFindings,
  assessCoverage,
  exaSearchTool,
  jinaSearchTool,
  jinaReaderTool,
} from "./tools";
import { createLeadAgent, createReviewerAgent } from "./agents";

/**
 * Start Deep Research
 *
 * Task #780: Main entry point action that triggers the deep research workflow
 *
 * This action:
 * 1. Creates a deep research session
 * 2. Posts a loading card to chat
 * 3. Runs the Ralph Loop (iterative research)
 * 4. Posts a final card with results
 * 5. Returns the session ID and status
 */
export const startDeepResearch = action({
  args: {
    conversationId: v.id("conversations"),
    topic: v.string(),
    maxIterations: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, topic, maxIterations = 5 }): Promise<{
    sessionId: any;
    status: string;
  }> => {
    // Step 1: Create session
    const sessionId = await ctx.runMutation(
      api.research.mutations.createDeepResearchSession,
      {
        conversationId,
        topic,
        maxIterations,
      }
    );

    // Step 2: Post loading card
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent" as const,
      content: `Starting deep research: ${topic}`,
      messageType: "result_card" as const,
      cardData: {
        card_type: "deep_research_loading",
        session_id: sessionId,
        query: topic,
      },
    });

    // Step 3: Run Ralph Loop
    const result = await runRalphLoop(ctx, sessionId, conversationId, topic, maxIterations);

    // Step 4: Post final card
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent" as const,
      content: `Deep research complete: ${topic}`,
      messageType: "result_card" as const,
      cardData: {
        card_type: "deep_research_final",
        session_id: sessionId,
        topic,
        total_iterations: result.totalIterations,
        final_coverage_score: result.finalCoverageScore,
      },
    });

    // Step 5: Return result
    return {
      sessionId,
      status: "completed",
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
export const runResearchIteration = action({
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
  ): Promise<{
    sessionId: any;
    iteration: number;
    coverageScore: number;
    shouldContinue: boolean;
    synthesis: string;
    finalReport?: string;
  }> => {
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
    await ctx.runMutation(api.research.mutations.createDeepResearchIteration, {
      sessionId,
      iterationNumber: iteration,
      coverageScore: review.score,
      feedback: review.feedback,
      findings: synthesis,
      refinedQueries: review.gaps,
      status: "completed",
    });

    // Step 5: AC-5 - Decide iteration
    const shouldContinue =
      review.score < 4 && iteration < maxIterations;

    if (shouldContinue) {
      // Continue with next iteration
      // Note: In production, this would schedule the next iteration
      // For now, we update the session status
      await ctx.runMutation(api.research.mutations.updateDeepResearchSession, {
        sessionId,
        status: "iterating",
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
      await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
        sessionId,
        status: "completed",
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

/**
 * Run Ralph Loop - Core orchestration for deep research
 *
 * Task #779: Implements the iterative research workflow:
 * 1. Initialize agents (lead, reviewer)
 * 2. Loop until coverage >= 4 or max iterations:
 *    a. SEARCH: Lead agent generates queries and executes tools
 *    b. SYNTHESIZE: Lead agent writes coherent report
 *    c. REVIEW: Reviewer agent scores coverage
 *    d. SAVE: Create iteration record
 *    e. POST CARD: Insert iteration card to chat
 *    f. REFINE: Update topic for next iteration
 * 3. Complete session
 *
 * @param ctx - Convex action context
 * @param sessionId - Deep research session ID
 * @param conversationId - Conversation ID for posting cards
 * @param topic - Research topic
 * @param maxIterations - Maximum iterations (default: 5)
 * @returns Summary of iterations and final coverage score
 */
export async function runRalphLoop(
  ctx: any,
  sessionId: Id<"deepResearchSessions">,
  conversationId: Id<"conversations">,
  topic: string,
  maxIterations: number = 5
): Promise<{ totalIterations: number; finalCoverageScore: number }> {
  try {
    // Step 1: Initialize agents
    const leadAgent = createLeadAgent(ctx);
    const reviewerAgent = createReviewerAgent(ctx);

    // Initialize loop variables
    let iteration = 0;
    let coverageScore = 0;
    let currentTopic = topic;

    // Step 2: Main loop - iterate until coverage >= 4 or max iterations
    while (iteration < maxIterations && coverageScore < 4) {
      iteration++;

      // Step 2a: SEARCH - Lead agent generates queries and executes searches
      const searchPrompt = `Research the following topic: "${currentTopic}"

Your task:
1. Generate 3-5 focused search queries that cover different aspects of this topic
2. Execute searches using the available tools (exaSearchTool for technical content, jinaSearchTool for general web, jinaReaderTool for deep article reading)
3. Extract key findings with proper citations in [Title](URL) format

Be thorough and systematic. Use multiple search queries to gather comprehensive information.`;

      const searchResult = await leadAgent.generateText(
        ctx,
        {
          prompt: searchPrompt,
        },
        {
          tools: [exaSearchTool, jinaSearchTool, jinaReaderTool],
          maxSteps: 10, // Allow multiple tool calls
        }
      );

      const searchFindings = searchResult.text;

      // Step 2b: SYNTHESIZE - Lead agent writes coherent report
      const synthesisPrompt = `Based on the research findings below, synthesize a comprehensive report.

Research Findings:
${searchFindings}

Requirements:
- Organize information by theme or category
- Use [Title](URL) format for all citations
- Write 500-1000 words
- Identify any gaps in coverage
- Be thorough but concise
- Focus on authoritative sources`;

      const synthesisResult = await leadAgent.generateText(
        ctx,
        {
          prompt: synthesisPrompt,
        },
        {
          maxSteps: 1, // No tools needed for synthesis
        }
      );

      const synthesis = synthesisResult.text;

      // Step 2c: REVIEW - Reviewer agent scores coverage
      const reviewPrompt = `Review the following research synthesis and assess its coverage.

Research Synthesis:
${synthesis}

Original Topic: ${topic}

Provide your assessment in JSON format:
{
  "coverageScore": number (1-5 scale),
  "gaps": string[] (list of identified gaps),
  "feedback": string (detailed feedback),
  "shouldContinue": boolean (true if score < 4)
}

Scoring:
1 = minimal (single source, major gaps)
2 = basic (few sources, obvious gaps)
3 = adequate (multiple sources, some gaps)
4 = comprehensive (thorough coverage, minor gaps)
5 = complete (exhaustive, no significant gaps)

Be strict - only score 4+ when truly comprehensive.`;

      const reviewResult = await reviewerAgent.generateText(
        ctx,
        {
          prompt: reviewPrompt,
        },
        {
          maxSteps: 1,
        }
      );

      // Parse review response (with fallback)
      let review: {
        coverageScore: number;
        gaps: string[];
        feedback: string;
        shouldContinue: boolean;
      };

      try {
        review = JSON.parse(reviewResult.text);
      } catch (error) {
        // Fallback if JSON parsing fails
        console.error("Failed to parse review JSON:", error);
        review = {
          coverageScore: 3,
          gaps: ["Unable to parse reviewer feedback"],
          feedback: reviewResult.text,
          shouldContinue: true,
        };
      }

      coverageScore = review.coverageScore;

      // Step 2d: SAVE - Create iteration record
      await ctx.runMutation(api.research.mutations.createDeepResearchIteration, {
        sessionId,
        iterationNumber: iteration,
        coverageScore: review.coverageScore,
        feedback: review.feedback,
        findings: synthesis,
        refinedQueries: review.gaps,
        status: "completed",
      });

      // Step 2e: POST CARD - Insert iteration card to chat
      const estimatedRemaining = Math.max(0, maxIterations - iteration);
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent" as const,
        content: `Iteration ${iteration} completed - Coverage score: ${review.coverageScore}/5`,
        messageType: "result_card" as const,
        cardData: {
          card_type: "deep_research_iteration",
          session_id: sessionId,
          iteration_number: iteration,
          coverage_score: review.coverageScore,
          feedback: review.feedback,
          estimated_remaining: estimatedRemaining,
        },
      });

      // Step 2f: REFINE - Update topic for next iteration
      if (coverageScore < 4 && review.gaps.length > 0) {
        // Focus on identified gaps for next iteration
        const topGaps = review.gaps.slice(0, 3).join(", ");
        currentTopic = `${topic} - Focus on: ${topGaps}`;
      }
    }

    // Step 3: Complete session
    await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
      sessionId,
      status: "completed",
    });

    // Return summary
    return {
      totalIterations: iteration,
      finalCoverageScore: coverageScore,
    };
  } catch (error) {
    // Error handling: mark session as error and rethrow
    await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
      sessionId,
      status: "error",
    });

    throw error;
  }
}
