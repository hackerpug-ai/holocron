/**
 * Research Tools for Deep Research Workflow
 *
 * US-047: Planning, executing, and synthesizing research (prototype)
 * US-777: Search tools (exaSearchTool, jinaSearchTool, jinaReaderTool)
 */

import { tool } from "ai";
import { z } from "zod";
import Exa from "exa-js";

/**
 * Research Plan Schema
 * Note: Production will use v from convex/values
 */
export const ResearchPlanSchema = {
  query: "string",
  subtasks: "array",
  maxIterations: "number",
} as const;

export type ResearchPlan = {
  query: string;
  subtasks: Array<{
    id: string;
    objective: string;
    searchTerms: string[];
  }>;
  maxIterations: number;
};

/**
 * Subagent Search Result Schema
 */
export const SubagentResultSchema = {
  objective: "string",
  findings: "string",
  sources: "array",
} as const;

export type SubagentResult = {
  objective: string;
  findings: string;
  sources: Array<{
    url: string;
    title?: string;
    domain?: string;
  }>;
};

/**
 * Plan research - Decomposes query into subtasks
 *
 * @deprecated This stub is no longer used. The Ralph Loop (runRalphLoop) uses
 * real LLM calls via Vercel AI SDK generateText() with search tools.
 */
export async function planResearch(_query: string): Promise<ResearchPlan> {
  throw new Error(
    "STUB_FUNCTION_REMOVED: planResearch is deprecated. Use runRalphLoop which uses real LLM calls with search tools."
  );
}

/**
 * Execute subagent search - Performs focused search
 *
 * @deprecated This stub is no longer used. The Ralph Loop (runRalphLoop) uses
 * real LLM calls via Vercel AI SDK generateText() with exaSearchTool/jinaSearchTool.
 */
export async function executeSubagentSearch(
  _objective: string,
): Promise<SubagentResult> {
  throw new Error(
    "STUB_FUNCTION_REMOVED: executeSubagentSearch is deprecated. Use runRalphLoop which uses real search tools (exaSearchTool, jinaSearchTool)."
  );
}

/**
 * Synthesize findings - Combines results into coherent report
 *
 * @deprecated This stub is no longer used. The Ralph Loop (runRalphLoop) uses
 * real LLM calls via Vercel AI SDK generateText() for synthesis.
 */
export async function synthesizeFindings(
  _findings: SubagentResult[],
): Promise<string> {
  throw new Error(
    "STUB_FUNCTION_REMOVED: synthesizeFindings is deprecated. Use runRalphLoop which uses real LLM synthesis."
  );
}

/**
 * Review coverage - Assesses completeness and identifies gaps
 *
 * @deprecated This stub is no longer used. The Ralph Loop (runRalphLoop) uses
 * real LLM calls via Vercel AI SDK generateText() for coverage review.
 */
export async function assessCoverage(
  _synthesis: string,
): Promise<{ score: number; gaps: string[]; feedback: string }> {
  throw new Error(
    "STUB_FUNCTION_REMOVED: assessCoverage is deprecated. Use runRalphLoop which uses real LLM coverage review."
  );
}

/**
 * US-777: Search Tools Implementation
 */

/**
 * exaSearchTool - Technical content search using Exa SDK
 *
 * Uses exa-js SDK with useAutoprompt for intelligent technical content search.
 * Best for: academic papers, technical documentation, research content.
 */
