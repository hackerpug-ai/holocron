/**
 * Z.ai (https://z.ai/) Provider for Vercel AI SDK
 *
 * Custom provider for Zhipu AI (Z.ai) GLM models.
 * Provides OpenAI-compatible interface with Z.ai's GLM series models.
 *
 * Model Mapping (aligned with Anthropic tiers):
 * - glm-4.5: Haiku-tier - Fast model for agents, parallel tasks, chat titles
 * - glm-4.7: Sonnet-tier - Full model for synthesis, review, complex reasoning
 * - glm-4.7: Opus-tier fallback (glm-5 not yet available on Z.ai)
 * - embedding-2: Embedding model for vector search
 */

"use node";

import { createOpenAI } from "@ai-sdk/openai";

/**
 * Z.ai base URL for API requests
 * Using the Coding API endpoint for unlimited plan access
 * Note: Coding endpoint is for coding scenarios only
 */
const ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";

/**
 * Z.ai provider instance
 * Uses OpenAI SDK with custom base URL for Z.ai compatibility
 *
 * IMPORTANT: Must use .chat() method to get Chat Completions API
 * Z.ai doesn't support OpenAI's newer Responses API (/responses endpoint)
 * Default zai(model) uses Responses API which returns 404 on Z.ai
 */
export const zai = createOpenAI({
  baseURL: ZAI_BASE_URL,
  apiKey: process.env.ZAI_API_KEY ?? "",
});

/**
 * Chat model factory
 *
 * @param model - Model identifier (default: glm-4.7)
 * @returns Chat model instance for use with generateText()
 *
 * @example
 * ```ts
 * const result = await generateText({
 *   model: zaiChat("glm-4.7"),
 *   prompt: "Hello, world!",
 * });
 * ```
 */
export const zaiChat = (model: string = "glm-4.7") => zai.chat(model);

/**
 * Fast chat model for parallel tasks and quick operations (Haiku-tier)
 *
 * Use for:
 * - Research agents (parallel fan-out searches)
 * - Chat title generation
 * - Quick synthesis operations
 *
 * Model: glm-4.5 (equivalent to Anthropic Haiku)
 */
export const zaiFlash = () => zai.chat("glm-4.5");

/**
 * Full chat model for synthesis and review (Sonnet-tier)
 *
 * Use for:
 * - Research synthesis (deep research loop)
 * - Coverage review and assessment
 * - Complex reasoning tasks
 *
 * Model: glm-4.7 (equivalent to Anthropic Sonnet)
 */
export const zaiPro = () => zai.chat("glm-4.7");

/**
 * Ultra reasoning model for final synthesis (Opus-tier)
 *
 * Use for:
 * - Final document synthesis (bringing together ideas)
 * - Complex multi-source integration
 * - High-quality report generation
 *
 * Model: glm-4.7 (glm-5 not yet available on Z.ai)
 */
export const zaiUltra = () => zai.chat("glm-4.7");

/**
 * Z.ai embedding model
 *
 * Uses Z.ai's embedding-2 model (OpenAI-compatible)
 * Produces 1024-dimensional vectors
 *
 * @example
 * ```ts
 * const { embedding } = await embed({
 *   model: zaiEmbedding,
 *   value: "Search query text",
 * });
 * ```
 */
export const zaiEmbedding = zai.embedding("embedding-2");
