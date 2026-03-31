/**
 * Integration tests for research model providers
 *
 * These tests make REAL API calls to OpenAI to verify models work correctly.
 * They are skipped by default — set INTEGRATION_TEST=1 to run them.
 *
 * Usage:
 *   INTEGRATION_TEST=1 pnpm vitest run tests/integration/research-models.test.ts
 */

import { describe, it, expect } from "vitest";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const SKIP = !process.env.INTEGRATION_TEST;
const itLive = SKIP ? it.skip : it;

describe("Research Model Integration: gpt-5.4-nano (intent classification)", () => {
  itLive("should classify a research query into a valid mode", async () => {
    const result = await generateText({
      model: openai("gpt-5.4-nano"),
      prompt: `Classify this research query into exactly ONE mode.

Query: "What are the best frameworks for validating software ideas?"

Modes: OVERVIEW, ACTIONABLE, COMPARATIVE, EXPLORATORY

Return ONLY a JSON object:
{
  "mode": "ONE_OF_THE_MODES",
  "reasoning": "brief explanation"
}`,
    });

    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, "").trim());
    expect(["OVERVIEW", "ACTIONABLE", "COMPARATIVE", "EXPLORATORY"]).toContain(parsed.mode);
    expect(parsed.reasoning).toBeTruthy();
    expect(result.usage?.totalTokens).toBeGreaterThan(0);
  }, 30000);
});

describe("Research Model Integration: gpt-5.4-mini (query expansion)", () => {
  itLive("should generate diverse search query variants", async () => {
    const result = await generateText({
      model: openai("gpt-5.4-mini"),
      prompt: `Generate exactly 4 diverse search query variants for comprehensive research on: "AI agent architectures"

Each variant should explore a different aspect:
1. Technical/implementation focus
2. Academic/research focus
3. Industry/practical focus
4. Latest developments/trends

Return ONLY a JSON array:
[
  {
    "query": "actual search query",
    "focus": "what this query focuses on",
    "rationale": "why this angle matters"
  }
]`,
    });

    const variants = JSON.parse(result.text.replace(/```json\n?|\n?```/g, "").trim());
    expect(Array.isArray(variants)).toBe(true);
    expect(variants.length).toBeGreaterThanOrEqual(3);
    expect(variants.length).toBeLessThanOrEqual(5);

    for (const v of variants) {
      expect(v.query).toBeTruthy();
      expect(typeof v.query).toBe("string");
      expect(v.focus).toBeTruthy();
    }

    // Verify queries are actually diverse (no two should be identical)
    const queries = variants.map((v: any) => v.query);
    const uniqueQueries = new Set(queries);
    expect(uniqueQueries.size).toBe(queries.length);
  }, 30000);
});

