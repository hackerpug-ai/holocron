/**
 * Research Worker Dispatcher
 *
 * Task #305: Orchestrates parallel research workers based on approved plans.
 *
 * Architecture:
 * - Parses approved research plans into track assignments
 * - Spawns research workers for each track (academic, business, code, etc.)
 * - Distributes queries among workers
 * - Collects and aggregates results from all workers
 * - Handles worker failures and retries
 *
 * Research Tracks:
 * - Academic: Research papers, academic studies, scholarly sources
 * - Business: Industry best practices, real-world applications, case studies
 * - Code: Implementation guides, API documentation, code examples
 * - News: Recent developments, trends, announcements
 * - Technical: Deep technical analysis, architecture, performance
 *
 * @see convex/research/parallel.ts - Parallel fan-out strategy
 * @see convex/research/actions.ts - Research orchestrator
 */

"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  executeParallelSearchWithRetry,
  type ParallelSearchResult,
} from "./search";

// ============================================================================
// Types
// ============================================================================

/**
 * Research track types - specialized domains for parallel research
 */
export type ResearchTrack =
  | "academic"    // Research papers, academic studies
  | "business"    // Industry best practices, case studies
  | "code"        // Implementation, API docs, code examples
  | "news"        // Recent developments, trends
  | "technical";  // Deep technical analysis, architecture

/**
 * Specialist agent types for domain-specific research
 * US-IMP-002: Research Agent Specialists
 * US-IMP-011: Product/Service Finder Specialists
 */
export type SpecialistType =
  | "academic"       // Academic research specialist
  | "technical"      // Technical research specialist
  | "product_finder" // Product finder specialist
  | "service_finder" // Service finder specialist
  | "generalist";    // General research agent (fallback)

/**
 * Research track configuration
 */
export interface TrackConfig {
  track: ResearchTrack;
  query: string;
  priority: number;
  retryCount: number;
  maxRetries: number;
}

/**
 * Worker result from a single track
 */
export interface TrackWorkerResult {
  track: ResearchTrack;
  query: string;
  success: boolean;
  results?: ParallelSearchResult;
  error?: string;
  durationMs: number;
  retryCount: number;
}

/**
 * Aggregated dispatcher results
 */
export interface DispatcherResult {
  sessionId: Id<"deepResearchSessions">;
  conversationId: Id<"conversations">;
  status: "completed" | "partial" | "failed";
  tracks: {
    total: number;
    completed: number;
    failed: number;
  };
  findings: {
    summary: string;
    trackResults: Array<{
      track: ResearchTrack;
      findings: string;
      sourceCount: number;
    }>;
    aggregatedSources: number;
  };
  durationMs: number;
  errors: string[];
}

// ============================================================================
// Track Assignment
// ============================================================================

/**
 * Research track definitions with query patterns
 */
const TRACK_PATTERNS: Record<
  ResearchTrack,
  { prefix: string; suffixes: string[]; priority: number }
> = {
  academic: {
    prefix: "",
    suffixes: [
      "research paper academic study",
      "scholarly article peer-reviewed",
      "academic research findings",
    ],
    priority: 1,
  },
  business: {
    prefix: "",
    suffixes: [
      "industry best practices",
      "business case study real-world application",
      "enterprise implementation guide",
    ],
    priority: 2,
  },
  code: {
    prefix: "",
    suffixes: [
      "implementation code example tutorial",
      "API documentation reference",
      "programming guide examples",
    ],
    priority: 3,
  },
  news: {
    prefix: "",
    suffixes: [
      "latest developments trends 2024 2025",
      "recent news announcements",
      "current state industry updates",
    ],
    priority: 4,
  },
  technical: {
    prefix: "",
    suffixes: [
      "technical architecture design",
      "performance optimization analysis",
      "deep dive technical details",
    ],
    priority: 5,
  },
};

/**
 * Parse an approved research plan into track assignments
 *
 * @param plan - Approved execution plan content
 * @param baseTopic - Base research topic
 * @returns Array of track configurations
 */
export function parsePlanIntoTracks(
  plan: any,
  baseTopic: string
): TrackConfig[] {
  // If plan has explicit track assignments, use those
  if (plan?.tracks && Array.isArray(plan.tracks)) {
    return plan.tracks.map((track: any) => ({
      track: track.track as ResearchTrack,
      query: track.query || `${baseTopic} ${track.track}`,
      priority: track.priority || 0,
      retryCount: 0,
      maxRetries: 2,
    }));
  }

  // Otherwise, decompose topic into default tracks
  const tracks: TrackConfig[] = [];
  const trackTypes: ResearchTrack[] = ["academic", "business", "code", "news"];

  for (const track of trackTypes) {
    const pattern = TRACK_PATTERNS[track];
    const query = `${baseTopic} ${pattern.suffixes[0]}`;

    tracks.push({
      track,
      query,
      priority: pattern.priority,
      retryCount: 0,
      maxRetries: 2,
    });
  }

  return tracks;
}

