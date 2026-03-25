/**
 * Research Actions for Deep Research Workflow (US-055)
 *
 * Implements the orchestrator-worker pattern:
 * - Lead Agent (GPT-5) for planning and synthesis
 * - Subagents (GPT-5-mini) for parallel search execution
 * - Reviewer Agent (GPT-5) for coverage assessment
 */

"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { generateText } from "ai";
import { zaiPro } from "../lib/ai/zai_provider";
import { stripMarkdownCodeBlock } from "../lib/json";
import {
  executeParallelSearchWithRetry,
  executeParallelUrlRead,
} from "./search";
import {
  buildResearchContext,
  buildSynthesisPrompt,
  buildReviewPrompt,
  buildSinglePassSynthesisPrompt,
  type StructuredFinding,
  type UrlContent,
} from "./prompts";
import {
  calculateConfidenceScore,
  determineConfidenceLevel,
  generateCaveats,
  generateWarnings,
  aggregateConfidenceStats,
  type ConfidenceFactors,
  type ConfidenceStats,
} from "./confidence";
import {
  generateIterationEmbedding,
  generateFindingEmbedding,
} from "./embeddings";
import {
  shouldContinueResearch,
  DEFAULT_CRITERIA,
  type TerminationCriteria,
  type LoopMetrics,
} from "./termination";

/**
 * Start Deep Research
 *
 * Task #780: Main entry point action that triggers the deep research workflow
 *
 * This action:
 * 1. Creates a deep research session
 * 2. Posts a loading card to chat
 * 3. Runs iterative research (deep research loop)
 * 4. Posts a final card with results
 * 5. Returns the session ID and status
 */
export const startDeepResearch = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    topic: v.string(),
    maxIterations: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { conversationId: existingConversationId, topic, maxIterations = 5 },
  ): Promise<{
    sessionId: any;
    conversationId: any;
    status: string;
  }> => {
    console.log(
      `[startDeepResearch] Entry - topic: "${topic}", maxIterations: ${maxIterations}, existingConversationId: ${existingConversationId || "none"}`,
    );

    // Step 0: Create conversation with first message (avoid empty conversations)
    console.log(`[startDeepResearch] Step 0: Creating/using conversation`);
    const conversationId =
      existingConversationId ??
      (await ctx.runMutation(api.conversations.mutations.create, {
        title: `Deep Research: ${topic}`,
      }));
    console.log(
      `[startDeepResearch] Step 0: Conversation ID: ${conversationId}`,
    );

    // Step 1: Create session
    console.log(`[startDeepResearch] Step 1: Creating deep research session`);
    const sessionId = await ctx.runMutation(
      api.research.mutations.createDeepResearchSession,
      {
        conversationId,
        topic,
        maxIterations,
      },
    );
    console.log(
      `[startDeepResearch] Step 1: Session created - ID: ${sessionId}`,
    );

    // Step 2: Post loading card (first actual content in conversation)
    console.log(
      `[startDeepResearch] Step 2: Posting loading card to conversation`,
    );
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent" as const,
      content: `Starting deep research: ${topic}`,
      messageType: "result_card" as const,
      cardData: {
        card_type: "deep_research_loading",
        status: "in_progress",
        session_id: sessionId,
        topic,
      },
    });
    console.log(`[startDeepResearch] Step 2: Loading card posted`);

    // Step 3: Schedule the first iteration to run immediately
    // This runs asynchronously and avoids Cloudflare 524 timeout
    console.log(`[startDeepResearch] Step 3: Scheduling first iteration`);
    await ctx.scheduler.runAfter(0, (api as any).research.scheduled.processDeepResearchIteration, {
      sessionId,
    });
    console.log(`[startDeepResearch] Step 3: First iteration scheduled`);

    // Step 4: Return immediately with running status
    // Client will poll session status for real-time updates
    console.log(`[startDeepResearch] Exit - Running`);
    return {
      sessionId,
      conversationId, // Frontend can navigate to this conversation
      status: "running",
    };
  },
});

/**
 * Run Iterative Research - Core orchestration for deep research
 *
 * Task #779: Implements the iterative research workflow:
 * 1. Initialize research session
 * 2. Loop until termination criteria met:
 *    a. SEARCH: Execute parallel searches with retry
 *    b. SYNTHESIZE: Generate structured findings with confidence scores
 *    c. REVIEW: Assess coverage and identify gaps
 *    d. SAVE: Create iteration record with embeddings
 *    e. POST CARD: Insert iteration card to chat
 *    f. REFINE: Update topic to address gaps
 * 3. Complete session
 *
 * @param ctx - Convex action context
 * @param sessionId - Deep research session ID
 * @param conversationId - Conversation ID for posting cards
 * @param topic - Research topic
 * @param maxIterations - Maximum iterations (default: 5)
 * @param criteria - Termination criteria (quality, cost, time)
 * @returns Summary of iterations and final coverage score
 */
