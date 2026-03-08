/**
 * Embedding Generation Utilities for Research Records
 *
 * Generates vector embeddings for research iterations and findings
 * using OpenAI's text-embedding-3-small model (1536 dimensions)
 */

"use node";

import { embed } from "ai";
import { openai } from "@ai-sdk/openai";

/**
 * Generate embedding for iteration findings text
 *
 * Truncates to 8000 chars to stay within token limits
 * @param findingsText - Narrative summary from synthesis
 * @returns 1536-dimensional embedding vector
 */
export async function generateIterationEmbedding(
  findingsText: string
): Promise<number[]> {
  const MAX_LENGTH = 8000;
  const truncated = findingsText.slice(0, MAX_LENGTH);

  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: truncated,
  });

  return embedding;
}

/**
 * Generate embedding for individual research finding
 *
 * @param claimText - The claim text from a structured finding
 * @returns 1536-dimensional embedding vector
 */
export async function generateFindingEmbedding(
  claimText: string
): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: claimText,
  });

  return embedding;
}

/**
 * Generate embedding for search query
 *
 * Used for semantic search across past research
 * @param query - Search query string
 * @returns 1536-dimensional embedding vector
 */
export async function generateQueryEmbedding(
  query: string
): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: query,
  });

  return embedding;
}
