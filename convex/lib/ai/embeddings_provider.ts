/**
 * Embedding Provider for Vercel AI SDK
 *
 * Uses Cohere's embed-english-v3.0 model for vector embeddings.
 * Produces 1024-dimensional vectors compatible with Convex vector indexes.
 *
 * Why Cohere:
 * - 1024 dimensions (matches our schema)
 * - Generous free tier
 * - High quality semantic embeddings
 * - Works independently of chat model provider
 */

"use node";

import { createCohere } from "@ai-sdk/cohere";

/**
 * Cohere provider instance
 * Native Cohere SDK integration for embeddings
 */
const cohere = createCohere({
  apiKey: process.env.COHERE_API_KEY ?? "",
});

/**
 * Cohere embedding model
 *
 * Model: embed-english-v3.0
 * Dimensions: 1024
 *
 * @example
 * ```ts
 * const { embedding } = await embed({
 *   model: cohereEmbedding,
 *   value: "Search query text",
 * });
 * ```
 */
export const cohereEmbedding = cohere.embedding("embed-english-v3.0");
