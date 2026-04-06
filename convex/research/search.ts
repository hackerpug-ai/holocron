/**
 * Parallel Search Module for Deep Research Optimization
 *
 * Implements parallel search execution with:
 * - Diverse query generation (academic, industry, practical, gap-focused)
 * - Promise.allSettled for resilient parallel execution
 * - Retry with exponential backoff
 * - URL-based deduplication
 * - Score-based result sorting
 * - Full URL content reading via Jina Reader
 */

"use node";

import Exa from "exa-js";
import { withRateLimit } from "./rateLimiter.js";

/**
 * Minimal ctx shape required for rate limiting (subset of ActionCtx)
 */
type RateLimitCtx = {
  runMutation: (fn: unknown, args: Record<string, unknown>) => Promise<unknown>;
} | null | undefined;

/**
 * Result from reading a single URL
 */
export interface UrlReadResult {
  url: string;
  title?: string;
  content: string;  // Up to 10k chars
  success: boolean;
  error?: string;
}

/**
 * Link extracted from a page
 */
export interface ExtractedLink {
  text: string;
  url: string;
}

/**
 * Result from reading a URL with links extraction
 */
export interface UrlReadWithLinksResult extends UrlReadResult {
  links: ExtractedLink[];
}

/**
 * Options for parallel URL reading
 */
export interface ParallelUrlReadOptions {
  maxConcurrent?: number;
  timeoutMs?: number;
  maxContentLength?: number;
}

/**
 * Read a single URL using Jina Reader API
 *
 * @param url - URL to read
 * @param timeoutMs - Timeout in milliseconds
 * @param maxContentLength - Maximum content length to return
 * @returns UrlReadResult with content or error
 */
export async function readUrlWithJina(
  url: string,
  timeoutMs: number = 15000,
  maxContentLength: number = 10000,
  ctx?: RateLimitCtx
): Promise<UrlReadResult> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    return {
      url,
      content: "",
      success: false,
      error: "JINA_API_KEY not configured",
    };
  }

  try {
    // Use Jina Reader API: r.jina.ai/{url}
    const readerUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const fetchFn = async () => fetch(readerUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/plain",
        "X-Return-Format": "text",
      },
      signal: controller.signal,
    });
    const response = ctx
      ? await withRateLimit(ctx, "jina-reader", fetchFn)
      : await fetchFn();

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        url,
        content: "",
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const fullContent = await response.text();

    // Extract title from first line if it looks like a title
    let title: string | undefined;
    const lines = fullContent.split("\n");
    if (lines.length > 0 && lines[0].startsWith("# ")) {
      title = lines[0].substring(2).trim();
    } else if (lines.length > 0 && lines[0].startsWith("Title: ")) {
      title = lines[0].substring(7).trim();
    }

    // Truncate content to maxContentLength
    const content = fullContent.slice(0, maxContentLength);

    return {
      url,
      title,
      content,
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const isTimeout =
      errorMessage.includes("abort") || errorMessage.includes("timeout");

    return {
      url,
      content: "",
      success: false,
      error: isTimeout ? "Jina Reader timeout reading URL" : `Jina Reader: ${errorMessage}`,
    };
  }
}

/**
 * Read a URL with Jina Reader API and extract all links
 *
 * Uses JSON format to get structured link data from the page.
 *
 * @param url - URL to read
 * @param timeoutMs - Timeout in milliseconds
 * @param maxContentLength - Maximum content length to return
 * @returns UrlReadWithLinksResult with content and extracted links
 */
export async function readUrlWithJinaAndLinks(
  url: string,
  timeoutMs: number = 15000,
  maxContentLength: number = 10000,
  ctx?: RateLimitCtx
): Promise<UrlReadWithLinksResult> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    return {
      url,
      content: "",
      links: [],
      success: false,
      error: "JINA_API_KEY not configured",
    };
  }

  try {
    // Use Jina Reader API with JSON format to get links
    const readerUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const fetchFn = async () => fetch(readerUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "X-With-Links-Summary": "true",
      },
      signal: controller.signal,
    });
    const response = ctx
      ? await withRateLimit(ctx, "jina-reader", fetchFn)
      : await fetchFn();

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        url,
        content: "",
        links: [],
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    // Extract content
    const fullContent = data.data?.content || data.content || "";
    const content = fullContent.slice(0, maxContentLength);

    // Extract title
    const title = data.data?.title || data.title || undefined;

    // Extract links from the response
    // Jina Reader returns links as { anchorText: url, ... } object map
    const linksData = data.data?.links || data.links;

    // Handle different link formats
    let rawLinks: any[] = [];
    if (Array.isArray(linksData)) {
      // Links as array of objects: [{ text, url }, ...]
      rawLinks = linksData;
    } else if (linksData && typeof linksData === "object") {
      // Links as object map: { anchorText: url, ... }
      // Convert to array format
      rawLinks = Object.entries(linksData).map(([text, url]) => ({ text, url }));
    }

    const links: ExtractedLink[] = rawLinks.map((link: any) => ({
      text: link.text || link.anchorText || link.title || "",
      url: link.url || link.href || "",
    })).filter((link: ExtractedLink) => link.url);

    return {
      url,
      title,
      content,
      links,
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const isTimeout =
      errorMessage.includes("abort") || errorMessage.includes("timeout");

    return {
      url,
      content: "",
      links: [],
      success: false,
      error: isTimeout ? "Jina Reader timeout reading URL" : `Jina Reader: ${errorMessage}`,
    };
  }
}

