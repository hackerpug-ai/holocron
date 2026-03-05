/**
 * Migration Validation Script
 *
 * Validates data integrity between Supabase and Convex after migration.
 * This is the critical data integrity gate - DO NOT skip validation.
 *
 * Usage: pnpm validate
 */

import { createClient } from "@supabase/supabase-js";
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "fs";
import { join } from "path";

// Types
type ValidationStatus = "PASS" | "FAIL";

interface ValidationResult {
  table: string;
  check: string;
  status: ValidationStatus;
  expected: number | string;
  actual: number | string;
  details?: string;
}

interface ValidationReport {
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: string;
  };
  results: ValidationResult[];
}

// Configuration
const CONVEX_URL = process.env.VITE_CONVEX_HTTP_URL || "";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

const results: ValidationResult[] = [];

// Initialize clients
const convex = new ConvexHttpClient(CONVEX_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Table mapping: Supabase table name -> Convex table name
const TABLE_MAPPING = [
  { supabase: "conversations", convex: "conversations" },
  { supabase: "chat_messages", convex: "chatMessages" },
  { supabase: "documents", convex: "documents" },
  { supabase: "research_sessions", convex: "researchSessions" },
  { supabase: "research_iterations", convex: "researchIterations" },
  { supabase: "deep_research_sessions", convex: "deepResearchSessions" },
  { supabase: "deep_research_iterations", convex: "deepResearchIterations" },
  { supabase: "citations", convex: "citations" },
  { supabase: "long_running_tasks", convex: "tasks" },
];

/**
 * AC-1: Validate row counts match 100% for all tables
 */
async function validateRowCounts(): Promise<void> {
  console.log("\n=== AC-1: Validating Row Counts ===");

  for (const { supabase: sTable, convex: cTable } of TABLE_MAPPING) {
    try {
      // Get Supabase count
      const { count: sCount, error: sError } = await supabase
        .from(sTable)
        .select("*", { count: "exact", head: true });

      if (sError) {
        results.push({
          table: cTable,
          check: "row_count",
          status: "FAIL",
          expected: 0,
          actual: `Error: ${sError.message}`,
          details: sError.message,
        });
        continue;
      }

      // Get Convex count - fetch all documents and count
      // Using a generic query approach
      const cData = await convex.query(`db.${cTable}:list`);
      const cCount = Array.isArray(cData) ? cData.length : 0;

      const status: ValidationStatus = sCount === cCount ? "PASS" : "FAIL";

      results.push({
        table: cTable,
        check: "row_count",
        status,
        expected: sCount ?? 0,
        actual: cCount,
        details: status === "FAIL" ? `Supabase: ${sCount}, Convex: ${cCount}` : undefined,
      });

      console.log(
        `${status === "PASS" ? "✓" : "✗"} ${cTable}: ${cCount} / ${sCount}`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push({
        table: cTable,
        check: "row_count",
        status: "FAIL",
        expected: 0,
        actual: `Error: ${errorMessage}`,
        details: errorMessage,
      });
      console.log(`✗ ${cTable}: Error - ${errorMessage}`);
    }
  }
}

/**
 * AC-2: Validate FK relationships preserved
 */
async function validateForeignKeys(): Promise<void> {
  console.log("\n=== AC-2: Validating FK Relationships ===");

  // Check 1: chatMessages -> conversations
  try {
    const messages = await convex.query("db.chatMessages:list");
    const conversations = await convex.query("db.conversations:list");
    const conversationIds = new Set(
      conversations.map((c: { _id: string }) => c._id)
    );

    const orphanedMessages = (messages as Array<{ conversationId: string }>).filter(
      (m) => !conversationIds.has(m.conversationId)
    );

    results.push({
      table: "chatMessages",
      check: "fk_conversations",
      status: orphanedMessages.length === 0 ? "PASS" : "FAIL",
      expected: 0,
      actual: orphanedMessages.length,
      details:
        orphanedMessages.length > 0
          ? `${orphanedMessages.length} orphaned messages`
          : undefined,
    });

    console.log(
      `${orphanedMessages.length === 0 ? "✓" : "✗"} chatMessages → conversations: ${
        orphanedMessages.length
      } orphans`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      table: "chatMessages",
      check: "fk_conversations",
      status: "FAIL",
      expected: 0,
      actual: `Error: ${errorMessage}`,
      details: errorMessage,
    });
  }

  // Check 2: researchIterations -> researchSessions
  try {
    const iterations = await convex.query("db.researchIterations:list");
    const sessions = await convex.query("db.researchSessions:list");
    const sessionIds = new Set(
      sessions.map((s: { _id: string }) => s._id)
    );

    const orphanedIterations = (iterations as Array<{ sessionId: string }>).filter(
      (i) => !sessionIds.has(i.sessionId)
    );

    results.push({
      table: "researchIterations",
      check: "fk_researchSessions",
      status: orphanedIterations.length === 0 ? "PASS" : "FAIL",
      expected: 0,
      actual: orphanedIterations.length,
      details:
        orphanedIterations.length > 0
          ? `${orphanedIterations.length} orphaned iterations`
          : undefined,
    });

    console.log(
      `${orphanedIterations.length === 0 ? "✓" : "✗"} researchIterations → researchSessions: ${
        orphanedIterations.length
      } orphans`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      table: "researchIterations",
      check: "fk_researchSessions",
      status: "FAIL",
      expected: 0,
      actual: `Error: ${errorMessage}`,
      details: errorMessage,
    });
  }

  // Check 3: deepResearchIterations -> deepResearchSessions
  try {
    const iterations = await convex.query("db.deepResearchIterations:list");
    const sessions = await convex.query("db.deepResearchSessions:list");
    const sessionIds = new Set(
      sessions.map((s: { _id: string }) => s._id)
    );

    const orphanedIterations = (iterations as Array<{ sessionId: string }>).filter(
      (i) => !sessionIds.has(i.sessionId)
    );

    results.push({
      table: "deepResearchIterations",
      check: "fk_deepResearchSessions",
      status: orphanedIterations.length === 0 ? "PASS" : "FAIL",
      expected: 0,
      actual: orphanedIterations.length,
      details:
        orphanedIterations.length > 0
          ? `${orphanedIterations.length} orphaned iterations`
          : undefined,
    });

    console.log(
      `${orphanedIterations.length === 0 ? "✓" : "✗"} deepResearchIterations → deepResearchSessions: ${
        orphanedIterations.length
      } orphans`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      table: "deepResearchIterations",
      check: "fk_deepResearchSessions",
      status: "FAIL",
      expected: 0,
      actual: `Error: ${errorMessage}`,
      details: errorMessage,
    });
  }

  // Check 4: deepResearchSessions -> conversations
  try {
    const deepSessions = await convex.query("db.deepResearchSessions:list");
    const conversations = await convex.query("db.conversations:list");
    const conversationIds = new Set(
      conversations.map((c: { _id: string }) => c._id)
    );

    const orphanedDeepSessions = (deepSessions as Array<{ conversationId: string }>).filter(
      (s) => !conversationIds.has(s.conversationId)
    );

    results.push({
      table: "deepResearchSessions",
      check: "fk_conversations",
      status: orphanedDeepSessions.length === 0 ? "PASS" : "FAIL",
      expected: 0,
      actual: orphanedDeepSessions.length,
      details:
        orphanedDeepSessions.length > 0
          ? `${orphanedDeepSessions.length} orphaned sessions`
          : undefined,
    });

    console.log(
      `${orphanedDeepSessions.length === 0 ? "✓" : "✗"} deepResearchSessions → conversations: ${
        orphanedDeepSessions.length
      } orphans`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      table: "deepResearchSessions",
      check: "fk_conversations",
      status: "FAIL",
      expected: 0,
      actual: `Error: ${errorMessage}`,
      details: errorMessage,
    });
  }
}

