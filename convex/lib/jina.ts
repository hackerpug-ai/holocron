/**
 * Jina AI Helper Module
 *
 * Centralized helper for Jina AI API operations:
 * - Jina Search API (s.jina.ai): Web search with AI-ranked results
 * - Jina Reader API (r.jina.ai): Clean content extraction from URLs
 *
 * Features:
 * - Consistent error handling across all Jina operations
 * - Loose Zod validation for flexible responses
 * - Type-safe interfaces
 * - Rate limiting support
 * - Timeout handling
 */

import { z } from 'zod';

/**
 * Jina Search API response schema (loose validation)
 *
 * Jina Search returns an array of search results with varying fields.
 * We use loose validation to handle API changes gracefully.
 */
export const JinaSearchResultSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  description: z.string().optional(),
  link: z.string().optional(), // Alternative to 'url'
}).passthrough(); // Allow extra fields

export type JinaSearchResult = z.infer<typeof JinaSearchResultSchema>;

/**
 * Jina Reader API response schema (loose validation)
 *
 * Jina Reader returns text content. We validate minimally
 * to handle different response formats gracefully.
 */
export const JinaReaderResultSchema = z.object({
  content: z.string().optional(),
  text: z.string().optional(), // Alternative field name
  title: z.string().optional(),
  url: z.string().optional(),
}).passthrough(); // Allow extra fields

export type JinaReaderResult = z.infer<typeof JinaReaderResultSchema>;

/**
 * Error types for Jina operations
 */
export class JinaError extends Error {
  constructor(
    message: string,
    public readonly type: 'rate_limit' | 'auth' | 'network' | 'validation' | 'unknown',
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'JinaError';
  }
}

/**
 * Configuration options for Jina API calls
 */
export interface JinaConfig {
  apiKey: string;
  timeout?: number; // Default: 30000ms
  signal?: AbortSignal;
}

/**
 * Options for Jina Search API
 */
export interface JinaSearchOptions extends Partial<JinaConfig> {
  limit?: number; // Default: 10 results
}

/**
 * Options for Jina Reader API
 */
export interface JinaReaderOptions extends Partial<JinaConfig> {
  returnFormat?: 'markdown' | 'text' | 'html'; // Default: markdown
  userAgent?: string;
}

/**
 * Perform web search using Jina Search API
 *
 * @param query - Search query string
 * @param options - Search options (apiKey, timeout, limit)
 * @returns Promise<JinaSearchResult[]> - Array of search results
 *
 * @throws JinaError on API errors, rate limits, or network issues
 *
 * @example
 * ```typescript
 * const results = await jinaSearch('TypeScript best practices', {
 *   apiKey: process.env.JINA_API_KEY,
 *   limit: 5
 * });
 * ```
 */
export async function jinaSearch(
  query: string,
  options: JinaSearchOptions = {}
): Promise<JinaSearchResult[]> {
  const { apiKey, timeout = 30000, signal, limit = 10 } = options;

  if (!apiKey) {
    throw new JinaError('JINA_API_KEY is required', 'auth');
  }

  if (!query || query.trim().length === 0) {
    throw new JinaError('Search query cannot be empty', 'validation');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Use provided signal if available, otherwise use our controller
  const effectiveSignal = signal || controller.signal;

  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://s.jina.ai/?q=${encodedQuery}`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      signal: effectiveSignal,
    });

    clearTimeout(timeoutId);

    // Handle rate limiting
    if (response.status === 429) {
      throw new JinaError(
        'Jina Search API rate limit exceeded',
        'rate_limit',
        429
      );
    }

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      throw new JinaError(
        'Invalid Jina API key',
        'auth',
        response.status
      );
    }

    // Handle other HTTP errors
    if (!response.ok) {
      throw new JinaError(
        `Jina Search API error: ${response.status} ${response.statusText}`,
        'network',
        response.status
      );
    }

    // Parse response with loose validation
    const rawData = await response.json();

    // Handle both array and object responses
    const resultsArray = Array.isArray(rawData) ? rawData : rawData.data || [];

    // Validate each result loosely (allow extra fields, make fields optional)
    const validatedResults = resultsArray
      .map((item: unknown) => {
        try {
          const parsed = JinaSearchResultSchema.parse(item);
          // Ensure all required fields have fallback values
          return {
            title: parsed.title || parsed.link || 'Unknown',
            url: parsed.url || parsed.link || '',
            content: parsed.content || parsed.description || '',
            ...parsed, // Preserve any extra fields from passthrough
          };
        } catch {
          // On validation error, return a minimal valid object
          const itemObj = item as Record<string, unknown>;
          return {
            title: String(itemObj.title || itemObj.link || 'Unknown'),
            url: String(itemObj.url || itemObj.link || ''),
            content: String(itemObj.content || itemObj.description || ''),
          };
        }
      })
      .slice(0, limit);

    return validatedResults;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof JinaError) {
      throw error;
    }

    // Handle AbortError (timeout or cancellation)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new JinaError(
        'Jina Search API request timed out',
        'network',
        undefined,
        error
      );
    }

    // Handle network errors
    if (error instanceof Error) {
      throw new JinaError(
        `Jina Search API network error: ${error.message}`,
        'network',
        undefined,
        error
      );
    }

    throw new JinaError(
      'Unknown error occurred in Jina Search API',
      'unknown',
      undefined,
      error
    );
  }
}

