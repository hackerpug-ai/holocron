/**
 * Service Finder Specialist
 *
 * US-IMP-011: Product/Service Finder Specialists
 *
 * Generates service research reports with emphasis on:
 * - Service providers and businesses
 * - Service ratings and reviews
 * - Service pricing and estimates
 * - Service availability and location
 *
 * Also logs improvements to app/product based on service research findings.
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
 * Service research report structure
 */
export interface ServiceReport {
  specialist: "service_finder";
  query: string;
  findings: string;
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    provider?: string;
    rating?: number;
  }>;
  metadata: {
    services: Array<{
      provider: string;
      service: string;
      rating: number;
      pricing: string;
      location?: string;
      availability?: string;
      contact?: string;
    }>;
    comparisons: Array<{
      provider: string;
      service: string;
      rating: number;
      pricing: string;
    }>;
    priceRange: {
      min: string;
      max: string;
      average: string;
    };
    topRated: string;
  };
  sourceCount: number;
  confidenceScore: number;
}

// ============================================================================
// Specialist Implementation
// ============================================================================

/**
 * Execute service research with specialist focus
 *
 * @param ctx - Convex action context
 * @param query - Research query
 * @returns Service research report
 */
export async function executeServiceFinder(
  ctx: ActionCtx,
  query: string
): Promise<ServiceReport> {
  

  // Enhance query with service-specific terms
  const serviceQuery = `${query} service provider review rating pricing near me`;

  // Execute parallel search with retry
  const searchResult = await executeParallelSearchWithRetry(
    serviceQuery,
    {},
    [],
    {
      maxRetries: 2,
      timeoutMs: 15000,
      deduplicateResults: true,
    }
  );

  

  // Generate service report using LLM
  const serviceReport = await generateServiceReport(query, searchResult);

  // Log improvements if any product/app suggestions found
  await logImprovementsFromServiceResearch(ctx, query, serviceReport);


  return serviceReport;
}

/**
 * Generate service-focused report from search results
 */
async function generateServiceReport(
  query: string,
  searchResult: ParallelSearchResult
): Promise<ServiceReport> {
  const prompt = buildServicePrompt(query, searchResult);

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    temperature: 0.7,
    prompt,
  });

  // Parse structured response
  const report = JSON.parse(text.trim());

  return {
    specialist: "service_finder",
    query,
    findings: report.findings,
    sources: searchResult.structuredResults.map((source) => ({
      title: source.title,
      url: source.url,
      snippet: source.content,
      provider: undefined,
      rating: undefined,
    })),
    metadata: {
      services: report.services || [],
      comparisons: report.comparisons || [],
      priceRange: report.priceRange || { min: "N/A", max: "N/A", average: "N/A" },
      topRated: report.topRated || "N/A",
    },
    sourceCount: searchResult.structuredResults.length,
    confidenceScore: calculateServiceConfidence(searchResult),
  };
}

/**
 * Build prompt for service report generation
 */
function buildServicePrompt(
  query: string,
  searchResult: ParallelSearchResult
): string {
  const sourcesText = searchResult.structuredResults
    .map(
      (s, i) =>
        `Source ${i + 1}:\nTitle: ${s.title}\nURL: ${s.url}\nContent: ${s.content}`
    )
    .join("\n\n");

  return `You are a service research specialist. Generate a comprehensive service provider comparison report based on the following sources.

Query: ${query}

Sources:
${sourcesText}

Generate a JSON response with this structure:
{
  "findings": "Comprehensive analysis of service providers and recommendations",
  "services": [
    {
      "provider": "Provider Name",
      "service": "Type of Service",
      "rating": 4.5,
      "pricing": "$XXX / hour or flat rate",
      "location": "City, State or service area",
      "availability": "Available / Booking required",
      "contact": "Phone or website"
    }
  ],
  "comparisons": [
    {
      "provider": "Provider Name",
      "service": "Type of Service",
      "rating": 4.5,
      "pricing": "$XXX"
    }
  ],
  "priceRange": {
    "min": "$XXX",
    "max": "$XXX",
    "average": "$XXX"
  },
  "topRated": "Provider Name with highest rating"
}

Focus on:
- Service provider ratings and reviews
- Pricing information and estimates
- Service quality and reliability
- Location and availability
- Contact information and booking process
- Recommendations based on value and quality

Ensure all pricing and contact data is accurate and extracted from the sources.`;
}

/**
 * Calculate confidence score for service research
 */
function calculateServiceConfidence(searchResult: ParallelSearchResult): number {
  // Base score on number of sources found
  const sourceCount = searchResult.structuredResults.length;
  const baseScore = Math.min(sourceCount * 0.1, 0.7);

  // Add bonus for having multiple sources
  const sourceBonus = sourceCount >= 3 ? 0.2 : 0.1;

  return Math.min(baseScore + sourceBonus, 1.0);
}

/**
 * Log improvements based on service research findings
 *
 * If the service research identifies opportunities for app/product improvements,
 * log them to the improvements system.
 */
async function logImprovementsFromServiceResearch(
  ctx: ActionCtx,
  query: string,
  report: ServiceReport
): Promise<void> {
  // Check if findings suggest any improvements
  const improvementKeywords = [
    "improve",
    "enhancement",
    "better",
    "feature",
    "recommend",
    "suggest",
    "opportunity",
    "add",
    "booking",
    "integration",
  ];

  const hasImprovements = improvementKeywords.some((keyword) =>
    report.findings.toLowerCase().includes(keyword)
  );

  if (!hasImprovements) {
    return;
  }

  // Extract improvement suggestions from findings
  const prompt = `Based on the following service research findings, identify any concrete suggestions for improving the app or product. Return a JSON array of improvement suggestions.

Findings: ${report.findings}

Services analyzed: ${report.metadata.services.map(s => s.provider).join(", ")}

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
        const description =
          typeof suggestion === "string"
            ? suggestion
            : JSON.stringify(suggestion);

        await ctx.runMutation(internal.improvements.internal.submitFromSpecialist, {
          description: `[Service Finder] ${description}\n\nQuery: ${query}`,
          source: "service_finder",
        });
      }

      
    }
  } catch (error) {
    console.error(
      `[logImprovementsFromServiceResearch] Failed to log improvements:`,
      error
    );
  }
}