export const exaSearchTool = tool({
  description:
    "Search for technical content, academic papers, and research using Exa. " +
    "Use this when you need high-quality technical or research content. " +
    "Returns results with full content, scores, and metadata.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
  }),
  execute: async ({ query }: { query: string }) => {
    console.log(`[exaSearchTool] Entry - query: "${query}"`);
    // Use default values since we removed optional parameters to fix schema conversion
    const numResults = 5;
    const category = "any";
    try {
      const apiKey = process.env.EXA_API_KEY;
      if (!apiKey) {
        console.error(`[exaSearchTool] EXA_API_KEY not configured`);
        return {
          query,
          results: [],
          error: "EXA_API_KEY not configured",
          source: "exa",
        };
      }

      console.log(
        `[exaSearchTool] Calling Exa API - numResults: ${numResults}, useAutoprompt: true`,
      );
      const exa = new Exa(apiKey);

      const startTime = Date.now();
      const searchResults = await exa.searchAndContents(query, {
        numResults,
        useAutoprompt: true,
        category: category === "any" ? undefined : category,
      });
      const duration = Date.now() - startTime;

      console.log(
        `[exaSearchTool] Exa API returned in ${duration}ms - results: ${searchResults.results.length}`,
      );

      const results = searchResults.results.map((result: any) => ({
        title: result.title || "",
        url: result.url || "",
        content: (result.text || "").slice(0, 500),
        score: result.score || 0,
        publishedDate: result.publishedDate || null,
        author: result.author || null,
      }));

      console.log(
        `[exaSearchTool] Exit - Success with ${results.length} results`,
      );
      return {
        query,
        results,
        source: "exa",
      };
    } catch (error) {
      console.error(`[exaSearchTool] Error:`, error);
      return {
        query,
        results: [],
        error: error instanceof Error ? error.message : String(error),
        source: "exa",
      };
    }
  },
});

/**
 * jinaSearchTool - Broad web search using Jina API
 *
 * Uses Jina's direct API for general web search.
 * Best for: broad web queries, general information, diverse sources.
 */
export const jinaSearchTool = tool({
  description:
    "Search the web for general information using Jina. " +
    "Use this for broad web queries and diverse information sources. " +
    "Returns results with titles, URLs, content snippets, and domains.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
  }),
  execute: async ({ query }: { query: string }) => {
    console.log(`[jinaSearchTool] Entry - query: "${query}"`);
    // Use default value since we removed optional parameter to fix schema conversion
    const numResults = 10;
    try {
      const apiKey = process.env.JINA_API_KEY;
      if (!apiKey) {
        console.error(`[jinaSearchTool] JINA_API_KEY not configured`);
        return {
          query,
          results: [],
          error: "JINA_API_KEY not configured",
          source: "jina",
        };
      }

      console.log(
        `[jinaSearchTool] Calling Jina Search API - query: "${query}"`,
      );
      const startTime = Date.now();
      // Jina Search uses s.jina.ai with query parameter
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(`https://s.jina.ai/?q=${encodedQuery}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });
      const duration = Date.now() - startTime;

      console.log(
        `[jinaSearchTool] Jina API responded in ${duration}ms - status: ${response.status}`,
      );

      if (!response.ok) {
        console.error(
          `[jinaSearchTool] HTTP error: ${response.status} ${response.statusText}`,
        );
        return {
          query,
          results: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
          source: "jina",
        };
      }

      // Jina Search returns JSON with data array
      const data = await response.json();
      console.log(
        `[jinaSearchTool] Received response - has data: ${!!data.data}`,
      );

      // Parse search results from Jina's response format
      const results = (data.data || []).map((result: any) => ({
        title: result.title || "",
        url: result.url || result.link || "",
        content: (result.description || result.content || "").slice(0, 500),
        domain: result.domain || new URL(result.url || result.link || "").hostname,
      }));

      console.log(
        `[jinaSearchTool] Exit - Success with ${results.length} results`,
      );
      return {
        query,
        results,
        source: "jina",
      };
    } catch (error) {
      console.error(`[jinaSearchTool] Error:`, error);
      return {
        query,
        results: [],
        error: error instanceof Error ? error.message : String(error),
        source: "jina",
      };
    }
  },
});

/**
 * jinaSiteSearchTool - Site-specific search using Jina
 *
 * Uses Jina's Search API with X-Site header to search within a specific domain.
 * Best for: focused research on documentation sites, company websites, specific domains.
 */
export const jinaSiteSearchTool = tool({
  description:
    "Search within a specific website using Jina. " +
    "Use this when you need to find information on a particular domain or documentation site. " +
    "Returns results filtered to the specified site with titles, URLs, and content snippets.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    site: z.string().url().describe("The website to search within (e.g., https://jina.ai)"),
  }),
  execute: async ({ query, site }: { query: string; site: string }) => {
    console.log(`[jinaSiteSearchTool] Entry - query: "${query}", site: "${site}"`);
    try {
      const apiKey = process.env.JINA_API_KEY;
      if (!apiKey) {
        console.error(`[jinaSiteSearchTool] JINA_API_KEY not configured`);
        return {
          query,
          site,
          results: [],
          error: "JINA_API_KEY not configured",
          source: "jina-site",
        };
      }

      console.log(
        `[jinaSiteSearchTool] Calling Jina Site Search API - query: "${query}", site: "${site}"`,
      );
      const startTime = Date.now();
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(`https://s.jina.ai/?q=${encodedQuery}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "X-Site": site,
        },
      });
      const duration = Date.now() - startTime;

      console.log(
        `[jinaSiteSearchTool] Jina Site Search API responded in ${duration}ms - status: ${response.status}`,
      );

      if (!response.ok) {
        console.error(
          `[jinaSiteSearchTool] HTTP error: ${response.status} ${response.statusText}`,
        );
        return {
          query,
          site,
          results: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
          source: "jina-site",
        };
      }

      const data = await response.json();
      console.log(
        `[jinaSiteSearchTool] Received response - has data: ${!!data.data}`,
      );

      const results = (data.data || []).map((result: any) => ({
        title: result.title || "",
        url: result.url || result.link || "",
        content: (result.description || result.content || "").slice(0, 500),
        domain: result.domain || new URL(result.url || result.link || "").hostname,
      }));

      console.log(
        `[jinaSiteSearchTool] Exit - Success with ${results.length} results from ${site}`,
      );
      return {
        query,
        site,
        results,
        source: "jina-site",
      };
    } catch (error) {
      console.error(`[jinaSiteSearchTool] Error:`, error);
      return {
        query,
        site,
        results: [],
        error: error instanceof Error ? error.message : String(error),
        source: "jina-site",
      };
    }
  },
});

