"use node";

/**
 * Triage Agent
 *
 * Lightweight intent classification using zaiFlash (no tools).
 * Classifies user messages into intent categories and optionally
 * generates direct responses for conversational intents.
 */

import { generateText } from "ai";
import { zaiFlash } from "../lib/ai/zai_provider";
import { TRIAGE_SYSTEM_PROMPT } from "./prompts";

type LlmMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type IntentCategory =
  | "conversation"
  | "knowledge"
  | "research"
  | "commerce"
  | "subscriptions"
  | "discovery"
  | "documents"
  | "analysis"
  | "multi_step";

export interface TriageResult {
  intent: IntentCategory;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  directResponse?: string;
}

const VALID_INTENTS: IntentCategory[] = [
  "conversation",
  "knowledge",
  "research",
  "commerce",
  "subscriptions",
  "discovery",
  "documents",
  "analysis",
  "multi_step",
];

const VALID_CONFIDENCES = ["high", "medium", "low"] as const;

/**
 * Classify user intent from conversation context.
 * Uses zaiFlash with no tools for fast, cheap classification.
 * Returns intent category, confidence, and optional direct response.
 */
export async function classifyIntent(
  messages: LlmMessage[],
): Promise<TriageResult> {
  // Use only the last 5 messages to keep cost low
  const recentMessages = messages.slice(-5);

  try {
    const result = await generateText({
      model: zaiFlash(),
      system: TRIAGE_SYSTEM_PROMPT,
      messages: recentMessages,
    });

    const text = result.text?.trim() ?? "";

    // Try to parse JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(
        "[triage] Failed to extract JSON from response:",
        text.slice(0, 200),
      );
      return fallbackResult();
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate intent
    const intent = VALID_INTENTS.includes(parsed.intent)
      ? (parsed.intent as IntentCategory)
      : null;
    if (!intent) {
      console.warn("[triage] Invalid intent:", parsed.intent);
      return fallbackResult();
    }

    // Validate confidence
    const confidence = VALID_CONFIDENCES.includes(parsed.confidence)
      ? (parsed.confidence as "high" | "medium" | "low")
      : "low";

    return {
      intent,
      confidence,
      reasoning: parsed.reasoning ?? "",
      directResponse:
        intent === "conversation" ? parsed.directResponse : undefined,
    };
  } catch (error) {
    console.error("[triage] Classification failed:", error);
    return fallbackResult();
  }
}

function fallbackResult(): TriageResult {
  return {
    intent: "conversation",
    confidence: "low",
    reasoning: "Classification failed, falling back",
  };
}
