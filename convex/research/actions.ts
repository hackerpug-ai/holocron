/**
 * Research Actions for Deep Research Workflow (US-055)
 *
 * Implements the orchestrator-worker pattern:
 * - Lead Agent (GPT-5) for planning and synthesis
 * - Subagents (GPT-5-mini) for parallel search execution
 * - Reviewer Agent (GPT-5) for coverage assessment
 */

"use node";

import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { stripMarkdownCodeBlock } from "../lib/json";
import { makeFunctionReference } from "convex/server";

// The scheduled file does not exist yet; reference it explicitly so the scheduler
// call can be wired at runtime without a generated-API type error.
const processDeepResearchIteration = makeFunctionReference<
  "action",
  { sessionId: string },
  null
>("research/scheduled:processDeepResearchIteration");

import {
  executeParallelSearchWithRetry,
  executeParallelUrlRead,
} from "./search";
import {
  buildResearchContext,
  buildSynthesisPrompt,
  buildReviewPrompt,
  buildSinglePassSynthesisPrompt,
  buildGapReasoningPrompt,
  type StructuredFinding,
  type UrlContent,
} from "./prompts";
import { zaiFlash, zaiPro } from "../lib/ai/zai_provider";
import { classifyResearchIntent, type ResearchMode } from "./intent";
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

// import { logEvent, logError } from "../lib/logger"; // Unused imports
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
    

    // Step 0a: Classify research intent
    const intent = await classifyResearchIntent(topic);
    

    // Step 0b: Create conversation with first message (avoid empty conversations)
    const conversationId =
      existingConversationId ??
      (await ctx.runMutation(api.conversations.mutations.create, {
        title: `Deep Research: ${topic}`,
      }));
    

    // Step 1: Create session with research mode
    const sessionId = await ctx.runMutation(
      api.research.mutations.createDeepResearchSession,
      {
        conversationId,
        topic,
        maxIterations,
        researchMode: intent.mode,
      },
    );
    

    // Step 2: Post loading card (first actual content in conversation)
    
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

    // Step 3: Schedule the first iteration to run immediately
    // This runs asynchronously and avoids Cloudflare 524 timeout
    await ctx.scheduler.runAfter(0, processDeepResearchIteration, {
      sessionId,
    });

    // Step 4: Return immediately with running status
    // Client will poll session status for real-time updates
    return {
      sessionId,
      conversationId, // Frontend can navigate to this conversation
      status: "running",
    };
  },
});

/**
 * Start Deep Research with Planning Phase
 *
 * Task #302: Creates a research plan and returns it for user approval.
 *
 * This is the NEW entry point for deep research that includes planning:
 * 1. Generates a research plan using the plan generation service
 * 2. Posts a plan confirmation card to chat
 * 3. Returns the plan ID for user approval
 * 4. After approval, use executeApprovedResearchPlan to start research
 *
 * AC-1: Research request -> Generate plan -> Return plan for approval
 */
export const startDeepResearchWithPlan = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    topic: v.string(),
    maxIterations: v.optional(v.number()),
    outputFormat: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { conversationId: existingConversationId, topic, maxIterations = 5, outputFormat = "document" },
  ): Promise<{
    planId: Id<"executionPlans">;
    conversationId: Id<"conversations">;
    status: string;
  }> => {
    

    // Step 0: Create conversation with first message (avoid empty conversations)
    const conversationId =
      existingConversationId ??
      (await ctx.runMutation(api.conversations.mutations.create, {
        title: `Deep Research: ${topic}`,
      }));
    

    // Step 1: Generate research plan
    const planId = await ctx.runMutation(api.plans.generator.generateDeepResearchPlan, {
      topic,
      maxIterations,
      outputFormat,
      conversationId,
    });
    

    // Step 2: Post plan confirmation card
    
    const plan = await ctx.runQuery(api.plans.queries.get, { id: planId });

    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent" as const,
      content: `Research plan generated for: ${topic}`,
      messageType: "result_card" as const,
      cardData: {
        card_type: "plan_confirmation",
        plan_id: planId,
        plan_title: plan?.content?.title || `Research: ${topic}`,
        plan_description: plan?.content?.description || "",
        plan_type: "deep-research",
        tracks: plan?.content?.tracks || [],
        estimated_steps: plan?.content?.estimatedSteps || 0,
        estimated_duration: plan?.content?.estimatedDurationMs || 0,
        status: "pending",
      },
    });
    

    // Step 3: Return plan ID for approval
    
    return {
      planId,
      conversationId,
      status: "pending_approval",
    };
  },
});

