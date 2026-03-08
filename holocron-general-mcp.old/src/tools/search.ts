/**
 * Search tools - wrapping Convex search queries/actions
 */

import { ConvexHttpClient } from 'convex/browser';
import { SearchResult } from '../convex/types.js';
import { HolocronConfig } from '../config/env.js';

/**
 * Hybrid search: combines vector + FTS (50/50 weighted)
 * Requires embedding generation (uses OpenAI)
 */
export async function hybridSearch(
  client: ConvexHttpClient,
  config: HolocronConfig,
  args: {
    query: string;
    limit?: number;
    category?: string;
  }
): Promise<{ results: SearchResult[] }> {
  const { query, limit = 10, category } = args;

  // Generate embedding for hybrid search
  const embedding = await generateEmbedding(query, config.openaiApiKey);

  // Call Convex hybridSearch action
  const results = (await client.action('documents/search:hybridSearch', {
    query,
    embedding,
    limit,
    category,
  })) as SearchResult[];

  return { results };
}

/**
 * Full-text search: keyword-based search (no embeddings needed)
 */
export async function searchFts(
  client: ConvexHttpClient,
  args: {
    query: string;
    limit?: number;
    category?: string;
  }
): Promise<{ results: SearchResult[] }> {
  const { query, limit = 10, category } = args;

  // Call Convex fullTextSearch query
  const results = (await client.query('documents/queries:fullTextSearch', {
    query,
    limit,
    category,
  })) as SearchResult[];

  return { results };
}

/**
 * Vector search: semantic similarity search (requires embedding)
 */
export async function searchVector(
  client: ConvexHttpClient,
  config: HolocronConfig,
  args: {
    query: string;
    limit?: number;
    category?: string;
  }
): Promise<{ results: SearchResult[] }> {
  const { query, limit = 10, category } = args;

  // Generate embedding for vector search
  const embedding = await generateEmbedding(query, config.openaiApiKey);

  // Call Convex vectorSearch query
  const results = (await client.query('documents/queries:vectorSearch', {
    embedding,
    limit,
    category,
  })) as SearchResult[];

  return { results };
}

/**
 * Helper: Generate OpenAI embedding for search query
 */
async function generateEmbedding(
  text: string,
  apiKey: string
): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding as number[];
}
