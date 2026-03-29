/**
 * Deep Research Scheduled Functions
 *
 * Background job processing for deep research iterations.
 * Prevents 600-second action timeout by processing one iteration at a time.
 */

"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  exaSearchTool,
  jinaSearchTool,
  jinaSiteSearchTool,
  jinaReaderTool,
} from "./tools";
import {
  buildResearchContext,
  buildSearchPrompt,
  buildSynthesisPrompt,
  buildReviewPrompt,
} from "./prompts";
import { stripMarkdownCodeBlock } from "../lib/json";

/**
 * Generate a concise 3-6 word summary from research feedback and findings
 *
 * Extracts the key insight from the reviewer feedback to create a human-readable
 * label for the iteration step in the loading card.
 */
function generateIterationSummary(
  feedback: string,
  findings: string,
  coverageScore: number
): string {
  // Try to extract key phrases from feedback
  // Common patterns: "Good coverage of X", "Found X, missing Y", "X well documented"

  // Extract first sentence if feedback is long
  const firstSentence = feedback.split(/[.!]/)[0] || feedback;

  // Try to extract meaningful phrases
  const patterns = [
    /(?:found|discovered|covered|documented)\s+(.+?)(?:\s+(?:but|however|missing|needs)|$)/i,
    /(?:good|strong|excellent)\s+(?:coverage|understanding)\s+(?:of\s+)?(.+?)(?:\s|$)/i,
    /(.+?)\s+(?:is well documented|are covered)/i,
  ];

  for (const pattern of patterns) {
    const match = firstSentence.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      // Limit to 6 words
      const words = extracted.split(/\s+/).slice(0, 6);
      if (words.length >= 2) {
        return words.join(" ");
      }
    }
  }

  // Fallback: Extract key nouns/verbs from first 50 chars of findings
  const findingsPreview = findings.slice(0, 100);
  const keyPhrases = findingsPreview.match(/\b(?:found|discovered|revealed|shows|identifies|provides)\s+(.+?)(?:\n|$)/i);
  if (keyPhrases && keyPhrases[1]) {
    const words = keyPhrases[1].trim().split(/\s+/).slice(0, 5);
    if (words.length >= 2) {
      return `Found: ${words.join(" ")}`;
    }
  }

  // Final fallback: Score-based summary
  if (coverageScore >= 4) {
    return "Strong coverage achieved";
  } else if (coverageScore >= 3) {
    return "Good progress made";
  } else {
    return "Exploring topic";
  }
}

/**
 * Update the deep research loading card with a new set of steps.
 *
 * Helper used throughout processDeepResearchIteration to give granular
 * in-progress feedback without repeating the query+update boilerplate.
 */
async function updateLoadingCardSteps(
  ctx: any,
  conversationId: string,
  sessionId: string,
  topic: string,
  steps: Array<{ id: string; label: string; status: string; detail?: string }>
): Promise<void> {
  const loadingCard = await ctx.runQuery(
    api.chatMessages.queries.findLoadingCardBySession,
    { conversationId, sessionId },
  );
  if (!loadingCard) return;

  await ctx.runMutation(api.chatMessages.mutations.update, {
    id: loadingCard._id,
    cardData: {
      card_type: "deep_research_loading",
      status: "in_progress",
      session_id: sessionId,
      topic,
      steps,
    },
  });
}

/**
 * Process Deep Research Iteration
 *
 * Scheduled function that:
 * 1. Loads session from DB
 * 2. Runs ONE iteration (search → synthesize → review)
 * 3. Saves results to DB
 * 4. Schedules next iteration OR completes session
 *
 * This function has no timeout limit, but each iteration completes quickly
 * enough to stay under reasonable execution time.
 */
