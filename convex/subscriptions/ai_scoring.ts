"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { generateText } from "ai";
import { zaiFlash } from "../lib/ai/zai_provider";
import { internal } from "../_generated/api";

/**
 * Batch-score an array of content items for relevance to a creator's topic area.
 *
 * Sends all items in a single LLM prompt for efficiency. Falls back to
 * returning an empty array (no AI scores) if the LLM call fails so the
 * existing keyword scoring remains unaffected.
 *
 * Enhanced with user feedback: Incorporates recent up/down votes as few-shot examples.
 */
export const scoreContentRelevance = internalAction({
  args: {
    items: v.array(v.object({ title: v.string(), platform: v.string() })),
    sourceName: v.string(),
    topic: v.string(),
  },
  handler: async (ctx, { items, sourceName, topic }): Promise<Array<{ score: number; reason: string }>> => {
    if (items.length === 0) return [];

    // Fetch recent user feedback for few-shot examples
    const recentFeedback = await ctx.runQuery(internal.feeds.internal.getRecentFeedback, { limit: 20 });

    // Build few-shot examples from user feedback
    const likedExamples = recentFeedback
      .filter((f) => f.feedback === "up")
      .slice(0, 5)
      .map((f) => f.title)
      .join("\n");

    const dislikedExamples = recentFeedback
      .filter((f) => f.feedback === "down")
      .slice(0, 5)
      .map((f) => f.title)
      .join("\n");

    const itemList = items
      .map((item, i) => `${i + 1}. [${item.platform}] ${item.title}`)
      .join("\n");

    // Platform-specific scoring rules
    const hasTwitterOrBluesky = items.some(item =>
      item.platform.toLowerCase() === 'twitter' || item.platform.toLowerCase() === 'bluesky'
    );

    let platformRules = '';
    if (hasTwitterOrBluesky) {
      platformRules = `
Platform-specific rules for [twitter]/[bluesky] — evaluate on TWO axes, then combine:

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

Platform-specific rules for [youtube]/[github]/[blog]:
- Score 0.9-1.0: Directly about the topic with substantial content
- Score 0.5-0.8: Tangentially related or brief mentions
- Score 0.0-0.3: Unrelated (personal, off-topic, promotional)
`;
    }

    // Build user feedback section
    let feedbackSection = '';
    if (likedExamples || dislikedExamples) {
      feedbackSection = `
User preferences (learned from past feedback):
${likedExamples ? `Items the user liked (score these HIGH):\n${likedExamples}\n` : ''}
${dislikedExamples ? `Items the user disliked (score these LOW):\n${dislikedExamples}\n` : ''}`;
    }

    const prompt = `You are a relevance scorer for a personal content feed. Score each item 0.0-1.0 for relevance to the creator's topic area.

Creator: ${sourceName}
Topic/Category: ${topic}
${feedbackSection}
Items to score:
${itemList}

General rules:
- Score 0.9-1.0: Directly about the topic
- Score 0.5-0.8: Tangentially related
- Score 0.0-0.3: Unrelated (personal, off-topic, promotional)
${platformRules}
Respond with ONLY a JSON array, no other text: [{"score": 0.8, "reason": "brief reason"}, ...]
The array must have exactly ${items.length} entries in the same order as the items.`;

    try {
      const result = await generateText({
        model: zaiFlash(),
        prompt,
      });

      const text = result.text.trim();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn("[scoreContentRelevance] No JSON array found in response");
        return [];
      }

      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      const scores = parsed.map((entry: unknown) => {
        const obj = entry as Record<string, unknown>;
        const score = typeof obj.score === "number" ? Math.min(1, Math.max(0, obj.score)) : 0.5;
        const reason = typeof obj.reason === "string" ? obj.reason : "ai_scored";
        return { score, reason };
      });

      while (scores.length < items.length) {
        scores.push({ score: 0.5, reason: "ai_no_score" });
      }

      return scores.slice(0, items.length);
    } catch (err) {
      console.warn("[scoreContentRelevance] LLM scoring failed, skipping:", err);
      return [];
    }
  },
});
