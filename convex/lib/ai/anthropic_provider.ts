/**
 * Anthropic Claude Provider for Vercel AI SDK
 *
 * Native Anthropic provider integration for Claude models.
 * Provides Haiku, Sonnet, and Opus tier models.
 *
 * Model Mapping:
 * - claude-haiku-4-5-20251001: Flash/Haiku tier - Fast model for agents, parallel tasks, chat titles
 * - claude-sonnet-4-6: Pro/Sonnet tier - Full model for synthesis, review, complex reasoning
 * - claude-opus-4-6: Ultra/Opus tier - Premium reasoning model
 */

"use node";

import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * Anthropic provider instance
 * Native Anthropic SDK integration
 */
export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

/**
 * Fast chat model for parallel tasks and quick operations (Flash/Haiku tier)
 *
 * Use for:
 * - Research agents (parallel fan-out searches)
 * - Chat title generation
 * - Intent classification (triage)
 * - Quick synthesis operations
 * - Content scoring
 *
 * Model: claude-haiku-4-5-20251001 (replaces glm-4.5, gpt-5.4-mini, gpt-5.4-nano, gpt-4o-mini)
 */
export const claudeFlash = () => anthropic("claude-haiku-4-5-20251001");

/**
 * Full chat model for synthesis and review (Pro/Sonnet tier)
 *
 * Use for:
 * - Research synthesis (deep research loop)
 * - Coverage review and assessment
 * - Complex reasoning tasks
 * - Chat agent specialist responses
 * - Document generation
 *
 * Model: claude-sonnet-4-6 (replaces glm-4.7, gpt-5.4)
 */
export const claudePro = () => anthropic("claude-sonnet-4-6");

/**
 * Ultra reasoning model for final synthesis (Ultra/Opus tier)
 *
 * Use for:
 * - Final document synthesis (bringing together ideas)
 * - Complex multi-source integration
 * - High-quality report generation
 *
 * Model: claude-opus-4-6 (replaces glm-4.7 ultra tier)
 */
export const claudeUltra = () => anthropic("claude-opus-4-6");
