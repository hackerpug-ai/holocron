/**
 * Migration: Clean up irrelevant Twitter content — Node.js actions
 *
 * Uses AI to evaluate each twitter-sourced item for relevance to AI/agentic coding
 * trends and tooling. Deletes documents + subscriptionContent + feedItems that are irrelevant.
 *
 * Run:
 *   npx convex run migrations/cleanup_irrelevant_twitter_actions:collectTwitterDocuments  (dry run)
 *   npx convex run migrations/cleanup_irrelevant_twitter_actions:cleanupIrrelevantTwitter (execute)
 */

"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { generateText } from "ai";
import { zaiFlash } from "../lib/ai/zai_provider";

// ============================================================================
// AI Relevance Scoring
// ============================================================================

export const scoreTwitterRelevance = internalAction({
  args: {
    items: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        contentPreview: v.optional(v.string()),
      })
    ),
  },
  handler: async (
    _ctx,
    { items }
  ): Promise<Array<{ id: string; score: number; reason: string }>> => {
    if (items.length === 0) return [];

    const itemList = items
      .map(
        (item, i) =>
          `${i + 1}. "${item.title}"${item.contentPreview ? `\n   Preview: ${item.contentPreview.slice(0, 200)}` : ""}`
      )
      .join("\n");

    const prompt = `You are a strict content relevance filter for an AI/agentic coding knowledge base.

Evaluate each tweet on TWO axes, then combine into a single score:

AXIS 1 — Intellectual Gravity (does this require engineering knowledge to appreciate?):
  HIGH (0.7-1.0): Model architecture details, benchmark methodology, API design decisions,
    training insights, infrastructure scaling, technical comparisons between systems
  MEDIUM (0.4-0.6): Surface-level announcements of technical products, brief mentions of tools
  LOW (0.0-0.3): Hot takes, reactions, memes, entertainment, personality commentary,
    anything a non-engineer would engage with equally

AXIS 2 — Builder Relevance (can a developer act on this information?):
  HIGH (0.7-1.0): New tool/model with usage details, workflow technique, breaking API change,
    pricing update affecting costs, integration guide, migration path
  MEDIUM (0.4-0.6): Awareness-level info (a tool exists, a model was released), no actionable detail
  LOW (0.0-0.3): Pure opinion, entertainment, social commentary, no developer action possible

Final score = average of both axes. Only tweets scoring HIGH on BOTH axes should reach 0.7+.

The knowledge base tracks: AI coding tools/IDEs, LLM releases/benchmarks, agentic coding workflows, MCP servers/tooling, developer tooling with AI, model releases for software engineering.

Examples of IRRELEVANT tweets (score 0.0-0.2):
- Reaction tweets with no technical content (expressing surprise, excitement, disbelief)
- AI doing non-coding tasks (playing games, generating art for fun, chatbot conversations)
- Generic tech humor or memes about programming
- Engagement bait that wraps a fact everyone already knows
- Surface-level takes that add no insight beyond what a headline says

Examples of RELEVANT tweets (score 0.7-1.0):
- "Kimi K2 uses fewer attention heads but more expert modules than DeepSeek V3" (architecture analysis)
- "Claude Code now supports MCP tool servers natively — here's how to configure them" (actionable tooling)
- "Measured 40% latency reduction switching from GPT-4o to Claude 3.5 for code review tasks" (benchmark)

Score each item 0.0-1.0:

${itemList}

Respond with ONLY a JSON array: [{"score": 0.8, "reason": "brief reason"}, ...]
Exactly ${items.length} entries in order.`;

    try {
      const result = await generateText({
        model: zaiFlash(),
        prompt,
      });

      const text = result.text.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return items.map((item) => ({ id: item.id, score: 0.5, reason: "ai_parse_failed" }));
      }

      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        return items.map((item) => ({ id: item.id, score: 0.5, reason: "ai_parse_failed" }));
      }

      return items.map((item, i) => {
        const entry = parsed[i] as Record<string, unknown> | undefined;
        if (!entry) return { id: item.id, score: 0.5, reason: "ai_no_score" };
        const score = typeof entry.score === "number" ? Math.min(1, Math.max(0, entry.score)) : 0.5;
        const reason = typeof entry.reason === "string" ? entry.reason : "ai_scored";
        return { id: item.id, score, reason };
      });
    } catch (err) {
      console.warn("[scoreTwitterRelevance] LLM scoring failed:", err);
      return items.map((item) => ({ id: item.id, score: 0.5, reason: "ai_error" }));
    }
  },
});

// ============================================================================
// Orchestrators
// ============================================================================

const RELEVANCE_THRESHOLD = 0.3;
const BATCH_SIZE = 20;

/** Dry run — just reports what it finds */
export const collectTwitterDocuments = internalAction({
  args: {},
  handler: async (ctx): Promise<{ twitterContentCount: number; prefixedDocCount: number }> => {
    const twitterContent: Array<{ subscriptionContentId: string; documentId: string; title: string }> = await ctx.runQuery(
      internal.migrations.cleanup_irrelevant_twitter.getTwitterContentWithDocuments, {}
    );
    const prefixedDocs: Array<{ documentId: string; title: string; content: string }> = await ctx.runQuery(
      internal.migrations.cleanup_irrelevant_twitter.getTwitterPrefixedDocuments, {}
    );

    
    
    for (const item of twitterContent.slice(0, 15)) {
      
    }
    for (const doc of prefixedDocs.slice(0, 15)) {
      
    }

    return {
      twitterContentCount: twitterContent.length,
      prefixedDocCount: prefixedDocs.length,
    };
  },
});

