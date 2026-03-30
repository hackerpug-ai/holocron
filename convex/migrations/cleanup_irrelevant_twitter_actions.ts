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

The knowledge base tracks:
- AI coding tools and IDEs (Claude Code, Cursor, Copilot, Windsurf, Aider, etc.)
- LLM releases, benchmarks, and capabilities relevant to coding
- Agentic coding workflows and patterns
- MCP (Model Context Protocol) servers and tooling
- Developer tooling that integrates AI/LLMs
- AI model releases relevant to software engineering
- Technical analysis of AI architectures relevant to coding tools

IRRELEVANT (score 0.0-0.2):
- Vague hot takes ("Holy sh*t", "This is insane", "Mind blown")
- AI party tricks (playing games, tic tac toe, rock paper scissors, memes)
- General tech humor ("The hottest new programming language is English")
- Non-coding AI applications (art, music, video generation for entertainment)
- Generic programming opinions not related to AI tooling
- Personal life updates from tech personalities
- Engagement bait with no substance
- ChatGPT/Claude doing non-coding tasks
- One-liner reactions without technical content

RELEVANT (score 0.7-1.0):
- Model architecture analysis ("Kimi K2 is basically DeepSeek V3 but with fewer heads")
- Tool/model release announcements with technical detail
- Coding benchmarks and comparisons
- New MCP servers or integrations
- Agentic coding workflow tips
- AI coding tool reviews
- API/pricing changes for AI providers

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

    console.log(`Found ${twitterContent.length} twitter subscriptionContent records`);
    console.log(`Found ${prefixedDocs.length} [TWITTER]-prefixed documents`);
    for (const item of twitterContent.slice(0, 15)) {
      console.log(`  - "${item.title}"`);
    }
    for (const doc of prefixedDocs.slice(0, 15)) {
      console.log(`  - "${doc.title}"`);
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

/** Score all twitter content and delete irrelevant items */
export const cleanupIrrelevantTwitter = internalAction({
  args: {},
  handler: async (ctx): Promise<CleanupResult> => {
    const twitterContent: Array<{ subscriptionContentId: string; documentId: string; title: string }> = await ctx.runQuery(
      internal.migrations.cleanup_irrelevant_twitter.getTwitterContentWithDocuments, {}
    );
    const prefixedDocs: Array<{ documentId: string; title: string; content: string }> = await ctx.runQuery(
      internal.migrations.cleanup_irrelevant_twitter.getTwitterPrefixedDocuments, {}
    );

    // Build unified scoring list, dedup by documentId
    const itemsToScore: Array<{
      id: string;
      title: string;
      contentPreview?: string;
      subscriptionContentId?: string;
      documentId?: string;
    }> = [];

    for (const record of twitterContent) {
      itemsToScore.push({
        id: record.subscriptionContentId,
        title: record.title,
        subscriptionContentId: record.subscriptionContentId,
        documentId: record.documentId || undefined,
      });
    }

    const linkedDocIds = new Set(twitterContent.map((t: any) => t.documentId).filter(Boolean));
    for (const doc of prefixedDocs) {
      if (!linkedDocIds.has(doc.documentId)) {
        itemsToScore.push({
          id: doc.documentId,
          title: doc.title,
          contentPreview: doc.content,
          documentId: doc.documentId,
        });
      }
    }

    console.log(`Scoring ${itemsToScore.length} twitter items in batches of ${BATCH_SIZE}`);

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

    console.log(`Keeping ${kept.length} relevant items:`);
    for (const line of kept.slice(0, 20)) console.log(`  + ${line}`);

    console.log(`Removing ${removed.length} irrelevant items:`);
    for (const line of removed.slice(0, 20)) console.log(`  - ${line}`);

    // Find feedItems that reference the content being deleted
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

      return {
        scored: itemsToScore.length,
        kept: kept.length,
        removed: removed.length,
        ...result,
      };
    }

    return { scored: itemsToScore.length, kept: kept.length, removed: removed.length, deletedDocs: 0, deletedContent: 0, deletedFeedItems: 0 };
  },
});
