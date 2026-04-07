/**
 * Academic Research Specialist
 *
 * US-IMP-002: Research Agent Specialists
 *
 * Generates academic-focused research reports with emphasis on:
 * - Scholarly sources and peer-reviewed research
 * - Academic citations and references
 * - Abstract and methodology summaries
 * - Research findings and conclusions
 *
 * Also logs improvements to app/product based on academic findings.
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
 * Academic research report structure
 */
export interface AcademicReport {
  specialist: "academic";
  query: string;
  findings: string;
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    citation?: string;
    isPeerReviewed: boolean;
  }>;
  metadata: {
    abstract: string;
    methodology: string;
    keyFindings: string[];
    citations: string[];
  };
  sourceCount: number;
  confidenceScore: number;
}

// ============================================================================
// Specialist Implementation
// ============================================================================

/**
 * Execute academic research with specialist focus
 *
 * @param ctx - Convex action context
 * @param query - Research query
 * @returns Academic research report
 */
export async function executeAcademicResearch(
  ctx: ActionCtx,
  query: string
): Promise<AcademicReport> {

  // Enhance query with academic-specific terms
  const academicQuery = `${query} academic research paper peer-reviewed scholarly`;

  // Execute parallel search with retry
  const searchResult = await executeParallelSearchWithRetry(
    academicQuery,
    {},
    [],
    {
      maxRetries: 2,
      timeoutMs: 15000,
      deduplicateResults: true,
    }
  );

  

  // Generate academic report using LLM
  const academicReport = await generateAcademicReport(query, searchResult);

  // Log improvements if any product/app suggestions found
  await logImprovementsFromAcademicResearch(ctx, query, academicReport);


  return academicReport;
}

/**
 * Generate academic-focused report from search results
 */
async function generateAcademicReport(
  query: string,
  searchResult: ParallelSearchResult
): Promise<AcademicReport> {
  const prompt = buildAcademicPrompt(query, searchResult);

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    temperature: 0.7,
    prompt,
  });

  // Parse structured response
  const report = JSON.parse(text.trim());

  return {
    specialist: "academic",
    query,
    findings: report.findings,
    sources: searchResult.structuredResults.map((source) => ({
      title: source.title,
      url: source.url,
      snippet: source.content,
      citation: undefined,
      isPeerReviewed: false,
    })),
    metadata: {
      abstract: report.abstract,
      methodology: report.methodology,
      keyFindings: report.keyFindings,
      citations: report.citations,
    },
    sourceCount: searchResult.structuredResults.length,
    confidenceScore: calculateAcademicConfidence(searchResult),
  };
}

/**
 * Build prompt for academic report generation
 */
function buildAcademicPrompt(
  query: string,
  searchResult: ParallelSearchResult
): string {
  const sourcesText = searchResult.structuredResults
    .map((s, i) => `Source ${i + 1}:\nTitle: ${s.title}\nURL: ${s.url}\nContent: ${s.content}`)
    .join("\n\n");

  return `You are an academic research specialist. Generate a scholarly research report based on the following sources.

Query: ${query}

Sources:
${sourcesText}

Generate a JSON response with this structure:
{
  "findings": "Comprehensive academic analysis of the research topic",
  "abstract": "Abstract summarizing the research scope and methodology",
  "methodology": "Research methodology and approach used in the sources",
  "keyFindings": ["key finding 1", "key finding 2", ...],
  "citations": ["citation 1", "citation 2", ...]
}

Focus on:
- Scholarly interpretation and synthesis
- Peer-reviewed research findings
- Academic citations and references
- Theoretical frameworks and methodologies
- Research gaps and future directions

Ensure the report maintains academic rigor and scholarly tone.`;
}

/**
 * Calculate confidence score for academic research
 */
function calculateAcademicConfidence(searchResult: ParallelSearchResult): number {
  // Base score on number of sources found
  const sourceCount = searchResult.structuredResults.length;
  const baseScore = Math.min(sourceCount * 0.1, 0.7);

  // Add bonus for having multiple sources
  const sourceBonus = sourceCount >= 3 ? 0.2 : 0.1;

  return Math.min(baseScore + sourceBonus, 1.0);
}

/**
 * Log improvements based on academic research findings
 *
 * If the academic research identifies opportunities for app/product improvements,
 * log them to the improvements system.
 */
async function logImprovementsFromAcademicResearch(
  ctx: ActionCtx,
  query: string,
  report: AcademicReport
): Promise<void> {
  // Check if findings suggest any improvements
  const improvementKeywords = [
    "improve",
    "enhancement",
    "better",
    "recommend",
    "suggest",
    "opportunity",
  ];

  const hasImprovements = improvementKeywords.some((keyword) =>
    report.findings.toLowerCase().includes(keyword)
  );

  if (!hasImprovements) {
    return;
  }

  // Extract improvement suggestions from findings
  const prompt = `Based on the following academic research findings, identify any concrete suggestions for improving the app or product. Return a JSON array of improvement suggestions.

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
          description: `[Academic Research] ${description}\n\nQuery: ${query}`,
          source: "academic_specialist",
        });
      }

      
    }
  } catch (error) {
    console.error(
      `[logImprovementsFromAcademicResearch] Failed to log improvements:`,
      error
    );
  }
}