/**
 * Select optimal tracks based on topic analysis
 *
 * @param topic - Research topic
 * @returns Array of recommended track types
 */
export function selectTracksForTopic(topic: string): ResearchTrack[] {
  const words = topic.toLowerCase();

  // Detect topic type for better track selection
  const isTechnical =
    words.includes("implement") ||
    words.includes("code") ||
    words.includes("api") ||
    words.includes("sdk") ||
    words.includes("programming");
  const isBusiness =
    words.includes("business") ||
    words.includes("enterprise") ||
    words.includes("company") ||
    words.includes("startup");
  const isAcademic =
    words.includes("research") ||
    words.includes("study") ||
    words.includes("paper") ||
    words.includes("theory");

  if (isTechnical) {
    return ["code", "technical", "business", "news"];
  }
  if (isBusiness) {
    return ["business", "news", "academic", "code"];
  }
  if (isAcademic) {
    return ["academic", "technical", "business", "news"];
  }

  // Default balanced set
  return ["academic", "business", "code", "news"];
}

/**
 * Detect the appropriate specialist type for a research query
 * US-IMP-002: Research Agent Specialists
 * US-IMP-011: Product/Service Finder Specialists
 *
 * @param query - The research query to analyze
 * @returns The detected specialist type
 */
export function detectSpecialist(query: string): SpecialistType {
  const words = query.toLowerCase();

  // Academic keywords: research, paper, study, academic, journal, citation, peer-reviewed
  const isAcademic =
    words.includes("academic") ||
    words.includes("research") ||
    words.includes("paper") ||
    words.includes("study") ||
    words.includes("scholarly") ||
    words.includes("journal") ||
    words.includes("citation") ||
    words.includes("peer-reviewed") ||
    words.includes("peer reviewed");

  // Technical keywords: implement, code, api, sdk, programming, technical, architecture
  const isTechnical =
    words.includes("technical") ||
    words.includes("implement") ||
    words.includes("code") ||
    words.includes("api") ||
    words.includes("sdk") ||
    words.includes("programming") ||
    words.includes("architecture") ||
    words.includes("development") ||
    words.includes("engineering");

  // Product keywords: buy, purchase, price, laptop, phone, product, best, comparison
  const isProduct =
    words.includes("buy") ||
    words.includes("purchase") ||
    words.includes("price") ||
    words.includes("laptop") ||
    words.includes("phone") ||
    words.includes("product") ||
    words.includes("best") && (
      words.includes("laptop") ||
      words.includes("phone") ||
      words.includes("camera") ||
      words.includes("tablet") ||
      words.includes("headphones") ||
      words.includes("monitor") ||
      words.includes("keyboard") ||
      words.includes("mouse")
    ) ||
    words.includes("comparison") && (
      words.includes("product") ||
      words.includes("price") ||
      words.includes("review")
    );

  // Service keywords: service, plumber, contractor, cleaner, repair, near me
  const isService =
    words.includes("service") ||
    words.includes("plumber") ||
    words.includes("contractor") ||
    words.includes("cleaner") ||
    words.includes("cleaning") ||
    words.includes("repair") ||
    words.includes("near me") ||
    words.includes("nearby") ||
    words.includes("provider") && (
      words.includes("service") ||
      words.includes("internet") ||
      words.includes("hosting") ||
      words.includes("consulting")
    ) ||
    words.includes("web design") ||
    words.includes("landscaping") ||
    words.includes("electrician");

  // Priority: academic > technical > product > service > generalist
  if (isAcademic) {
    return "academic";
  }
  if (isTechnical) {
    return "technical";
  }
  if (isProduct) {
    return "product_finder";
  }
  if (isService) {
    return "service_finder";
  }

  // Default to generalist for ambiguous queries
  return "generalist";
}

// ============================================================================
// Worker Execution
// ============================================================================

/**
 * Execute a single research track worker
 *
 * @param ctx - Convex action context
 * @param config - Track configuration
 * @returns Worker result
 */
