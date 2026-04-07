/**
 * Product Finder Specialist
 *
 * US-IMP-011: Product/Service Finder Specialists
 *
 * Generates product research reports with emphasis on:
 * - Product prices and comparisons
 * - Product ratings and reviews
 * - Product specifications and features
 * - Product availability and vendors
 *
 * Also logs improvements to app/product based on product research findings.
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
 * Product research report structure
 */
export interface ProductReport {
  specialist: "product_finder";
  query: string;
  findings: string;
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    price?: string;
    rating?: number;
  }>;
  metadata: {
    products: Array<{
      name: string;
      price: string;
      rating: number;
      specs: Record<string, string>;
      availability?: string;
    }>;
    comparisons: Array<{
      product: string;
      price: string;
      rating: number;
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
 * Execute product research with specialist focus
 *
 * @param ctx - Convex action context
 * @param query - Research query
 * @returns Product research report
 */
export async function executeProductFinder(
  ctx: ActionCtx,
  query: string
): Promise<ProductReport> {
  

  // Enhance query with product-specific terms
  const productQuery = `${query} price comparison review rating specs buy purchase`;

  // Execute parallel search with retry
  const searchResult = await executeParallelSearchWithRetry(
    productQuery,
    {},
    [],
    {
      maxRetries: 2,
      timeoutMs: 15000,
      deduplicateResults: true,
    }
  );

  

  // Generate product report using LLM
  const productReport = await generateProductReport(query, searchResult);

  // Log improvements if any product/app suggestions found
  await logImprovementsFromProductResearch(ctx, query, productReport);


  return productReport;
}

/**
 * Generate product-focused report from search results
 */
async function generateProductReport(
  query: string,
  searchResult: ParallelSearchResult
): Promise<ProductReport> {
  const prompt = buildProductPrompt(query, searchResult);

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    temperature: 0.7,
    prompt,
  });

  // Parse structured response
  const report = JSON.parse(text.trim());

  return {
    specialist: "product_finder",
    query,
    findings: report.findings,
    sources: searchResult.structuredResults.map((source) => ({
      title: source.title,
      url: source.url,
      snippet: source.content,
      price: undefined,
      rating: undefined,
    })),
    metadata: {
      products: report.products || [],
      comparisons: report.comparisons || [],
      priceRange: report.priceRange || { min: "N/A", max: "N/A", average: "N/A" },
      topRated: report.topRated || "N/A",
    },
    sourceCount: searchResult.structuredResults.length,
    confidenceScore: calculateProductConfidence(searchResult),
  };
}

/**
 * Build prompt for product report generation
 */
function buildProductPrompt(
  query: string,
  searchResult: ParallelSearchResult
): string {
  const sourcesText = searchResult.structuredResults
    .map(
      (s, i) =>
        `Source ${i + 1}:\nTitle: ${s.title}\nURL: ${s.url}\nContent: ${s.content}`
    )
    .join("\n\n");

  return `You are a product research specialist. Generate a comprehensive product comparison report based on the following sources.

Query: ${query}

Sources:
${sourcesText}

Generate a JSON response with this structure:
{
  "findings": "Comprehensive analysis of product options and recommendations",
  "products": [
    {
      "name": "Product Name",
      "price": "$XXX",
      "rating": 4.5,
      "specs": {
        "feature1": "spec value",
        "feature2": "spec value"
      },
      "availability": "In Stock / Out of Stock"
    }
  ],
  "comparisons": [
    {
      "product": "Product Name",
      "price": "$XXX",
      "rating": 4.5
    }
  ],
  "priceRange": {
    "min": "$XXX",
    "max": "$XXX",
    "average": "$XXX"
  },
  "topRated": "Product Name with highest rating"
}

Focus on:
- Accurate pricing information
- Product ratings and reviews
- Detailed specifications and features
- Price comparisons across vendors
- Availability and stock information
- Recommendations based on value

Ensure all price data is accurate and extracted from the sources.`;
}

/**
 * Calculate confidence score for product research
 */
function calculateProductConfidence(searchResult: ParallelSearchResult): number {
  // Base score on number of sources found
  const sourceCount = searchResult.structuredResults.length;
  const baseScore = Math.min(sourceCount * 0.1, 0.7);

  // Add bonus for having multiple sources
  const sourceBonus = sourceCount >= 3 ? 0.2 : 0.1;

  return Math.min(baseScore + sourceBonus, 1.0);
}

/**
 * Log improvements based on product research findings
 *
 * If the product research identifies opportunities for app/product improvements,
 * log them to the improvements system.
 */
async function logImprovementsFromProductResearch(
  ctx: ActionCtx,
  query: string,
  report: ProductReport
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
    "track",
    "alert",
  ];

  const hasImprovements = improvementKeywords.some((keyword) =>
    report.findings.toLowerCase().includes(keyword)
  );

  if (!hasImprovements) {
    return;
  }

  // Extract improvement suggestions from findings
  const prompt = `Based on the following product research findings, identify any concrete suggestions for improving the app or product. Return a JSON array of improvement suggestions.

Findings: ${report.findings}

Products analyzed: ${report.metadata.products.map(p => p.name).join(", ")}

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
          description: `[Product Finder] ${description}\n\nQuery: ${query}`,
          source: "product_finder",
        });
      }

      
    }
  } catch (error) {
    console.error(
      `[logImprovementsFromProductResearch] Failed to log improvements:`,
      error
    );
  }
}
