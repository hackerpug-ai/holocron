/**
 * What's New Report Generation Workflow
 *
 * Splits the monolithic generateDailyReport action into smaller,
 * timeout-safe phases. Each phase runs independently with progress
 * tracked in the database.
 *
 * Architecture:
 * 1. Start workflow → Create whatsNewWorkflows entry
 * 2. Fetch phase → Fetch from all sources, store raw findings
 * 3. Enrich phase → Quality scoring, summarization (parallel batches)
 * 4. Synthesize phase → LLM report generation
 * 5. Complete phase → Store document, create report entry, notify
 *
 * Each phase has its own timeout budget and can be retried independently.
 */

import { v } from "convex/values";
import { internalMutation, internalAction, internalQuery } from "../_generated/server";
import { internal, api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { Finding } from "./types";
import {
  fetchReddit,
  fetchHackerNews,
  fetchGitHub,
  fetchDevTo,
  fetchLobsters,
  fetchBluesky,
  fetchChangelog,
  fetchTwitter,
  fetchWebSearch,
  deduplicateFindings,
  capFindingsPerSource,
  categorizeFindings,
  populatePerFindingCorroboration,
  calculateTopEngagementVelocity,
  calculateCorroboration,
  extractSources,
} from "./actions";
import { synthesizeReport as llmSynthesizeReport, generateFindingSummary } from "./llm";
import { scoreFindingsQuality } from "./actions";

// ============================================================================
// Types
// ============================================================================

export type WorkflowPhase =
  | "pending"
  | "fetching"
  | "enriching"
  | "synthesizing"
  | "completed"
  | "failed";

export interface WorkflowState {
  phase: WorkflowPhase;
  startedAt: number;
  updatedAt: number;
  error?: string;
  retryCount?: number;
}

// ============================================================================
// Arguments
// ============================================================================

const startWorkflowArgs = {
  days: v.optional(v.number()),
  force: v.optional(v.boolean()),
} as const;

// ============================================================================
// Mutations - Workflow State Management
// ============================================================================

/**
 * Create a new workflow entry and start the fetch phase
 */
export const startWorkflow = internalMutation({
  args: startWorkflowArgs,
  handler: async (ctx, args): Promise<{ workflowId: any; isNew: boolean }> => {
    const days = args.days ?? 1;
    const force = args.force ?? false;

    // Check if today's report exists (unless force)
    if (!force) {
      const existingReport = await ctx.runQuery(
        internal.whatsNew.internal.getTodaysReport
      );
      if (existingReport) {
        return { workflowId: existingReport._id, isNew: false };
      }
    }

    // Create workflow entry
    const workflowId = await ctx.db.insert("whatsNewWorkflows", {
      phase: "pending",
      days,
      force,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      findingsCount: 0,
      // Findings will be stored as JSON string
      findingsJson: undefined,
      error: undefined,
      completedAt: undefined,
      reportId: undefined,
    });

    // Start fetch phase via action
    await ctx.scheduler.runAfter(0, internal.whatsNew.workflow.fetchPhase, {
      workflowId,
    });

    return { workflowId, isNew: true };
  },
});

/**
 * Update workflow phase and timestamp
 */
export const updatePhase = internalMutation({
  args: {
    workflowId: v.id("whatsNewWorkflows"),
    phase: v.union(
      v.literal("fetching"),
      v.literal("enriching"),
      v.literal("synthesizing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    findingsJson: v.optional(v.string()),
    findingsCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workflowId, phase, error, findingsJson, findingsCount } = args;

    const updates: Partial<Doc<"whatsNewWorkflows">> = {
      phase,
      updatedAt: Date.now(),
    };

    if (error) updates.error = error;
    if (findingsJson) updates.findingsJson = findingsJson;
    if (findingsCount !== undefined) updates.findingsCount = findingsCount;
    if (phase === "completed" || phase === "failed") {
      updates.completedAt = Date.now();
    }

    await ctx.db.patch(workflowId, updates);
  },
});

// ============================================================================
// Actions - Workflow Phases
// ============================================================================

/**
 * Phase 1: Fetch from all sources
 *
 * Runs in parallel, stores raw findings as JSON.
 * Timeout: 120s (should be plenty for HTTP fetches)
 */
export const fetchPhase = internalAction({
  args: {
    workflowId: v.id("whatsNewWorkflows"),
  },
  handler: async (ctx, args) => {
    const { workflowId } = args;

    // Update phase
    await ctx.runMutation(internal.whatsNew.workflow.updatePhase, {
      workflowId,
      phase: "fetching",
    });

    // Get workflow config
    const workflow = await ctx.runQuery(
      internal.whatsNew.workflow.getWorkflow,
      { workflowId }
    );
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const days = workflow.days;

    // Fetch Bluesky accounts for dynamic lists
    const blueskyAccounts = await ctx.runQuery(
      internal.subscriptions.internal.getCreatorAccountsByPlatform,
      { platform: "bluesky" }
    );

    // Fetch from all sources in parallel
    const fetchResults = await Promise.allSettled([
      fetchReddit(days),
      fetchHackerNews(days),
      fetchGitHub(days),
      fetchDevTo(days),
      fetchLobsters(days),
      fetchBluesky(days, blueskyAccounts),
      fetchChangelog(days),
      fetchTwitter(days),
      fetchWebSearch(days),
    ]);

    // Collect all findings
    const allFindings: Finding[] = [];
    for (const result of fetchResults) {
      if (result.status === "fulfilled") {
        allFindings.push(...result.value.findings);
      } else {
        console.error("[fetchPhase] Fetch failed:", result.reason);
      }
    }

    // Store findings as JSON
    const findingsJson = JSON.stringify(allFindings);

    // Update workflow with findings
    await ctx.runMutation(internal.whatsNew.workflow.updatePhase, {
      workflowId,
      phase: "fetching",
      findingsJson,
      findingsCount: allFindings.length,
    });

    // Continue to enrich phase
    await ctx.scheduler.runAfter(0, internal.whatsNew.workflow.enrichPhase, {
      workflowId,
    });
  },
});

/**
 * Phase 2: Enrich findings (quality scoring, summarization)
 *
 * Runs in batches to avoid timeout. Each batch processes a subset.
 * Timeout: 180s (3 minutes)
 */
export const enrichPhase = internalAction({
  args: {
    workflowId: v.id("whatsNewWorkflows"),
    batchIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workflowId } = args;

    // Update phase
    await ctx.runMutation(internal.whatsNew.workflow.updatePhase, {
      workflowId,
      phase: "enriching",
    });

    // Get workflow with findings
    const workflow = await ctx.runQuery(
      internal.whatsNew.workflow.getWorkflow,
      { workflowId }
    );
    if (!workflow || !workflow.findingsJson) {
      throw new Error(`Workflow ${workflowId} has no findings`);
    }

    const allFindings = JSON.parse(workflow.findingsJson) as Finding[];

    // Deduplicate
    const uniqueFindings = deduplicateFindings(allFindings);

    // Quality scoring (LLM-based for social posts)
    const qualityFindings = await scoreFindingsQuality(uniqueFindings);

    // Cap findings per source
    const cappedFindings = capFindingsPerSource(qualityFindings, 15);

    // Calculate metrics
    populatePerFindingCorroboration(cappedFindings);
    const topEngagementVelocity = calculateTopEngagementVelocity(cappedFindings);
    const totalCorroborationCount = calculateCorroboration(cappedFindings);
    const sources = extractSources(cappedFindings);

    // Content enrichment: fetch summaries for top findings lacking them
    const findingsNeedingSummary = cappedFindings
      .filter((f) => !f.summary || f.summary.length < 20)
      .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
      .slice(0, 15);

    if (findingsNeedingSummary.length > 0) {
      const enrichResults = await Promise.allSettled(
        findingsNeedingSummary.map(async (finding) => {
          try {
            const response = await fetch(`https://r.jina.ai/${finding.url}`, {
              headers: {
                Accept: "text/plain",
                "User-Agent": "Holocron-WhatsNew/1.0",
              },
              signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) return null;
            const text = await response.text();
            return { url: finding.url, content: text.substring(0, 2000) };
          } catch {
            return null;
          }
        })
      );

      // Batch-summarize fetched content
      const fetchedContent: Array<{ url: string; content: string }> = [];
      for (const result of enrichResults) {
        if (result.status === "fulfilled" && result.value) {
          fetchedContent.push(result.value);
        }
      }

      if (fetchedContent.length > 0) {
        try {
          const { generateText } = await import("ai");
          const { zaiFlash } = await import("../lib/ai/zai_provider");

          const batchPrompt = `For each article below, write a concise 1-2 sentence summary for an AI engineer. Return a JSON array of objects with "url" and "summary" fields.

${fetchedContent.map((c, i) => `Article ${i + 1} (${c.url}):\n${c.content.substring(0, 500)}`).join("\n\n")}

Respond with ONLY a JSON array: [{"url": "...", "summary": "..."}]`;

          const summaryResult = await generateText({
            model: zaiFlash(),
            prompt: batchPrompt,
          });

          const jsonMatch = summaryResult.text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const summaries = JSON.parse(jsonMatch[0]) as Array<{
              url: string;
              summary: string;
            }>;
            const summaryMap = new Map(summaries.map((s) => [s.url, s.summary]));
            for (const finding of cappedFindings) {
              const summary = summaryMap.get(finding.url);
              if (summary) {
                finding.summary = summary;
              }
            }
          }
        } catch (err) {
          console.warn("[enrichPhase] Content enrichment summarization failed:", err);
        }
      }
    }

    // AI summary generation for findings lacking summaries
    const findingsNeedingAiSummary = cappedFindings
      .filter((f) => !f.summary || f.summary.length < 80)
      .slice(0, 20);

    if (findingsNeedingAiSummary.length > 0) {
      for (const finding of findingsNeedingAiSummary) {
        try {
          const summary = await generateFindingSummary(ctx, finding);
          if (summary) {
            finding.summary = summary;
          }
        } catch (error) {
          console.warn(`[enrichPhase] Summary generation failed for "${finding.title.substring(0, 50)}...":`, error);
        }
      }
    }

    // Store enriched findings with metadata
    const enrichedFindings = {
      findings: cappedFindings,
      metrics: {
        topEngagementVelocity,
        totalCorroborationCount,
        sources,
      },
    };

    const enrichedJson = JSON.stringify(enrichedFindings);

    // Update workflow
    await ctx.runMutation(internal.whatsNew.workflow.updatePhase, {
      workflowId,
      phase: "enriching",
      findingsJson: enrichedJson,
      findingsCount: cappedFindings.length,
    });

    // Continue to synthesis phase
    await ctx.scheduler.runAfter(0, internal.whatsNew.workflow.synthesizePhase, {
      workflowId,
    });
  },
});

/**
 * Phase 3: Synthesize markdown report
 *
 * Generates the final markdown report using LLM.
 * Timeout: 180s (3 minutes)
 */
export const synthesizePhase = internalAction({
  args: {
    workflowId: v.id("whatsNewWorkflows"),
  },
  handler: async (ctx, args): Promise<{
    reportId: any;
    documentId: any;
    findingsCount: number;
  }> => {
    const { workflowId } = args;

    // Update phase
    await ctx.runMutation(internal.whatsNew.workflow.updatePhase, {
      workflowId,
      phase: "synthesizing",
    });

    // Get workflow with enriched findings
    const workflow = await ctx.runQuery(
      internal.whatsNew.workflow.getWorkflow,
      { workflowId }
    );
    if (!workflow || !workflow.findingsJson) {
      throw new Error(`Workflow ${workflowId} has no enriched findings`);
    }

    const enrichedData = JSON.parse(workflow.findingsJson) as {
      findings: Finding[];
      metrics: {
        topEngagementVelocity: number;
        totalCorroborationCount: number;
        sources: string[];
      };
    };

    const { findings: cappedFindings, metrics } = enrichedData;
    const { discoveries, releases, trends, discussions } = categorizeFindings(cappedFindings);

    console.log(
      `[synthesizePhase] ${cappedFindings.length} findings (${discoveries.length} discoveries, ${releases.length} releases, ${trends.length} trends, ${discussions.length} discussions)`
    );

    // Generate markdown report
    const now = new Date();
    const periodStart = new Date(now.getTime() - workflow.days * 24 * 60 * 60 * 1000);

    const synthesisResult = await llmSynthesizeReport(
      cappedFindings,
      workflow.days,
      periodStart,
      now
    );

    if (synthesisResult.error) {
      await ctx.runMutation(internal.whatsNew.workflow.updatePhase, {
        workflowId,
        phase: "failed",
        error: synthesisResult.error,
      });
      throw new Error(`LLM synthesis failed: ${synthesisResult.error}`);
    }

    // Store document with embedding
    const documentResult = await ctx.runAction(
      api.documents.storage.createWithEmbedding,
      {
        title: `What's New: ${now.toISOString().split("T")[0]}`,
        content: synthesisResult.markdown,
        category: "whats-new",
        date: now.toISOString().split("T")[0],
        status: "complete",
      }
    );

    // Create whatsNewReports entry
    const toolSuggestionsJson = synthesisResult.toolSuggestions
      ? JSON.stringify(synthesisResult.toolSuggestions)
      : undefined;

    const findingsJson = JSON.stringify(cappedFindings);

    const reportId = await ctx.runMutation(internal.whatsNew.mutations.createReport, {
      periodStart: periodStart.getTime(),
      periodEnd: now.getTime(),
      days: workflow.days,
      focus: "all",
      discoveryOnly: false,
      findingsCount: cappedFindings.length,
      discoveryCount: discoveries.length,
      releaseCount: releases.length,
      trendCount: trends.length,
      reportPath: "",
      summaryJson: {
        topSources: Object.entries(
          cappedFindings.reduce(
            (acc, f) => {
              acc[f.source] = (acc[f.source] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          )
        ).sort((a, b) => b[1] - a[1]),
        topEngagementVelocity: metrics.topEngagementVelocity,
        totalCorroborationCount: metrics.totalCorroborationCount,
        sources: metrics.sources,
      },
      documentId: documentResult.documentId,
      toolSuggestionsJson,
      findingsJson,
    });

    // Notify user
    await ctx.runMutation(internal.notifications.internal.create, {
      type: "whats_new",
      title: "What's New Report Ready",
      body: `Your daily AI digest is ready with ${cappedFindings.length} findings.`,
      route: `/whats-new/${reportId}`,
      referenceId: reportId,
    });

    // Add to feed
    await ctx.runMutation(internal.feeds.internal.createFeedItem, {
      groupKey: `whats-new:${reportId}`,
      title: `AI Engineering Daily: ${cappedFindings.length} findings`,
      summary: `Discoveries: ${discoveries.length}, Releases: ${releases.length}, Trends: ${trends.length}`,
      contentType: "blog",
      itemCount: 1,
      itemIds: [],
      subscriptionIds: [],
      publishedAt: Date.now(),
      discoveredAt: Date.now(),
      createdAt: Date.now(),
    });

    // Mark workflow complete
    await ctx.runMutation(internal.whatsNew.workflow.updatePhase, {
      workflowId,
      phase: "completed",
    });

    return {
      reportId,
      documentId: documentResult.documentId,
      findingsCount: cappedFindings.length,
    };
  },
});

// ============================================================================
// Queries - Workflow Status
// ============================================================================

/**
 * Get workflow by ID
 */
export const getWorkflow = internalQuery({
  args: {
    workflowId: v.id("whatsNewWorkflows"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.workflowId);
  },
});

/**
 * Get active workflows (not completed/failed)
 */
export const getActiveWorkflows = internalQuery({
  args: {},
  handler: async (ctx) => {
    const workflows = await ctx.db
      .query("whatsNewWorkflows")
      .withIndex("by_updated")
      .order("desc")
      .take(20);

    return workflows.filter(
      (w) => w.phase !== "completed" && w.phase !== "failed"
    );
  },
});