async function executeTrackWorker(
  ctx: ActionCtx,
  config: TrackConfig
): Promise<TrackWorkerResult> {
  const startTime = Date.now();
  console.log(
    `[executeTrackWorker] Starting track: ${config.track}, query: "${config.query}"`
  );

  try {
    const result = await executeParallelSearchWithRetry(
      config.query,
      {},
      [],
      {
        maxRetries: config.maxRetries,
        timeoutMs: 15000,
        deduplicateResults: true,
      }
    );

    const durationMs = Date.now() - startTime;
    console.log(
      `[executeTrackWorker] Completed track: ${config.track} in ${durationMs}ms, sources: ${result.structuredResults.length}`
    );

    return {
      track: config.track,
      query: config.query,
      success: true,
      results: result,
      durationMs,
      retryCount: config.retryCount,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(
      `[executeTrackWorker] Failed track: ${config.track}, error: ${errorMessage}`
    );

    return {
      track: config.track,
      query: config.query,
      success: false,
      error: errorMessage,
      durationMs,
      retryCount: config.retryCount,
    };
  }
}

/**
 * Execute track worker with retry logic
 *
 * @param ctx - Convex action context
 * @param config - Track configuration
 * @returns Worker result (with retries exhausted if needed)
 */
async function executeTrackWorkerWithRetry(
  ctx: ActionCtx,
  config: TrackConfig
): Promise<TrackWorkerResult> {
  let result = await executeTrackWorker(ctx, config);

  // Retry failed tracks
  while (!result.success && config.retryCount < config.maxRetries) {
    console.log(
      `[executeTrackWorkerWithRetry] Retrying track: ${config.track}, attempt: ${config.retryCount + 1}/${config.maxRetries}`
    );

    config.retryCount++;
    result = await executeTrackWorker(ctx, config);
  }

  return result;
}

// ============================================================================
// Result Aggregation
// ============================================================================

/**
 * Aggregate results from all track workers
 *
 * @param trackResults - Array of track worker results
 * @returns Aggregated findings
 */
export function aggregateTrackResults(
  trackResults: TrackWorkerResult[]
): {
  summary: string;
  trackResults: Array<{
    track: ResearchTrack;
    findings: string;
    sourceCount: number;
  }>;
  aggregatedSources: number;
} {
  const successfulTracks = trackResults.filter((r) => r.success);
  const failedTracks = trackResults.filter((r) => !r.success);

  // Build track-specific results
  const results = successfulTracks.map((result) => ({
    track: result.track,
    findings: result.results!.findings,
    sourceCount: result.results!.structuredResults.length,
  }));

  // Count total sources
  const aggregatedSources = successfulTracks.reduce(
    (sum, r) => sum + r.results!.structuredResults.length,
    0
  );

  // Build summary
  let summary = `Research completed across ${successfulTracks.length} track${successfulTracks.length !== 1 ? "s" : ""}`;
  if (failedTracks.length > 0) {
    summary += ` (${failedTracks.length} failed)`;
  }
  summary += `. Found ${aggregatedSources} sources total.`;

  return {
    summary,
    trackResults: results,
    aggregatedSources,
  };
}

// ============================================================================
// Dispatcher Actions
// ============================================================================

/**
 * Execute plan-based research with worker dispatcher
 *
 * Main entry point for plan-driven parallel research.
 *
 * @param conversationId - Conversation for posting updates
 * @param sessionId - Deep research session
 * @param plan - Approved execution plan
 * @param topic - Research topic
 * @returns Aggregated dispatcher results
 */
export const executePlanBasedResearch = internalAction({
  args: {
    conversationId: v.id("conversations"),
    sessionId: v.id("deepResearchSessions"),
    plan: v.any(),
    topic: v.string(),
  },
  handler: async (
    ctx,
    { conversationId, sessionId, plan, topic }
  ): Promise<DispatcherResult> => {
    const startTime = Date.now();
    console.log(
      `[executePlanBasedResearch] Entry - topic: "${topic}", sessionId: ${sessionId}`
    );

    // Step 1: Parse plan into track assignments
    const tracks = parsePlanIntoTracks(plan, topic);
    console.log(
      `[executePlanBasedResearch] Parsed plan into ${tracks.length} tracks`
    );

    // Step 2: Update loading card with track assignments
    const loadingCard = await ctx.runQuery(
      api.chatMessages.queries.findLoadingCardBySession,
      { conversationId, sessionId: sessionId.toString() }
    );

    if (loadingCard) {
      await ctx.runMutation(api.chatMessages.mutations.update, {
        id: loadingCard._id,
        cardData: {
          card_type: "deep_research_loading",
          status: "in_progress",
          session_id: sessionId,
          topic,
          steps: [
            {
              id: "dispatch",
              label: `Dispatched ${tracks.length} research workers...`,
              status: "completed",
            },
            {
              id: "research",
              label: `Researching ${tracks.length} tracks in parallel...`,
              status: "in_progress",
            },
          ],
        },
      });
    }

    // Step 3: Execute all track workers in parallel with graceful degradation
    console.log(`[executePlanBasedResearch] Executing ${tracks.length} workers`);
    const workerPromises = tracks.map((config) =>
      executeTrackWorkerWithRetry(ctx, config)
    );

    // Use Promise.allSettled so one provider failure doesn't block others
    const settledResults = await Promise.allSettled(workerPromises);
    const trackResults = settledResults.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      // Convert rejected promise into a failed TrackWorkerResult
      const config = tracks[index];
      const errorMessage = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      console.error(
        `[executePlanBasedResearch] Track ${config.track} rejected: ${errorMessage}`
      );
      return {
        track: config.track,
        query: config.query,
        success: false,
        error: errorMessage,
        durationMs: 0,
        retryCount: config.retryCount,
      } as TrackWorkerResult;
    });

    // Step 4: Aggregate results
    const completedTracks = trackResults.filter((r) => r.success);
    const failedTracks = trackResults.filter((r) => !r.success);

    console.log(
      `[executePlanBasedResearch] Workers complete - ${completedTracks.length}/${tracks.length} successful`
    );

    const findings = aggregateTrackResults(trackResults);

    // Step 5: Update loading card with completion status
    if (loadingCard) {
      await ctx.runMutation(api.chatMessages.mutations.update, {
        id: loadingCard._id,
        cardData: {
          card_type: "deep_research_loading",
          status: "in_progress",
          session_id: sessionId,
          topic,
          steps: [
            {
              id: "dispatch",
              label: `Dispatched ${tracks.length} research workers`,
              status: "completed",
            },
            {
              id: "research",
              label: `Researched ${completedTracks.length}/${tracks.length} tracks`,
              status: "completed",
            },
            {
              id: "aggregate",
              label: "Aggregating findings...",
              status: "in_progress",
            },
          ],
        },
      });
    }

    // Step 6: Create iteration record with track results
    await ctx.runMutation(api.research.mutations.createDeepResearchIteration, {
      sessionId,
      iterationNumber: 1,
      coverageScore: completedTracks.length === tracks.length ? 4 : 3,
      feedback: `Completed ${completedTracks.length}/${tracks.length} research tracks`,
      findings: findings.summary,
      refinedQueries: failedTracks.map((f) => f.query),
      status: "completed",
      summary: `Parallel track research: ${completedTracks.length} completed`,
    });

    // Step 7: Complete session
    await ctx.runMutation(api.research.mutations.completeDeepResearchSession, {
      sessionId,
      status: completedTracks.length > 0 ? "completed" : "failed",
    });

    const totalTime = Date.now() - startTime;

    // Determine overall status
    const status: "completed" | "partial" | "failed" =
      completedTracks.length === tracks.length
        ? "completed"
        : completedTracks.length > 0
        ? "partial"
        : "failed";

    console.log(
      `[executePlanBasedResearch] Exit - status: ${status}, duration: ${totalTime}ms`
    );

    return {
      sessionId,
      conversationId,
      status,
      tracks: {
        total: tracks.length,
        completed: completedTracks.length,
        failed: failedTracks.length,
      },
      findings,
      durationMs: totalTime,
      errors: failedTracks.map((f) => `${f.track}: ${f.error}`),
    };
  },
});

