/**
 * Parallel Fan-Out Strategy for Deep Research
 *
 * Fast-path research strategy that:
 * 1. Decomposes topic into 4 domain-specific queries
 * 2. Executes all domains in parallel
 * 3. Single-pass synthesis
 * 4. Optional follow-up for gaps
 *
 * Target: ~15-25s total execution for simple queries
 */

"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { generateText } from "ai";
import { claudeFlash } from "../lib/ai/anthropic_provider";
import {
  executeParallelSearchWithRetry,
} from "./search";
import { stripMarkdownCodeBlock } from "../lib/json";
import type { ResearchMode } from "./intent";
import { getSynthesisInstructions, getSearchBudget, getDecompositionInstructions, buildFollowUpContext } from "./mode_prompts";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

/**
 * Result type for parallel fan-out research
 */
export interface ParallelFanOutResult {
  sessionId: Id<"deepResearchSessions">;
  conversationId: Id<"conversations">;
  status: string;
  summary: string;
  confidence: string;
  durationMs: number;
}

/**
 * Sub-question for LLM-driven query decomposition
 */
export interface SubQuestion {
  query: string;       // The actual search query
  focus: string;       // What this sub-question targets
  rationale: string;   // Why this angle matters
  dependsOn: number[]; // Indices of sub-questions this depends on (future DAG support)
}

/**
 * @deprecated Use decomposeIntoSubQuestions() instead. Kept as fallback.
 */
export function decomposeIntoDomainsStatic(topic: string, mode?: ResearchMode): string[] {
  const words = topic.toLowerCase();

  // Mode-specific decomposition takes priority over keyword detection
  if (mode === "ACTIONABLE") {
    return [
      `${topic} implementation code example tutorial`,
      `${topic} architecture patterns design decisions`,
      `${topic} production case study lessons learned`,
      `${topic} tools frameworks libraries getting started`,
    ];
  }

  if (mode === "COMPARATIVE") {
    // Try to extract comparison subjects for better decomposition
    const parts = topic.split(/\s+vs\.?\s+|\s+compared?\s+to\s+/i);
    if (parts.length >= 2) {
      return [
        `${parts[0]} features capabilities advantages`,
        `${parts[1]} features capabilities advantages`,
        `${parts[0]} vs ${parts[1]} comparison benchmark`,
        `${parts[0]} ${parts[1]} when to use best practices`,
      ];
    }
    return [
      `${topic} comparison features capabilities`,
      `${topic} benchmarks performance trade-offs`,
      `${topic} pros cons advantages disadvantages`,
      `${topic} when to use decision criteria`,
    ];
  }

  if (mode === "OVERVIEW") {
    return [
      `${topic} market landscape key players adoption`,
      `${topic} trends developments 2024 2025`,
      `${topic} statistics data market size growth`,
      `${topic} future outlook predictions trajectory`,
    ];
  }

  if (mode === "EXPLORATORY") {
    return [
      `${topic} approaches methods techniques`,
      `${topic} use cases applications real-world`,
      `${topic} advantages disadvantages tradeoffs`,
      `${topic} tools frameworks alternatives`,
    ];
  }

  // Detect topic type for better decomposition
  const isTechnical =
    words.includes("implement") ||
    words.includes("code") ||
    words.includes("api") ||
    words.includes("sdk");
  const isComparison =
    words.includes("vs") ||
    words.includes("compare") ||
    words.includes("difference");
  const isConceptual =
    words.includes("what is") ||
    words.includes("explain") ||
    words.includes("how does");

  if (isComparison) {
    // Extract comparison subjects
    const parts = topic.split(/\s+vs\.?\s+|\s+compared?\s+to\s+/i);
    if (parts.length >= 2) {
      return [
        `${parts[0]} features capabilities advantages`,
        `${parts[1]} features capabilities advantages`,
        `${parts[0]} vs ${parts[1]} comparison benchmark`,
        `${parts[0]} ${parts[1]} when to use best practices`,
      ];
    }
  }

  if (isTechnical) {
    return [
      `${topic} implementation code example tutorial`,
      `${topic} documentation API reference`,
      `${topic} best practices patterns architecture`,
      `${topic} performance optimization production`,
    ];
  }

  if (isConceptual) {
    return [
      `${topic} definition explanation`,
      `${topic} examples use cases`,
      `${topic} advantages disadvantages tradeoffs`,
      `${topic} alternatives comparison`,
    ];
  }

  // Default decomposition
  return [
    `${topic} technical implementation guide`,
    `${topic} research papers academic study`,
    `${topic} industry best practices real-world`,
    `${topic} latest developments trends 2024 2025`,
  ];
}

/**
 * LLM-driven query decomposition into sub-questions.
 *
 * Uses gpt-5.4-mini to generate dependency-aware sub-questions tailored to
 * the research mode. Falls back to static decomposition on failure.
 *
 * @param topic - Research topic
 * @param mode - Research mode for decomposition guidance
 * @param maxCount - Maximum number of sub-questions (from search budget)
 * @returns Array of SubQuestion objects
 */