/**
 * Execute Approved Research Plan
 *
 * Task #302: Starts research execution after plan approval.
 *
 * This action:
 * 1. Validates plan is approved
 * 2. Creates deep research session
 * 3. Posts loading card
 * 4. Executes research using the approved plan
 * 5. Updates plan status through execution lifecycle
 *
 * AC-2: Approved plan -> Execute -> Research runs with plan, status updated
 */
export const executeApprovedResearchPlan = action({
  args: {
    planId: v.id("executionPlans"),
  },
  handler: async (
    ctx,
    { planId },
  ): Promise<{
    sessionId: Id<"deepResearchSessions">;
    conversationId: Id<"conversations">;
    status: string;
  }> => {
    

    // Step 1: Fetch and validate plan
    
    const plan = await ctx.runQuery(api.plans.queries.get, { id: planId });

    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    if (plan.status !== "approved") {
      throw new Error(
        `Plan ${planId} is not approved (current status: ${plan.status})`,
      );
    }

    if (!plan.metadata?.conversationId) {
      throw new Error(`Plan ${planId} has no associated conversation`);
    }

    const conversationId = plan.metadata.conversationId as Id<"conversations">;
    const topic = plan.metadata.topic as string;
    

    // Step 2: Update plan status to executing
    
    await ctx.runMutation(api.plans.confirmation.startExecution, { planId });

    // Step 3: Create deep research session
    
    const sessionId = await ctx.runMutation(
      api.research.mutations.createDeepResearchSession,
      {
        conversationId,
        topic,
        maxIterations: plan.content?.maxIterations || 5,
        researchType: "deep",
      },
    );
    

    // Step 4: Post loading card
    
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent" as const,
      content: `Executing research plan: ${topic}`,
      messageType: "result_card" as const,
      cardData: {
        card_type: "deep_research_loading",
        status: "in_progress",
        session_id: sessionId,
        topic,
        plan_id: planId,
      },
    });

    // Step 5: Execute research using plan-based dispatcher
    

    try {
      const result = await ctx.runAction(
        internal.research.dispatcher.executePlanBasedResearch,
        {
          conversationId,
          sessionId,
          plan: plan.content,
          topic,
        },
      );

      // Step 6: Update plan status based on result
      if (result.status === "completed" || result.status === "partial") {
        await ctx.runMutation(api.plans.confirmation.completeExecution, {
          planId,
        });
      } else {
        await ctx.runMutation(api.plans.confirmation.failExecution, {
          planId,
        });
      }

      

      return {
        sessionId,
        conversationId,
        status: result.status,
      };
    } catch (error) {
      // Mark plan as failed on error
      await ctx.runMutation(api.plans.confirmation.failExecution, {
        planId,
      });

      throw error;
    }
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
  ctx: ActionCtx,
  sessionId: Id<"deepResearchSessions">,
  conversationId: Id<"conversations">,
  topic: string,
  maxIterations: number = 5,
  mode?: ResearchMode,
  criteria: TerminationCriteria = DEFAULT_CRITERIA,
): Promise<{ totalIterations: number; finalCoverageScore: number; finalConfidenceStats?: ConfidenceStats }> {
  
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
        
        break;
      }

      
      iteration++;

      // Check timeout at start of each iteration
      checkTimeout();

      
      
      

      // Build context from database
      
      const context = await buildResearchContext(ctx, sessionId);
      

      // Step 2a: SEARCH - Execute parallel searches with retry

      // Extract gaps from previous iteration's review (if any)
      const previousGaps = context.previousIterations.length > 0
        ? context.previousIterations[context.previousIterations.length - 1].gaps
        : [];

      

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
      
      
      

      const searchFindings = parallelSearchResult.findings;

      // Step 2b: SYNTHESIZE - Write coherent report with structured confidence output
      
      const synthesisPrompt = buildSynthesisPrompt(context, searchFindings, mode);
      

      const synthesisStartTime = Date.now();
      const synthesisResult = await generateText({
        model: openai("gpt-5.4"),
        prompt: synthesisPrompt,
      });
      const _synthesisDuration = Date.now() - synthesisStartTime;
      
      

      const synthesisRaw = synthesisResult.text;

      // Step 2b.1: Parse structured synthesis and create findings/citations
      let structuredFindings: StructuredFinding[] = [];
      let narrativeSummary = synthesisRaw;

      try {
        const parsed = JSON.parse(synthesisRaw);
        structuredFindings = parsed.findings || [];
        narrativeSummary = parsed.narrativeSummary || synthesisRaw;
      } catch {
        console.warn(`[runIterativeResearch] Step 2b.1: Failed to parse structured synthesis, using narrative only`);
        // Fallback: use raw text as narrative, no structured findings
      }

      // Step 2b.1.5: Generate embedding for iteration findings
      // CRITICAL: Embedding generation is BLOCKING - if this fails, the iteration fails
      // Research findings without embeddings are broken data (semantic search won't work)
      const iterationEmbedding = await generateIterationEmbedding(narrativeSummary);

      // Step 2b.2: Create iteration record first to get iterationId
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
        // CRITICAL: Embedding generation is BLOCKING - if this fails, the finding creation fails
        // Research findings without embeddings are broken data (semantic search won't work)
        const findingEmbedding = await generateFindingEmbedding(finding.claimText);

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
      const reviewPrompt = buildReviewPrompt(context, narrativeSummary);
      

      console.log(
        `[runIterativeResearch] Step 2c: Calling LLM (glm-4.7) for coverage review`,
      );
      const reviewStartTime = Date.now();
      const reviewResult = await generateText({
        model: openai("gpt-5.4"),
        prompt: reviewPrompt,
      });
      const _reviewDuration = Date.now() - reviewStartTime;
      
      

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

      try {
        review = JSON.parse(stripMarkdownCodeBlock(reviewResult.text));

        if (review.confidenceAssessment) {
          // TODO: Handle confidence assessment
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
        
      }

      coverageScore = review.coverageScore;
      

      // Step 2d: UPDATE iteration with review results
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

      // Step 2f: REFINE - Update topic for next iteration (include low confidence areas)
      

      // New condition: continue if coverage < 4 OR average confidence < 70
      const needsMoreCoverage = coverageScore < 4;
      const needsMoreConfidence = averageConfidence < 70;

      if ((needsMoreCoverage || needsMoreConfidence) && iteration < maxIterations) {
        if (review.gaps.length > 0) {
          // ReAct-style reasoning: explicitly reason about what's missing before
          // choosing the next query, rather than heuristically concatenating gaps.
          const keyFindingTexts = structuredFindings.slice(0, 10).map((f: StructuredFinding) => f.claimText);
          try {
            const reasoningResult = await generateText({
              model: zaiFlash(),
              prompt: buildGapReasoningPrompt(topic, review.gaps, keyFindingTexts, iteration),
            });
            const jsonMatch = reasoningResult.text.match(/\{[\s\S]*\}/);
            const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
            if (parsed.refinedQuery && typeof parsed.refinedQuery === "string") {
              currentTopic = parsed.refinedQuery;
              console.log(
                `[runIterativeResearch] Step 2f: ReAct refined query: "${parsed.refinedQuery}" (thought: "${parsed.thought ?? ""}")`,
              );
            } else {
              // Fallback to heuristic if reasoning produces no usable query
              currentTopic = `${topic} - Focus on: ${review.gaps.slice(0, 2).join(", ")}`;
              console.log(
                `[runIterativeResearch] Step 2f: Fallback topic: "${currentTopic}"`,
              );
            }
          } catch (err) {
            // Reasoning call failed — fall back to heuristic
            currentTopic = `${topic} - Focus on: ${review.gaps.slice(0, 2).join(", ")}`;
            console.warn("[runIterativeResearch] Step 2f: Gap reasoning failed, using heuristic:", err);
          }
        } else if (review.confidenceAssessment?.lowConfidenceClaimIds?.length) {
          currentTopic = `${topic} - Focus on: improving source coverage for low-confidence claims`;
          console.log(`[runIterativeResearch] Step 2f: Targeting low-confidence claims`);
        }
      } else {
        console.log(
          `[runIterativeResearch] Step 2f: No refinement needed (coverage: ${coverageScore}, confidence: ${averageConfidence})`,
        );
      }

      
      
    }

    

    // Step 3: Complete session with final confidence summary
    await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
      sessionId,
      status: "completed",
      finalConfidenceSummary: cumulativeConfidenceStats,
    });

    // Return summary
    return {
      totalIterations: iteration,
      finalCoverageScore: coverageScore,
      finalConfidenceStats: cumulativeConfidenceStats,
    };
  } catch (error) {
    // Error handling: mark session as error and rethrow
    const isTimeout = error instanceof Error && error.message.includes("RESEARCH_TIMEOUT");
    console.error(`[runIterativeResearch] ${isTimeout ? "TIMEOUT" : "ERROR"} caught:`, error);

    await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
      sessionId,
      status: "error",
      errorReason: isTimeout ? "timeout" : "unknown",
    });

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
    
    return "parallel_fan_out";
  }

  // Comparison queries (favor fast path)
  const isComparison = words.includes("vs") || words.includes("compare") || words.includes("versus");
  if (isComparison) {
    
    return "parallel_fan_out";
  }

  // Deep research explicit request - use single_pass for speed
  const isDeepRequest = words.includes("deep") || words.includes("comprehensive") || words.includes("thorough") || words.includes("detailed");
  if (isDeepRequest) {
    
    return "single_pass";
  }

  // Long queries suggest complexity - use single_pass
  if (wordCount > 15) {
    return "single_pass";
  }

  // Default to fast path for most queries
  
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

    // Classify research intent
    const intent = await classifyResearchIntent(topic);
    const mode = intent.mode;
    

    let sessionId: Id<"deepResearchSessions"> | undefined;
    let effectiveConversationId: Id<"conversations"> | undefined;

    try {
    // Import helper function
    const { decomposeIntoDomainsStatic } = await import("./parallel");

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

    // Step 4: Decompose into domains
    const domains = decomposeIntoDomainsStatic(topic, mode);
    

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


    // Step 6: Single-pass synthesis - output pure markdown article

    // Build synthesis prompt
    const resultsSection = domainResults
      .map(
        (r, i) => `## Domain ${i + 1}: ${r.domain}\n${r.findings}`
      )
      .join("\n");

    // Count total sources for confidence estimation
    const sourceCount = totalResults;

    // Import mode-specific synthesis instructions
    const { getSynthesisInstructions: getModeSynthesis } = await import("./mode_prompts");
    const modeGuidance = mode ? `\n${getModeSynthesis(mode)}\n` : "";

    const synthesisPrompt = `Synthesize the following research results into a well-formatted markdown article.

**Topic:** ${topic}
${modeGuidance}
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
      model: openai("gpt-5.4"),
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

    

    // Step 7: Create document with full report content BEFORE completing session
    const docResult = await ctx.runAction(api.documents.storage.createWithEmbedding, {
      title: `Research: ${topic}`,
      content: synthesis.report,
      category: "research",
      researchType: "simple",
    });


    // Link document to session
    await ctx.runMutation(internal.research.mutations.updateDeepResearchSessionDocumentId, {
      sessionId,
      documentId: docResult.documentId as Id<"documents">,
    });

    

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


    return {
      sessionId: sessionId!,
      conversationId: effectiveConversationId!,
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
  ctx: ActionCtx,
  conversationId: Id<"conversations"> | undefined,
  topic: string,
  mode?: ResearchMode
): Promise<SinglePassResearchResult> {
  const startTime = Date.now();

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
      researchMode: mode,
    }
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
  const { generateQueryVariants } = await import("./parallel_iteration");
  const variants = await generateQueryVariants(topic, mode);
  

  // Step 5: Execute all variants in parallel (8 searches: 4 queries x 2 engines)
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
  const _totalSearchResults = allResults.length;

  

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

  

  // Step 7: Read top URLs in parallel
  const urlReadResults = await executeParallelUrlRead(urlsToRead, {
    maxConcurrent: 5,
    timeoutMs: 15000,
    maxContentLength: 10000,
  });

  const successfulReads = urlReadResults.filter((r) => r.success);
  

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
  const synthesisPrompt = buildSinglePassSynthesisPrompt(
    topic,
    urlContents,
    searchSnippets,
    mode
  );

  const synthesisResult = await generateText({
    model: openai("gpt-5.4"),
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

    // Step 1: Classify research intent (determines output style)
    const intent = await classifyResearchIntent(topic);
    const mode = intent.mode;
    

    // Step 2: Select execution strategy (determines how to search)
    const strategy = analyzeResearchStrategy(topic);
    

    if (strategy === "parallel_fan_out") {
      // Import and run parallel fan-out helper directly
      const { executeParallelFanOut } = await import("./parallel");
      const result = await executeParallelFanOut(ctx, conversationId, topic, true, mode);
      return result;
    } else if (strategy === "parallel_iteration") {
      // Import and run parallel iteration for deep research
      const { executeParallelIteration } = await import("./parallel_iteration");
      const result = await executeParallelIteration(ctx, conversationId, topic, true, mode);
      return result;
    } else if (strategy === "single_pass") {
      // Fast single-pass research with full URL reading
      const result = await executeSinglePassResearch(ctx, conversationId, topic, mode);
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
          researchMode: mode,
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

      // Step 3: Run Iterative Research (mode threaded through prompts)
      const result = await runIterativeResearch(ctx, sessionId, effectiveConversationId, topic, 5, mode);


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

/**
 * answerQuestionAction - Synchronous research + answer
 *
 * Unlike startSimpleResearch/startSmartResearch (which create sessions/documents),
 * this executes synchronously and returns a direct answer for chat response.
 *
 * Flow:
 * 1. Execute web search using Jina Search API
 * 2. Read full content from top 3 sources
 * 3. Synthesize answer using zaiFlash (fast, cost-effective)
 * 4. Return answer + sources for immediate chat response
 */
export const answerQuestionAction = internalAction({
  args: {
    query: v.string(),
    sources: v.optional(v.number()),
  },
  handler: async (ctx, { query, sources = 5 }) => {
    const numSources = Math.min(sources, 10); // Cap at 10
    const startTime = Date.now();

    const apiKey = process.env.JINA_API_KEY;
    if (!apiKey) {
      return {
        answer: "JINA_API_KEY not configured. Please set the environment variable.",
        sources: [],
        durationMs: Date.now() - startTime,
      };
    }

    // 1. Execute web search using Jina Search API
    // eslint-disable-next-line no-useless-assignment -- Variable IS used in subsequent statements (false positive due to early returns)
    let searchResults: Array<{ title: string; url: string; content: string }> = [];
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(`https://s.jina.ai/?q=${encodedQuery}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Jina Search API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      searchResults = (data.data || []).slice(0, numSources).map((result: any) => ({
        title: result.title || "",
        url: result.url || result.link || "",
        content: (result.description || result.content || "").slice(0, 500),
      }));
    } catch (error) {
      console.error("[answerQuestionAction] Search error:", error);
      return {
        answer: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        sources: [],
        durationMs: Date.now() - startTime,
      };
    }

    if (searchResults.length === 0) {
      return {
        answer: `I couldn't find any relevant information for "${query}".`,
        sources: [],
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Read full content from top 3 sources using Jina Reader
    const topUrls = searchResults.slice(0, 3).map((r) => r.url);
    const contents: Array<{ title: string; content: string; url: string }> = [];

    for (const url of topUrls) {
      try {
        const response = await fetch(`https://r.jina.ai/${url}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "X-Return-Format": "markdown",
          },
        });

        if (response.ok) {
          const content = await response.text();
          contents.push({
            title: searchResults.find((r) => r.url === url)?.title || url,
            content: content.slice(0, 3000), // Limit content for synthesis
            url,
          });
        }
      } catch (error) {
        console.warn(`[answerQuestionAction] Failed to read ${url}:`, error);
      }
    }

    // 3. Synthesize answer using zaiFlash (fast, cost-effective)
    // eslint-disable-next-line no-useless-assignment -- Variable IS used in return statement (false positive due to early returns)
    let answer = "";
    try {
      const { text } = await generateText({
        model: zaiFlash(),
        system: `You are a research assistant. Answer the user's question based on the provided web search results.

Guidelines:
- Be concise (2-4 sentences for simple answers, 1-2 short paragraphs for complex topics)
- Lead with the most important information first
- Use bullet points for lists
- Include [Source X] citations in brackets when referencing specific information
- Don't fabricate facts — if the sources don't contain the answer, say so`,
        prompt: `Question: ${query}

Sources:
${contents.map((c, i) => `[${i + 1}] ${c.title}\n${c.content}`).join("\n\n")}

Answer:`,
      });
      answer = text.trim();
    } catch (error) {
      console.error("[answerQuestionAction] Synthesis error:", error);
      answer = `I found ${searchResults.length} sources but couldn't synthesize an answer. Here are the top results:\n\n${searchResults.slice(0, 3).map((r, i) => `${i + 1}. [${r.title}](${r.url})`).join("\n")}`;
    }

    // 4. Format sources for card display
    const formattedSources = searchResults.slice(0, 5).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content.slice(0, 150),
    }));

    return {
      answer,
      sources: formattedSources,
      durationMs: Date.now() - startTime,
    };
  },
});

