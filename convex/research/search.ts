/**
 * Parallel Search Module for Deep Research Optimization
 *
 * Implements parallel search execution with:
 * - Diverse query generation (academic, industry, practical, gap-focused)
 * - Promise.allSettled for resilient parallel execution
 * - Retry with exponential backoff
 * - URL-based deduplication
 * - Score-based result sorting
 */

"use node";

import Exa from "exa-js";
import { withRateLimit } from "./rateLimiter.js";

/**
 * Structured search result with metadata
 */
export interface StructuredSearchResult {
  source: string;
  url: string;
  title: string;
  content: string;
  score?: number;
  publishedDate?: string;
  author?: string;
}

/**
 * Parallel search execution options
 */
export interface ParallelSearchOptions {
  maxRetries?: number;
  timeoutMs?: number;
  deduplicateResults?: boolean;
}

/**
 * Result from parallel search execution
 */
export interface ParallelSearchResult {
  findings: string;
  structuredResults: StructuredSearchResult[];
  toolCallCount: number;
  durationMs: number;
}

/**
 * Generate diverse search queries for comprehensive coverage
 *
 * Creates 4 query variants:
 * 1. Academic/research-focused
 * 2. Industry/practical implementation
 * 3. Tutorial/how-to focused
 * 4. Gap-focused (based on previous gaps)
 */
export function generateDiverseQueries(
  topic: string,
  previousGaps: string[] = []
): string[] {
  const queries: string[] = [];

  // Academic/research query
  queries.push(`${topic} research papers academic study`);

  // Industry/practical implementation
  queries.push(`${topic} best practices implementation guide`);

  // Tutorial/how-to
  queries.push(`${topic} tutorial how to example`);

  // Gap-focused query (use first gap or refine topic)
  if (previousGaps.length > 0) {
    queries.push(`${topic} ${previousGaps[0]}`);
  } else {
    queries.push(`${topic} latest developments 2024 2025`);
  }

  return queries;
}

/**
 * Execute a single search with retry logic
 */
async function executeSearchWithRetry(
  searchFn: () => Promise<StructuredSearchResult[]>,
  maxRetries: number,
  timeoutMs: number
): Promise<StructuredSearchResult[]> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Search timeout")), timeoutMs);
      });

      // Race between search and timeout
      const results = await Promise.race([searchFn(), timeoutPromise]);
      return results;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[executeSearchWithRetry] Attempt ${attempt + 1}/${maxRetries + 1} failed:`,
        lastError.message
      );

      // Exponential backoff before retry
      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  console.error(
    `[executeSearchWithRetry] All retries exhausted:`,
    lastError?.message
  );
  return [];
}

/**
 * Execute Exa search for a query
 */
async function executeExaSearch(query: string): Promise<StructuredSearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.warn("[executeExaSearch] EXA_API_KEY not configured");
    return [];
  }

  const exa = new Exa(apiKey);

  // Apply rate limiting (10 QPS)
  const searchResults = await withRateLimit('exa', async () => {
    return await exa.searchAndContents(query, {
      numResults: 5,
      useAutoprompt: true,
    });
  });

  return searchResults.results.map((result: any) => ({
    source: "exa",
    url: result.url || "",
    title: result.title || "",
    content: (result.text || "").slice(0, 500),
    score: result.score || 0,
    publishedDate: result.publishedDate || undefined,
    author: result.author || undefined,
  }));
}

/**
 * Execute Jina search for a query
 */
async function executeJinaSearch(query: string): Promise<StructuredSearchResult[]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.warn("[executeJinaSearch] JINA_API_KEY not configured");
    return [];
  }

  const encodedQuery = encodeURIComponent(query);

  // Apply rate limiting (100 RPM for free tier)
  const response = await withRateLimit('jina', async () => {
    return await fetch(`https://s.jina.ai/?q=${encodedQuery}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
  });

  if (!response.ok) {
    throw new Error(`Jina search failed: ${response.status}`);
  }

  const data = await response.json();
  return (data.data || []).map((result: any) => ({
    source: "jina",
    url: result.url || result.link || "",
    title: result.title || "",
    content: (result.description || result.content || "").slice(0, 500),
    score: undefined,
  }));
}

/**
 * Deduplicate results by URL
 */