/**
 * AC-3: Validate embedding dimensions = 1536
 */
async function validateEmbeddingDimensions(): Promise<void> {
  console.log("\n=== AC-3: Validating Embedding Dimensions ===");

  try {
    const documents = await convex.query("db.documents:list");
    const docsArray = Array.isArray(documents) ? documents : [];

    // Filter documents with embeddings
    const docsWithEmbeddings = docsArray.filter(
      (doc: { embedding?: number[] }) => doc.embedding && doc.embedding.length > 0
    );

    if (docsWithEmbeddings.length === 0) {
      results.push({
        table: "documents",
        check: "embedding_dimensions",
        status: "FAIL",
        expected: 1536,
        actual: "No embeddings found",
        details: "No documents with embeddings found in Convex",
      });
      console.log("✗ No documents with embeddings found");
      return;
    }

    // Check for invalid dimensions
    const invalidDocs = docsWithEmbeddings.filter(
      (doc: { embedding: number[] }) => doc.embedding.length !== 1536
    );

    // Sample first doc with embedding
    const sampleDoc = docsWithEmbeddings[0] as { embedding: number[]; _id: string; title: string };
    const sampleDimension = sampleDoc.embedding.length;

    results.push({
      table: "documents",
      check: "embedding_dimensions",
      status: invalidDocs.length === 0 ? "PASS" : "FAIL",
      expected: 1536,
      actual: invalidDocs.length === 0 ? 1536 : `varies (${invalidDocs.length} invalid)`,
      details:
        invalidDocs.length > 0
          ? `${invalidDocs.length} documents with invalid dimensions`
          : undefined,
    });

    console.log(
      `${invalidDocs.length === 0 ? "✓" : "✗"} Embedding dimensions: ${sampleDimension} (${docsWithEmbeddings.length} docs checked)`
    );

    if (invalidDocs.length > 0) {
      console.log(`  ✗ ${invalidDocs.length} documents have invalid dimensions`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      table: "documents",
      check: "embedding_dimensions",
      status: "FAIL",
      expected: 1536,
      actual: `Error: ${errorMessage}`,
      details: errorMessage,
    });
    console.log(`✗ Error validating embeddings: ${errorMessage}`);
  }
}