// =============================================================================
// FIND RECOMMENDATIONS ACTION (REC-003)
// =============================================================================

import { RecommendationSynthesisSchema, RECOMMENDATION_SYNTHESIS_PROMPT } from "../chat/specialistPrompts";

/**
 * Args for findRecommendationsCore
 */
interface FindRecommendationsArgs {
  query: string;
  count?: number;
  location?: string;
  constraints?: string[];
}

/**
 * Result from findRecommendationsCore
 */
interface FindRecommendationsResult {
  items: Array<{
    name: string;
    description: string;
    whyRecommended: string;
    rating?: number;
    location?: string;
    pricing?: string;
    contact?: {
      phone?: string;
      url?: string;
      email?: string;
    };
  }>;
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  query: string;
  durationMs: number;
}

/**
 * Build enhanced query from base query + location + constraints
 */
function buildEnhancedQuery(args: FindRecommendationsArgs): string {
  const parts = [args.query];
  if (args.location) {
    parts.push(`in ${args.location}`);
  }
  if (args.constraints && args.constraints.length > 0) {
    parts.push(args.constraints.join(" "));
  }
  return parts.join(" ");
}

/**
 * Call Jina Search API and return results
 */
async function jinaSearch(
  query: string,
  options: { signal: AbortSignal }
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.error("[jinaSearch] JINA_API_KEY not configured");
    return [];
  }

  try {
    const searchUrl = `https://s.jina.ai/${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: options.signal,
    });

    if (!response.ok) {
      console.error(`[jinaSearch] HTTP error: ${response.status} ${response.statusText}`);
      return [];
    }

    const text = await response.text();
    const lines = text.split("\n").filter((line) => line.trim());

    const results: Array<{ title: string; url: string; snippet: string }> = [];

    for (const line of lines) {
      // Jina returns format: [title] - [url] - [content]
      const match = line.match(/\[(.*?)\] - \[(.*?)\] - (.*)/);
      if (match) {
        results.push({
          title: match[1],
          url: match[2],
          snippet: match[3].slice(0, 200),
        });
      }
    }

    return results.slice(0, 8); // Max 8 sources for recommendation synthesis
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("abort") || errorMessage.includes("The operation was aborted")) {
      console.warn("[jinaSearch] Request aborted");
      throw error; // Re-throw abort errors so they can be caught by the outer try-catch
    } else {
      console.error("[jinaSearch] Error:", error);
      return [];
    }
  }
}

/**
 * Read multiple URLs in parallel using Jina Reader
 */
async function parallelJinaReader(
  sources: Array<{ url: string; title: string; snippet: string }>,
  options: { signal: AbortSignal; timeoutMs: number }
): Promise<string> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.error("[parallelJinaReader] JINA_API_KEY not configured");
    return "";
  }

  const readPromises = sources.slice(0, 5).map(async (source) => {
    try {
      const readerUrl = `https://r.jina.ai/${encodeURIComponent(source.url)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

      const response = await fetch(readerUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "text/plain",
        },
        signal: options.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const content = await response.text();
      return `## ${source.title}\n${content.slice(0, 2000)}`; // Limit to 2k chars per source
    } catch (error) {
      console.warn(`[parallelJinaReader] Failed to read ${source.url}:`, error);
      return null;
    }
  });

  const results = await Promise.all(readPromises);
  return results.filter((r): r is string => r !== null).join("\n\n");
}