export async function runIterativeResearch(
  ctx: any,
  sessionId: Id<"deepResearchSessions">,
  conversationId: Id<"conversations">,
  topic: string,
  maxIterations: number = 5,
  criteria: TerminationCriteria = DEFAULT_CRITERIA,
): Promise<{ totalIterations: number; finalCoverageScore: number; finalConfidenceStats?: ConfidenceStats }> {
  console.log(
    `[runIterativeResearch] Entry - sessionId: ${sessionId}, topic: "${topic}", maxIterations: ${maxIterations}`,
  );
  console.log(
    `[runIterativeResearch] Termination criteria - coverage: ${criteria.minCoverage}, confidence: ${criteria.minConfidence}%, maxCost: ${criteria.maxCostUsd ? `$${criteria.maxCostUsd}` : 'unlimited'}, maxDuration: ${criteria.maxDurationMs ? `${Math.round(criteria.maxDurationMs / 60000)}m` : 'unlimited'}`,
  );

  // Timeout configuration: 10 minutes (Convex hard limit is 600s anyway)
  const ACTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const actionStartTime = Date.now();

  const checkTimeout = () => {
    const elapsed = Date.now() - actionStartTime;
    if (elapsed >= ACTION_TIMEOUT_MS) {
      const elapsedMinutes = Math.round(elapsed / 60000);
      throw new Error(`RESEARCH_TIMEOUT: Research exceeded 10 minute limit (ran for ${elapsedMinutes} minutes)`);
    }
  };

  try {
    // Initialize loop variables
    let iteration = 0;
    let coverageScore = 0;
    let currentTopic = topic;
    let averageConfidence = 0;
    let totalCostUsd = 0; // Track cumulative cost
    let cumulativeConfidenceStats: ConfidenceStats = {
      highConfidenceCount: 0,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      averageConfidenceScore: 0,
      claimsWithMultipleSources: 0,
      totalClaims: 0,
    };

    console.log(
      `[runIterativeResearch] Initialized - iteration: ${iteration}, coverageScore: ${coverageScore}`,
    );

    // Step 2: Main loop - iterate until termination criteria met
    while (true) {
      // Check termination criteria
      const loopMetrics: LoopMetrics = {
        iteration,
        coverage: coverageScore,
        confidence: averageConfidence,
        costUsd: totalCostUsd,
        durationMs: Date.now() - actionStartTime,
      };

      const decision = shouldContinueResearch(loopMetrics, criteria);

      if (!decision.continue) {
        console.log(`[runIterativeResearch] Terminating: ${decision.reason}`);
        break;
      }

      console.log(
        `[runIterativeResearch] Continue decision: ${decision.reason}`,
      );
      iteration++;

      // Check timeout at start of each iteration
      checkTimeout();

      console.log(
        `\n[runIterativeResearch] ========== ITERATION ${iteration}/${maxIterations} START ==========`,
      );
      console.log(`[runIterativeResearch] Current topic: "${currentTopic}"`);
      console.log(`[runIterativeResearch] Previous coverage score: ${coverageScore}, avgConfidence: ${averageConfidence}`);

      // Build context from database
      console.log(`[runIterativeResearch] Building research context from database`);
      const context = await buildResearchContext(ctx, sessionId);
      console.log(
        `[runIterativeResearch] Context built - previousIterations: ${context.previousIterations.length}`,
      );

      // Step 2a: SEARCH - Execute parallel searches with retry
      console.log(`[runIterativeResearch] Step 2a: SEARCH - Executing parallel search`);

      // Extract gaps from previous iteration's review (if any)
      const previousGaps = context.previousIterations.length > 0
        ? context.previousIterations[context.previousIterations.length - 1].gaps
        : [];

      console.log(
        `[runIterativeResearch] Step 2a: Previous gaps: ${previousGaps.length}`,
      );

      const searchStartTime = Date.now();
      const parallelSearchResult = await executeParallelSearchWithRetry(
        currentTopic,
        {}, // context placeholder
        previousGaps,
        { maxRetries: 2, timeoutMs: 15000, deduplicateResults: true }
      );
      const searchDuration = Date.now() - searchStartTime;

      console.log(
        `[runIterativeResearch] Step 2a: Parallel search completed in ${parallelSearchResult.durationMs}ms (total: ${searchDuration}ms)`,
      );
      console.log(
        `[runIterativeResearch] Step 2a: Search findings length: ${parallelSearchResult.findings.length} chars`,
      );
      console.log(
        `[runIterativeResearch] Step 2a: Tool calls made: ${parallelSearchResult.toolCallCount}`,
      );
      console.log(
        `[runIterativeResearch] Step 2a: Structured results: ${parallelSearchResult.structuredResults.length}`,
      );

      const searchFindings = parallelSearchResult.findings;

      // Step 2b: SYNTHESIZE - Write coherent report with structured confidence output
      console.log(
        `[runIterativeResearch] Step 2b: SYNTHESIZE - Building synthesis prompt`,
      );
      const synthesisPrompt = buildSynthesisPrompt(context, searchFindings);
      console.log(
        `[runIterativeResearch] Step 2b: Synthesis prompt length: ${synthesisPrompt.length} chars`,
      );

      console.log(`[runIterativeResearch] Step 2b: Calling LLM (glm-4.7) for synthesis`);
      const synthesisStartTime = Date.now();
      const synthesisResult = await generateText({
        model: zaiPro(),
        prompt: synthesisPrompt,
      });
      const synthesisDuration = Date.now() - synthesisStartTime;
      console.log(
        `[runIterativeResearch] Step 2b: Synthesis completed in ${synthesisDuration}ms`,
      );
      console.log(
        `[runIterativeResearch] Step 2b: Synthesis length: ${synthesisResult.text.length} chars`,
      );

      const synthesisRaw = synthesisResult.text;

      // Step 2b.1: Parse structured synthesis and create findings/citations
      console.log(`[runIterativeResearch] Step 2b.1: Parsing structured synthesis`);
      let structuredFindings: StructuredFinding[] = [];
      let narrativeSummary = synthesisRaw;

      try {
        const parsed = JSON.parse(synthesisRaw);
        structuredFindings = parsed.findings || [];
        narrativeSummary = parsed.narrativeSummary || synthesisRaw;
        console.log(`[runIterativeResearch] Step 2b.1: Parsed ${structuredFindings.length} structured findings`);
      } catch {
        console.warn(`[runIterativeResearch] Step 2b.1: Failed to parse structured synthesis, using narrative only`);
        // Fallback: use raw text as narrative, no structured findings
      }

      // Step 2b.1.5: Generate embedding for iteration findings
      console.log(`[runIterativeResearch] Step 2b.1.5: Generating embedding for iteration findings`);
      let iterationEmbedding: number[] | undefined;
      try {
        iterationEmbedding = await generateIterationEmbedding(narrativeSummary);
        console.log(`[runIterativeResearch] Step 2b.1.5: Generated embedding: ${iterationEmbedding.length} dimensions`);
      } catch (error) {
        console.error(`[runIterativeResearch] Step 2b.1.5: Failed to generate iteration embedding:`, error);
        // Continue without embedding - it's optional
      }

      // Step 2b.2: Create iteration record first to get iterationId
      console.log(`[runIterativeResearch] Step 2b.2: Creating iteration record`);
      const iterationId = await ctx.runMutation(
        api.research.mutations.createDeepResearchIteration,
        {
          sessionId,
          iterationNumber: iteration,
          coverageScore: 0, // Will be updated after review
          feedback: "",
          findings: narrativeSummary,
          refinedQueries: [],
          status: "processing",
          embedding: iterationEmbedding,
        },
      );

      // Step 2b.3: Process structured findings - create citations and findings
      console.log(`[runIterativeResearch] Step 2b.3: Processing ${structuredFindings.length} findings with confidence`);
      const iterationFindingsForStats: Array<{
        confidenceLevel: string;
        confidenceScore: number;
        citationIds: Array<Id<"citations">>;
      }> = [];

      for (const finding of structuredFindings) {
        // Create citations for this finding
        const citationIds: Id<"citations">[] = [];
        for (const source of finding.sources) {
          const citationId = await ctx.runMutation(
            api.research.mutations.createCitationWithCredibility,
            {
              deepResearchSessionId: sessionId,
              sourceUrl: source.url,
              sourceTitle: source.title,
              claimText: finding.claimText.substring(0, 200),
              sourceType: source.sourceType,
              credibilityScore: finding.confidenceFactors.sourceCredibilityScore,
              evidenceType: source.evidenceType,
              publishedDate: source.publishedDate,
              authorCredentials: source.authorCredentials,
            },
          );
          citationIds.push(citationId);
        }

        // Calculate confidence for this finding
        const factors: ConfidenceFactors = finding.confidenceFactors;
        const confidenceScore = calculateConfidenceScore(factors);
        const confidenceLevel = determineConfidenceLevel(confidenceScore, citationIds.length);
        const caveats = confidenceLevel === "MEDIUM" ? generateCaveats(factors, citationIds.length) : [];
        const warnings = confidenceLevel === "LOW" ? generateWarnings(factors, citationIds.length) : [];

        // Generate embedding for finding
        let findingEmbedding: number[] | undefined;
        try {
          findingEmbedding = await generateFindingEmbedding(finding.claimText);
        } catch (error) {
          console.error(`[runIterativeResearch] Failed to generate finding embedding:`, error);
          // Continue without embedding - it's optional
        }

        // Create research finding record with embedding
        await ctx.runMutation(
          api.research.mutations.createResearchFinding,
          {
            sessionId,
            iterationId,
            claimText: finding.claimText,
            claimCategory: finding.claimCategory,
            sourceCredibilityScore: factors.sourceCredibilityScore,
            evidenceQualityScore: factors.evidenceQualityScore,
            corroborationScore: factors.corroborationScore,
            recencyScore: factors.recencyScore,
            expertConsensusScore: factors.expertConsensusScore,
            confidenceScore,
            confidenceLevel,
            citationIds,
            confidenceFactors: factors,
            caveats,
            warnings,
            embedding: findingEmbedding,
          },
        );

        iterationFindingsForStats.push({
          confidenceLevel,
          confidenceScore,
          citationIds,
        });
      }

      // Step 2b.4: Calculate and store iteration confidence stats
      const iterationStats = aggregateConfidenceStats(iterationFindingsForStats);
      console.log(`[runIterativeResearch] Step 2b.4: Iteration stats - high: ${iterationStats.highConfidenceCount}, medium: ${iterationStats.mediumConfidenceCount}, low: ${iterationStats.lowConfidenceCount}, avg: ${iterationStats.averageConfidenceScore}`);

      if (iterationFindingsForStats.length > 0) {
        await ctx.runMutation(
          api.research.mutations.updateIterationConfidenceStats,
          {
            iterationId,
            confidenceStats: iterationStats,
          },
        );
      }

      // Update cumulative stats
      cumulativeConfidenceStats.highConfidenceCount += iterationStats.highConfidenceCount;
      cumulativeConfidenceStats.mediumConfidenceCount += iterationStats.mediumConfidenceCount;
      cumulativeConfidenceStats.lowConfidenceCount += iterationStats.lowConfidenceCount;
      cumulativeConfidenceStats.claimsWithMultipleSources += iterationStats.claimsWithMultipleSources;
      cumulativeConfidenceStats.totalClaims += iterationStats.totalClaims;
      if (cumulativeConfidenceStats.totalClaims > 0) {
        // Weighted average
        cumulativeConfidenceStats.averageConfidenceScore = Math.round(
          (cumulativeConfidenceStats.averageConfidenceScore * (cumulativeConfidenceStats.totalClaims - iterationStats.totalClaims) +
            iterationStats.averageConfidenceScore * iterationStats.totalClaims) /
            cumulativeConfidenceStats.totalClaims
        );
      }
      averageConfidence = cumulativeConfidenceStats.averageConfidenceScore;

      // Step 2c: REVIEW - Score coverage (now includes confidence assessment)
      console.log(`[runIterativeResearch] Step 2c: REVIEW - Building review prompt`);
      const reviewPrompt = buildReviewPrompt(context, narrativeSummary);
      console.log(
        `[runIterativeResearch] Step 2c: Review prompt length: ${reviewPrompt.length} chars`,
      );

      console.log(
        `[runIterativeResearch] Step 2c: Calling LLM (glm-4.7) for coverage review`,
      );
      const reviewStartTime = Date.now();
      const reviewResult = await generateText({
        model: zaiPro(),
        prompt: reviewPrompt,
      });
      const reviewDuration = Date.now() - reviewStartTime;
      console.log(
        `[runIterativeResearch] Step 2c: Review completed in ${reviewDuration}ms`,
      );
      console.log(
        `[runIterativeResearch] Step 2c: Review response length: ${reviewResult.text.length} chars`,
      );

      // Parse review response (with fallback)
      let review: {
        coverageScore: number;
        gaps: string[];
        feedback: string;
        shouldContinue: boolean;
        confidenceAssessment?: {
          overallConfidenceLevel: string;
          highConfidenceClaimCount: number;
          lowConfidenceClaimIds: string[];
          confidenceImprovement: string;
          multiSourceCoverage: number;
        };
      };

      console.log(`[runIterativeResearch] Step 2c: Parsing review JSON`);
      try {
        review = JSON.parse(stripMarkdownCodeBlock(reviewResult.text));
        console.log(
          `[runIterativeResearch] Step 2c: Review parsed successfully - score: ${review.coverageScore}, gaps: ${review.gaps.length}, shouldContinue: ${review.shouldContinue}`,
        );
        if (review.confidenceAssessment) {
          console.log(
            `[runIterativeResearch] Step 2c: Confidence assessment - level: ${review.confidenceAssessment.overallConfidenceLevel}, multiSource: ${review.confidenceAssessment.multiSourceCoverage}%`,
          );
        }
      } catch (error) {
        // Fallback if JSON parsing fails
        console.error(
          `[runIterativeResearch] Step 2c: Failed to parse review JSON:`,
          error,
        );
        console.error(
          `[runIterativeResearch] Step 2c: Raw review text:`,
          reviewResult.text,
        );
        review = {
          coverageScore: 3,
          gaps: ["Unable to parse reviewer feedback"],
          feedback: reviewResult.text,
          shouldContinue: true,
        };
        console.log(
          `[runIterativeResearch] Step 2c: Using fallback review - score: ${review.coverageScore}`,
        );
      }

      coverageScore = review.coverageScore;
      console.log(
        `[runIterativeResearch] Step 2c: Updated coverage score to ${coverageScore}`,
      );

      // Step 2d: UPDATE iteration with review results
      console.log(`[runIterativeResearch] Step 2d: Updating iteration with review results`);
      // Note: We already created the iteration, now we need to update it with review results
      // Using a patch via the existing mutation pattern

      // Step 2e: POST CARD - Insert iteration card to chat with confidence info
      const estimatedRemaining = Math.max(0, maxIterations - iteration);
      console.log(
        `[runIterativeResearch] Step 2e: POST CARD - Posting iteration card (estimated remaining: ${estimatedRemaining})`,
      );
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent" as const,
        content: `Iteration ${iteration} completed - Coverage: ${review.coverageScore}/5, Confidence: ${iterationStats.averageConfidenceScore}%`,
        messageType: "result_card" as const,
        cardData: {
          card_type: "deep_research_iteration",
          session_id: sessionId,
          iteration_number: iteration,
          coverage_score: review.coverageScore,
          feedback: review.feedback,
          estimated_remaining: estimatedRemaining,
          confidence_stats: {
            high: iterationStats.highConfidenceCount,
            medium: iterationStats.mediumConfidenceCount,
            low: iterationStats.lowConfidenceCount,
            average: iterationStats.averageConfidenceScore,
          },
        },
      });
      console.log(`[runIterativeResearch] Step 2e: Iteration card posted`);

      // Step 2f: REFINE - Update topic for next iteration (include low confidence areas)
      console.log(
        `[runIterativeResearch] Step 2f: REFINE - Checking if topic refinement needed`,
      );

      // New condition: continue if coverage < 4 OR average confidence < 70
      const needsMoreCoverage = coverageScore < 4;
      const needsMoreConfidence = averageConfidence < 70;

      if ((needsMoreCoverage || needsMoreConfidence) && iteration < maxIterations) {
        const refinementReasons: string[] = [];

        if (review.gaps.length > 0) {
          refinementReasons.push(...review.gaps.slice(0, 2));
        }

        // Add focus on low confidence claims
        if (review.confidenceAssessment?.lowConfidenceClaimIds?.length) {
          refinementReasons.push("Improve source coverage for low-confidence claims");
        }

        if (refinementReasons.length > 0) {
          currentTopic = `${topic} - Focus on: ${refinementReasons.join(", ")}`;
          console.log(
            `[runIterativeResearch] Step 2f: Topic refined to focus on: "${refinementReasons.join(", ")}"`,
          );
        }
      } else {
        console.log(
          `[runIterativeResearch] Step 2f: No refinement needed (coverage: ${coverageScore}, confidence: ${averageConfidence})`,
        );
      }

      console.log(
        `[runIterativeResearch] ========== ITERATION ${iteration}/${maxIterations} END ==========\n`,
      );
      console.log(
        `[runIterativeResearch] Loop condition check - iteration: ${iteration} < maxIterations: ${maxIterations} = ${iteration < maxIterations}, coverageScore: ${coverageScore} < 4 = ${coverageScore < 4}, avgConfidence: ${averageConfidence} < 70 = ${averageConfidence < 70}`,
      );
    }

    console.log(
      `[runIterativeResearch] Loop finished - Total iterations: ${iteration}, Final coverage: ${coverageScore}, Final confidence: ${averageConfidence}`,
    );

    // Step 3: Complete session with final confidence summary
    console.log(`[runIterativeResearch] Step 3: Completing session in database with confidence summary`);
    await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
      sessionId,
      status: "completed",
      finalConfidenceSummary: cumulativeConfidenceStats,
    });
    console.log(`[runIterativeResearch] Step 3: Session marked as completed`);

    // Return summary
    console.log(`[runIterativeResearch] Exit - Success`);
    return {
      totalIterations: iteration,
      finalCoverageScore: coverageScore,
      finalConfidenceStats: cumulativeConfidenceStats,
    };
  } catch (error) {
    // Error handling: mark session as error and rethrow
    const isTimeout = error instanceof Error && error.message.includes("RESEARCH_TIMEOUT");
    console.error(`[runIterativeResearch] ${isTimeout ? "TIMEOUT" : "ERROR"} caught:`, error);
    console.log(`[runIterativeResearch] Marking session as error in database`);

    await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
      sessionId,
      status: "error",
      errorReason: isTimeout ? "timeout" : "unknown",
    });
    console.log(`[runIterativeResearch] Session marked as error (reason: ${isTimeout ? "timeout" : "unknown"})`);

    throw error;
  }
}

