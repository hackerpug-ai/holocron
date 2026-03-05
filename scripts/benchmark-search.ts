/**
 * Benchmark Script: Convex vs Supabase Hybrid Search
 *
 * This script compares search quality between Convex and Supabase
 * to ensure ≥90% match rate (GO/NO-GO criteria).
 *
 * Usage: npx tsx scripts/benchmark-search.ts
 *
 * Environment variables required:
 * - EXPO_PUBLIC_SUPABASE_URL
 * - EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
 * - EXPO_PUBLIC_OPENAI_API_KEY
 * - CONVEX_DEPLOYMENT or CONVEX_DEVELOPMENT_TOKEN
 */

import { createClient } from "@supabase/supabase-js";
import { ConvexHttpClient } from "convex/browser";

// Configuration
const EXPECTED_MATCH_RATE = 0.9; // 90%
const TEST_QUERIES = [
  "react native navigation",
  "typescript best practices",
  "convex database schema",
  "vector embeddings",
  "expo router configuration",
  "supabase authentication",
  "backend architecture",
  "api design patterns",
  "database migration",
  "testing methodology",
];

// Environment validation
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
const convexUrl = process.env.CONVEX_DEPLOYMENT;
const convexToken = process.env.CONVEX_DEPLOYMENT_KEY || process.env.CONVEX_DEVELOPMENT_TOKEN;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("ERROR: Missing Supabase credentials");
  console.error("Required: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!openaiApiKey) {
  console.error("ERROR: Missing OpenAI API key");
  console.error("Required: EXPO_PUBLIC_OPENAI_API_KEY");
  process.exit(1);
}

if (!convexUrl || !convexToken) {
  console.error("ERROR: Missing Convex credentials");
  console.error("Required: CONVEX_DEPLOYMENT or CONVEX_DEVELOPMENT_TOKEN");
  process.exit(1);
}

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const convex = new ConvexHttpClient(convexUrl, {
  auth: convexToken,
});

/**
 * Generate embedding using OpenAI API
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Supabase hybrid search
 */
async function supabaseHybridSearch(query: string, embedding: number[], limit = 10) {
  const params: Record<string, unknown> = {
    query_text: query,
    query_embedding: embedding,
    match_count: limit,
  };

  const { data, error } = await supabase.rpc("hybrid_search", params);

  if (error) {
    throw error;
  }
  return (data as any[]) || [];
}

/**
 * Convex hybrid search
 */
async function convexHybridSearch(query: string, embedding: number[], limit = 10) {
  // Import the API dynamically to get function references
  const apiModule = await import("../convex/_generated/api");
  const api = apiModule.default;

  const results = await convex.action(api.documents.search.hybridSearch, {
    query,
    embedding,
    limit,
  });
  return results || [];
}

/**
 * Calculate overlap between two result sets
 */
function calculateOverlap(results1: any[], results2: any[]): {
  overlap: number;
  overlapRate: number;
  commonIds: string[];
} {
  const ids1 = new Set(results1.map((r) => r._id || r.id));
  const ids2 = new Set(results2.map((r) => r._id || r.id));

  const commonIds = Array.from(ids1).filter((id) => ids2.has(id));
  const overlap = commonIds.length;
  const unionSize = new Set([...ids1, ...ids2]).size;
  const overlapRate = unionSize > 0 ? overlap / unionSize : 0;

  return { overlap, overlapRate, commonIds };
}

/**
 * Main benchmark function
 */
async function runBenchmark() {
  console.log("=".repeat(80));
  console.log("SEARCH BENCHMARK: Convex vs Supabase");
  console.log("=".repeat(80));
  console.log(`Expected Match Rate: ${EXPECTED_MATCH_RATE * 100}%`);
  console.log(`Test Queries: ${TEST_QUERIES.length}`);
  console.log("");

  const results = [];

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const query = TEST_QUERIES[i];
    console.log(`[${i + 1}/${TEST_QUERIES.length}] Testing query: "${query}"`);

    try {
      // Generate embedding for query
      const embedding = await generateEmbedding(query);

      // Run Supabase search
      console.log(`  Running Supabase search...`);
      const supabaseResults = await supabaseHybridSearch(query, embedding);
      console.log(`    → Found ${supabaseResults.length} results`);

      // Run Convex search
      console.log(`  Running Convex search...`);
      const convexResults = await convexHybridSearch(query, embedding);
      console.log(`    → Found ${convexResults.length} results`);

      // Calculate overlap
      const { overlap, overlapRate, commonIds } = calculateOverlap(
        supabaseResults,
        convexResults
      );

      console.log(`  Overlap: ${overlap} documents (${(overlapRate * 100).toFixed(1)}%)`);

      results.push({
        query,
        supabaseCount: supabaseResults.length,
        convexCount: convexResults.length,
        overlap,
        overlapRate,
        passed: overlapRate >= EXPECTED_MATCH_RATE,
      });

      console.log(
        `  Status: ${overlapRate >= EXPECTED_MATCH_RATE ? "✓ PASS" : "✗ FAIL"}`
      );
      console.log("");
    } catch (error) {
      console.error(`  ✗ ERROR: ${error}`);
      console.log("");
      results.push({
        query,
        error: String(error),
        passed: false,
      });
    }
  }

  // Summary
  console.log("=".repeat(80));
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(80));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed && !r.error).length;
  const errors = results.filter((r) => r.error).length;

  const avgOverlapRate =
    results
      .filter((r) => r.overlapRate !== undefined)
      .reduce((sum, r) => sum + r.overlapRate!, 0) /
    results.filter((r) => r.overlapRate !== undefined).length;

  console.log(`Total Queries: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Average Overlap Rate: ${(avgOverlapRate * 100).toFixed(1)}%`);
  console.log("");

  const overallPass = avgOverlapRate >= EXPECTED_MATCH_RATE;
  console.log(`Overall Status: ${overallPass ? "✓ PASS" : "✗ FAIL"}`);

  if (!overallPass) {
    console.log("");
    console.log("⚠️  GO/NO-GO GATE FAILED");
    console.log(`   Required: ${EXPECTED_MATCH_RATE * 100}% match rate`);
    console.log(`   Actual: ${(avgOverlapRate * 100).toFixed(1)}% match rate`);
    console.log("");
    console.log("⚠️  ACTION REQUIRED: Escalate to user before proceeding with migration");
  }

  console.log("=".repeat(80));

  // Save results to file
  const fs = await import("fs");
  const resultsPath = "./.tmp/benchmark-results.json";
  await fs.promises.mkdir("./.tmp", { recursive: true });
  await fs.promises.writeFile(
    resultsPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        expectedMatchRate: EXPECTED_MATCH_RATE,
        averageOverlapRate: avgOverlapRate,
        passed: overallPass,
        results,
      },
      null,
      2
    )
  );
  console.log(`\nResults saved to: ${resultsPath}`);

  // Exit with error code if failed
  process.exit(overallPass ? 0 : 1);
}

// Run benchmark
runBenchmark().catch((error) => {
  console.error("Fatal error during benchmark:", error);
  process.exit(1);
});
