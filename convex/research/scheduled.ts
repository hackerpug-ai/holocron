/**
 * Deep Research Scheduled Functions
 *
 * Background job processing for deep research iterations.
 * Prevents 600-second action timeout by processing one iteration at a time.
 *
 * Pipeline per iteration:
 *   EXPAND (gpt-5.4-mini) → SEARCH (direct API) → DEEP READ (Jina) → SYNTHESIZE (gpt-5.4) → REVIEW (gpt-5.4)
 */

"use node";

import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  executeParallelSearchWithRetry,
  executeParallelUrlRead,
  generateDiverseQueries,
  type StructuredSearchResult,
} from "./search";
import {
  buildResearchContext,
  buildSynthesisPrompt,
  buildReviewPrompt,
} from "./prompts";
import { stripMarkdownCodeBlock } from "../lib/json";
import type { ResearchMode } from "./intent";
import { getVariantInstructions } from "./mode_prompts";

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
  ctx: ActionCtx,
  conversationId: string,
  sessionId: string,
  topic: string,
  steps: Array<{ id: string; label: string; status: string; detail?: string }>
): Promise<void> {
  const loadingCard = await ctx.runQuery(
    api.chatMessages.queries.findLoadingCardBySession,
    { conversationId: conversationId as Id<"conversations">, sessionId },
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
 * Generate diverse query variants using LLM
 *
 * Uses gpt-5.4-mini for fast, intelligent query expansion.
 * Falls back to static generation if LLM fails.
 * Now includes context from previous sessions in the conversation.
 */
async function expandQueries(
  topic: string,
  previousGaps: string[],
  previousSessions?: Array<{ topic: string; summary: string }>,
  mode?: ResearchMode,
  count: number = 6,
): Promise<Array<{ query: string; focus: string; rationale: string }>> {
  const previousSessionsContext = previousSessions && previousSessions.length > 0
    ? `\nPrevious research sessions in this conversation:\n${previousSessions.map((s, i) =>
        `${i + 1}. "${s.topic}"\n   Key findings: ${s.summary.slice(0, 200)}...`
      ).join("\n\n")}\n\nBuild upon these previous findings to provide comprehensive coverage.`
    : "";

  const gapContext = previousGaps.length > 0
    ? `\nPrevious research identified these gaps to address:\n${previousGaps.map((g, i) => `${i + 1}. ${g}`).join("\n")}\n\nPrioritize queries that fill these gaps.`
    : "";

  const variantInstructions = mode
    ? getVariantInstructions(mode)
    : `Each variant should explore a different aspect:
1. Technical/implementation focus
2. Academic/research focus
3. Industry/practical focus
4. Latest developments/trends
5. Expert opinions and case studies
6. Comparative analysis`;

  const prompt = `Generate exactly ${count} diverse search query variants for comprehensive research on: "${topic}"

${variantInstructions}
${previousSessionsContext}
${gapContext}

Return ONLY a JSON array:
[
  {
    "query": "actual search query",
    "focus": "what this query focuses on (2-5 words)",
    "rationale": "why this angle matters"
  }
]

Be specific and targeted. Each query should uncover different information.`;

  try {
    const result = await generateText({
      model: openai("gpt-5.4-mini"),
      prompt,
    });

    const variants = JSON.parse(stripMarkdownCodeBlock(result.text));
    if (Array.isArray(variants) && variants.length >= 2) {
      console.log(`[expandQueries] Generated ${variants.length} variants via gpt-5.4-mini`);
      return variants.slice(0, count);
    }
    throw new Error(`Invalid variant count: ${variants.length}`);
  } catch (error) {
    console.warn(`[expandQueries] LLM failed, using static fallback: ${error instanceof Error ? error.message : String(error)}`);
    return generateDiverseQueries(topic, previousGaps).map((q, i) => ({
      query: q,
      focus: `Angle ${i + 1}`,
      rationale: "Static fallback",
    }));
  }
}

/**
 * Process Deep Research Iteration
 *
 * Scheduled function that runs ONE iteration of the enhanced research pipeline:
 *   1. EXPAND — Generate 6 diverse query variants (gpt-5.4-mini)
 *   2. SEARCH — Execute parallel searches across all variants (Exa + Jina APIs)
 *   3. DEEP READ — Read top 8 source URLs in full (Jina Reader, 10k chars each)
 *   4. SYNTHESIZE — Combine snippets + full articles into structured findings (gpt-5.4)
 *   5. REVIEW — Assess coverage quality and identify gaps (gpt-5.4)
 *
 * Saves results to DB, then schedules next iteration OR completes session.
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

      console.log(
        `[processIteration] Iteration ${currentIteration}/${maxIterations}, topic: "${session.topic}"`,
      );

      // Build context from database
      const context = await buildResearchContext(ctx, sessionId);

      // Build steps prefix from already-completed iterations
      const completedIterationSteps = context.previousIterations.map((iter: any, idx: number) => ({
        id: `iteration-${idx + 1}`,
        label: iter.summary || `Iteration ${idx + 1} complete`,
        status: "completed" as const,
      }));

      const researchMode = (session as any).researchMode as ResearchMode | undefined;

      // Get gaps from previous iterations for query refinement
      const previousGaps = context.previousIterations.length > 0
        ? context.previousIterations[context.previousIterations.length - 1].gaps
        : [];

      // ─── PHASE 1: EXPAND QUERIES ───────────────────────────────────────
      console.log(`[processIteration] EXPAND phase starting`);
      await updateLoadingCardSteps(
        ctx,
        session.conversationId,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `expand-${currentIteration}`,
            label: `Iteration ${currentIteration}: Expanding search queries...`,
            status: "in-progress",
          },
        ],
      );

      const queryVariants = await expandQueries(
        session.topic, // Always use original topic, not mangled refinedTopic
        previousGaps,
        context.previousSessions,
        researchMode,
        6,
      );

      console.log(
        `[processIteration] EXPAND complete - ${queryVariants.length} variants generated`,
      );

      // ─── PHASE 2: PARALLEL SEARCH ─────────────────────────────────────
      console.log(`[processIteration] SEARCH phase starting`);
      await updateLoadingCardSteps(
        ctx,
        session.conversationId,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `expand-${currentIteration}`,
            label: `Iteration ${currentIteration}: Generated ${queryVariants.length} search angles`,
            status: "completed",
          },
          {
            id: `search-${currentIteration}`,
            label: `Iteration ${currentIteration}: Searching ${queryVariants.length} queries across multiple sources...`,
            status: "in-progress",
          },
        ],
      );

      // Execute parallel searches for each query variant
      const searchPromises = queryVariants.map(variant =>
        executeParallelSearchWithRetry(variant.query, {}, previousGaps, {
          maxRetries: 2,
          timeoutMs: 15000,
          deduplicateResults: true,
        })
      );

      const searchResults = await Promise.all(searchPromises);

      // Aggregate and deduplicate results across all variants
      const seenUrls = new Set<string>();
      const allStructuredResults: StructuredSearchResult[] = [];
      for (const result of searchResults) {
        for (const sr of result.structuredResults) {
          const normalized = sr.url.toLowerCase().replace(/\/$/, "");
          if (!seenUrls.has(normalized)) {
            seenUrls.add(normalized);
            allStructuredResults.push(sr);
          }
        }
      }

      // Combine findings text from all search results
      const searchFindings = searchResults
        .map(r => r.findings)
        .filter(f => f.length > 0)
        .join("\n\n---\n\n");

      const totalToolCalls = searchResults.reduce((sum, r) => sum + r.toolCallCount, 0);

      console.log(
        `[processIteration] SEARCH complete - ${allStructuredResults.length} unique sources from ${totalToolCalls} searches`,
      );

      // ─── PHASE 3: DEEP READ TOP SOURCES ───────────────────────────────
      console.log(`[processIteration] DEEP READ phase starting`);
      await updateLoadingCardSteps(
        ctx,
        session.conversationId,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `expand-${currentIteration}`,
            label: `Iteration ${currentIteration}: Generated ${queryVariants.length} search angles`,
            status: "completed",
          },
          {
            id: `search-${currentIteration}`,
            label: `Iteration ${currentIteration}: Found ${allStructuredResults.length} unique sources`,
            status: "completed",
          },
          {
            id: `read-${currentIteration}`,
            label: `Iteration ${currentIteration}: Reading top articles in depth...`,
            status: "in-progress",
          },
        ],
      );

      // Sort by relevance score and take top 8 URLs for deep reading
      const topUrls = allStructuredResults
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 8)
        .map(r => r.url)
        .filter(url => url && url.startsWith("http"));

      let deepReadContent = "";
      let deepReadCount = 0;

      if (topUrls.length > 0) {
        const readResults = await executeParallelUrlRead(topUrls, {
          maxConcurrent: 5,
          timeoutMs: 15000,
          maxContentLength: 10000,
        });

        const successfulReads = readResults.filter(r => r.success && r.content.length > 100);
        deepReadCount = successfulReads.length;
        deepReadContent = successfulReads
          .map(r => `### ${r.title || "Source"}\nURL: ${r.url}\n\n${r.content}`)
          .join("\n\n---\n\n");
      }

      console.log(
        `[processIteration] DEEP READ complete - ${deepReadCount}/${topUrls.length} articles read`,
      );

      // Combine search snippets + deep read content for synthesis
      const enrichedFindings = deepReadContent
        ? `## Search Snippets (${allStructuredResults.length} sources)\n\n${searchFindings}\n\n## Full Article Content (${deepReadCount} articles)\n\n${deepReadContent}`
        : searchFindings;

      // ─── PHASE 4: SYNTHESIZE ──────────────────────────────────────────
      console.log(`[processIteration] SYNTHESIZE phase starting`);
      await updateLoadingCardSteps(
        ctx,
        session.conversationId,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `expand-${currentIteration}`,
            label: `Iteration ${currentIteration}: Generated ${queryVariants.length} search angles`,
            status: "completed",
          },
          {
            id: `search-${currentIteration}`,
            label: `Iteration ${currentIteration}: Found ${allStructuredResults.length} unique sources`,
            status: "completed",
          },
          {
            id: `read-${currentIteration}`,
            label: `Iteration ${currentIteration}: Read ${deepReadCount} articles in depth`,
            status: "completed",
          },
          {
            id: `synthesize-${currentIteration}`,
            label: `Iteration ${currentIteration}: Synthesizing ${allStructuredResults.length} sources + ${deepReadCount} articles...`,
            status: "in-progress",
          },
        ],
      );

      const synthesisPrompt = buildSynthesisPrompt(context, enrichedFindings, researchMode);
      const synthesisResult = await generateText({
        model: openai("gpt-5.4"), // Frontier model for high-quality synthesis
        prompt: synthesisPrompt,
      });
      const synthesis = synthesisResult.text;
      console.log(
        `[processIteration] SYNTHESIZE complete - ${synthesis.length} chars`,
      );

      // ─── PHASE 5: REVIEW ──────────────────────────────────────────────
      console.log(`[processIteration] REVIEW phase starting`);
      await updateLoadingCardSteps(
        ctx,
        session.conversationId,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `expand-${currentIteration}`,
            label: `Iteration ${currentIteration}: Generated ${queryVariants.length} search angles`,
            status: "completed",
          },
          {
            id: `search-${currentIteration}`,
            label: `Iteration ${currentIteration}: Found ${allStructuredResults.length} unique sources`,
            status: "completed",
          },
          {
            id: `read-${currentIteration}`,
            label: `Iteration ${currentIteration}: Read ${deepReadCount} articles in depth`,
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
        model: openai("gpt-5.4"), // Frontier model for accurate review
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
        session.conversationId,
        sessionId.toString(),
        session.topic,
        [
          ...completedIterationSteps,
          {
            id: `expand-${currentIteration}`,
            label: `Iteration ${currentIteration}: Generated ${queryVariants.length} search angles`,
            status: "completed",
          },
          {
            id: `search-${currentIteration}`,
            label: `Iteration ${currentIteration}: Found ${allStructuredResults.length} unique sources`,
            status: "completed",
          },
          {
            id: `read-${currentIteration}`,
            label: `Iteration ${currentIteration}: Read ${deepReadCount} articles in depth`,
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
        session.conversationId,
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

      // Update session — keep original topic intact (query expansion handles gaps)
      await ctx.runMutation(api.research.mutations.updateDeepResearchSession, {
        sessionId,
        status: "in_progress",
        currentIteration,
        refinedTopic: session.topic, // Keep original topic, don't mangle with gaps
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
          session.conversationId,
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
