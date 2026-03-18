/**
 * Parallel Iteration Strategy for Deep Research
 *
 * Optimized research strategy that:
 * 1. Generates 2-3 query variants using LLM (zaiFlash)
 * 2. Executes all variants in parallel
 * 3. Synthesizes findings with quality model (zaiPro)
 * 4. Handles follow-up searches for identified gaps
 *
 * Target: 2-3x faster than serial iteration (25-40s vs 45-90s)
 * while maintaining research quality through parallel execution.
 *
 * Key optimizations:
 * - Variant generation with fallback to static queries
 * - Parallel search execution via Promise.all
 * - Quality synthesis with zaiPro
 * - Optional follow-up for gaps
 */

"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { generateText } from "ai";
import { zaiFlash, zaiPro } from "../lib/ai/zai_provider";
import {
  executeParallelSearchWithRetry,
  type ParallelSearchResult,
} from "./search";
import { stripMarkdownCodeBlock } from "../lib/json";
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
 * Uses zaiFlash for fast, cheap variant generation.
 * Falls back to static variants if LLM fails.
 *
 * @param topic - Research topic
 * @returns Array of 2-3 query variants
 */
export async function generateQueryVariants(
  topic: string
): Promise<QueryVariant[]> {
  console.log(
    `[generateQueryVariants] Entry - topic: "${topic}"`
  );

  const prompt = `Generate 2-3 diverse search query variants for comprehensive research on: "${topic}"

Each variant should explore a different aspect:
1. Technical/implementation focus
2. Academic/research focus
3. Industry/practical focus
4. Latest developments/trends

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
    console.log(`[generateQueryVariants] Calling zaiFlash for variant generation`);
    const result = await generateText({
      model: zaiFlash(),
      prompt,
    });

    console.log(`[generateQueryVariants] Parsing LLM response`);
    const variants = JSON.parse(stripMarkdownCodeBlock(result.text)) as QueryVariant[];

    if (!Array.isArray(variants) || variants.length < 2 || variants.length > 3) {
      throw new Error(`Invalid variant count: ${variants.length}`);
    }

    console.log(`[generateQueryVariants] Generated ${variants.length} variants via LLM`);
    return variants;
  } catch (error) {
    console.warn(
      `[generateQueryVariants] LLM generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    console.log(`[generateQueryVariants] Falling back to static variants`);

    // Fallback to static variants
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
    ].slice(0, 3);
  }
}

/**
 * Build synthesis prompt for parallel iteration results
 *
 * Combines findings from all query variants into a comprehensive synthesis.
 *
 * @param topic - Research topic
 * @param variantResults - Results from each variant
 * @returns Synthesis prompt for zaiPro
 */
function buildParallelSynthesisPrompt(
  topic: string,
  variantResults: Array<{ variant: QueryVariant; findings: string }>
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

  return `Synthesize the following parallel research results into a comprehensive response.

Topic: ${topic}

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
  enableFollowUp: boolean = true
): Promise<ParallelIterationResult> {
  const startTime = Date.now();
  console.log(
    `[executeParallelIteration] Entry - topic: "${topic}", enableFollowUp: ${enableFollowUp}`
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
    }
  );

  console.log(
    `[executeParallelIteration] Session created - ID: ${sessionId}, type: parallel_iteration`
  );

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
  const variants = await generateQueryVariants(topic);
  console.log(
    `[executeParallelIteration] Generated ${variants.length} query variants`
  );

  // Step 5: Execute all variants in parallel
  console.log(`[executeParallelIteration] Executing parallel variant searches`);
  const variantSearches = variants.map(async (variant) => {
    const result = await executeParallelSearchWithRetry(
      variant.query,
      {},
      [],
      { maxRetries: 2, timeoutMs: 12000, deduplicateResults: true }
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

  // Step 6: Synthesize with zaiPro for quality
  console.log(`[executeParallelIteration] Running synthesis with zaiPro`);
  const synthesisPrompt = buildParallelSynthesisPrompt(
    topic,
    variantResults.map((r) => ({
      variant: r.variant,
      findings: r.findings,
    }))
  );

  const synthesisResult = await generateText({
    model: zaiPro(),
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

  // Step 7: Optional follow-up for gaps
  if (enableFollowUp && synthesis.gaps.length > 0 && synthesis.confidence !== "HIGH") {
    console.log(
      `[executeParallelIteration] Running follow-up for ${synthesis.gaps.length} gaps`
    );

    // Use top 2 gaps for follow-up
    const followUpResult = await executeParallelSearchWithRetry(
      topic,
      {},
      synthesis.gaps.slice(0, 2),
      { maxRetries: 2, timeoutMs: 15000, deduplicateResults: true }
    );

    // Append follow-up findings to synthesis
    synthesis.summary += `\n\n## Additional Findings\n${followUpResult.findings}`;
    console.log(
      `[executeParallelIteration] Follow-up complete - ${followUpResult.structuredResults.length} additional results`
    );
  }

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
 * Executes 2-3 query variants in parallel, then synthesizes with zaiPro.
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
  },
  handler: async (ctx, { conversationId, topic, enableFollowUp = true }): Promise<ParallelIterationResult> => {
    return executeParallelIteration(ctx, conversationId, topic, enableFollowUp);
  },
});
