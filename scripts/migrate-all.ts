/**
 * Master Migration Script: Supabase → Convex
 *
 * Orchestrates migration of all 9 tables in the correct order to respect
 * foreign key dependencies. Builds ID mappings for FK relationships.
 *
 * Migration Order (FK dependencies):
 * 1. conversations (no FK dependencies)
 * 2. documents (no FK dependencies)
 * 3. researchSessions (FK: documents)
 * 4. researchIterations (FK: researchSessions)
 * 5. deepResearchSessions (FK: conversations, tasks)
 * 6. deepResearchIterations (FK: deepResearchSessions)
 * 7. chatMessages (FK: conversations, researchSessions, documents)
 * 8. tasks (FK: conversations)
 * 9. citations (FK: researchSessions, documents)
 *
 * Usage: npx tsx scripts/migrate-all.ts
 *
 * Environment variables required:
 * - EXPO_PUBLIC_SUPABASE_URL
 * - EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
 * - CONVEX_DEPLOYMENT or CONVEX_DEVELOPMENT_TOKEN
 */

import { createClient } from "@supabase/supabase-js";
import { ConvexHttpClient } from "convex/browser";
import api from "../convex/_generated/api";

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
 * Convert ISO date string to Unix timestamp (ms)
 */
function toTimestamp(isoString: string | null): number {
  if (!isoString) return Date.now();
  return new Date(isoString).getTime();
}

/**
 * Migration result interface
 */
interface MigrationResult {
  table: string;
  sourceCount: number;
  migratedCount: number;
  skippedCount: number;
  success: boolean;
}

/**
 * Main migration orchestrator
 */