describe("Research Model Integration: gpt-5.4 (synthesis)", () => {
  itLive("should synthesize findings into structured JSON with confidence scoring", async () => {
    const mockFindings = `
## Search Results

### Source 1: Official React Documentation
URL: https://react.dev/learn
React is a JavaScript library for building user interfaces. It uses a component-based
architecture with hooks for state management. React 19 introduced Server Components.

### Source 2: Vercel Blog
URL: https://vercel.com/blog/nextjs-15
Next.js 15 builds on React Server Components, offering automatic code splitting
and streaming SSR. Adoption has grown 200% year-over-year.

### Source 3: Stack Overflow Survey 2025
URL: https://survey.stackoverflow.co/2025
React remains the most used web framework at 42% adoption among professional developers,
followed by Vue.js at 18% and Angular at 15%.
`;

    const result = await generateText({
      model: openai("gpt-5.4"),
      prompt: `Synthesize research findings into a structured JSON format.

Topic: "React framework adoption and architecture"

Latest Search Findings:
${mockFindings}

Return a JSON object with:
{
  "findings": [
    {
      "claimText": "The specific claim (1-3 sentences)",
      "claimCategory": "Category like 'Market Adoption', 'Architecture', etc.",
      "sources": [
        {
          "url": "https://example.com",
          "title": "Source Title",
          "sourceType": "official_documentation|expert_blog|academic_paper|forum",
          "evidenceType": "primary|secondary|tertiary|anecdotal"
        }
      ],
      "confidenceFactors": {
        "sourceCredibilityScore": 0-100,
        "evidenceQualityScore": 0-100,
        "corroborationScore": 0-100,
        "recencyScore": 0-100,
        "expertConsensusScore": 0-100
      }
    }
  ],
  "narrativeSummary": "A 100-200 word summary"
}

Extract 3-5 findings. Be honest about confidence levels.`,
    });

    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, "").trim());

    // Validate structure
    expect(parsed.findings).toBeDefined();
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThanOrEqual(2);
    expect(parsed.narrativeSummary).toBeTruthy();

    // Validate finding structure
    const finding = parsed.findings[0];
    expect(finding.claimText).toBeTruthy();
    expect(finding.claimCategory).toBeTruthy();
    expect(Array.isArray(finding.sources)).toBe(true);
    expect(finding.sources.length).toBeGreaterThanOrEqual(1);

    // Validate confidence scores are in range
    const cf = finding.confidenceFactors;
    expect(cf.sourceCredibilityScore).toBeGreaterThanOrEqual(0);
    expect(cf.sourceCredibilityScore).toBeLessThanOrEqual(100);
    expect(cf.evidenceQualityScore).toBeGreaterThanOrEqual(0);
    expect(cf.evidenceQualityScore).toBeLessThanOrEqual(100);
  }, 60000);
});

describe("Research Model Integration: gpt-5.4 (review)", () => {
  itLive("should produce a valid coverage review with gaps", async () => {
    const mockSynthesis = `
The research found that React is the most popular web framework with 42% market share.
Server Components represent a major architectural shift. Next.js is the leading
React meta-framework. However, coverage of Vue.js and Angular alternatives is limited,
and no academic papers were consulted.
`;

    const result = await generateText({
      model: openai("gpt-5.4"),
      prompt: `Review this research synthesis and assess its coverage.

Research Synthesis:
${mockSynthesis}

Original Topic: "Modern web framework comparison and architecture patterns"

Iterations Completed: 1

Provide your assessment in JSON format:
{
  "coverageScore": number (1-5 scale),
  "gaps": string[] (list of identified gaps),
  "feedback": string (detailed feedback),
  "shouldContinue": boolean
}

COVERAGE SCORING:
1 = minimal, 2 = basic, 3 = adequate, 4 = comprehensive, 5 = complete

Be strict - only score 4+ when truly comprehensive.`,
    });

    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, "").trim());

    expect(parsed.coverageScore).toBeGreaterThanOrEqual(1);
    expect(parsed.coverageScore).toBeLessThanOrEqual(5);
    expect(parsed.coverageScore).toBeLessThanOrEqual(3); // Should be low — limited synthesis
    expect(Array.isArray(parsed.gaps)).toBe(true);
    expect(parsed.gaps.length).toBeGreaterThanOrEqual(1);
    expect(parsed.feedback).toBeTruthy();
    expect(typeof parsed.shouldContinue).toBe("boolean");
    expect(parsed.shouldContinue).toBe(true); // Coverage is low, should continue
  }, 60000);
});

describe("Research Pipeline Integration: expand → search helpers", () => {
  itLive("should import and call generateDiverseQueries without errors", async () => {
    const { generateDiverseQueries } = await import("../../convex/research/search");
    const queries = generateDiverseQueries("AI agent architectures", ["tool calling patterns"]);

    expect(Array.isArray(queries)).toBe(true);
    expect(queries.length).toBe(4);
    for (const q of queries) {
      expect(typeof q).toBe("string");
      expect(q.length).toBeGreaterThan(10);
    }
  });
});
