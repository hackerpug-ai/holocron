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
import { openai } from "@ai-sdk/openai";
import {
  executeParallelSearchWithRetry,
  type ParallelSearchResult,
} from "./search";
import { buildSynthesisPrompt, type ResearchContext } from "./prompts";
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
 * Domain decomposition for parallel research
 *
 * Splits a topic into 4 specialized domain queries:
 * 1. Technical/Implementation
 * 2. Academic/Research
 * 3. Industry/Practical
 * 4. Emerging/Trends
 */
export function decomposeIntoDomains(topic: string): string[] {
  const words = topic.toLowerCase();

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
 * Build a quick synthesis prompt for fan-out results
 */
function buildFanOutSynthesisPrompt(
  topic: string,
  domainResults: Array<{ domain: string; findings: string }>
): string {
  const resultsSection = domainResults
    .map(
      (r, i) => `
## Domain ${i + 1}: ${r.domain}
${r.findings}
`
    )
    .join("\n");

  return `Synthesize the following parallel research results into a comprehensive response.

Topic: ${topic}

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
  enableFollowUp: boolean = true
): Promise<ParallelFanOutResult> {
  const startTime = Date.now();
  console.log(
    `[executeParallelFanOut] Entry - topic: "${topic}", enableFollowUp: ${enableFollowUp}`
  );

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

  // Step 4: Decompose into domains
  const domains = decomposeIntoDomains(topic);
  console.log(
    `[executeParallelFanOut] Decomposed into ${domains.length} domains`
  );

  // Step 5: Execute all domains in parallel
  console.log(`[executeParallelFanOut] Executing parallel domain searches`);
  const domainSearches = domains.map(async (domain) => {
    const result = await executeParallelSearchWithRetry(
      domain,
      {},
      [],
      { maxRetries: 1, timeoutMs: 10000, deduplicateResults: true }
    );
    return { domain, ...result };
  });

  const domainResults = await Promise.all(domainSearches);
  const totalResults = domainResults.reduce(
    (sum, r) => sum + r.structuredResults.length,
    0
  );
  const totalDuration = domainResults.reduce((sum, r) => sum + r.durationMs, 0);

  console.log(
    `[executeParallelFanOut] All domain searches complete - ${totalResults} results in ${totalDuration}ms`
  );

  // Step 6: Single-pass synthesis
  console.log(`[executeParallelFanOut] Running synthesis`);
  const synthesisPrompt = buildFanOutSynthesisPrompt(
    topic,
    domainResults.map((r) => ({ domain: r.domain, findings: r.findings }))
  );

  const synthesisResult = await generateText({
    model: openai("gpt-5"),
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
    synthesis = JSON.parse(synthesisResult.text);
  } catch {
    synthesis = {
      summary: synthesisResult.text,
      keyFindings: [],
      gaps: [],
      confidence: "MEDIUM",
    };
  }

  console.log(
    `[executeParallelFanOut] Synthesis complete - confidence: ${synthesis.confidence}, gaps: ${synthesis.gaps.length}`
  );

  // Step 7: Optional follow-up for gaps (mini iterative research iteration)
  if (enableFollowUp && synthesis.gaps.length > 0 && synthesis.confidence !== "HIGH") {
    console.log(
      `[executeParallelFanOut] Running follow-up for ${synthesis.gaps.length} gaps`
    );

    const followUpResult = await executeParallelSearchWithRetry(
      topic,
      {},
      synthesis.gaps.slice(0, 2), // Focus on top 2 gaps
      { maxRetries: 2, timeoutMs: 15000, deduplicateResults: true }
    );

    // Append follow-up findings to synthesis
    synthesis.summary += `\n\n## Additional Findings\n${followUpResult.findings}`;
    console.log(
      `[executeParallelFanOut] Follow-up complete - ${followUpResult.structuredResults.length} additional results`
    );
  }

  // Step 8: Create iteration record
  await ctx.runMutation(api.research.mutations.createDeepResearchIteration, {
    sessionId,
    iterationNumber: 1,
    coverageScore: synthesis.confidence === "HIGH" ? 4 : synthesis.confidence === "MEDIUM" ? 3 : 2,
    feedback: `Fan-out research completed with ${totalResults} sources`,
    findings: synthesis.summary,
    refinedQueries: synthesis.gaps,
    status: "completed",
  });

  // Step 9: Complete session
  await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
    sessionId,
    status: "completed",
  });

  // Step 10: Post result card
  const totalTime = Date.now() - startTime;
  await ctx.runMutation(api.chatMessages.mutations.create, {
    conversationId: effectiveConversationId,
    role: "agent" as const,
    content: synthesis.summary,
    messageType: "result_card" as const,
    cardData: {
      card_type: "deep_research_result",
      session_id: sessionId,
      coverage_score: synthesis.confidence === "HIGH" ? 4 : synthesis.confidence === "MEDIUM" ? 3 : 2,
      iterations_completed: 1,
      key_findings: synthesis.keyFindings,
      gaps: synthesis.gaps,
      duration_ms: totalTime,
    },
  });

  console.log(
    `[executeParallelFanOut] Exit - completed in ${totalTime}ms`
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
  },
  handler: async (ctx, { conversationId, topic, enableFollowUp = true }): Promise<ParallelFanOutResult> => {
    return executeParallelFanOut(ctx, conversationId, topic, enableFollowUp);
  },
});
