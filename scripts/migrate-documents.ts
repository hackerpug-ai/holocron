/**
 * Migration Script: Supabase documents → Convex
 *
 * This script migrates all documents from Supabase to Convex,
 * preserving vector embeddings (1536 dimensions).
 *
 * Usage: npx tsx scripts/migrate-documents.ts
 *
 * Environment variables required:
 * - EXPO_PUBLIC_SUPABASE_URL
 * - EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
 * - CONVEX_DEPLOYMENT (or CONVEX_DEVELOPMENT_TOKEN)
 */

import { createClient } from "@supabase/supabase-js";
import { ConvexHttpClient } from "convex/browser";
import api from "../convex/_generated/api";

// Configuration
const BATCH_SIZE = 50;
const EXPECTED_EMBEDDING_DIMENSIONS = 1536;

// Environment validation
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const convexUrl = process.env.CONVEX_DEPLOYMENT || process.env.npm_config_convex_url;
const convexToken =
  process.env.CONVEX_DEPLOYMENT_KEY || process.env.CONVEX_DEVELOPMENT_TOKEN;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("ERROR: Missing Supabase credentials");
  console.error("Required: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!convexUrl || !convexToken) {
  console.error("ERROR: Missing Convex credentials");
  console.error("Required: CONVEX_DEPLOYMENT or CONVEX_DEVELOPMENT_TOKEN");
  console.error(
    "Hint: Run `npx convex dev` first to get a development token, or use CONVEX_DEPLOYMENT_KEY"
  );
  process.exit(1);
}

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const convex = new ConvexHttpClient(convexUrl, {
  auth: convexToken,
});

interface SupabaseDocument {
  id: number;
  title: string;
  content: string;
  category: string;
  file_path: string | null;
  file_type: string | null;
  status: string | null;
  date: string | null;
  time: string | null;
  research_type: string | null;
  iterations: number | null;
  created_at: string;
  embedding: string | null;
}

/**
 * Parse Supabase embedding string to number array
 * Format: "[0.1,0.2,0.3,...]" or "0.1,0.2,0.3,..."
 */
function parseEmbedding(embeddingString: string | null): number[] | null {
  if (!embeddingString) return null;

  try {
    // Remove brackets if present
    const cleaned = embeddingString.trim().replace(/^\[|\]$/g, "");
    if (!cleaned) return null;

    // Parse as comma-separated numbers
    const values = cleaned.split(",").map((v) => parseFloat(v.trim()));

    // Validate all are valid numbers
    if (values.some(isNaN)) {
      console.warn("Warning: Found NaN values in embedding");
      return null;
    }

    return values;
  } catch (error) {
    console.error("Error parsing embedding:", error);
    return null;
  }
}

/**
 * Convert ISO date string to Unix timestamp (ms)
 */
function toTimestamp(isoString: string | null): number {
  if (!isoString) return Date.now();
  return new Date(isoString).getTime();
}

/**
 * Validate embedding dimensions
 */
function validateEmbeddingDimensions(embedding: number[] | null): boolean {
  if (!embedding) return true; // Null embeddings are allowed
  return embedding.length === EXPECTED_EMBEDDING_DIMENSIONS;
}

/**
 * Main migration function
 */