export const processDeepResearchIteration = internalAction({
  args: {
    sessionId: v.id("deepResearchSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    console.log(`[processIteration] Starting - sessionId: ${sessionId}`);

    try {
      // Load session directly from database (actions need all fields)
      const session = await ctx.runQuery(
        api.research.queries.getDeepResearchSession,
        {
          sessionId,
        },
      );

      if (!session) {
        console.error(`[processIteration] Session not found: ${sessionId}`);
        return;
      }

      if (session.status === "completed" || session.status === "cancelled") {
        console.log(
          `[processIteration] Session already ${session.status}, skipping`,
        );
        return;
      }

      // Get current iteration from the session data
      const currentIteration = (session.iterations.length || 0) + 1;
      const maxIterations = session.maxIterations ?? 5;
      const currentTopic = session.topic;
      const _previousCoverageScore = 0;

      console.log(
        `[processIteration] Iteration ${currentIteration}/${maxIterations}, topic: "${currentTopic}"`,
      );

      // Build context from database
      const context = await buildResearchContext(ctx, sessionId);

      // Build steps prefix from already-completed iterations
      const completedIterationSteps = context.previousIterations.map((iter: any, idx: number) => ({
        id: `iteration-${idx + 1}`,
        label: iter.summary || `Iteration ${idx + 1} complete`,
        status: "completed" as const,
      }));

      // SEARCH Phase — update loading card to show search in-progress
      console.log(`[processIteration] SEARCH phase starting`);
      await updateLoadingCardSteps(
        ctx,
        session.conversationId as string,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `search-${currentIteration}`,
            label: `Iteration ${currentIteration}: Searching sources in parallel...`,
            status: "in-progress",
          },
        ],
      );
      // Get research mode from session for mode-aware prompts
      const researchMode = (session as any).researchMode as string | undefined;
      const searchPrompt = buildSearchPrompt(
        currentTopic,
        context.previousIterations,
        researchMode as any,
      );
      const searchResult = await generateText({
        model: openai("gpt-4o-mini"), // Fast, cheap, good at tool calls
        prompt: searchPrompt,
        tools: {
          exaSearch: exaSearchTool,
          jinaSearch: jinaSearchTool,
          jinaSiteSearch: jinaSiteSearchTool,
          jinaReader: jinaReaderTool,
        },
      });

      // Extract tool results - these contain the actual search data
      const toolResults = searchResult.toolResults || [];
      const searchFindings =
        toolResults.length > 0
          ? JSON.stringify(toolResults, null, 2)
          : searchResult.text || "No search results found";

      console.log(
        `[processIteration] SEARCH complete - ${searchFindings.length} chars, ${toolResults.length} tool calls`,
      );

      // SYNTHESIZE Phase — update loading card before synthesis begins
      console.log(`[processIteration] SYNTHESIZE phase starting`);
      await updateLoadingCardSteps(
        ctx,
        session.conversationId as string,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `search-${currentIteration}`,
            label: `Iteration ${currentIteration}: Searched ${toolResults.length} sources`,
            status: "completed",
          },
          {
            id: `synthesize-${currentIteration}`,
            label: `Iteration ${currentIteration}: Synthesizing findings...`,
            status: "in-progress",
          },
        ],
      );
      const synthesisPrompt = buildSynthesisPrompt(context, searchFindings, researchMode as any);
      const synthesisResult = await generateText({
        model: openai("gpt-4o"), // Fast, reliable, cheaper than gpt-4-turbo
        prompt: synthesisPrompt,
      });
      const synthesis = synthesisResult.text;
      console.log(
        `[processIteration] SYNTHESIZE complete - ${synthesis.length} chars`,
      );

      // REVIEW Phase — update loading card before review begins
      console.log(`[processIteration] REVIEW phase starting`);
      await updateLoadingCardSteps(
        ctx,
        session.conversationId as string,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `search-${currentIteration}`,
            label: `Iteration ${currentIteration}: Searched ${toolResults.length} sources`,
            status: "completed",
          },
          {
            id: `synthesize-${currentIteration}`,
            label: `Iteration ${currentIteration}: Synthesized findings`,
            status: "completed",
          },
          {
            id: `review-${currentIteration}`,
            label: `Iteration ${currentIteration}: Reviewing coverage...`,
            status: "in-progress",
          },
        ],
      );
      const reviewPrompt = buildReviewPrompt(context, synthesis);
      const reviewResult = await generateText({
        model: openai("gpt-4o"), // Fast, reliable, cheaper than gpt-4-turbo
        prompt: reviewPrompt,
      });

      // Parse review
      let review: {
        coverageScore: number;
        gaps: string[];
        feedback: string;
        shouldContinue: boolean;
      };

      try {
        const cleanedJson = stripMarkdownCodeBlock(reviewResult.text);
        review = JSON.parse(cleanedJson);
      } catch (error) {
        console.error(`[processIteration] Failed to parse review JSON:`, error);
        review = {
          coverageScore: 3,
          gaps: ["Unable to parse reviewer feedback"],
          feedback: reviewResult.text,
          shouldContinue: true,
        };
      }

      console.log(
        `[processIteration] REVIEW complete - score: ${review.coverageScore}, gaps: ${review.gaps.length}`,
      );

      // Generate a concise summary from the feedback (3-6 words)
      const summary = generateIterationSummary(review.feedback, synthesis, review.coverageScore);

      // Show "Saving..." step before persisting iteration
      await updateLoadingCardSteps(
        ctx,
        session.conversationId as string,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `search-${currentIteration}`,
            label: `Iteration ${currentIteration}: Searched ${toolResults.length} sources`,
            status: "completed",
          },
          {
            id: `synthesize-${currentIteration}`,
            label: `Iteration ${currentIteration}: Synthesized findings`,
            status: "completed",
          },
          {
            id: `review-${currentIteration}`,
            label: `Iteration ${currentIteration}: Coverage score ${review.coverageScore}/5`,
            status: "completed",
          },
          {
            id: `save-${currentIteration}`,
            label: `Saving iteration ${currentIteration} to knowledge base...`,
            status: "in-progress",
          },
        ],
      );

      // Save iteration
      await ctx.runMutation(
        api.research.mutations.createDeepResearchIteration,
        {
          sessionId,
          iterationNumber: currentIteration,
          coverageScore: review.coverageScore,
          feedback: review.feedback,
          findings: synthesis,
          refinedQueries: review.gaps,
          status: "completed",
          summary,
        },
      );

      // Mark iteration save as complete
      await updateLoadingCardSteps(
        ctx,
        session.conversationId as string,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `iteration-${currentIteration}`,
            label: summary || `Iteration ${currentIteration} — Coverage ${review.coverageScore}/5`,
            status: "completed",
            detail: review.feedback || undefined,
          },
        ],
      );

      // Update session with progress
      const refinedTopic =
        review.coverageScore < 4 && review.gaps.length > 0
          ? `${session.topic} - Focus on: ${review.gaps.slice(0, 3).join(", ")}`
          : currentTopic;

      await ctx.runMutation(api.research.mutations.updateDeepResearchSession, {
        sessionId,
        status: "in_progress",
        currentIteration,
        refinedTopic,
        currentCoverageScore: review.coverageScore,
      });

      // Decide: schedule next OR complete
      const shouldContinue =
        review.coverageScore < 4 && currentIteration < maxIterations;

      if (shouldContinue) {
        console.log(`[processIteration] Scheduling next iteration`);
        // Schedule next iteration to run after a short delay (1 second)
        await ctx.scheduler.runAfter(
          1000,
          internal.research.scheduled.processDeepResearchIteration,
          {
            sessionId,
          },
        );
      } else {
        console.log(
          `[processIteration] Research complete - finalizing session`,
        );

        // Fetch all saved iterations to build the completed steps list
        const allIterations = await ctx.runQuery(
          api.research.queries.listDeepResearchIterations,
          { sessionId },
        );
        const allIterationSteps = allIterations.map((iter: any) => ({
          id: `iteration-${iter.iterationNumber}`,
          label: iter.summary || `Iteration ${iter.iterationNumber} — Coverage ${iter.coverageScore || 0}/5`,
          status: "completed" as const,
          detail: iter.feedback || undefined,
        }));

        // Show "Saving to knowledge base..." before document creation
        await updateLoadingCardSteps(
          ctx,
          session.conversationId as string,
          sessionId.toString(),
          session.topic,
          [
            ...allIterationSteps,
            {
              id: "save-final",
              label: "Saving to knowledge base...",
              status: "in-progress",
            },
          ],
        );

        // Complete session (this triggers document creation)
        await ctx.runMutation(
          api.research.mutations.completeDeepResearchSession,
          {
            sessionId,
            status: "completed",
          },
        );
      }

      console.log(
        `[processIteration] Complete - next: ${shouldContinue ? "scheduled" : "done"}`,
      );
    } catch (error) {
      console.error(`[processIteration] ERROR:`, error);
      // Mark session as error
      await ctx.runMutation(
        api.research.mutations.completeDeepResearchSession,
        {
          sessionId,
          status: "error",
        },
      );
      throw error;
    }
  },
});