export async function decomposeIntoSubQuestions(
  topic: string,
  mode?: ResearchMode,
  maxCount: number = 4
): Promise<SubQuestion[]> {
  

  const modeInstructions = mode
    ? getDecompositionInstructions(mode)
    : `Generate sub-questions that cover different aspects:
1. Technical/implementation details
2. Real-world usage and case studies
3. Best practices and patterns
4. Recent developments and trends`;

  const prompt = `Decompose this research topic into exactly ${maxCount} focused sub-questions for parallel search.

Topic: "${topic}"

${modeInstructions}

RULES:
- Each sub-question must be a COMPLETE, standalone search query (not keywords appended to the topic)
- Sub-questions must be NON-OVERLAPPING — each covers a distinct aspect
- Include dependency info: if a sub-question needs results from another to be useful, mark it
- Be specific and targeted — vague queries waste search budget

Return ONLY a JSON array:
[
  {
    "query": "complete search query string",
    "focus": "what this sub-question targets (2-5 words)",
    "rationale": "why this angle matters for the research",
    "dependsOn": []
  }
]

Generate exactly ${maxCount} sub-questions.`;

  try {
    const result = await generateText({
      model: claudeFlash(),
      prompt,
    });

    const parsed = JSON.parse(stripMarkdownCodeBlock(result.text)) as SubQuestion[];

    if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > maxCount + 1) {
      throw new Error(`Invalid sub-question count: ${parsed.length}, expected 2-${maxCount}`);
    }

    // Validate each sub-question has required fields
    for (const sq of parsed) {
      if (!sq.query || !sq.focus) {
        throw new Error("Sub-question missing required fields");
      }
      if (!sq.dependsOn) sq.dependsOn = [];
      if (!sq.rationale) sq.rationale = "";
    }

    
    return parsed.slice(0, maxCount);
  } catch (error) {
    console.warn(
      `[decomposeIntoSubQuestions] LLM decomposition failed: ${error instanceof Error ? error.message : String(error)}`
    );
    

    // Fall back to static decomposition, wrapping as SubQuestion[]
    const staticDomains = decomposeIntoDomainsStatic(topic, mode);
    return staticDomains.map((domain, i) => ({
      query: domain,
      focus: `Domain ${i + 1}`,
      rationale: "Static fallback",
      dependsOn: [],
    }));
  }
}

/**
 * Build a quick synthesis prompt for fan-out results
 */
