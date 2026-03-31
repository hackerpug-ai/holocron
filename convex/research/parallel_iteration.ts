/**
 * Parallel Iteration Strategy for Deep Research
 *
 * Optimized research strategy that:
 * 1. Generates 2-3 query variants using LLM (gpt-5.4-mini)
 * 2. Executes all variants in parallel
 * 3. Synthesizes findings with quality model (gpt-5.4)
 * 4. Handles follow-up searches for identified gaps
 *
 * Target: 2-3x faster than serial iteration (25-40s vs 45-90s)
 * while maintaining research quality through parallel execution.
 *
 * Key optimizations:
 * - Variant generation with fallback to static queries
 * - Parallel search execution via Promise.all
 * - Quality synthesis with gpt-5.4
 * - Optional follow-up for gaps
 */

"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  executeParallelSearchWithRetry,
} from "./search";
import { stripMarkdownCodeBlock } from "../lib/json";
import type { ResearchMode } from "./intent";
import { getVariantInstructions, getSynthesisInstructions, getFallbackVariants, getSearchBudget, buildFollowUpContext } from "./mode_prompts";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

/**
 * Result type for parallel iteration research
 */
export interface ParallelIterationResult {
  sessionId: Id<"deepResearchSessions">;
  conversationId: Id<"conversations">;
  status: string;
  summary: string;
  confidence: string;
  durationMs: number;
}

/**
 * Query variant for parallel execution
 */
export interface QueryVariant {
  query: string;
  focus: string;
  rationale: string;
}

/**
 * Generate query variants using LLM
 *
 * Uses gpt-5.4-mini for fast, cheap variant generation.
 * Falls back to static variants if LLM fails.
 *
 * @param topic - Research topic
 * @returns Array of 2-3 query variants
 */