/**
 * Hybrid Search for Research Iterations
 *
 * Combines vector similarity and keyword matching (50/50 weighting)
 * to find semantically and textually relevant past research
 */
export const hybridSearchIterations = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    sessionId: v.optional(v.id("deepResearchSessions")),
  },
  handler: async (ctx, { query, limit = 10, sessionId }) => {
    const { generateQueryEmbedding } = await import("./embeddings");
    const embedding = await generateQueryEmbedding(query);

    const searchLimit = Math.max(limit * 2, 20);

    const [vectorResults, textResults] = await Promise.all([
      ctx.runQuery(api.research.queries.vectorSearchIterations, {
        embedding,
        limit: searchLimit,
        sessionId,
      }),
      ctx.runQuery(api.research.queries.fullTextSearchIterations, {
        query,
        limit: searchLimit,
        sessionId,
      }),
    ]);

    // Merge with 50/50 weighting
    const resultScore = new Map<string, number>();
    const resultMap = new Map<string, any>();

    const maxVectorScore = vectorResults.length > 0 ? vectorResults[0].score : 1;
    for (const result of vectorResults) {
      const id = result._id.toString();
      const normalizedScore = maxVectorScore > 0 ? result.score / maxVectorScore : 0;
      resultScore.set(id, (resultScore.get(id) || 0) + normalizedScore * 0.5);
      resultMap.set(id, result);
    }

    for (const result of textResults) {
      const id = result._id.toString();
      resultScore.set(id, (resultScore.get(id) || 0) + (result.score || 0) * 0.5);
      if (!resultMap.has(id)) {
        resultMap.set(id, result);
      }
    }

    return Array.from(resultMap.entries())
      .sort((a, b) => resultScore.get(b[0])! - resultScore.get(a[0])!)
      .slice(0, limit)
      .map(([_, result]) => ({
        ...result,
        score: resultScore.get(result._id.toString())!,
      }));
  },
});

