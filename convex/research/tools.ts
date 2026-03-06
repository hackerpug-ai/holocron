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
 * This is a prototype implementation for testing.
 * In production, this would use the Lead Agent with GPT-5.
 */
export async function planResearch(query: string): Promise<ResearchPlan> {
  // Prototype implementation - generates a basic plan
  // Production implementation would call Lead Agent with GPT-5

  const keywords = extractKeywords(query);
  const subtasks = generateSubtasks(query, keywords);

  return {
    query,
    subtasks,
    maxIterations: 3,
  };
}

/**
 * Execute subagent search - Performs focused search
 *
 * This is a prototype implementation for testing.
 * In production, this would use the Web Searcher with GPT-5-mini.
 */
export async function executeSubagentSearch(
  objective: string
): Promise<SubagentResult> {
  // Prototype implementation - simulates search results
  // Production implementation would call Web Searcher with GPT-5-mini

  return {
    objective,
    findings: `Simulated research findings for: ${objective}`,
    sources: [
      {
        url: "https://example.com/source1",
        title: "Example Source 1",
        domain: "example.com",
      },
    ],
  };
}

/**
 * Synthesize findings - Combines results into coherent report
 *
 * This is a prototype implementation for testing.
 * In production, this would use the Lead Agent with GPT-5.
 */
export async function synthesizeFindings(
  findings: SubagentResult[]
): Promise<string> {
  // Prototype implementation - combines findings
  // Production implementation would call Lead Agent with GPT-5

  const combined = findings
    .map((f) => `## ${f.objective}\n\n${f.findings}`)
    .join("\n\n");

  return `# Research Synthesis\n\n${combined}`;
}

/**
 * Review coverage - Assesses completeness and identifies gaps
 *
 * This is a prototype implementation for testing.
 * In production, this would use the Reviewer Agent with GPT-5.
 */
export async function assessCoverage(
  synthesis: string
): Promise<{ score: number; gaps: string[]; feedback: string }> {
  // Prototype implementation - returns default score
  // Production implementation would call Reviewer Agent with GPT-5

  return {
    score: 4,
    gaps: [],
    feedback: "Research coverage appears complete for prototype testing.",
  };
}

/**
 * Helper: Extract keywords from query
 */
function extractKeywords(query: string): string[] {
  // Simple keyword extraction for prototype
  const words = query.toLowerCase().split(/\s+/);
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "what",
    "how",
    "why",
    "when",
    "where",
    "who",
    "which",
  ]);

  return words.filter((w) => w.length > 3 && !stopWords.has(w));
}

/**
 * Helper: Generate subtasks from keywords
 */
function generateSubtasks(query: string, keywords: string[]): ResearchPlan["subtasks"] {
  // Generate 2-4 subtasks based on keywords
  const numSubtasks = Math.min(Math.max(2, keywords.length), 4);

  return Array.from({ length: numSubtasks }, (_, i) => ({
    id: `subtask-${i + 1}`,
    objective: `Research aspect ${i + 1} of: ${query}`,
    searchTerms: keywords.slice(0, 3),
  }));
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
  parameters: z.object({
    query: z.string().describe("The search query"),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of results to return (1-10)"),
    category: z
      .enum(["company", "research paper", "news", "github", "tweet", "any"])
      .default("any")
      .describe("Filter results by content category"),
  }),
  execute: async ({ query, numResults, category }) => {
    try {
      const apiKey = process.env.EXA_API_KEY;
      if (!apiKey) {
        return {
          query,
          results: [],
          error: "EXA_API_KEY not configured",
          source: "exa",
        };
      }

      const exa = new Exa(apiKey);

      const searchResults = await exa.searchAndContents(query, {
        numResults,
        useAutoprompt: true,
        category: category === "any" ? undefined : category,
      });

      const results = searchResults.results.map((result: any) => ({
        title: result.title || "",
        url: result.url || "",
        content: (result.text || "").slice(0, 500),
        score: result.score || 0,
        publishedDate: result.publishedDate || null,
        author: result.author || null,
      }));

      return {
        query,
        results,
        source: "exa",
      };
    } catch (error) {
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
  parameters: z.object({
    query: z.string().describe("The search query"),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(10)
      .describe("Number of results to return (1-10)"),
  }),
  execute: async ({ query, numResults }) => {
    try {
      const apiKey = process.env.JINA_API_KEY;
      if (!apiKey) {
        return {
          query,
          results: [],
          error: "JINA_API_KEY not configured",
          source: "jina",
        };
      }

      const response = await fetch("https://api.jina.ai/v1/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          num_results: numResults,
        }),
      });

      if (!response.ok) {
        return {
          query,
          results: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
          source: "jina",
        };
      }

      const data = await response.json();
      const results = (data.results || []).map((result: any) => ({
        title: result.title || "",
        url: result.url || "",
        content: (result.content || "").slice(0, 500),
        domain: result.domain || "",
      }));

      return {
        query,
        results,
        source: "jina",
      };
    } catch (error) {
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
  parameters: z.object({
    url: z.string().url().describe("The URL to extract content from"),
  }),
  execute: async ({ url }) => {
    try {
      const apiKey = process.env.JINA_API_KEY;
      if (!apiKey) {
        return {
          url,
          content: "",
          error: "JINA_API_KEY not configured",
          source: "jina-reader",
        };
      }

      const response = await fetch(`https://r.jina.ai/${url}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "X-Return-Format": "markdown",
        },
      });

      if (!response.ok) {
        return {
          url,
          content: "",
          error: `HTTP ${response.status}: ${response.statusText}`,
          source: "jina-reader",
        };
      }

      const content = await response.text();

      return {
        url,
        content: content.slice(0, 5000),
        source: "jina-reader",
      };
    } catch (error) {
      return {
        url,
        content: "",
        error: error instanceof Error ? error.message : String(error),
        source: "jina-reader",
      };
    }
  },
});
