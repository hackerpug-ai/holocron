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
Platform-specific rules for [twitter]/[bluesky]:
- Score 0.8-1.0 ONLY for: tool/model/API releases, technical benchmarks, original AI engineering insights, code examples, technical tutorials
- Score 0.0-0.3 for: personal opinions, vague musings, off-topic AI mentions, promotional content, hot takes, engagement bait, "just thinking" posts
- Be STRICT - most social media content should score low

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