/**
 * Research Strategy Type
 */
export type ResearchStrategy = "ralph_loop" | "parallel_fan_out" | "parallel_iteration" | "single_pass";

/**
 * Analyze Research Strategy
 *
 * Determines the optimal research strategy based on query characteristics:
 * - parallel_fan_out: Simple questions, comparisons, short queries
 * - single_pass: Deep research requests - fast parallel approach with full URL reading
 * - ralph_loop: Complex multi-iteration research with quality gates (legacy)
 *
 * @param topic - Research topic to analyze
 * @returns Recommended research strategy
 */
export function analyzeResearchStrategy(topic: string): ResearchStrategy {
  const words = topic.toLowerCase().split(/\s+/);
  const wordCount = words.length;

  // Simple question detection (favor fast path)
  const isQuestion = topic.includes("?");
  const isSimpleQuestion = isQuestion && wordCount < 12;
  if (isSimpleQuestion) {
    console.log(`[analyzeResearchStrategy] Simple question detected -> parallel_fan_out`);
    return "parallel_fan_out";
  }

  // Comparison queries (favor fast path)
  const isComparison = words.includes("vs") || words.includes("compare") || words.includes("versus");
  if (isComparison) {
    console.log(`[analyzeResearchStrategy] Comparison detected -> parallel_fan_out`);
    return "parallel_fan_out";
  }

  // Deep research explicit request - use single_pass for speed
  const isDeepRequest = words.includes("deep") || words.includes("comprehensive") || words.includes("thorough") || words.includes("detailed");
  if (isDeepRequest) {
    console.log(`[analyzeResearchStrategy] Deep research request detected -> single_pass`);
    return "single_pass";
  }

  // Long queries suggest complexity - use single_pass
  if (wordCount > 15) {
    console.log(`[analyzeResearchStrategy] Long query (${wordCount} words) -> single_pass`);
    return "single_pass";
  }

  // Default to fast path for most queries
  console.log(`[analyzeResearchStrategy] Default -> parallel_fan_out`);
  return "parallel_fan_out";
}