/**
 * Synthesize recommendations using LLM
 */
async function synthesize(
  content: string,
  args: FindRecommendationsArgs,
  options: { signal: AbortSignal; strict?: boolean }
): Promise<any | null> {
  const count = args.count || 5;
  const strict = options.strict || false;

  const strictInstructions = strict
    ? `\n\nCRITICAL: Your response MUST be valid JSON matching this schema:\n${JSON.stringify(
        {
          items: [
            {
              name: "string",
              description: "string",
              whyRecommended: "string",
              rating: "number (optional)",
              location: "string (optional)",
              pricing: "string (optional)",
              contact: {
                phone: "string (optional)",
                url: "string (optional)",
                email: "string (optional)",
              },
            },
          ],
          sources: [
            {
              title: "string",
              url: "string",
              snippet: "string",
            },
          ],
          query: "string",
          durationMs: "number",
        },
        null,
        2
      )}\n\nDo NOT include any text outside the JSON object. No markdown code blocks. Just the raw JSON.`
    : "";

  try {
    const { text } = await generateText({
      model: zaiPro(),
      system: RECOMMENDATION_SYNTHESIS_PROMPT + strictInstructions,
      prompt: `Query: ${args.query}\nCount: ${count}\nLocation: ${args.location || "not specified"}\nConstraints: ${args.constraints?.join(", ") || "none"}\n\nSources:\n${content}`,
      // @ts-ignore - signal is supported by generateText but not in the type definition
      signal: options.signal,
    });

    // Parse JSON response
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[synthesize] No JSON found in response");
      return null;
    }

    const jsonString = jsonMatch[1] || jsonMatch[0];
    try {
      return JSON.parse(jsonString);
    } catch (parseError) {
      console.error("[synthesize] JSON parse error:", parseError);
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("abort") || errorMessage.includes("The operation was aborted")) {
      console.warn("[synthesize] Request aborted");
      throw error; // Re-throw abort errors
    }
    console.error("[synthesize] Error:", error);
    return null;
  }
}