/**
 * Extract clean content from a URL using Jina Reader API
 *
 * @param url - URL to read and extract content from
 * @param options - Reader options (apiKey, timeout, returnFormat)
 * @returns Promise<string> - Extracted content as text
 *
 * @throws JinaError on API errors, rate limits, or network issues
 *
 * @example
 * ```typescript
 * const content = await jinaReader('https://example.com/article', {
 *   apiKey: process.env.JINA_API_KEY,
 *   returnFormat: 'markdown'
 * });
 * ```
 */
export async function jinaReader(
  url: string,
  options: JinaReaderOptions = {}
): Promise<string> {
  const { apiKey, timeout = 30000, signal, returnFormat = 'markdown' } = options;

  if (!apiKey) {
    throw new JinaError('JINA_API_KEY is required', 'auth');
  }

  if (!url || url.trim().length === 0) {
    throw new JinaError('URL cannot be empty', 'validation');
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    throw new JinaError('Invalid URL format', 'validation');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Use provided signal if available, otherwise use our controller
  const effectiveSignal = signal || controller.signal;

  try {
    // Jina Reader API: https://r.jina.ai/{url}
    const readerUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'text/plain',
    };

    if (returnFormat !== 'markdown') {
      headers['X-Return-Format'] = returnFormat;
    }

    const response = await fetch(readerUrl, {
      method: 'GET',
      headers,
      signal: effectiveSignal,
    });

    clearTimeout(timeoutId);

    // Handle rate limiting
    if (response.status === 429) {
      throw new JinaError(
        'Jina Reader API rate limit exceeded',
        'rate_limit',
        429
      );
    }

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      throw new JinaError(
        'Invalid Jina API key',
        'auth',
        response.status
      );
    }

    // Handle not found or other errors gracefully
    if (!response.ok) {
      throw new JinaError(
        `Jina Reader API error: ${response.status} ${response.statusText}`,
        'network',
        response.status
      );
    }

    const content = await response.text();

    if (!content || content.trim().length === 0) {
      throw new JinaError(
        'No content extracted from URL',
        'validation'
      );
    }

    return content;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof JinaError) {
      throw error;
    }

    // Handle AbortError (timeout or cancellation)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new JinaError(
        'Jina Reader API request timed out',
        'network',
        undefined,
        error
      );
    }

    // Handle network errors
    if (error instanceof Error) {
      throw new JinaError(
        `Jina Reader API network error: ${error.message}`,
        'network',
        undefined,
        error
      );
    }

    throw new JinaError(
      'Unknown error occurred in Jina Reader API',
      'unknown',
      undefined,
      error
    );
  }
}

/**
 * Batch read multiple URLs using Jina Reader API
 *
 * @param urls - Array of URLs to read
 * @param options - Reader options (apiKey, timeout, returnFormat)
 * @returns Promise<Map<string, string>> - Map of URL to extracted content
 *
 * @throws JinaError on API errors (individual errors are caught, not thrown)
 *
 * @example
 * ```typescript
 * const results = await jinaReaderBatch([
 *   'https://example.com/article1',
 *   'https://example.com/article2'
 * ], {
 *   apiKey: process.env.JINA_API_KEY
 * });
 *
 * for (const [url, content] of results.entries()) {
 *   console.log(`${url}: ${content.length} characters`);
 * }
 * ```
 */
export async function jinaReaderBatch(
  urls: string[],
  options: JinaReaderOptions = {}
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Process URLs in parallel with Promise.allSettled
  const promises = urls.map(async (url) => {
    try {
      const content = await jinaReader(url, options);
      return { url, content, success: true };
    } catch (error) {
      // Log error but don't fail entire batch
      console.error(`[jinaReaderBatch] Failed to read ${url}:`, error);
      return { url, content: '', success: false, error };
    }
  });

  const outcomes = await Promise.allSettled(promises);

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      const result = outcome.value;
      if (result.success) {
        results.set(result.url, result.content);
      }
    }
  }

  return results;
}

/**
 * Search and read combined operation
 *
 * Performs a search, then reads the top N results using Jina Reader.
 * Useful for getting full content from search results.
 *
 * @param query - Search query
 * @param options - Combined options
 * @returns Promise<Array<{url: string, title: string, content: string}>>
 *
 * @example
 * ```typescript
 * const results = await jinaSearchAndRead('AI news today', {
 *   apiKey: process.env.JINA_API_KEY,
 *   searchLimit: 3,
 *   readLimit: 2
 * });
 * ```
 */
export async function jinaSearchAndRead(
  query: string,
  options: {
    apiKey: string;
    timeout?: number;
    signal?: AbortSignal;
    searchLimit?: number; // Default: 5
    readLimit?: number; // Default: 3
  }
): Promise<Array<{ url: string; title: string; content: string }>> {
  const { apiKey, timeout, signal, searchLimit = 5, readLimit = 3 } = options;

  // Step 1: Perform search
  const searchResults = await jinaSearch(query, {
    apiKey,
    timeout,
    signal,
    limit: searchLimit,
  });

  // Step 2: Extract URLs from search results
  const urlsToRead = searchResults
    .map((result) => result.url || result.link || '')
    .filter((url) => url.length > 0)
    .slice(0, readLimit);

  // Step 3: Read content from top URLs
  const contentMap = await jinaReaderBatch(urlsToRead, {
    apiKey,
    timeout,
    signal,
  });

  // Step 4: Combine results
  const combinedResults: Array<{ url: string; title: string; content: string }> = [];

  for (const searchResult of searchResults.slice(0, readLimit)) {
    const url = searchResult.url || searchResult.link || '';
    if (url && contentMap.has(url)) {
      combinedResults.push({
        url,
        title: searchResult.title || 'Untitled',
        content: contentMap.get(url)!,
      });
    }
  }

  return combinedResults;
}
