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
import { api } from "../convex/_generated/api";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Simple .env file loader
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length > 0) {
      let value = valueParts.join("=").trim();
      // Strip surrounding quotes (single or double)
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Only set if not already defined
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    }
  }
}

// Load environment variables from .env.local and .env
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

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

// Configuration - support both VITE and EXPO_PUBLIC prefixes
const CONVEX_URL = process.env.VITE_CONVEX_HTTP_URL || process.env.EXPO_PUBLIC_CONVEX_URL || "";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || "";

const results: ValidationResult[] = [];

// Initialize clients (lazy initialization)
let convex: ConvexHttpClient | null = null;
let supabase: ReturnType<typeof createClient> | null = null;

function getClients() {
  if (!convex || !supabase) {
    convex = new ConvexHttpClient(CONVEX_URL);
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return { convex, supabase };
}

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

  const { convex: cvx, supabase: sup } = getClients();

  // Query mapping from Convex module name to count query
  // Using index modules which re-export from queries/mutations
  const countQueries = {
    conversations: api.conversations.index.count,
    chatMessages: api.chatMessages.index.count,
    documents: api.documents.index.count,
    researchSessions: api.researchSessions.queries.count,
    researchIterations: api.researchIterations.queries.count,
    deepResearchSessions: api.deepResearchSessions.queries.count,
    deepResearchIterations: api.deepResearchIterations.queries.count,
    citations: api.citations.queries.count,
    tasks: api.tasks.index.count,
  };

  for (const { supabase: sTable, convex: cTable } of TABLE_MAPPING) {
    try {
      // Get Supabase count
      const { count: sCount, error: sError } = await sup!
        .from(sTable)
        .select("*", { count: "exact", head: true });

      // Get Convex count using the count query
      const countQuery = countQueries[cTable as keyof typeof countQueries];
      const cCount = countQuery ? await cvx!.query(countQuery, {}) : 0;

      // Handle table doesn't exist in Supabase (new Convex-only table)
      if (sError || sCount === null) {
        // If table doesn't exist in Supabase but exists in Convex with 0 rows, that's OK
        const status: ValidationStatus = cCount === 0 ? "PASS" : "FAIL";

        results.push({
          table: cTable,
          check: "row_count",
          status,
          expected: 0,
          actual: cCount,
          details: status === "PASS"
            ? "New Convex-only table (not in Supabase)"
            : `Table missing in Supabase but has ${cCount} rows in Convex`,
        });

        console.log(
          `${status === "PASS" ? "✓" : "✗"} ${cTable}: ${cCount} / N/A (Convex-only)`
        );
        continue;
      }

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

  const { convex: cvx } = getClients();

  // Check 1: chatMessages -> conversations
  try {
    const messages = await cvx!.query(api.chatMessages.index.list, {});
    const conversations = await cvx!.query(api.conversations.index.list, {});
    const conversationIds = new Set(
      conversations.map((c: any) => c._id)
    );

    const orphanedMessages = messages.filter(
      (m: any) => !conversationIds.has(m.conversationId)
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
    const iterations = await cvx!.query(api.researchIterations.queries.list);
    const sessions = await cvx!.query(api.researchSessions.queries.list);
    const sessionIds = new Set(
      sessions.map((s: any) => s._id)
    );

    const orphanedIterations = iterations.filter(
      (i: any) => !sessionIds.has(i.sessionId)
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
    const iterations = await cvx!.query(api.deepResearchIterations.queries.list);
    const sessions = await cvx!.query(api.deepResearchSessions.queries.list);
    const sessionIds = new Set(
      sessions.map((s: any) => s._id)
    );

    const orphanedIterations = iterations.filter(
      (i: any) => !sessionIds.has(i.sessionId)
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
    const deepSessions = await cvx!.query(api.deepResearchSessions.queries.list);
    const conversations = await cvx!.query(api.conversations.index.list, {});
    const conversationIds = new Set(
      conversations.map((c: any) => c._id)
    );

    const orphanedDeepSessions = deepSessions.filter(
      (s: any) => !conversationIds.has(s.conversationId)
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

  const { convex: cvx } = getClients();

  try {
    const documents = await cvx!.query(api.documents.index.list, {});

    // Filter documents with embeddings
    const docsWithEmbeddings = documents.filter(
      (doc: any) => doc.embedding && doc.embedding.length > 0
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
      (doc: any) => doc.embedding!.length !== 1536
    );

    // Sample first doc with embedding
    const sampleDoc = docsWithEmbeddings[0];
    const sampleDimension = sampleDoc.embedding!.length;

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
 * AC-4: Validate chat message ordering preserved (createdAt sequence)
 */
async function validateChatOrdering(): Promise<void> {
  console.log("\n=== AC-4: Validating Chat Message Ordering ===");

  const { convex: cvx } = getClients();

  try {
    const conversations = await cvx!.query(api.conversations.index.list, { limit: 100 });

    let outOfOrderCount = 0;
    const outOfOrderDetails: string[] = [];

    for (const conv of conversations) {
      const messages = await cvx!.query(api.chatMessages.index.list, {
        conversationId: conv._id,
      });

      // Check ascending order by createdAt
      for (let i = 1; i < messages.length; i++) {
        if (messages[i].createdAt < messages[i - 1].createdAt) {
          outOfOrderCount++;
          if (outOfOrderDetails.length < 5) {
            outOfOrderDetails.push(
              `Conv ${conv._id}: msg[${i - 1}].createdAt > msg[${i}].createdAt`
            );
          }
        }
      }
    }

    const status: ValidationStatus = outOfOrderCount === 0 ? "PASS" : "FAIL";

    results.push({
      table: "chatMessages",
      check: "ordering",
      status,
      expected: "ascending",
      actual: outOfOrderCount === 0 ? "ascending" : `${outOfOrderCount} out of order`,
      details: outOfOrderDetails.length > 0 ? outOfOrderDetails.join("; ") : undefined,
    });

    console.log(
      `${outOfOrderCount === 0 ? "✓" : "✗"} Chat message ordering: ${outOfOrderCount} out of order (checked ${conversations.length} conversations)`
    );

    if (outOfOrderDetails.length > 0) {
      console.log(`  Details: ${outOfOrderDetails.join("; ")}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      table: "chatMessages",
      check: "ordering",
      status: "FAIL",
      expected: "ascending",
      actual: `Error: ${errorMessage}`,
      details: errorMessage,
    });
    console.log(`✗ Error validating chat ordering: ${errorMessage}`);
  }
}

/**
 * AC-5: Generate integrity report
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
    if (!CONVEX_URL) console.error("  - VITE_CONVEX_HTTP_URL or EXPO_PUBLIC_CONVEX_URL");
    if (!SUPABASE_URL) console.error("  - VITE_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
    if (!SUPABASE_ANON_KEY) console.error("  - VITE_SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    throw new Error("Missing required environment variables");
  }

  // Run all validation checks
  await validateRowCounts();
  await validateForeignKeys();
  await validateEmbeddingDimensions();
  await validateChatOrdering();

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