export async function generateQueryVariants(
  topic: string,
  mode?: ResearchMode,
  maxCount: number = 3
): Promise<QueryVariant[]> {
  console.log(
    `[generateQueryVariants] Entry - topic: "${topic}", mode: ${mode ?? "unset"}`
  );

  const variantInstructions = mode
    ? getVariantInstructions(mode)
    : `Each variant should explore a different aspect:
1. Technical/implementation focus
2. Academic/research focus
3. Industry/practical focus
4. Latest developments/trends`;

  const prompt = `Generate exactly ${maxCount} diverse search query variants for comprehensive research on: "${topic}"

${variantInstructions}

Return ONLY a JSON array:
[
  {
    "query": "actual search query",
    "focus": "what this query focuses on",
    "rationale": "why this angle matters"
  }
]

Be specific and targeted. Each query should uncover different information.`;

  try {
    console.log(`[generateQueryVariants] Calling gpt-5.4-mini for variant generation`);
    const result = await generateText({
      model: openai("gpt-5.4-mini"),
      prompt,
    });

    console.log(`[generateQueryVariants] Parsing LLM response`);
    const variants = JSON.parse(stripMarkdownCodeBlock(result.text)) as QueryVariant[];

    if (!Array.isArray(variants) || variants.length < 2 || variants.length > maxCount + 1) {
      throw new Error(`Invalid variant count: ${variants.length}, expected 2-${maxCount}`);
    }

    console.log(`[generateQueryVariants] Generated ${variants.length} variants via LLM`);
    return variants;
  } catch (error) {
    console.warn(
      `[generateQueryVariants] LLM generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    console.log(`[generateQueryVariants] Falling back to static variants`);

    // Fallback to mode-aware static variants
    if (mode) {
      return getFallbackVariants(topic, mode).slice(0, maxCount);
    }
    return [
      {
        query: `${topic} implementation guide tutorial example`,
        focus: "Technical implementation",
        rationale: "Practical how-to information",
      },
      {
        query: `${topic} research papers academic study`,
        focus: "Academic research",
        rationale: "Scientific and theoretical foundations",
      },
      {
        query: `${topic} best practices industry applications`,
        focus: "Industry practice",
        rationale: "Real-world usage and patterns",
      },
    ].slice(0, maxCount);
  }
}

/**
 * Build synthesis prompt for parallel iteration results
 *
 * Combines findings from all query variants into a comprehensive synthesis.
 *
 * @param topic - Research topic
 * @param variantResults - Results from each variant
 * @returns Synthesis prompt for gpt-5.4
 */
function buildParallelSynthesisPrompt(
  topic: string,
  variantResults: Array<{ variant: QueryVariant; findings: string }>,
  mode?: ResearchMode
): string {
  const resultsSection = variantResults
    .map(
      (r, i) => `
## Variant ${i + 1}: ${r.variant.focus}
Query: ${r.variant.query}
Rationale: ${r.variant.rationale}

${r.findings}
`
    )
    .join("\n");

  const modeInstructions = mode
    ? getSynthesisInstructions(mode)
    : "";

  return `Synthesize the following parallel research results into a comprehensive response.

Topic: ${topic}
${modeInstructions ? `\n${modeInstructions}\n` : ""}
Research Results:
${resultsSection}

Provide a well-structured summary that:
1. Identifies key findings across all variants
2. Notes any contradictions or gaps
3. Provides actionable insights
4. Includes source citations in [Title](URL) format
5. Identifies areas that need further investigation

Return a JSON object:
{
  "summary": "A comprehensive 400-600 word summary",
  "keyFindings": ["finding1", "finding2", ...],
  "gaps": ["gap1", "gap2", ...],
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}

CONFIDENCE LEVELS:
- HIGH: Multiple authoritative sources, clear consensus, comprehensive coverage
- MEDIUM: Adequate sources, some gaps or conflicting information
- LOW: Limited sources, significant gaps, or unreliable information`;
}

/**
 * Update the deep research loading card with a new steps list.
 *
 * Small helper to avoid repeating the query+update pattern.
 */
async function updateIterationLoadingCard(
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  sessionId: Id<"deepResearchSessions">,
  topic: string,
  steps: Array<{ id: string; label: string; status: string; detail?: string }>
): Promise<void> {
  const loadingCard = await ctx.runQuery(
    api.chatMessages.queries.findLoadingCardBySession,
    { conversationId, sessionId: sessionId.toString() },
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
 * Execute Parallel Iteration Strategy (Internal Helper)
 *
 * Core implementation that can be called directly from other actions.
 * Use this instead of ctx.runAction for internal calls.
 *
 * @param ctx - Convex action context
 * @param conversationId - Optional conversation to post results to
 * @param topic - Research topic
 * @param enableFollowUp - Whether to do a follow-up pass for gaps (default: true)
 */
export async function executeParallelIteration(
  ctx: ActionCtx,
  conversationId: Id<"conversations"> | undefined,
  topic: string,
  enableFollowUp: boolean = true,
  mode?: ResearchMode
): Promise<ParallelIterationResult> {
  const startTime = Date.now();
  console.log(
    `[executeParallelIteration] Entry - topic: "${topic}", enableFollowUp: ${enableFollowUp}, mode: ${mode ?? "unset"}`
  );

  // Step 1: Create conversation if needed
  const effectiveConversationId =
    conversationId ??
    (await ctx.runMutation(api.conversations.mutations.create, {
      title: `Parallel Research: ${topic}`,
    }));

  // Step 2: Create session with researchType: "parallel_iteration"
  const sessionId = await ctx.runMutation(
    api.research.mutations.createDeepResearchSession,
    {
      conversationId: effectiveConversationId,
      topic,
      maxIterations: 1, // Parallel iteration is typically single-pass
      researchType: "parallel_iteration",
      researchMode: mode,
    }
  );

  console.log(
    `[executeParallelIteration] Session created - ID: ${sessionId}, type: parallel_iteration`
  );

  const budget = getSearchBudget(mode);

  // Step 3: Post loading card
  await ctx.runMutation(api.chatMessages.mutations.create, {
    conversationId: effectiveConversationId,
    role: "agent" as const,
    content: `Parallel research: ${topic}`,
    messageType: "result_card" as const,
    cardData: {
      card_type: "deep_research_loading",
      status: "in_progress",
      session_id: sessionId,
      topic,
    },
  });

  // Step 4: Generate query variants
  console.log(`[executeParallelIteration] Generating query variants`);

  // Show "analyzing" step while generating variants
  await updateIterationLoadingCard(ctx, effectiveConversationId, sessionId, topic, [
    {
      id: "analyze",
      label: "Analyzing query complexity... Generating search variants",
      status: "in-progress",
    },
  ]);

  const variants = await generateQueryVariants(topic, mode, budget.primarySearchCount);
  console.log(
    `[executeParallelIteration] Generated ${variants.length} query variants`
  );

  // Show "searching" step now that we know how many variants we have
  await updateIterationLoadingCard(ctx, effectiveConversationId, sessionId, topic, [
    {
      id: "analyze",
      label: `Analyzing query complexity... Selected parallel iteration strategy (${variants.length} variants)`,
      status: "completed",
    },
    {
      id: "search",
      label: `Searching ${variants.length} query variants in parallel...`,
      status: "in-progress",
    },
  ]);

  // Step 5: Execute all variants in parallel
  console.log(`[executeParallelIteration] Executing parallel variant searches`);
  const variantSearches = variants.map(async (variant) => {
    const result = await executeParallelSearchWithRetry(
      variant.query,
      {},
      [],
      { maxRetries: budget.maxRetries, timeoutMs: budget.searchTimeoutMs, deduplicateResults: true }
    );
    return { variant, ...result };
  });

  const variantResults = await Promise.all(variantSearches);
  const totalResults = variantResults.reduce(
    (sum, r) => sum + r.structuredResults.length,
    0
  );
  const totalDuration = variantResults.reduce((sum, r) => sum + r.durationMs, 0);

  console.log(
    `[executeParallelIteration] All variant searches complete - ${totalResults} results in ${totalDuration}ms`
  );

  // Step 5b: Update card — search done, synthesis starting
  await updateIterationLoadingCard(ctx, effectiveConversationId, sessionId, topic, [
    {
      id: "analyze",
      label: `Analyzed query — parallel iteration across ${variants.length} variants`,
      status: "completed",
    },
    {
      id: "search",
      label: `Searched ${totalResults} sources across ${variants.length} variants`,
      status: "completed",
    },
    {
      id: "synthesize",
      label: `Synthesizing findings from ${totalResults} sources...`,
      status: "in-progress",
    },
  ]);

  // Step 6: Synthesize with gpt-5.4 for quality
  console.log(`[executeParallelIteration] Running synthesis with gpt-5.4`);
  const synthesisPrompt = buildParallelSynthesisPrompt(
    topic,
    variantResults.map((r) => ({
      variant: r.variant,
      findings: r.findings,
    })),
    mode
  );

  const synthesisResult = await generateText({
    model: openai("gpt-5.4"),
    prompt: synthesisPrompt,
  });

  // Parse synthesis result
  let synthesis: {
    summary: string;
    keyFindings: string[];
    gaps: string[];
    confidence: string;
  };

  try {
    synthesis = JSON.parse(stripMarkdownCodeBlock(synthesisResult.text));
  } catch {
    synthesis = {
      summary: synthesisResult.text,
      keyFindings: [],
      gaps: [],
      confidence: "MEDIUM",
    };
  }

  console.log(
    `[executeParallelIteration] Synthesis complete - confidence: ${synthesis.confidence}, gaps: ${synthesis.gaps.length}`
  );

  // Build post-synthesis completed steps
  const postSynthesisSteps = [
    {
      id: "analyze",
      label: `Analyzed query — parallel iteration across ${variants.length} variants`,
      status: "completed" as const,
    },
    {
      id: "search",
      label: `Searched ${totalResults} sources across ${variants.length} variants`,
      status: "completed" as const,
    },
    {
      id: "synthesize",
      label: `Synthesized findings — confidence: ${synthesis.confidence}`,
      status: "completed" as const,
    },
  ];

  // Step 7: Optional follow-up for gaps
  if (enableFollowUp && synthesis.gaps.length > 0 && synthesis.confidence !== "HIGH") {
    console.log(
      `[executeParallelIteration] Running follow-up for ${synthesis.gaps.length} gaps`
    );

    await updateIterationLoadingCard(ctx, effectiveConversationId, sessionId, topic, [
      ...postSynthesisSteps,
      {
        id: "followup",
        label: `Filling ${synthesis.gaps.length} coverage gap${synthesis.gaps.length === 1 ? "" : "s"}...`,
        status: "in-progress",
      },
    ]);

    const contextualGaps = buildFollowUpContext(synthesis.keyFindings, synthesis.gaps);
    const followUpResult = await executeParallelSearchWithRetry(
      topic,
      {},
      contextualGaps.slice(0, budget.followUpBudget),
      { maxRetries: budget.maxRetries, timeoutMs: budget.followUpTimeoutMs, deduplicateResults: true }
    );

    // Append follow-up findings to synthesis
    synthesis.summary += `\n\n## Additional Findings\n${followUpResult.findings}`;
    console.log(
      `[executeParallelIteration] Follow-up complete - ${followUpResult.structuredResults.length} additional results`
    );

    postSynthesisSteps.push({
      id: "followup",
      label: `Filled ${synthesis.gaps.length} gap${synthesis.gaps.length === 1 ? "" : "s"} with ${followUpResult.structuredResults.length} additional sources`,
      status: "completed" as const,
    });
  }

  // Show "saving" step before persisting results
  await updateIterationLoadingCard(ctx, effectiveConversationId, sessionId, topic, [
    ...postSynthesisSteps,
    {
      id: "save",
      label: "Saving to knowledge base...",
      status: "in-progress",
    },
  ]);

  // Step 8: Create iteration record
  await ctx.runMutation(api.research.mutations.createDeepResearchIteration, {
    sessionId,
    iterationNumber: 1,
    coverageScore: synthesis.confidence === "HIGH" ? 4 : synthesis.confidence === "MEDIUM" ? 3 : 2,
    feedback: `Parallel iteration completed with ${totalResults} sources across ${variants.length} query variants`,
    findings: synthesis.summary,
    refinedQueries: synthesis.gaps,
    status: "completed",
  });

  // Step 9: Complete session (triggers document creation and result card posting)
  await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
    sessionId,
    status: "completed",
  });

  const totalTime = Date.now() - startTime;

  console.log(
    `[executeParallelIteration] Exit - completed in ${totalTime}ms (document creation and result card posting scheduled)`
  );

  return {
    sessionId,
    conversationId: effectiveConversationId,
    status: "completed",
    summary: synthesis.summary,
    confidence: synthesis.confidence,
    durationMs: totalTime,
  };
}

/**
 * Run Parallel Iteration Strategy
 *
 * Fast-path research strategy for deep research queries.
 * Executes 2-3 query variants in parallel, then synthesizes with gpt-5.4.
 *
 * @param conversationId - Optional conversation to post results to
 * @param topic - Research topic
 * @param enableFollowUp - Whether to do a follow-up pass for gaps (default: true)
 */
export const runParallelIteration = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    topic: v.string(),
    enableFollowUp: v.optional(v.boolean()),
    researchMode: v.optional(v.string()),
  },
  handler: async (ctx, { conversationId, topic, enableFollowUp = true, researchMode }): Promise<ParallelIterationResult> => {
    return executeParallelIteration(ctx, conversationId, topic, enableFollowUp, researchMode as ResearchMode | undefined);
  },
});