/**
 * AC-4: Generate integrity report
 */
async function generateReport(): Promise<ValidationReport> {
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const passRate = results.length > 0 ? (passCount / results.length) * 100 : 0;

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: passCount,
      failed: failCount,
      passRate: `${passRate.toFixed(1)}%`,
    },
    results,
  };

  return report;
}

/**
 * Main validation function
 */
export async function validateMigration(): Promise<ValidationReport> {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║     MIGRATION DATA INTEGRITY VALIDATION                   ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Check environment variables
  if (!CONVEX_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("\n✗ Missing required environment variables:");
    if (!CONVEX_URL) console.error("  - VITE_CONVEX_HTTP_URL");
    if (!SUPABASE_URL) console.error("  - VITE_SUPABASE_URL");
    if (!SUPABASE_ANON_KEY) console.error("  - VITE_SUPABASE_ANON_KEY");
    throw new Error("Missing required environment variables");
  }

  // Run all validation checks
  await validateRowCounts();
  await validateForeignKeys();
  await validateEmbeddingDimensions();

  // Generate report
  const report = await generateReport();

  // Save report to file
  const fs = await import("fs/promises");
  try {
    await fs.mkdir(".tmp", { recursive: true });
    await fs.writeFile(
      ".tmp/validation-report.json",
      JSON.stringify(report, null, 2)
    );
    console.log("\n✓ Report saved to .tmp/validation-report.json");
  } catch (error) {
    console.error("\n✗ Failed to save report:", error);
  }

  // Print summary
  console.log("\n=== VALIDATION SUMMARY ===");
  console.log(`Total checks: ${report.summary.total}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Pass rate: ${report.summary.passRate}`);

  if (report.summary.failed > 0) {
    console.log("\n=== FAILED CHECKS ===");
    results
      .filter((r) => r.status === "FAIL")
      .forEach((r) => {
        console.log(`✗ ${r.table}.${r.check}`);
        console.log(`  Expected: ${r.expected}`);
        console.log(`  Actual: ${r.actual}`);
        if (r.details) console.log(`  Details: ${r.details}`);
      });
  }

  console.log("\n" + "=".repeat(60));

  return report;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateMigration()
    .then((report) => {
      if (report.summary.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n✗ Validation failed:", error);
      process.exit(1);
    });
}
