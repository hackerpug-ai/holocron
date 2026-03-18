/**
 * Embedding Generation Utilities for Research Records
 *
 * Generates vector embeddings for research iterations and findings
 * using Cohere's embed-english-v3.0 model (1024 dimensions)
 */

"use node";

import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";

/**
 * Generate embedding for iteration findings text
 *
 * Truncates to 8000 chars to stay within token limits
 * @param findingsText - Narrative summary from synthesis
 * @returns embedding vector from zembed-1
 */
export async function generateIterationEmbedding(
  findingsText: string
): Promise<number[]> {
  const MAX_LENGTH = 8000;
  const truncated = findingsText.slice(0, MAX_LENGTH);

  const { embedding } = await embed({
    model: cohereEmbedding,
    value: truncated,
  });

  return embedding;
}

/**
 * Generate embedding for individual research finding
 *
 * @param claimText - The claim text from a structured finding
 * @returns embedding vector from zembed-1
 */
export async function generateFindingEmbedding(
  claimText: string
): Promise<number[]> {
  const { embedding } = await embed({
    model: cohereEmbedding,
    value: claimText,
  });

  return embedding;
}

/**
 * Generate embedding for search query
 *
 * Used for semantic search across past research
 * @param query - Search query string
 * @returns embedding vector from zembed-1
 */
export async function generateQueryEmbedding(
  query: string
): Promise<number[]> {
  const { embedding } = await embed({
    model: cohereEmbedding,
    value: query,
  });

  return embedding;
}
