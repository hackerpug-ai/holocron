/**
 * Research Intent Classification
 *
 * Classifies research queries into modes that determine output style:
 * - OVERVIEW: Landscape, trends, market state
 * - ACTIONABLE: Implementation guidance, how-to, architecture
 * - COMPARATIVE: Evaluating options, trade-offs
 * - EXPLORATORY: Open-ended discovery, categorized approaches
 *
 * Mode is orthogonal to execution strategy (parallel_fan_out, single_pass, etc.)
 * Strategy determines HOW to search; mode determines WHAT to produce.
 */

"use node";

import { generateText } from "ai";
import { zaiFlash } from "../lib/ai/zai_provider";
import { stripMarkdownCodeBlock } from "../lib/json";

export type ResearchMode = "OVERVIEW" | "ACTIONABLE" | "COMPARATIVE" | "EXPLORATORY";

export interface IntentClassification {
  mode: ResearchMode;
  reasoning: string;
  outputGuidance: string;
}

/**
 * Classify research intent using LLM with heuristic fallback.
 *
 * Cost: ~$0.0005 per call (zaiFlash).
 * Latency: ~1-2s (runs concurrently with strategy selection).
 */
export async function classifyResearchIntent(topic: string): Promise<IntentClassification> {
  console.log(`[classifyResearchIntent] Entry - topic: "${topic}"`);

  try {
    const result = await generateText({
      model: zaiFlash(),
      prompt: `Classify this research query into exactly ONE mode based on what the user wants to learn.

Query: "${topic}"

Modes:
- OVERVIEW: User wants a landscape view, market state, trends, or general understanding of a domain. Signals: "state of", "landscape", "trends in", "what's happening", "overview of", broad topic names without action verbs.
- ACTIONABLE: User wants concrete implementation guidance, architecture patterns, how-to instructions, or specific technical solutions. Signals: "how to", "architect", "implement", "build", "design", "best way to", "configure", "set up", "create", "make".
- COMPARATIVE: User wants to evaluate options, understand trade-offs, or make a decision between alternatives. Signals: "vs", "compare", "which is better", "alternatives to", "pros and cons", "difference between".
- EXPLORATORY: User wants to discover what approaches, methods, or solutions exist for a problem without committing to one. Signals: "what are approaches to", "options for", "ways to", "methods for", "strategies for", open-ended questions.

Return ONLY a JSON object:
{
  "mode": "OVERVIEW" | "ACTIONABLE" | "COMPARATIVE" | "EXPLORATORY",
  "reasoning": "Brief explanation of why this mode was chosen",
  "outputGuidance": "Specific instruction for what the research output should focus on"
}`,
    });

    const parsed = JSON.parse(stripMarkdownCodeBlock(result.text)) as IntentClassification;

    // Validate mode is one of the expected values
    const validModes: ResearchMode[] = ["OVERVIEW", "ACTIONABLE", "COMPARATIVE", "EXPLORATORY"];
    if (!validModes.includes(parsed.mode)) {
      throw new Error(`Invalid mode: ${parsed.mode}`);
    }

    console.log(`[classifyResearchIntent] LLM classified as ${parsed.mode}: ${parsed.reasoning}`);
    return parsed;
  } catch (error) {
    console.warn(
      `[classifyResearchIntent] LLM classification failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return classifyResearchIntentHeuristic(topic);
  }
}

/**
 * Heuristic fallback for intent classification.
 * Uses keyword matching when LLM is unavailable.
 */
function classifyResearchIntentHeuristic(topic: string): IntentClassification {
  const lower = topic.toLowerCase();

  // COMPARATIVE signals
  if (
    lower.includes(" vs ") ||
    lower.includes(" versus ") ||
    lower.includes("compare ") ||
    lower.includes("comparison") ||
    lower.includes("which is better") ||
    lower.includes("alternatives to") ||
    lower.includes("pros and cons") ||
    lower.includes("difference between")
  ) {
    console.log(`[classifyResearchIntent] Heuristic: COMPARATIVE`);
    return {
      mode: "COMPARATIVE",
      reasoning: "Query contains comparison signals",
      outputGuidance: "Focus on side-by-side analysis, trade-offs, decision criteria, and when to use each option.",
    };
  }

  // ACTIONABLE signals
  if (
    lower.includes("how to ") ||
    lower.includes("how do i ") ||
    lower.includes("architect") ||
    lower.includes("implement") ||
    lower.includes("build ") ||
    lower.includes("design ") ||
    lower.includes("best way to") ||
    lower.includes("configure") ||
    lower.includes("set up") ||
    lower.includes("create ") ||
    lower.includes("make ") ||
    lower.includes("step by step") ||
    lower.includes("tutorial") ||
    lower.includes("guide to")
  ) {
    console.log(`[classifyResearchIntent] Heuristic: ACTIONABLE`);
    return {
      mode: "ACTIONABLE",
      reasoning: "Query contains implementation/how-to signals",
      outputGuidance: "Focus on concrete patterns, code examples, architecture decisions, and step-by-step guidance.",
    };
  }

  // OVERVIEW signals
  if (
    lower.includes("state of") ||
    lower.includes("landscape") ||
    lower.includes("trends in") ||
    lower.includes("what's happening") ||
    lower.includes("overview of") ||
    lower.includes("market") ||
    lower.includes("industry") ||
    lower.includes("current state") ||
    lower.includes("future of")
  ) {
    console.log(`[classifyResearchIntent] Heuristic: OVERVIEW`);
    return {
      mode: "OVERVIEW",
      reasoning: "Query contains landscape/trends signals",
      outputGuidance: "Focus on market context, key players, trends, trajectory, and relevant statistics.",
    };
  }

  // Default to EXPLORATORY
  console.log(`[classifyResearchIntent] Heuristic: EXPLORATORY (default)`);
  return {
    mode: "EXPLORATORY",
    reasoning: "No strong signals for other modes; treating as open-ended exploration",
    outputGuidance: "Focus on categorizing different approaches with pros/cons and when-to-use guidance.",
  };
}
