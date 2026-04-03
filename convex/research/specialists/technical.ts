/**
 * Technical Research Specialist
 *
 * US-IMP-002: Research Agent Specialists
 *
 * Generates technical research reports with emphasis on:
 * - Implementation details and code samples
 * - API references and documentation
 * - Technical architecture and design patterns
 * - Performance optimization and best practices
 *
 * Also logs improvements to app/product based on technical findings.
 */

"use node";

import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  executeParallelSearchWithRetry,
  type ParallelSearchResult,
} from "../search";

// ============================================================================
// Types
// ============================================================================

/**
 * Technical research report structure
 */
export interface TechnicalReport {
  specialist: "technical";
  query: string;
  findings: string;
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    codeSample?: string;
    apiReference?: string;
  }>;
  metadata: {
    implementation: string;
    codeSamples: string[];
    architecture: string;
    bestPractices: string[];
  };
  sourceCount: number;
  confidenceScore: number;
}

// ============================================================================
// Specialist Implementation
// ============================================================================

/**
 * Execute technical research with specialist focus
 *
 * @param ctx - Convex action context
 * @param query - Research query
 * @returns Technical research report
 */
export async function executeTechnicalResearch(
  ctx: ActionCtx,
  query: string
): Promise<TechnicalReport> {
  console.log(`[executeTechnicalResearch] Starting research for query: "${query}"`);

  // Enhance query with technical-specific terms
  const technicalQuery = `${query} implementation code example API documentation tutorial`;

  // Execute parallel search with retry
  const searchResult = await executeParallelSearchWithRetry(
    technicalQuery,
    {},
    [],
    {
      maxRetries: 2,
      timeoutMs: 15000,
      deduplicateResults: true,
    }
  );

  console.log(
    `[executeTechnicalResearch] Found ${searchResult.structuredResults.length} sources`
  );

  // Generate technical report using LLM
  const technicalReport = await generateTechnicalReport(query, searchResult);

  // Log improvements if any product/app suggestions found
  await logImprovementsFromTechnicalResearch(ctx, query, technicalReport);

  console.log(`[executeTechnicalResearch] Completed research`);

  return technicalReport;
}

/**
 * Generate technical-focused report from search results
 */
async function generateTechnicalReport(
  query: string,
  searchResult: ParallelSearchResult
): Promise<TechnicalReport> {
  const prompt = buildTechnicalPrompt(query, searchResult);

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    temperature: 0.7,
    prompt,
  });

  // Parse structured response
  const report = JSON.parse(text.trim());

  return {
    specialist: "technical",
    query,
    findings: report.findings,
    sources: searchResult.structuredResults.map((source) => ({
      title: source.title,
      url: source.url,
      snippet: source.content,
      codeSample: undefined,
      apiReference: undefined,
    })),
    metadata: {
      implementation: report.implementation,
      codeSamples: report.codeSamples,
      architecture: report.architecture,
      bestPractices: report.bestPractices,
    },
    sourceCount: searchResult.structuredResults.length,
    confidenceScore: calculateTechnicalConfidence(searchResult),
  };
}

/**
 * Build prompt for technical report generation
 */
function buildTechnicalPrompt(
  query: string,
  searchResult: ParallelSearchResult
): string {
  const sourcesText = searchResult.structuredResults
    .map((s, i) => `Source ${i + 1}:\nTitle: ${s.title}\nURL: ${s.url}\nContent: ${s.content}`)
    .join("\n\n");

  return `You are a technical research specialist. Generate a technical implementation report based on the following sources.

Query: ${query}

Sources:
${sourcesText}

Generate a JSON response with this structure:
{
  "findings": "Comprehensive technical analysis of the topic",
  "implementation": "Implementation guidance and approach",
  "codeSamples": ["code sample 1", "code sample 2", ...],
  "architecture": "Technical architecture and design patterns",
  "bestPractices": ["best practice 1", "best practice 2", ...]
}

Focus on:
- Practical implementation details
- Code examples and API references
- Technical architecture and design patterns
- Performance optimization techniques
- Industry best practices and standards

Ensure the report is actionable and technically accurate.`;
}

/**
 * Calculate confidence score for technical research
 */
function calculateTechnicalConfidence(searchResult: ParallelSearchResult): number {
  // Base score on number of sources found
  const sourceCount = searchResult.structuredResults.length;
  const baseScore = Math.min(sourceCount * 0.1, 0.7);

  // Add bonus for having multiple sources
  const sourceBonus = sourceCount >= 3 ? 0.2 : 0.1;

  return Math.min(baseScore + sourceBonus, 1.0);
}

/**
 * Log improvements based on technical research findings
 *
 * If the technical research identifies opportunities for app/product improvements,
 * log them to the improvements system.
 */
async function logImprovementsFromTechnicalResearch(
  ctx: ActionCtx,
  query: string,
  report: TechnicalReport
): Promise<void> {
  // Check if findings suggest any improvements
  const improvementKeywords = [
    "improve",
    "enhancement",
    "better",
    "optimize",
    "recommend",
    "suggest",
  ];

  const hasImprovements = improvementKeywords.some((keyword) =>
    report.findings.toLowerCase().includes(keyword)
  );

  if (!hasImprovements) {
    return;
  }

  // Extract improvement suggestions from findings
  const prompt = `Based on the following technical research findings, identify any concrete suggestions for improving the app or product. Return a JSON array of improvement suggestions.

Findings: ${report.findings}

If there are no specific improvement suggestions, return an empty array: []`;

  try {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      temperature: 0.5,
      prompt,
    });

    const suggestions = JSON.parse(text.trim());

    if (Array.isArray(suggestions) && suggestions.length > 0) {
      // Log each suggestion as an improvement
      for (const suggestion of suggestions) {
        const description = typeof suggestion === "string" ? suggestion : JSON.stringify(suggestion);

        await ctx.runMutation(internal.improvements.internal.submitFromSpecialist, {
          description: `[Technical Research] ${description}\n\nQuery: ${query}`,
          source: "technical_specialist",
        });
      }

      console.log(
        `[logImprovementsFromTechnicalResearch] Logged ${suggestions.length} improvements`
      );
    }
  } catch (error) {
    console.error(
      `[logImprovementsFromTechnicalResearch] Failed to log improvements:`,
      error
    );
  }
}