async function migrate() {
  console.log("=".repeat(60));
  console.log("Starting migration: Supabase → Convex");
  console.log("=".repeat(60));
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Convex URL: ${convexUrl}`);
  console.log("");

  // Step 1: Count documents in Supabase
  console.log("Step 1: Counting documents in Supabase...");
  const { count: supabaseCount, error: countError } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true });

  if (countError) {
    console.error("ERROR: Failed to count Supabase documents:", countError);
    process.exit(1);
  }

  console.log(`Found ${supabaseCount ?? 0} documents in Supabase`);
  console.log("");

  if (!supabaseCount || supabaseCount === 0) {
    console.log("No documents to migrate. Exiting.");
    return;
  }

  // Step 2: Fetch all documents from Supabase
  console.log("Step 2: Fetching all documents from Supabase...");
  const { data: documents, error: fetchError } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (fetchError) {
    console.error("ERROR: Failed to fetch documents:", fetchError);
    process.exit(1);
  }

  if (!documents || documents.length === 0) {
    console.log("No documents found. Exiting.");
    return;
  }

  console.log(`Fetched ${documents.length} documents`);
  console.log("");

  // Step 3: Validate embeddings before migration
  console.log("Step 3: Validating embeddings...");
  let invalidEmbeddings = 0;
  const documentsWithValidEmbeddings: Array<SupabaseDocument & { embedding: number[] }> = [];

  for (const doc of documents) {
    const embedding = parseEmbedding(doc.embedding);
    if (embedding && !validateEmbeddingDimensions(embedding)) {
      console.warn(
        `  ⚠️  Document "${doc.title}" has invalid embedding dimensions: ${embedding.length} (expected ${EXPECTED_EMBEDDING_DIMENSIONS})`
      );
      invalidEmbeddings++;
    } else {
      documentsWithValidEmbeddings.push({ ...doc, embedding: embedding! });
    }
  }

  const validWithEmbeddings = documentsWithValidEmbeddings.filter((d) => d.embedding !== null);
  const withoutEmbeddings = documents.filter((d) => d.embedding === null);

  console.log(`  ✓ Valid embeddings: ${validWithEmbeddings.length}`);
  console.log(`  ⚠️  Invalid dimensions: ${invalidEmbeddings}`);
  console.log(`  - No embedding: ${withoutEmbeddings.length}`);
  console.log("");

  if (invalidEmbeddings > 0) {
    console.error(`ERROR: ${invalidEmbeddings} documents have invalid embedding dimensions`);
    console.error("Migration aborted to prevent data corruption");
    process.exit(1);
  }

  // Step 4: Clear existing documents in Convex (optional, for clean migration)
  console.log("Step 4: Checking existing Convex documents...");
  try {
    const existingCount = await convex.query(api.documents.count, {});
    console.log(`  Found ${existingCount} existing documents in Convex`);

    if (existingCount > 0) {
      console.log("  Clearing existing documents for clean migration...");
      await convex.mutation(api.documents.clearAll, {});
      console.log("  ✓ Cleared existing documents");
    }
  } catch (error) {
    console.log("  Note: Could not check/clear existing documents (may not exist yet)");
  }
  console.log("");

  // Step 5: Migrate in batches
  console.log("Step 5: Migrating documents to Convex...");
  let migrated = 0;
  let skipped = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    console.log(
      `  Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(documents.length / BATCH_SIZE)} (${batch.length} documents)...`
    );

    for (const doc of batch) {
      try {
        const embedding = parseEmbedding(doc.embedding);

        await convex.mutation(api.documents.insertFromMigration, {
          title: doc.title,
          content: doc.content,
          category: doc.category,
          filePath: doc.file_path ?? undefined,
          fileType: doc.file_type ?? undefined,
          status: doc.status ?? undefined,
          date: doc.date ?? undefined,
          time: doc.time ?? undefined,
          researchType: doc.research_type ?? undefined,
          iterations: doc.iterations ?? undefined,
          createdAt: toTimestamp(doc.created_at),
          embedding: embedding ?? undefined,
        });

        migrated++;
      } catch (error) {
        console.error(`    ✗ Failed to migrate "${doc.title}":`, error);
        skipped++;
      }
    }

    console.log(`    ✓ Migrated ${migrated}/${documents.length} documents`);
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("Migration Summary");
  console.log("=".repeat(60));
  console.log(`Source (Supabase):     ${supabaseCount} documents`);
  console.log(`Migrated to Convex:    ${migrated} documents`);
  console.log(`Skipped:               ${skipped} documents`);
  console.log("");

  // Step 6: Verify migration
  console.log("Step 6: Verifying migration...");
  try {
    const convexCount = await convex.query(api.documents.count, {});
    console.log(`  Convex document count: ${convexCount}`);

    if (convexCount === supabaseCount) {
      console.log("  ✓ Row counts match 100%");
    } else {
      console.log(`  ⚠️  Row count mismatch: ${convexCount} vs ${supabaseCount}`);
    }

    // Validate embedding dimensions in Convex
    const sample = await convex.query(api.documents.getSampleWithEmbedding, {});
    if (sample) {
      console.log(`  ✓ Sample embedding dimensions: ${sample.embeddingDimension}`);
      if (sample.embeddingDimension === EXPECTED_EMBEDDING_DIMENSIONS) {
        console.log(`  ✓ Embedding dimensions validated (1536)`);
      } else {
        console.log(`  ⚠️  Unexpected dimensions: ${sample.embeddingDimension}`);
      }
    } else {
      console.log(`  ⚠️  No documents with embeddings found in Convex`);
    }

    // Show category breakdown
    const categoryCounts = await convex.query(api.documents.countByCategory, {});
    console.log("\n  Documents by category:");
    for (const [category, count] of Object.entries(categoryCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`    - ${category}: ${count}`);
    }
  } catch (error) {
    console.error("  Error during verification:", error);
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("Migration complete!");
  console.log("=".repeat(60));
}

// Run migration
migrate().catch((error) => {
  console.error("Fatal error during migration:", error);
  process.exit(1);
});
