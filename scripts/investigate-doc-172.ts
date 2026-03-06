/**
 * Investigate and manually migrate document 172
 *
 * This script queries Supabase for document 172 to understand why it was
 * skipped during migration, then manually migrates it to Convex.
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
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    }
  }
}

// Load environment variables
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL || process.env.VITE_CONVEX_HTTP_URL;

if (!supabaseUrl || !supabaseServiceKey || !convexUrl) {
  console.error("ERROR: Missing required environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const convex = new ConvexHttpClient(convexUrl);

function toTimestamp(isoString: string | null): number {
  if (!isoString) return Date.now();
  return new Date(isoString).getTime();
}

async function investigateDocument172() {
  console.log("\n=== Investigating Document 172 ===\n");

  // Fetch document 172 from Supabase
  const { data: doc, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", 172)
    .single();

  if (error) {
    console.error("❌ Error fetching document 172:", error);
    return;
  }

  if (!doc) {
    console.error("❌ Document 172 not found in Supabase");
    return;
  }

  console.log("✓ Found document 172 in Supabase");
  console.log("\nDocument details:");
  console.log("  ID:", doc.id);
  console.log("  Title:", doc.title);
  console.log("  Category:", doc.category);
  console.log("  File path:", doc.file_path || "N/A");
  console.log("  Status:", doc.status);
  console.log("  Created:", doc.created_at);
  console.log("  Content length:", doc.content?.length || 0, "characters");
  console.log("  Embedding:", doc.embedding ? "Present" : "NULL");

  if (doc.embedding) {
    console.log("  Embedding type:", typeof doc.embedding);
    console.log("  Embedding preview:", JSON.stringify(doc.embedding).substring(0, 100) + "...");

    // Try to parse embedding
    try {
      let embedding: number[] | undefined;
      if (typeof doc.embedding === "string") {
        const cleaned = doc.embedding.trim().replace(/^\[|\]$/g, "");
        if (cleaned) {
          embedding = cleaned.split(",").map((v: string) => parseFloat(v.trim()));
          console.log("  Embedding dimensions:", embedding.length);

          if (embedding.length !== 1536) {
            console.log("  ⚠️  WARNING: Embedding has", embedding.length, "dimensions, expected 1536");
          }

          // Check for NaN values
          const nanCount = embedding.filter(v => isNaN(v)).length;
          if (nanCount > 0) {
            console.log("  ⚠️  WARNING:", nanCount, "NaN values in embedding");
          }
        }
      } else {
        console.log("  ⚠️  Embedding is not a string, type:", typeof doc.embedding);
        embedding = doc.embedding;
      }

      // Migrate to Convex
      console.log("\n=== Migrating Document 172 to Convex ===\n");

      const convexId = await convex.mutation(api.documents.mutations.insertFromMigration, {
        title: doc.title,
        content: doc.content || "",
        category: doc.category as "code" | "design" | "business" | "llm-prompt" | "other",
        filePath: doc.file_path ?? undefined,
        fileType: doc.file_type ?? "md",
        status: doc.status ?? "complete",
        date: doc.date ?? undefined,
        time: doc.time ?? undefined,
        researchType: doc.research_type ?? undefined,
        iterations: doc.iterations ?? undefined,
        createdAt: toTimestamp(doc.created_at),
        embedding,
      });

      console.log("✓ Successfully migrated document 172 to Convex");
      console.log("  Convex ID:", convexId);

      // Update ID mappings
      const idMappingsPath = ".tmp/id-mappings.json";
      if (existsSync(idMappingsPath)) {
        const mappings = JSON.parse(readFileSync(idMappingsPath, "utf-8"));
        mappings.documents["172"] = convexId;
        const fs = await import("fs/promises");
        await fs.writeFile(idMappingsPath, JSON.stringify(mappings, null, 2));
        console.log("✓ Updated ID mappings");
      }

    } catch (error) {
      console.error("\n❌ Error parsing/migrating embedding:", error);
      if (error instanceof Error) {
        console.error("   Error details:", error.message);
        console.error("   Stack:", error.stack);
      }
    }
  } else {
    console.log("\n⚠️  Document 172 has no embedding");
    console.log("   This document should be migrated without an embedding");

    // Migrate without embedding
    try {
      const convexId = await convex.mutation(api.documents.mutations.insertFromMigration, {
        title: doc.title,
        content: doc.content || "",
        category: doc.category as "code" | "design" | "business" | "llm-prompt" | "other",
        filePath: doc.file_path ?? undefined,
        fileType: doc.file_type ?? "md",
        status: doc.status ?? "complete",
        date: doc.date ?? undefined,
        time: doc.time ?? undefined,
        researchType: doc.research_type ?? undefined,
        iterations: doc.iterations ?? undefined,
        createdAt: toTimestamp(doc.created_at),
        embedding: undefined,
      });

      console.log("✓ Successfully migrated document 172 to Convex (without embedding)");
      console.log("  Convex ID:", convexId);

      // Update ID mappings
      const idMappingsPath = ".tmp/id-mappings.json";
      if (existsSync(idMappingsPath)) {
        const mappings = JSON.parse(readFileSync(idMappingsPath, "utf-8"));
        mappings.documents["172"] = convexId;
        const fs = await import("fs/promises");
        await fs.writeFile(idMappingsPath, JSON.stringify(mappings, null, 2));
        console.log("✓ Updated ID mappings");
      }
    } catch (error) {
      console.error("\n❌ Error migrating document:", error);
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  investigateDocument172()
    .then(() => {
      console.log("\n=== Investigation Complete ===\n");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Investigation failed:", error);
      process.exit(1);
    });
}