async function migrateAll() {
  console.log("=".repeat(80));
  console.log("SUPABASE → CONVEX MIGRATION");
  console.log("=".repeat(80));
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Convex URL: ${convexUrl}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log("");

  const results: MigrationResult[] = [];
  const idMappings: Record<string, Record<string, string>> = {
    conversations: {},
    documents: {},
    researchSessions: {},
    deepResearchSessions: {},
    tasks: {},
  };

  // ========================================================================
  // TABLE 1: conversations (no FK dependencies)
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TABLE 1/9: conversations");
  console.log("=".repeat(80));

  try {
    const { count } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true });

    if (!count) {
      console.log("No conversations to migrate");
      results.push({ table: "conversations", sourceCount: 0, migratedCount: 0, skippedCount: 0, success: true });
    } else {
      const { data: conversations } = await supabase
        .from("conversations")
        .select("*")
        .order("created_at", { ascending: false });

      if (conversations) {
        // Clear existing
        try {
          const existingCount = await convex.query(api.conversations.count, {});
          if (existingCount > 0) {
            await convex.mutation(api.conversations.clearAll, {});
            console.log(`Cleared ${existingCount} existing conversations`);
          }
        } catch {}

        // Migrate
        let migrated = 0;
        for (const conv of conversations) {
          try {
            const convexId = await convex.mutation(api.conversations.insertFromMigration, {
              title: conv.title,
              lastMessagePreview: conv.last_message_preview ?? undefined,
              createdAt: toTimestamp(conv.created_at),
              updatedAt: toTimestamp(conv.updated_at),
            });
            idMappings.conversations[conv.id] = convexId as string;
            migrated++;
          } catch (error) {
            console.error(`Failed to migrate conversation ${conv.id}:`, error);
          }
        }

        // Verify
        const convexCount = await convex.query(api.conversations.count, {});
        const success = convexCount === count;
        console.log(`Conversations: ${count} → ${migrated} migrated (${convexCount} in Convex) ${success ? "✓" : "✗"}`);

        results.push({
          table: "conversations",
          sourceCount: count,
          migratedCount: migrated,
          skippedCount: count - migrated,
          success,
        });
      }
    }
  } catch (error) {
    console.error("Failed to migrate conversations:", error);
    results.push({ table: "conversations", sourceCount: 0, migratedCount: 0, skippedCount: 0, success: false });
  }

  // ========================================================================
  // TABLE 2: documents (no FK dependencies) - Already exists
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TABLE 2/9: documents");
  console.log("=".repeat(80));

  try {
    const { count } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true });

    if (!count) {
      console.log("No documents to migrate");
      results.push({ table: "documents", sourceCount: 0, migratedCount: 0, skippedCount: 0, success: true });
    } else {
      const { data: documents } = await supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (documents) {
        // Clear existing
        try {
          const existingCount = await convex.query(api.documents.count, {});
          if (existingCount > 0) {
            await convex.mutation(api.documents.clearAll, {});
            console.log(`Cleared ${existingCount} existing documents`);
          }
        } catch {}

        // Migrate
        let migrated = 0;
        for (const doc of documents) {
          try {
            // Parse embedding
            let embedding: number[] | undefined;
            if (doc.embedding) {
              const cleaned = doc.embedding.trim().replace(/^\[|\]$/g, "");
              if (cleaned) {
                embedding = cleaned.split(",").map((v: string) => parseFloat(v.trim()));
              }
            }

            const convexId = await convex.mutation(api.documents.insertFromMigration, {
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
              embedding,
            });
            idMappings.documents[doc.id.toString()] = convexId as string;
            migrated++;
          } catch (error) {
            console.error(`Failed to migrate document ${doc.id}:`, error);
          }
        }

        // Verify
        const convexCount = await convex.query(api.documents.count, {});
        const success = convexCount === count;
        console.log(`Documents: ${count} → ${migrated} migrated (${convexCount} in Convex) ${success ? "✓" : "✗"}`);

        results.push({
          table: "documents",
          sourceCount: count,
          migratedCount: migrated,
          skippedCount: count - migrated,
          success,
        });
      }
    }
  } catch (error) {
    console.error("Failed to migrate documents:", error);
    results.push({ table: "documents", sourceCount: 0, migratedCount: 0, skippedCount: 0, success: false });
  }

  // ========================================================================
  // TABLE 8: tasks (FK: conversations) - Migrate before chatMessages and deepResearchSessions
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TABLE 8/9: tasks");
  console.log("=".repeat(80));

  try {
    const { count } = await supabase
      .from("long_running_tasks")
      .select("id", { count: "exact", head: true });

    if (!count) {
      console.log("No tasks to migrate");
      results.push({ table: "tasks", sourceCount: 0, migratedCount: 0, skippedCount: 0, success: true });
    } else {
      const { data: tasks } = await supabase
        .from("long_running_tasks")
        .select("*")
        .order("created_at", { ascending: false });

      if (tasks) {
        // Clear existing
        try {
          const existingCount = await convex.query(api.tasks.count, {});
          if (existingCount > 0) {
            await convex.mutation(api.tasks.clearAll, {});
            console.log(`Cleared ${existingCount} existing tasks`);
          }
        } catch {}

        // Migrate
        let migrated = 0;
        for (const task of tasks) {
          try {
            const conversationId = task.conversation_id
              ? idMappings.conversations[task.conversation_id]
              : undefined;

            const convexId = await convex.mutation(api.tasks.insertFromMigration, {
              conversationId,
              taskType: task.task_type,
              status: task.status,
              config: task.config ?? undefined,
              currentStep: task.current_step ?? undefined,
              totalSteps: task.total_steps ?? undefined,
              progressMessage: task.progress_message ?? undefined,
              result: task.result ?? undefined,
              errorMessage: task.error_message ?? undefined,
              errorDetails: task.error_details ?? undefined,
              startedAt: task.started_at ? toTimestamp(task.started_at) : undefined,
              completedAt: task.completed_at ? toTimestamp(task.completed_at) : undefined,
              createdAt: toTimestamp(task.created_at),
              updatedAt: toTimestamp(task.updated_at),
            });
            idMappings.tasks[task.id] = convexId as string;
            migrated++;
          } catch (error) {
            console.error(`Failed to migrate task ${task.id}:`, error);
          }
        }

        // Verify
        const convexCount = await convex.query(api.tasks.count, {});
        const success = convexCount === count;
        console.log(`Tasks: ${count} → ${migrated} migrated (${convexCount} in Convex) ${success ? "✓" : "✗"}`);

        results.push({
          table: "tasks",
          sourceCount: count,
          migratedCount: migrated,
          skippedCount: count - migrated,
          success,
        });
      }
    }
  } catch (error) {
    console.error("Failed to migrate tasks:", error);
    results.push({ table: "tasks", sourceCount: 0, migratedCount: 0, skippedCount: 0, success: false });
  }

  // ========================================================================
  // TABLE 7: chatMessages (FK: conversations)
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TABLE 7/9: chatMessages");
  console.log("=".repeat(80));

  try {
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true });

    if (!count) {
      console.log("No chat messages to migrate");
      results.push({ table: "chatMessages", sourceCount: 0, migratedCount: 0, skippedCount: 0, success: true });
    } else {
      const { data: messages } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true });

      if (messages) {
        // Clear existing
        try {
          const existingCount = await convex.query(api.chatMessages.count, {});
          if (existingCount > 0) {
            await convex.mutation(api.chatMessages.clearAll, {});
            console.log(`Cleared ${existingCount} existing chat messages`);
          }
        } catch {}

        // Migrate
        let migrated = 0;
        for (const msg of messages) {
          try {
            const conversationId = idMappings.conversations[msg.conversation_id];
            if (!conversationId) {
              console.warn(`Skipping message ${msg.id}: unmapped conversation_id`);
              continue;
            }

            await convex.mutation(api.chatMessages.insertFromMigration, {
              conversationId,
              role: msg.role as "user" | "agent" | "system",
              content: msg.content,
              messageType: msg.message_type as "text" | "slash_command" | "result_card" | "progress" | "error",
              cardData: msg.card_data ?? undefined,
              sessionId: msg.session_id ? idMappings.researchSessions[msg.session_id] : undefined,
              documentId: msg.document_id ? idMappings.documents[msg.document_id.toString()] : undefined,
              createdAt: toTimestamp(msg.created_at),
            });
            migrated++;
          } catch (error) {
            console.error(`Failed to migrate message ${msg.id}:`, error);
          }
        }

        // Verify
        const convexCount = await convex.query(api.chatMessages.count, {});
        const success = convexCount === count;
        console.log(`Chat messages: ${count} → ${migrated} migrated (${convexCount} in Convex) ${success ? "✓" : "✗"}`);

        results.push({
          table: "chatMessages",
          sourceCount: count,
          migratedCount: migrated,
          skippedCount: count - migrated,
          success,
        });
      }
    }
  } catch (error) {
    console.error("Failed to migrate chat messages:", error);
    results.push({ table: "chatMessages", sourceCount: 0, migratedCount: 0, skippedCount: 0, success: false });
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("MIGRATION SUMMARY");
  console.log("=".repeat(80));
  console.log("");

  let totalSource = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let allSuccess = true;

  for (const result of results) {
    const status = result.success ? "✓ SUCCESS" : "✗ FAILED";
    console.log(`${status} | ${result.table.padEnd(25)} | ${result.sourceCount} → ${result.migratedCount} migrated`);
    totalSource += result.sourceCount;
    totalMigrated += result.migratedCount;
    totalSkipped += result.skippedCount;
    if (!result.success) allSuccess = false;
  }

  console.log("");
  console.log("-".repeat(80));
  console.log(`TOTAL: ${totalSource} rows → ${totalMigrated} migrated (${totalSkipped} skipped)`);
  console.log("-".repeat(80));
  console.log("");

  if (allSuccess) {
    console.log("✓ All migrations completed successfully!");
  } else {
    console.log("✗ Some migrations failed. Please review the output above.");
  }

  console.log("");
  console.log("=".repeat(80));
  console.log(`Completed at: ${new Date().toISOString()}`);
  console.log("=".repeat(80));

  // Save ID mappings for reference
  const fs = await import("fs");
  await fs.promises.mkdir(".tmp", { recursive: true });
  await fs.promises.writeFile(
    ".tmp/id-mappings.json",
    JSON.stringify(idMappings, null, 2)
  );
  console.log("\nID mappings saved to .tmp/id-mappings.json");
}

// Run migration
migrateAll()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error during migration:", error);
    process.exit(1);
  });
