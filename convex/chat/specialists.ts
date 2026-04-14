"use node";

/**
 * Specialist Registry
 *
 * Maps intent categories to specialist configurations.
 * Each specialist has a focused tool set, domain-optimized prompt, and model selection.
 */

import type { LanguageModel, ToolSet } from "ai";
import { claudeFlash, claudePro } from "../lib/ai/anthropic_provider";
import {
  knowledgeTools,
  researchTools,
  commerceTools,
  subscriptionTools,
  discoveryTools,
  documentTools,
  analysisTools,
  improvementTools,
  plannerTools,
} from "./tools";
import {
  KNOWLEDGE_SPECIALIST_PROMPT,
  RESEARCH_SPECIALIST_PROMPT,
  COMMERCE_SPECIALIST_PROMPT,
  SUBSCRIPTIONS_SPECIALIST_PROMPT,
  DISCOVERY_SPECIALIST_PROMPT,
  DOCUMENTS_SPECIALIST_PROMPT,
  ANALYSIS_SPECIALIST_PROMPT,
  IMPROVEMENTS_SPECIALIST_PROMPT,
  PLANNER_SPECIALIST_PROMPT,
} from "./specialistPrompts";
import type { IntentCategory } from "./triage";

export type { IntentCategory };

export type SpecialistName =
  | "knowledge"
  | "research"
  | "podcast"
  | "commerce"
  | "subscriptions"
  | "discovery"
  | "documents"
  | "analysis"
  | "improvements"
  | "planner";

export type SpecialistConfig = {
  name: SpecialistName;
  model: () => LanguageModel;
  tools: ToolSet;
  systemPrompt: string;
};

/**
 * Maps intent categories to specialist names.
 * "conversation" maps to null (handled directly by triage).
 */
export const INTENT_TO_SPECIALIST: Record<
  IntentCategory,
  SpecialistName | null
> = {
  conversation: null,
  knowledge: "knowledge",
  research: "research",
  podcast: "podcast",
  commerce: "commerce",
  subscriptions: "subscriptions",
  discovery: "discovery",
  documents: "documents",
  analysis: "analysis",
  improvements: "improvements",
  multi_step: "planner",
};

const SPECIALIST_CONFIGS: Record<SpecialistName, SpecialistConfig> = {
  knowledge: {
    name: "knowledge",
    model: claudeFlash,
    tools: knowledgeTools,
    systemPrompt: KNOWLEDGE_SPECIALIST_PROMPT,
  },
  research: {
    name: "research",
    model: claudePro,
    tools: researchTools,
    systemPrompt: RESEARCH_SPECIALIST_PROMPT,
  },
  podcast: {
    name: "podcast",
    model: claudePro,
    tools: researchTools, // Reuse research tools for podcast content analysis
    systemPrompt: RESEARCH_SPECIALIST_PROMPT, // Can customize later if needed
  },
  commerce: {
    name: "commerce",
    model: claudeFlash,
    tools: commerceTools,
    systemPrompt: COMMERCE_SPECIALIST_PROMPT,
  },
  subscriptions: {
    name: "subscriptions",
    model: claudeFlash,
    tools: subscriptionTools,
    systemPrompt: SUBSCRIPTIONS_SPECIALIST_PROMPT,
  },
  discovery: {
    name: "discovery",
    model: claudeFlash,
    tools: discoveryTools,
    systemPrompt: DISCOVERY_SPECIALIST_PROMPT,
  },
  documents: {
    name: "documents",
    model: claudePro,
    tools: documentTools,
    systemPrompt: DOCUMENTS_SPECIALIST_PROMPT,
  },
  analysis: {
    name: "analysis",
    model: claudePro,
    tools: analysisTools,
    systemPrompt: ANALYSIS_SPECIALIST_PROMPT,
  },
  improvements: {
    name: "improvements",
    model: claudePro,
    tools: improvementTools,
    systemPrompt: IMPROVEMENTS_SPECIALIST_PROMPT,
  },
  planner: {
    name: "planner",
    model: claudePro,
    tools: plannerTools,
    systemPrompt: PLANNER_SPECIALIST_PROMPT,
  },
};

/**
 * Get specialist configuration by name.
 * Throws if specialist not found.
 */
export function getSpecialist(name: SpecialistName): SpecialistConfig {
  const config = SPECIALIST_CONFIGS[name];
  if (!config) {
    throw new Error(`Unknown specialist: ${name}`);
  }
  return config;
}