/**
 * Public action to trigger plan-based research
 *
 * Entry point for external callers (e.g., from chat tool execution)
 */
export const runPlanBasedResearch = action({
  args: {
    conversationId: v.id("conversations"),
    planId: v.id("executionPlans"),
    topic: v.string(),
  },
  handler: async (
    ctx,
    { conversationId, planId, topic }
  ): Promise<{
    sessionId: Id<"deepResearchSessions">;
    status: string;
  }> => {
    console.log(
      `[runPlanBasedResearch] Entry - planId: ${planId}, topic: "${topic}"`
    );

    // Fetch the approved plan
    const plan = await ctx.runQuery(api.plans.queries.get, {
      id: planId,
    });

    if (!plan || plan.status !== "approved") {
      throw new Error("Plan not found or not approved");
    }

    // Create deep research session
    const sessionId = await ctx.runMutation(
      api.research.mutations.createDeepResearchSession,
      {
        conversationId,
        topic,
        maxIterations: 1,
      }
    );

    // Post loading card
    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent",
      content: `Executing research plan: ${topic}`,
      messageType: "result_card",
      cardData: {
        card_type: "deep_research_loading",
        status: "in_progress",
        session_id: sessionId,
        topic,
      },
    });

    // Execute the dispatcher
    return await ctx.runAction(internal.research.dispatcher.executePlanBasedResearch, {
      conversationId,
      sessionId,
      plan: plan.content,
      topic,
    });
  },
});