/**
 * Core implementation of findRecommendations
 *
 * This is a pure function that doesn't use Convex context.
 * It can be called from both internalAction and public action wrappers.
 */
/**
 * Core implementation of findRecommendations
 *
 * This is a pure function that doesn't use Convex context.
 * It can be called from both internalAction and public action wrappers.
 *
 * @internal Exported for testing only
 */
export async function findRecommendationsCore(args: FindRecommendationsArgs): Promise<FindRecommendationsResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    // Step 1: Build enhanced query
    const enhancedQuery = buildEnhancedQuery(args);

    // Step 2: Call Jina Search
    const sources = await jinaSearch(enhancedQuery, { signal: controller.signal });

    // Step 3: Handle empty sources
    if (sources.length === 0) {
      return {
        items: [],
        sources: [],
        query: args.query,
        durationMs: Date.now() - start,
      };
    }

    // Step 4: Read top 5 sources in parallel with 15s timeout
    const content = await parallelJinaReader(sources, {
      signal: controller.signal,
      timeoutMs: 15_000,
    });

    // Step 5: Synthesize with LLM
    let synth = await synthesize(content, args, { signal: controller.signal });

    // Step 6: Validate with Zod
    let parsed = synth ? RecommendationSynthesisSchema.safeParse(synth) : { success: false };

    // Step 7: Retry once with strict instructions if validation fails
    if (!parsed.success) {
      console.warn("[findRecommendationsCore] First synthesis failed validation, retrying with strict instructions");
      synth = await synthesize(content, args, { signal: controller.signal, strict: true });
      parsed = synth ? RecommendationSynthesisSchema.safeParse(synth) : { success: false };
    }

    // Step 8: Return successful result or fallback
    if (parsed.success) {
      // Type assertion: parsed is SafeParseSuccess when success is true
      return {
        items: (parsed as any).data.items,
        sources: (parsed as any).data.sources,
        query: args.query,
        durationMs: Date.now() - start,
      };
    }

    // Fallback if validation failed
    console.error("[findRecommendationsCore] Synthesis validation failed after retry");
    return {
      items: [],
      sources,
      query: args.query,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    // Handle abort errors specifically
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("abort") || errorMessage.includes("The operation was aborted")) {
      console.warn("[findRecommendationsCore] Operation aborted after timeout");
      return {
        items: [],
        sources: [],
        query: args.query,
        durationMs: Date.now() - start,
      };
    }
    // Re-throw other errors
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Internal action for findRecommendations (used by tool executor)
 */
