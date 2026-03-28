"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { generateText } from "ai";
import { zaiFlash } from "../lib/ai/zai_provider";

/**
 * Batch-score an array of content items for relevance to a creator's topic area.
 *
 * Sends all items in a single LLM prompt for efficiency. Falls back to
 * returning an empty array (no AI scores) if the LLM call fails so the
 * existing keyword scoring remains unaffected.
 */
export const scoreContentRelevance = internalAction({
  args: {
    items: v.array(v.object({ title: v.string(), platform: v.string() })),
    sourceName: v.string(),
    topic: v.string(),
  },
  handler: async (_ctx, { items, sourceName, topic }): Promise<Array<{ score: number; reason: string }>> => {
    if (items.length === 0) return [];

    const itemList = items
      .map((item, i) => `${i + 1}. [${item.platform}] ${item.title}`)
      .join("\n");

    const prompt = `You are a relevance scorer for a personal content feed. Score each item 0.0-1.0 for relevance to the creator's topic area.

Creator: ${sourceName}
Topic/Category: ${topic}

Items to score:
${itemList}

Rules:
- Score 0.9-1.0: Directly about the topic
- Score 0.5-0.8: Tangentially related
- Score 0.0-0.3: Unrelated (personal, off-topic, promotional)

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