/**
 * jinaReaderTool - Deep content extraction from URLs
 *
 * Uses Jina's Reader API to extract full markdown content from any URL.
 * Best for: reading articles, extracting full page content, deep analysis.
 */
export const jinaReaderTool = tool({
  description:
    "Extract full content from a URL in markdown format using Jina Reader. " +
    "Use this when you need to read and analyze the full content of a specific webpage. " +
    "Returns clean markdown text without ads or navigation.",
  inputSchema: z.object({
    url: z.string().url().describe("The URL to extract content from"),
  }),
  execute: async ({ url }: { url: string }) => {
    console.log(`[jinaReaderTool] Entry - url: "${url}"`);
    try {
      const apiKey = process.env.JINA_API_KEY;
      if (!apiKey) {
        console.error(`[jinaReaderTool] JINA_API_KEY not configured`);
        return {
          url,
          content: "",
          error: "JINA_API_KEY not configured",
          source: "jina-reader",
        };
      }

      console.log(`[jinaReaderTool] Calling Jina Reader API`);
      const startTime = Date.now();
      const response = await fetch(`https://r.jina.ai/${url}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Return-Format": "markdown",
        },
      });
      const duration = Date.now() - startTime;

      console.log(
        `[jinaReaderTool] Jina Reader API responded in ${duration}ms - status: ${response.status}`,
      );

      if (!response.ok) {
        console.error(
          `[jinaReaderTool] HTTP error: ${response.status} ${response.statusText}`,
        );
        return {
          url,
          content: "",
          error: `HTTP ${response.status}: ${response.statusText}`,
          source: "jina-reader",
        };
      }

      const content = await response.text();
      const truncatedContent = content.slice(0, 5000);

      console.log(
        `[jinaReaderTool] Exit - Success with ${content.length} chars (truncated to ${truncatedContent.length})`,
      );
      return {
        url,
        content: truncatedContent,
        source: "jina-reader",
      };
    } catch (error) {
      console.error(`[jinaReaderTool] Error:`, error);
      return {
        url,
        content: "",
        error: error instanceof Error ? error.message : String(error),
        source: "jina-reader",
      };
    }
  },
});