/**
 * Execute parallel URL reading with rate limiting
 *
 * Reads multiple URLs in parallel using Jina Reader API.
 * Rate limited to 5 concurrent requests.
 *
 * @param urls - Array of URLs to read
 * @param options - Options for parallel reading
 * @returns Array of UrlReadResult
 */
export async function executeParallelUrlRead(
  urls: string[],
  options: ParallelUrlReadOptions = {},
  ctx?: RateLimitCtx
): Promise<UrlReadResult[]> {
  const {
    maxConcurrent = 5,
    timeoutMs = 15000,
    maxContentLength = 10000,
  } = options;

  console.log(
    `[executeParallelUrlRead] Entry - ${urls.length} URLs, maxConcurrent: ${maxConcurrent}, timeoutMs: ${timeoutMs}`
  );

  if (urls.length === 0) {
    return [];
  }

  // Process in batches to respect rate limits
  const results: UrlReadResult[] = [];
  const batches: string[][] = [];

  for (let i = 0; i < urls.length; i += maxConcurrent) {
    batches.push(urls.slice(i, i + maxConcurrent));
  }

  console.log(
    `[executeParallelUrlRead] Processing ${batches.length} batches`
  );

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `[executeParallelUrlRead] Processing batch ${i + 1}/${batches.length} (${batch.length} URLs)`
    );

    const batchResults = await Promise.all(
      batch.map((url) => readUrlWithJina(url, timeoutMs, maxContentLength, ctx))
    );

    results.push(...batchResults);

    // Small delay between batches to be nice to the API
    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(
    `[executeParallelUrlRead] Exit - ${successCount}/${urls.length} successful`
  );

  return results;
}

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
 * Execute a single search with retry logic and provider attribution
 */
async function executeSearchWithRetry(
  searchFn: () => Promise<StructuredSearchResult[]>,
  maxRetries: number,
  timeoutMs: number,
  provider: string = "unknown"
): Promise<StructuredSearchResult[]> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create timeout promise with provider attribution
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`${provider} search timeout after ${timeoutMs}ms`)),
          timeoutMs
        );
      });

      // Race between search and timeout
      const results = await Promise.race([searchFn(), timeoutPromise]);
      return results;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[executeSearchWithRetry] ${provider} attempt ${attempt + 1}/${maxRetries + 1} failed:`,
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
    `[executeSearchWithRetry] ${provider} search failed after ${maxRetries + 1} attempts:`,
    lastError?.message
  );
  return [];
}

/**
 * Execute Exa search for a query
 */
async function executeExaSearch(query: string, ctx?: RateLimitCtx): Promise<StructuredSearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.warn("[executeExaSearch] EXA_API_KEY not configured");
    return [];
  }

  const exa = new Exa(apiKey);

  // Apply rate limiting (10 QPS)
  const searchFn = async () => exa.searchAndContents(query, {
    numResults: 8,
    useAutoprompt: true,
  });
  const searchResults = ctx
    ? await withRateLimit(ctx, 'exa', searchFn)
    : await searchFn();

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
async function executeJinaSearch(query: string, ctx?: RateLimitCtx): Promise<StructuredSearchResult[]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    console.warn("[executeJinaSearch] JINA_API_KEY not configured");
    return [];
  }

  const encodedQuery = encodeURIComponent(query);

  // Apply rate limiting (100 RPM for free tier)
  const fetchFn = async () => fetch(`https://s.jina.ai/?q=${encodedQuery}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const response = ctx
    ? await withRateLimit(ctx, 'jina', fetchFn)
    : await fetchFn();

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
  options: ParallelSearchOptions = {},
  ctx?: RateLimitCtx
): Promise<ParallelSearchResult> {
  const startTime = Date.now();
  const {
    maxRetries = 3,
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

  // Execute all searches in parallel with provider attribution
  const searchPromises = queries.flatMap((query) => [
    executeSearchWithRetry(() => executeExaSearch(query, ctx), maxRetries, timeoutMs, "Exa"),
    executeSearchWithRetry(() => executeJinaSearch(query, ctx), maxRetries, timeoutMs, "Jina"),
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