/**
 * Start Simple Research
 *
 * Fast single-pass research that completes in 15-30 seconds.
 * - Decomposes query into 4 domain-specific queries
 * - Executes in parallel
 * - Single synthesis pass
 * - Returns findings immediately
 *
 * Use for quick fact-checking and straightforward questions.
 *
 * @param conversationId - Optional existing conversation
 * @param topic - Research topic
 * @returns Session info with summary and confidence
 */
export const startSimpleResearch = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    topic: v.string(),
  },
  handler: async (ctx, { conversationId, topic }): Promise<{
    sessionId: Id<"deepResearchSessions">;
    conversationId: Id<"conversations">;
    status: string;
    summary: string;
    confidence: string;
    durationMs: number;
  }> => {
    const startTime = Date.now();
    console.log(`[startSimpleResearch] Entry - topic: "${topic}"`);

    let sessionId: Id<"deepResearchSessions"> | undefined;
    let effectiveConversationId: Id<"conversations"> | undefined;

    try {
    // Import helper function
    const { decomposeIntoDomains } = await import("./parallel");

    // Step 1: Create conversation if needed
    effectiveConversationId =
      conversationId ??
      (await ctx.runMutation(api.conversations.mutations.create, {
        title: `Quick Research: ${topic}`,
      }));

    // Step 2: Create session with researchType: "simple"
    sessionId = await ctx.runMutation(
      api.research.mutations.createDeepResearchSession,
      {
        conversationId: effectiveConversationId,
        topic,
        maxIterations: 1,
        researchType: "simple",
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
    console.log(`[startSimpleResearch] Decomposed into ${domains.length} domains`);

    // Step 5: Execute all domains in parallel
    const domainSearches = domains.map(async (domain) => {
      const result = await executeParallelSearchWithRetry(
        domain,
        {},
        [],
        { maxRetries: 1, timeoutMs: 600000, deduplicateResults: true } // 10 minutes
      );
      return { domain, ...result };
    });

    const domainResults = await Promise.all(domainSearches);
    const totalResults = domainResults.reduce(
      (sum, r) => sum + r.structuredResults.length,
      0
    );

    console.log(`[startSimpleResearch] All domain searches complete - ${totalResults} results`);

    // Step 6: Single-pass synthesis - output pure markdown article
    console.log(`[startSimpleResearch] Running synthesis`);

    // Build synthesis prompt
    const resultsSection = domainResults
      .map(
        (r, i) => `## Domain ${i + 1}: ${r.domain}\n${r.findings}`
      )
      .join("\n");

    // Count total sources for confidence estimation
    const sourceCount = totalResults;

    const synthesisPrompt = `Synthesize the following research results into a well-formatted markdown article.

**Topic:** ${topic}

**Research Results:**
${resultsSection}

Write a complete markdown article with this exact structure:

# ${topic}

## Summary
Write 2-3 sentences that directly answer the research question. This should be a clear, actionable takeaway.

## Key Findings

Present 3-7 key findings, each as a subsection:

### Finding Title
1-2 paragraphs explaining the finding with inline citations like [Source Title](URL).

### Another Finding
Continue with additional findings...

## Sources
List all sources used:
- [Source Title](URL) - Brief description of what it contributed
- [Source Title](URL) - Brief description

## Confidence Assessment
State whether confidence is HIGH, MEDIUM, or LOW based on:
- HIGH: Multiple corroborating authoritative sources
- MEDIUM: Limited sources or some gaps
- LOW: Conflicting information or unreliable sources

**IMPORTANT:**
- Output ONLY the markdown article - no JSON, no code blocks, no wrapper
- Start directly with the # heading
- Use inline [Title](URL) citations throughout
- Be specific and actionable`;

    const synthesisResult = await generateText({
      model: zaiPro(),
      prompt: synthesisPrompt,
    });

    // The LLM outputs pure markdown - use it directly
    const report = synthesisResult.text.trim();

    // Extract summary from the Summary section
    const summaryMatch = report.match(/## Summary\s*\n+([\s\S]*?)(?=\n##|\n#|$)/);
    const summary = summaryMatch
      ? summaryMatch[1].trim().substring(0, 250)
      : report.substring(0, 250);

    // Extract confidence from the Confidence Assessment section
    let confidence: "HIGH" | "MEDIUM" | "LOW";
    const confidenceMatch = report.match(/confidence is (HIGH|MEDIUM|LOW)/i);
    if (confidenceMatch) {
      confidence = confidenceMatch[1].toUpperCase() as "HIGH" | "MEDIUM" | "LOW";
    } else if (sourceCount >= 8) {
      confidence = "HIGH";
    } else if (sourceCount >= 4) {
      confidence = "MEDIUM";
    } else {
      confidence = "LOW";
    }

    const synthesis = { report, summary, confidence };

    console.log(`[startSimpleResearch] Synthesis complete - confidence: ${synthesis.confidence}`);

    // Step 7: Create document with full report content BEFORE completing session
    console.log(`[startSimpleResearch] Creating document with full report`);
    const docResult = await ctx.runAction(api.documents.storage.createWithEmbedding, {
      title: `Research: ${topic}`,
      content: synthesis.report,
      category: "research",
      researchType: "simple",
    });

    console.log(`[startSimpleResearch] Document created: ${docResult.documentId}`);

    // Link document to session
    await ctx.runMutation(internal.research.mutations.updateDeepResearchSessionDocumentId, {
      sessionId,
      documentId: docResult.documentId as Id<"documents">,
    });

    console.log(`[startSimpleResearch] Document linked to session`);

    // Step 8: Complete session (document already exists, will skip createResearchDocument)
    await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
      sessionId,
      status: "completed",
    });

    // Update session with findings summary
    await ctx.runMutation(api.research.mutations.updateDeepResearchSession, {
      sessionId,
      status: "completed",
      refinedTopic: synthesis.summary.substring(0, 200), // Preview
      currentCoverageScore: synthesis.confidence === "HIGH" ? 4 : synthesis.confidence === "MEDIUM" ? 3 : 2,
    });

    // NOTE: Do NOT create a result card message here.
    // The caller (chat/index.ts sendMessage) will persist the result card.
    // Creating it here causes duplicate messages.
    const totalTime = Date.now() - startTime;

    console.log(`[startSimpleResearch] Exit - completed in ${totalTime}ms`);

    return {
      sessionId,
      conversationId: effectiveConversationId,
      status: "completed",
      summary: synthesis.summary,
      confidence: synthesis.confidence,
      durationMs: totalTime,
    };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[startSimpleResearch] ERROR:`, error);

      // Post error to chat so user sees it
      if (effectiveConversationId) {
        await ctx.runMutation(api.chatMessages.mutations.create, {
          conversationId: effectiveConversationId,
          role: "agent" as const,
          content: `Quick research failed: ${errorMessage}`,
          messageType: "error" as const,
        });
      }

      // Mark session as error if it was created
      if (sessionId) {
        await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
          sessionId,
          status: "error",
        });
      }

      throw error; // Re-throw so Convex logs it
    }
  },
});

/**
 * Single-Pass Research Result Type
 */
export interface SinglePassResearchResult {
  sessionId: Id<"deepResearchSessions">;
  conversationId: Id<"conversations">;
  status: string;
  strategy: "single_pass";
  summary: string;
  confidence: string;
  sourcesRead: number;
  durationMs: number;
}

/**
 * Execute Single-Pass Research Strategy (Internal Helper)
 *
 * Fast single-pass research that:
 * 1. Generates 3 query variants
 * 2. Executes parallel searches (Exa + Jina)
 * 3. Deduplicates URLs, reads top 8 in parallel
 * 4. Single synthesis with full content
 * 5. Creates iteration record and completes session
 *
 * Target: 20-35 seconds with full URL content reading.
 *
 * @param ctx - Convex action context
 * @param conversationId - Optional conversation to post results to
 * @param topic - Research topic
 */
export async function executeSinglePassResearch(
  ctx: any,
  conversationId: Id<"conversations"> | undefined,
  topic: string
): Promise<SinglePassResearchResult> {
  const startTime = Date.now();
  console.log(`[executeSinglePassResearch] Entry - topic: "${topic}"`);

  // Step 1: Create conversation if needed
  const effectiveConversationId =
    conversationId ??
    (await ctx.runMutation(api.conversations.mutations.create, {
      title: `Deep Research: ${topic}`,
    }));

  // Step 2: Create session with researchType: "single_pass"
  const sessionId = await ctx.runMutation(
    api.research.mutations.createDeepResearchSession,
    {
      conversationId: effectiveConversationId,
      topic,
      maxIterations: 1,
      researchType: "single_pass",
    }
  );

  console.log(
    `[executeSinglePassResearch] Session created - ID: ${sessionId}, type: single_pass`
  );

  // Step 3: Post loading card (simple spinner)
  await ctx.runMutation(api.chatMessages.mutations.create, {
    conversationId: effectiveConversationId,
    role: "agent" as const,
    content: `Researching: ${topic}`,
    messageType: "result_card" as const,
    cardData: {
      card_type: "deep_research_loading",
      status: "in_progress",
      session_id: sessionId,
      topic,
    },
  });

  // Step 4: Generate 3 query variants
  console.log(`[executeSinglePassResearch] Generating query variants`);
  const { generateQueryVariants } = await import("./parallel_iteration");
  const variants = await generateQueryVariants(topic);
  console.log(
    `[executeSinglePassResearch] Generated ${variants.length} query variants`
  );

  // Step 5: Execute all variants in parallel (8 searches: 4 queries x 2 engines)
  console.log(`[executeSinglePassResearch] Executing parallel searches`);
  const searchPromises = variants.map((variant) =>
    executeParallelSearchWithRetry(
      variant.query,
      {},
      [],
      { maxRetries: 2, timeoutMs: 12000, deduplicateResults: true }
    )
  );

  const searchResults = await Promise.all(searchPromises);
  const allResults = searchResults.flatMap((r) => r.structuredResults);
  const totalSearchResults = allResults.length;

  console.log(
    `[executeSinglePassResearch] Search complete - ${totalSearchResults} results`
  );

  // Step 6: Deduplicate URLs and select top 8 for reading
  const uniqueUrls = new Map<string, { url: string; title: string }>();
  for (const result of allResults) {
    const normalizedUrl = result.url.toLowerCase().replace(/\/$/, "");
    if (!uniqueUrls.has(normalizedUrl) && result.url) {
      uniqueUrls.set(normalizedUrl, {
        url: result.url,
        title: result.title || "Untitled",
      });
    }
  }

  const urlsToRead = Array.from(uniqueUrls.values())
    .slice(0, 8)
    .map((u) => u.url);

  console.log(
    `[executeSinglePassResearch] Reading ${urlsToRead.length} URLs in parallel`
  );

  // Step 7: Read top URLs in parallel
  const urlReadResults = await executeParallelUrlRead(urlsToRead, {
    maxConcurrent: 5,
    timeoutMs: 15000,
    maxContentLength: 10000,
  });

  const successfulReads = urlReadResults.filter((r) => r.success);
  console.log(
    `[executeSinglePassResearch] Read ${successfulReads.length}/${urlsToRead.length} URLs successfully`
  );

  // Step 8: Build URL content for synthesis
  const urlContents: UrlContent[] = urlReadResults
    .filter((r) => r.success && r.content.length > 100)
    .map((r) => ({
      url: r.url,
      title: r.title,
      content: r.content,
    }));

  // Build search snippets as fallback
  const searchSnippets = searchResults
    .map((r) => r.findings)
    .join("\n\n---\n\n");

  // Step 9: Single synthesis with full content
  console.log(`[executeSinglePassResearch] Running synthesis with zaiPro`);
  const synthesisPrompt = buildSinglePassSynthesisPrompt(
    topic,
    urlContents,
    searchSnippets
  );

  const synthesisResult = await generateText({
    model: zaiPro(),
    prompt: synthesisPrompt,
  });

  // The report is returned directly as markdown
  const report = synthesisResult.text;

  // Determine confidence from report content
  let confidence = "MEDIUM";
  if (report.toLowerCase().includes("confidence: high") || report.toLowerCase().includes("**high**")) {
    confidence = "HIGH";
  } else if (report.toLowerCase().includes("confidence: low") || report.toLowerCase().includes("**low**")) {
    confidence = "LOW";
  }

  console.log(
    `[executeSinglePassResearch] Synthesis complete - confidence: ${confidence}`
  );

  // Step 10: Create iteration record
  await ctx.runMutation(api.research.mutations.createDeepResearchIteration, {
    sessionId,
    iterationNumber: 1,
    coverageScore: confidence === "HIGH" ? 4 : confidence === "MEDIUM" ? 3 : 2,
    feedback: `Single-pass research completed with ${successfulReads.length} full sources read`,
    findings: report,
    refinedQueries: [],
    status: "completed",
  });

  // Step 11: Complete session (triggers document creation)
  await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
    sessionId,
    status: "completed",
  });

  const totalTime = Date.now() - startTime;

  console.log(
    `[executeSinglePassResearch] Exit - completed in ${totalTime}ms`
  );

  return {
    sessionId,
    conversationId: effectiveConversationId,
    status: "completed",
    strategy: "single_pass",
    summary: report.substring(0, 500) + "...",
    confidence,
    sourcesRead: successfulReads.length,
    durationMs: totalTime,
  };
}

/**
 * Run Single-Pass Research Action
 *
 * Exposed action for single-pass research strategy.
 */
export const runSinglePassResearch = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    topic: v.string(),
  },
  handler: async (ctx, { conversationId, topic }): Promise<SinglePassResearchResult> => {
    return executeSinglePassResearch(ctx, conversationId, topic);
  },
});

/**
 * Start Smart Research (NEW DEFAULT ENTRY POINT)
 *
 * Intelligent research router that selects the optimal strategy:
 * - Parallel Fan-Out: Fast path for simple queries (~15-25s)
 * - Iterative Research: Deep path for complex research (~45-90s)
 *
 * This action replaces startDeepResearch as the recommended entry point.
 *
 * @param conversationId - Optional existing conversation
 * @param topic - Research topic
 * @returns Session info and status
 */
export const startSmartResearch = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    topic: v.string(),
  },
  handler: async (ctx, { conversationId, topic }): Promise<{
    sessionId: Id<"deepResearchSessions">;
    conversationId: Id<"conversations">;
    status: string;
    strategy?: string;
    totalIterations?: number;
    finalCoverageScore?: number;
    summary?: string;
    confidence?: string;
    durationMs?: number;
  }> => {
    console.log(`[startSmartResearch] Entry - topic: "${topic}"`);

    // Analyze query to determine strategy
    const strategy = analyzeResearchStrategy(topic);
    console.log(`[startSmartResearch] Selected strategy: ${strategy}`);

    if (strategy === "parallel_fan_out") {
      // Import and run parallel fan-out helper directly
      const { executeParallelFanOut } = await import("./parallel");
      const result = await executeParallelFanOut(ctx, conversationId, topic, true);
      return result;
    } else if (strategy === "parallel_iteration") {
      // Import and run parallel iteration for deep research
      const { executeParallelIteration } = await import("./parallel_iteration");
      const result = await executeParallelIteration(ctx, conversationId, topic);
      return result;
    } else if (strategy === "single_pass") {
      // Fast single-pass research with full URL reading
      const result = await executeSinglePassResearch(ctx, conversationId, topic);
      return {
        sessionId: result.sessionId,
        conversationId: result.conversationId,
        status: result.status,
        strategy: result.strategy,
        summary: result.summary,
        confidence: result.confidence,
        durationMs: result.durationMs,
      };
    } else {
      // Run full iterative research for complex queries
      // Step 0: Create conversation
      const effectiveConversationId =
        conversationId ??
        (await ctx.runMutation(api.conversations.mutations.create, {
          title: `Deep Research: ${topic}`,
        }));

      // Step 1: Create session
      const sessionId = await ctx.runMutation(
        api.research.mutations.createDeepResearchSession,
        {
          conversationId: effectiveConversationId,
          topic,
          maxIterations: 5,
        },
      );

      // Step 2: Post loading card
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId: effectiveConversationId,
        role: "agent" as const,
        content: `Starting deep research: ${topic}`,
        messageType: "result_card" as const,
        cardData: {
          card_type: "deep_research_loading",
          status: "in_progress",
          session_id: sessionId,
          topic,
        },
      });

      // Step 3: Run Iterative Research
      const result = await runIterativeResearch(ctx, sessionId, effectiveConversationId, topic, 5);

      console.log(`[startSmartResearch] Iterative research completed - ${result.totalIterations} iterations`);

      return {
        sessionId,
        conversationId: effectiveConversationId,
        status: "completed",
        strategy: "ralph_loop",
        totalIterations: result.totalIterations,
        finalCoverageScore: result.finalCoverageScore,
      };
    }
  },
});