function deduplicateByUrl(
  results: StructuredSearchResult[]
): StructuredSearchResult[] {
  const seen = new Set<string>();
  const deduplicated: StructuredSearchResult[] = [];

  for (const result of results) {
    // Normalize URL for comparison
    const normalizedUrl = result.url.toLowerCase().replace(/\/$/, "");
    if (!seen.has(normalizedUrl) && normalizedUrl) {
      seen.add(normalizedUrl);
      deduplicated.push(result);
    }
  }

  return deduplicated;
}

/**
 * Sort results by score and source priority
 *
 * Priority: exa (academic) > jina (general)
 */
function sortByRelevance(
  results: StructuredSearchResult[]
): StructuredSearchResult[] {
  return results.sort((a, b) => {
    // First sort by score if available
    if (a.score !== undefined && b.score !== undefined) {
      return b.score - a.score;
    }

    // Prefer results with scores
    if (a.score !== undefined && b.score === undefined) return -1;
    if (a.score === undefined && b.score !== undefined) return 1;

    // Source priority: exa > jina
    const sourcePriority: Record<string, number> = {
      exa: 2,
      jina: 1,
    };
    return (sourcePriority[b.source] || 0) - (sourcePriority[a.source] || 0);
  });
}

/**
 * Format results into human-readable findings
 */
function formatFindings(results: StructuredSearchResult[]): string {
  if (results.length === 0) {
    return "No search results found.";
  }

  const formattedResults = results.map((result, index) => {
    return `[${index + 1}] **${result.title || "Untitled"}**
Source: ${result.source}
URL: ${result.url}
${result.content}
`;
  });

  return `Found ${results.length} relevant sources:\n\n${formattedResults.join("\n")}`;
}

/**
 * Execute parallel search with retry and deduplication
 *
 * Main entry point for optimized parallel search execution.
 * Generates diverse queries, executes in parallel with Promise.allSettled,
 * handles retries with exponential backoff, and deduplicates results.
 *
 * @param topic - Research topic
 * @param context - Research context (unused but kept for interface compatibility)
 * @param previousGaps - Gaps from previous iterations to focus search
 * @param options - Execution options (maxRetries, timeoutMs, deduplicateResults)
 * @returns Parallel search result with findings, structured results, stats
 */
export async function executeParallelSearchWithRetry(
  topic: string,
  _context: Record<string, unknown>,
  previousGaps: string[] = [],
  options: ParallelSearchOptions = {}
): Promise<ParallelSearchResult> {
  const startTime = Date.now();
  const {
    maxRetries = 2,
    timeoutMs = 15000,
    deduplicateResults = true,
  } = options;

  console.log(
    `[executeParallelSearchWithRetry] Entry - topic: "${topic}", gaps: ${previousGaps.length}, maxRetries: ${maxRetries}, timeoutMs: ${timeoutMs}`
  );

  // Generate diverse queries
  const queries = generateDiverseQueries(topic, previousGaps);
  console.log(
    `[executeParallelSearchWithRetry] Generated ${queries.length} diverse queries`
  );

  // Execute all searches in parallel
  const searchPromises = queries.flatMap((query) => [
    executeSearchWithRetry(() => executeExaSearch(query), maxRetries, timeoutMs),
    executeSearchWithRetry(() => executeJinaSearch(query), maxRetries, timeoutMs),
  ]);

  console.log(
    `[executeParallelSearchWithRetry] Executing ${searchPromises.length} parallel searches`
  );

  // Use Promise.allSettled for resilient execution
  const settledResults = await Promise.allSettled(searchPromises);

  // Collect successful results
  let allResults: StructuredSearchResult[] = [];
  let toolCallCount = 0;

  for (const result of settledResults) {
    if (result.status === "fulfilled" && result.value.length > 0) {
      allResults.push(...result.value);
      toolCallCount++;
    }
  }

  console.log(
    `[executeParallelSearchWithRetry] Collected ${allResults.length} raw results from ${toolCallCount} successful searches`
  );

  // Deduplicate
  if (deduplicateResults) {
    allResults = deduplicateByUrl(allResults);
    console.log(
      `[executeParallelSearchWithRetry] Deduplicated to ${allResults.length} unique results`
    );
  }

  // Sort by relevance
  allResults = sortByRelevance(allResults);

  // Format findings
  const findings = formatFindings(allResults);

  const durationMs = Date.now() - startTime;
  console.log(
    `[executeParallelSearchWithRetry] Exit - ${allResults.length} results in ${durationMs}ms`
  );

  return {
    findings,
    structuredResults: allResults,
    toolCallCount,
    durationMs,
  };
}