interface CleanupResult {
  scored: number;
  kept: number;
  removed: number;
  deletedDocs: number;
  deletedContent: number;
  deletedFeedItems: number;
}

/**
 * Score a chunk of twitter content and delete irrelevant items.
 * Processes PAGE_SIZE items per invocation to avoid Convex 600s timeout.
 * Call with offset=0 first, then increment by PAGE_SIZE until done.
 *
 * npx convex run migrations/cleanup_irrelevant_twitter_actions:cleanupIrrelevantTwitter '{"offset": 0}'
 */
const PAGE_SIZE = 60; // ~3 LLM batches of 20, fits within 600s timeout

export const cleanupIrrelevantTwitter = internalAction({
  args: {
    offset: v.optional(v.number()),
  },
  handler: async (ctx, { offset: startOffset }): Promise<CleanupResult> => {
    const offset = startOffset ?? 0;

    const twitterContent: Array<{ subscriptionContentId: string; documentId: string; title: string }> = await ctx.runQuery(
      internal.migrations.cleanup_irrelevant_twitter.getTwitterContentWithDocuments, {}
    );
    const prefixedDocs: Array<{ documentId: string; title: string; content: string }> = await ctx.runQuery(
      internal.migrations.cleanup_irrelevant_twitter.getTwitterPrefixedDocuments, {}
    );

    // Build unified scoring list, dedup by documentId
    const allItems: Array<{
      id: string;
      title: string;
      contentPreview?: string;
      subscriptionContentId?: string;
      documentId?: string;
    }> = [];

    for (const record of twitterContent) {
      allItems.push({
        id: record.subscriptionContentId,
        title: record.title,
        subscriptionContentId: record.subscriptionContentId,
        documentId: record.documentId || undefined,
      });
    }

    const linkedDocIds = new Set(twitterContent.map((t: any) => t.documentId).filter(Boolean));
    for (const doc of prefixedDocs) {
      if (!linkedDocIds.has(doc.documentId)) {
        allItems.push({
          id: doc.documentId,
          title: doc.title,
          contentPreview: doc.content,
          documentId: doc.documentId,
        });
      }
    }

    // Paginate
    const itemsToScore = allItems.slice(offset, offset + PAGE_SIZE);
    const hasMore = offset + PAGE_SIZE < allItems.length;


    if (itemsToScore.length === 0) {
      
      return { scored: 0, kept: 0, removed: 0, deletedDocs: 0, deletedContent: 0, deletedFeedItems: 0 };
    }

    // Score in batches
    const allScores: Array<{ id: string; score: number; reason: string }> = [];
    for (let i = 0; i < itemsToScore.length; i += BATCH_SIZE) {
      const batch = itemsToScore.slice(i, i + BATCH_SIZE);
      const scores = await ctx.runAction(
        internal.migrations.cleanup_irrelevant_twitter_actions.scoreTwitterRelevance,
        {
          items: batch.map((item) => ({
            id: item.id,
            title: item.title,
            contentPreview: item.contentPreview,
          })),
        }
      );
      allScores.push(...scores);
    }

    // Partition into keep/remove
    const subscriptionContentToDelete: string[] = [];
    const documentsToDelete: string[] = [];
    const kept: string[] = [];
    const removed: string[] = [];

    for (let i = 0; i < itemsToScore.length; i++) {
      const item = itemsToScore[i];
      const scoreResult = allScores[i];

      if (scoreResult && scoreResult.score < RELEVANCE_THRESHOLD) {
        if (item.subscriptionContentId) subscriptionContentToDelete.push(item.subscriptionContentId);
        if (item.documentId) documentsToDelete.push(item.documentId);
        removed.push(`[${scoreResult.score.toFixed(2)}] "${item.title}" — ${scoreResult.reason}`);
      } else {
        kept.push(`[${scoreResult?.score.toFixed(2)}] "${item.title}"`);
      }
    }

    
    const feedItemIds: string[] = await ctx.runQuery(
      internal.migrations.cleanup_irrelevant_twitter.getFeedItemsByContentIds,
      { contentIds: subscriptionContentToDelete }
    );

    // Execute deletion
    if (subscriptionContentToDelete.length > 0 || documentsToDelete.length > 0) {
      const result: { deletedDocs: number; deletedContent: number; deletedFeedItems: number } = await ctx.runMutation(
        internal.migrations.cleanup_irrelevant_twitter.deleteIrrelevantContent,
        {
          subscriptionContentIds: subscriptionContentToDelete,
          documentIds: documentsToDelete,
          feedItemIds,
        }
      );

      if (hasMore) {
        
      }

      return {
        scored: itemsToScore.length,
        kept: kept.length,
        removed: removed.length,
        ...result,
      };
    }

    if (hasMore) {
      console.log(`Page done (nothing to delete). Run next page: npx convex run migrations/cleanup_irrelevant_twitter_actions:cleanupIrrelevantTwitter '{"offset": ${offset + PAGE_SIZE}}'`);
    }

    return { scored: itemsToScore.length, kept: kept.length, removed: removed.length, deletedDocs: 0, deletedContent: 0, deletedFeedItems: 0 };
  },
});