function buildFanOutSynthesisPrompt(
  topic: string,
  domainResults: Array<{ domain: string; findings: string }>,
  mode?: ResearchMode
): string {
  const resultsSection = domainResults
    .map(
      (r, i) => `
## Domain ${i + 1}: ${r.domain}
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
1. Identifies key findings across all domains
2. Notes any contradictions or gaps
3. Provides actionable insights
4. Includes source citations in [Title](URL) format

Return a JSON object:
{
  "summary": "A comprehensive 300-500 word summary",
  "keyFindings": ["finding1", "finding2", ...],
  "gaps": ["gap1", "gap2", ...],
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}`;
}

/**
 * Update the deep research loading card with a new steps list.
 *
 * Small helper to avoid repeating the query+update pattern in executeParallelFanOut.
 */
async function updateFanOutLoadingCard(
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
 * Execute Parallel Fan-Out Strategy (Internal Helper)
 *
 * Core implementation that can be called directly from other actions.
 * Use this instead of ctx.runAction for internal calls.
 *
 * @param ctx - Convex action context
 * @param conversationId - Optional conversation to post results to
 * @param topic - Research topic
 * @param enableFollowUp - Whether to do a follow-up pass for gaps (default: true)
 */
export async function executeParallelFanOut(
  ctx: ActionCtx,
  conversationId: Id<"conversations"> | undefined,
  topic: string,
  enableFollowUp: boolean = true,
  mode?: ResearchMode
): Promise<ParallelFanOutResult> {
  const startTime = Date.now();
  

  // Step 1: Create conversation if needed
  const effectiveConversationId =
    conversationId ??
    (await ctx.runMutation(api.conversations.mutations.create, {
      title: `Quick Research: ${topic}`,
    }));

  // Step 2: Create session
  const sessionId = await ctx.runMutation(
    api.research.mutations.createDeepResearchSession,
    {
      conversationId: effectiveConversationId,
      topic,
      maxIterations: 1, // Fan-out is typically single-pass
      researchMode: mode,
    }
  );

  // Step 3: Post loading card
  await ctx.runMutation(api.chatMessages.mutations.create, {
    conversationId: effectiveConversationId,
    role: "agent" as const,
    content: `Quick research: ${topic}`,
    messageType: "result_card" as const,
    cardData: {
      card_type: "deep_research_loading",
      status: "in_progress",
      session_id: sessionId,
      topic,
    },
  });

  // Step 4: Decompose into sub-questions
  const budget = getSearchBudget(mode);
  const subQuestions = await decomposeIntoSubQuestions(topic, mode, budget.primarySearchCount);
  

  // Step 4b: Show "analyzing query" step now that we know the sub-question count
  await updateFanOutLoadingCard(ctx, effectiveConversationId, sessionId, topic, [
    {
      id: "analyze",
      label: `Analyzing query... Selected parallel fan-out strategy (${subQuestions.length} domains)`,
      status: "completed",
    },
    {
      id: "search",
      label: `Searching ${subQuestions.length} domains in parallel...`,
      status: "in-progress",
    },
  ]);

  // Step 5: Execute all sub-questions in parallel
  const domainSearches = subQuestions.map(async (subQuestion) => {
    const result = await executeParallelSearchWithRetry(
      subQuestion.query,
      {},
      [],
      { maxRetries: budget.maxRetries, timeoutMs: budget.searchTimeoutMs, deduplicateResults: true }
    );
    return { domain: subQuestion.focus, ...result };
  });

  const domainResults = await Promise.all(domainSearches);
  const totalResults = domainResults.reduce(
    (sum, r) => sum + r.structuredResults.length,
    0
  );
  domainResults.reduce((sum, r) => sum + r.durationMs, 0);

  

  // Step 5b: Update card — search done, synthesis starting
  await updateFanOutLoadingCard(ctx, effectiveConversationId, sessionId, topic, [
    {
      id: "analyze",
      label: `Analyzed query — parallel fan-out across ${subQuestions.length} domains`,
      status: "completed",
    },
    {
      id: "search",
      label: `Searched ${totalResults} sources across ${subQuestions.length} domains`,
      status: "completed",
    },
    {
      id: "synthesize",
      label: "Synthesizing findings from all domains...",
      status: "in-progress",
    },
  ]);

  // Step 6: Single-pass synthesis
  const synthesisPrompt = buildFanOutSynthesisPrompt(
    topic,
    domainResults.map((r) => ({ domain: r.domain, findings: r.findings })),
    mode
  );

  const synthesisResult = await generateText({
    model: claudeFlash(),
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

  

  // Step 6b: Update card — synthesis done, optionally show follow-up or save
  const postSynthesisSteps = [
    {
      id: "analyze",
      label: `Analyzed query — parallel fan-out across ${subQuestions.length} domains`,
      status: "completed" as const,
    },
    {
      id: "search",
      label: `Searched ${totalResults} sources across ${subQuestions.length} domains`,
      status: "completed" as const,
    },
    {
      id: "synthesize",
      label: `Synthesized findings — confidence: ${synthesis.confidence}`,
      status: "completed" as const,
    },
  ];

  // Step 7: Optional follow-up for gaps (mini iterative research iteration)
  if (enableFollowUp && synthesis.gaps.length > 0 && synthesis.confidence !== "HIGH") {
    

    await updateFanOutLoadingCard(ctx, effectiveConversationId, sessionId, topic, [
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
    

    postSynthesisSteps.push({
      id: "followup",
      label: `Filled ${synthesis.gaps.length} gap${synthesis.gaps.length === 1 ? "" : "s"} with ${followUpResult.structuredResults.length} additional sources`,
      status: "completed" as const,
    });
  }

  // Show "saving" step before persisting results
  await updateFanOutLoadingCard(ctx, effectiveConversationId, sessionId, topic, [
    ...postSynthesisSteps,
    {
      id: "save",
      label: "Saving to knowledge base...",
      status: "in-progress",
    },
  ]);

  // Step 8: Create iteration record
  const summary = synthesis.keyFindings.length > 0
    ? synthesis.keyFindings[0].slice(0, 50) // Use first key finding as summary
    : `Fan-out search across ${subQuestions.length} domains`;

  await ctx.runMutation(api.research.mutations.createDeepResearchIteration, {
    sessionId,
    iterationNumber: 1,
    coverageScore: synthesis.confidence === "HIGH" ? 4 : synthesis.confidence === "MEDIUM" ? 3 : 2,
    feedback: `Fan-out research completed with ${totalResults} sources`,
    findings: synthesis.summary,
    refinedQueries: synthesis.gaps,
    status: "completed",
    summary,
  });

  // Step 9: Complete session (triggers document creation and result card posting)
  await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
    sessionId,
    status: "completed",
  });

  const totalTime = Date.now() - startTime;

  console.log(
    `[executeParallelFanOut] Exit - completed in ${totalTime}ms (document creation and result card posting scheduled)`
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
 * Run Parallel Fan-Out Strategy
 *
 * Fast-path research strategy for simpler queries.
 * Executes 4 domain-specific searches in parallel, then synthesizes.
 *
 * @param conversationId - Optional conversation to post results to
 * @param topic - Research topic
 * @param enableFollowUp - Whether to do a follow-up pass for gaps (default: true)
 */
export const runParallelFanOut = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    topic: v.string(),
    enableFollowUp: v.optional(v.boolean()),
    researchMode: v.optional(v.string()),
  },
  handler: async (ctx, { conversationId, topic, enableFollowUp = true, researchMode }): Promise<ParallelFanOutResult> => {
    return executeParallelFanOut(ctx, conversationId, topic, enableFollowUp, researchMode as ResearchMode | undefined);
  },
});