export const findRecommendationsAction = internalAction({
  args: {
    query: v.string(),
    count: v.optional(v.number()),
    location: v.optional(v.string()),
    constraints: v.optional(v.array(v.string())),
  },
  returns: v.object({
    items: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        whyRecommended: v.string(),
        rating: v.optional(v.number()),
        location: v.optional(v.string()),
        pricing: v.optional(v.string()),
        contact: v.optional(
          v.object({
            phone: v.optional(v.string()),
            url: v.optional(v.string()),
            email: v.optional(v.string()),
          })
        ),
      })
    ),
    sources: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        snippet: v.string(),
      })
    ),
    query: v.string(),
    durationMs: v.number(),
  }),
  handler: async (_ctx, args) => findRecommendationsCore(args),
});

/**
 * Public action for findRecommendations (exposed to MCP)
 */
export const findRecommendations = action({
  args: {
    query: v.string(),
    count: v.optional(v.number()),
    location: v.optional(v.string()),
    constraints: v.optional(v.array(v.string())),
  },
  returns: v.object({
    items: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        whyRecommended: v.string(),
        rating: v.optional(v.number()),
        location: v.optional(v.string()),
        pricing: v.optional(v.string()),
        contact: v.optional(
          v.object({
            phone: v.optional(v.string()),
            url: v.optional(v.string()),
            email: v.optional(v.string()),
          })
        ),
      })
    ),
    sources: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        snippet: v.string(),
      })
    ),
    query: v.string(),
    durationMs: v.number(),
  }),
  handler: async (_ctx, args) => findRecommendationsCore(args),
});
