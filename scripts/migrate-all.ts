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
 * 5. tasks (FK: conversations) - before deepResearchSessions
 * 6. deepResearchSessions (FK: conversations, tasks)
 * 7. deepResearchIterations (FK: deepResearchSessions)
 * 8. chatMessages (FK: conversations, researchSessions, documents)
 * 9. citations (FK: researchSessions, documents)
 *
 * Usage: npx tsx scripts/migrate-all.ts
 *
 * Environment variables required:
 * - EXPO_PUBLIC_SUPABASE_URL
 * - EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
 * - EXPO_PUBLIC_CONVEX_URL
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

// Environment validation
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
// Use the Convex cloud URL for HTTP client, not the deployment name
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL || process.env.VITE_CONVEX_HTTP_URL;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("ERROR: Missing Supabase credentials");
  console.error("Required: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!convexUrl) {
  console.error("ERROR: Missing Convex URL");
  console.error("Required: EXPO_PUBLIC_CONVEX_URL or VITE_CONVEX_HTTP_URL");
  process.exit(1);
}

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ConvexHttpClient can work without auth for admin operations in development
const convex = new ConvexHttpClient(convexUrl);

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
          const existingCount = await convex.query(api["conversations/index"].count, {});
          if (existingCount > 0) {
            await convex.mutation(api["conversations/index"].clearAll, {});
            console.log(`Cleared ${existingCount} existing conversations`);
          }
        } catch {}

        // Migrate
        let migrated = 0;
        for (const conv of conversations) {
          try {
            const convexId = await convex.mutation(api["conversations/index"].insertFromMigration, {
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
        const convexCount = await convex.query(api["conversations/index"].count, {});
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
          const existingCount = await convex.query(api["documents/index"].count, {});
          if (existingCount > 0) {
            await convex.mutation(api["documents/index"].clearAll, {});
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

            const convexId = await convex.mutation(api["documents/index"].insertFromMigration, {
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
        const convexCount = await convex.query(api["documents/index"].count, {});
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
          const existingCount = await convex.query(api["tasks/index"].count, {});
          if (existingCount > 0) {
            await convex.mutation(api["tasks/index"].clearAll, {});
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

            const convexId = await convex.mutation(api["tasks/index"].insertFromMigration, {
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
        const convexCount = await convex.query(api["tasks/index"].count, {});
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
          const existingCount = await convex.query(api["chatMessages/index"].count, {});
          if (existingCount > 0) {
            await convex.mutation(api["chatMessages/index"].clearAll, {});
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

            await convex.mutation(api["chatMessages/index"].insertFromMigration, {
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
        const convexCount = await convex.query(api["chatMessages/index"].count, {});
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
  // TABLE 3: researchSessions (FK: documents)
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TABLE 3/9: researchSessions");
  console.log("=".repeat(80));

  try {
    const { count } = await supabase
      .from("research_sessions")
      .select("id", { count: "exact", head: true });

    if (!count) {
      console.log("No research sessions to migrate");
      results.push({ table: "researchSessions", sourceCount: 0, migratedCount: 0, skippedCount: 1, success: true });
    } else {
      const { data: sessions } = await supabase
        .from("research_sessions")
        .select("*")
        .order("created_at", { ascending: false });

      if (sessions) {
        // Clear existing
        try {
          const existingCount = await convex.query(api["researchSessions/queries"].count, {});
          if (existingCount > 0) {
            await convex.mutation(api["researchSessions/mutations"].clearAll, {});
            console.log(`Cleared ${existingCount} existing research sessions`);
          }
        } catch {}

        // Migrate
        let migrated = 0;
        for (const session of sessions) {
          try {
            const documentId = session.document_id
              ? idMappings.documents[session.document_id.toString()]
              : undefined;

            const convexId = await convex.mutation(api["researchSessions/mutations"].insertFromMigration, {
              query: session.query,
              researchType: session.research_type,
              inputType: session.input_type,
              status: session.status,
              maxIterations: session.max_iterations ?? undefined,
              currentIteration: session.current_iteration ?? undefined,
              coverageScore: session.coverage_score ?? undefined,
              plan: session.plan ?? undefined,
              findings: session.findings ?? undefined,
              documentId,
              errorText: session.error_text ?? undefined,
              createdAt: toTimestamp(session.created_at),
              updatedAt: toTimestamp(session.updated_at),
              completedAt: session.completed_at ? toTimestamp(session.completed_at) : undefined,
            });
            idMappings.researchSessions[session.id] = convexId as string;
            migrated++;
          } catch (error) {
            console.error(`Failed to migrate research session ${session.id}:`, error);
          }
        }

        // Verify
        const convexCount = await convex.query(api["researchSessions/queries"].count, {});
        const success = convexCount === count;
        console.log(`Research sessions: ${count} → ${migrated} migrated (${convexCount} in Convex) ${success ? "✓" : "✗"}`);

        results.push({
          table: "researchSessions",
          sourceCount: count,
          migratedCount: migrated,
          skippedCount: count - migrated,
          success,
        });
      }
    }
  } catch (error) {
    console.error("Failed to migrate research sessions:", error);
    results.push({ table: "researchSessions", sourceCount: 1, migratedCount: 1, skippedCount: 1, success: false });
  }

  // ========================================================================
  // TABLE 4: researchIterations (FK: researchSessions)
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TABLE 4/9: researchIterations");
  console.log("=".repeat(80));

  try {
    const { count } = await supabase
      .from("research_iterations")
      .select("id", { count: "exact", head: true });

    if (!count) {
      console.log("No research iterations to migrate");
      results.push({ table: "researchIterations", sourceCount: 1, migratedCount: 1, skippedCount: 1, success: true });
    } else {
      const { data: iterations } = await supabase
        .from("research_iterations")
        .select("*")
        .order("created_at", { ascending: true });

      if (iterations) {
        // Clear existing
        try {
          const existingCount = await convex.query(api["researchIterations/queries"].count, {});
          if (existingCount > 0) {
            await convex.mutation(api["researchIterations/mutations"].clearAll, {});
            console.log(`Cleared ${existingCount} existing research iterations`);
          }
        } catch {}

        // Migrate
        let migrated = 0;
        for (const iter of iterations) {
          try {
            const sessionId = idMappings.researchSessions[iter.session_id];
            if (!sessionId) {
              console.warn(`Skipping iteration ${iter.id}: unmapped session_id`);
              continue;
            }

            await convex.mutation(api["researchIterations/mutations"].insertFromMigration, {
              sessionId,
              iterationNumber: iter.iteration_number,
              findingsSummary: iter.findings_summary ?? undefined,
              sources: iter.sources ?? undefined,
              reviewScore: iter.review_score ?? undefined,
              reviewFeedback: iter.review_feedback ?? undefined,
              reviewGaps: iter.review_gaps ?? undefined,
              refinedQueries: iter.refined_queries ?? undefined,
              createdAt: toTimestamp(iter.created_at),
            });
            migrated++;
          } catch (error) {
            console.error(`Failed to migrate research iteration ${iter.id}:`, error);
          }
        }

        // Verify
        const convexCount = await convex.query(api["researchIterations/queries"].count, {});
        const success = convexCount === count;
        console.log(`Research iterations: ${count} → ${migrated} migrated (${convexCount} in Convex) ${success ? "✓" : "✗"}`);

        results.push({
          table: "researchIterations",
          sourceCount: count,
          migratedCount: migrated,
          skippedCount: count - migrated,
          success,
        });
      }
    }
  } catch (error) {
    console.error("Failed to migrate research iterations:", error);
    results.push({ table: "researchIterations", sourceCount: 1, migratedCount: 1, skippedCount: 1, success: false });
  }

  // ========================================================================
  // TABLE 6: deepResearchSessions (FK: conversations, tasks)
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TABLE 6/9: deepResearchSessions");
  console.log("=".repeat(80));

  try {
    const { count } = await supabase
      .from("deep_research_sessions")
      .select("id", { count: "exact", head: true });

    if (!count) {
      console.log("No deep research sessions to migrate");
      results.push({ table: "deepResearchSessions", sourceCount: 1, migratedCount: 1, skippedCount: 1, success: true });
    } else {
      const { data: sessions } = await supabase
        .from("deep_research_sessions")
        .select("*")
        .order("created_at", { ascending: false });

      if (sessions) {
        // Clear existing
        try {
          const existingCount = await convex.query(api["deepResearchSessions/queries"].count, {});
          if (existingCount > 0) {
            await convex.mutation(api["deepResearchSessions/mutations"].clearAll, {});
            console.log(`Cleared ${existingCount} existing deep research sessions`);
          }
        } catch {}

        // Migrate
        let migrated = 0;
        for (const session of sessions) {
          try {
            const conversationId = idMappings.conversations[session.conversation_id];
            if (!conversationId) {
              console.warn(`Skipping deep session ${session.id}: unmapped conversation_id`);
              continue;
            }

            const taskId = session.task_id
              ? idMappings.tasks[session.task_id]
              : undefined;

            const convexId = await convex.mutation(api["deepResearchSessions/mutations"].insertFromMigration, {
              conversationId,
              taskId,
              topic: session.topic,
              maxIterations: session.max_iterations ?? undefined,
              status: session.status,
              createdAt: toTimestamp(session.created_at),
              updatedAt: toTimestamp(session.updated_at),
              completedAt: session.completed_at ? toTimestamp(session.completed_at) : undefined,
            });
            idMappings.deepResearchSessions[session.id] = convexId as string;
            migrated++;
          } catch (error) {
            console.error(`Failed to migrate deep research session ${session.id}:`, error);
          }
        }

        // Verify
        const convexCount = await convex.query(api["deepResearchSessions/queries"].count, {});
        const success = convexCount === count;
        console.log(`Deep research sessions: ${count} → ${migrated} migrated (${convexCount} in Convex) ${success ? "✓" : "✗"}`);

        results.push({
          table: "deepResearchSessions",
          sourceCount: count,
          migratedCount: migrated,
          skippedCount: count - migrated,
          success,
        });
      }
    }
  } catch (error) {
    console.error("Failed to migrate deep research sessions:", error);
    results.push({ table: "deepResearchSessions", sourceCount: 1, migratedCount: 1, skippedCount: 1, success: false });
  }

  // ========================================================================
  // TABLE 7: deepResearchIterations (FK: deepResearchSessions)
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TABLE 7/9: deepResearchIterations");
  console.log("=".repeat(80));

  try {
    const { count } = await supabase
      .from("deep_research_iterations")
      .select("id", { count: "exact", head: true });

    if (!count) {
      console.log("No deep research iterations to migrate");
      results.push({ table: "deepResearchIterations", sourceCount: 1, migratedCount: 1, skippedCount: 1, success: true });
    } else {
      const { data: iterations } = await supabase
        .from("deep_research_iterations")
        .select("*")
        .order("created_at", { ascending: true });

      if (iterations) {
        // Clear existing
        try {
          const existingCount = await convex.query(api["deepResearchIterations/queries"].count, {});
          if (existingCount > 0) {
            await convex.mutation(api["deepResearchIterations/mutations"].clearAll, {});
            console.log(`Cleared ${existingCount} existing deep research iterations`);
          }
        } catch {}

        // Migrate
        let migrated = 0;
        for (const iter of iterations) {
          try {
            const sessionId = idMappings.deepResearchSessions[iter.session_id];
            if (!sessionId) {
              console.warn(`Skipping deep iteration ${iter.id}: unmapped session_id`);
              continue;
            }

            await convex.mutation(api["deepResearchIterations/mutations"].insertFromMigration, {
              sessionId,
              iterationNumber: iter.iteration_number,
              coverageScore: iter.coverage_score ?? undefined,
              feedback: iter.feedback ?? undefined,
              findings: iter.findings ?? undefined,
              refinedQueries: iter.refined_queries ?? undefined,
              status: iter.status,
              createdAt: toTimestamp(iter.created_at),
            });
            migrated++;
          } catch (error) {
            console.error(`Failed to migrate deep research iteration ${iter.id}:`, error);
          }
        }

        // Verify
        const convexCount = await convex.query(api["deepResearchIterations/queries"].count, {});
        const success = convexCount === count;
        console.log(`Deep research iterations: ${count} → ${migrated} migrated (${convexCount} in Convex) ${success ? "✓" : "✗"}`);

        results.push({
          table: "deepResearchIterations",
          sourceCount: count,
          migratedCount: migrated,
          skippedCount: count - migrated,
          success,
        });
      }
    }
  } catch (error) {
    console.error("Failed to migrate deep research iterations:", error);
    results.push({ table: "deepResearchIterations", sourceCount: 1, migratedCount: 1, skippedCount: 1, success: false });
  }

  // ========================================================================
  // TABLE 9: citations (FK: researchSessions, documents)
  // ========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("TABLE 9/9: citations");
  console.log("=".repeat(80));

  try {
    const { count } = await supabase
      .from("citations")
      .select("id", { count: "exact", head: true });

    if (!count) {
      console.log("No citations to migrate");
      results.push({ table: "citations", sourceCount: 1, migratedCount: 1, skippedCount: 1, success: true });
    } else {
      const { data: citations } = await supabase
        .from("citations")
        .select("*")
        .order("retrieved_at", { ascending: false });

      if (citations) {
        // Clear existing
        try {
          const existingCount = await convex.query(api["citations/queries"].count, {});
          if (existingCount > 0) {
            await convex.mutation(api["citations/mutations"].clearAll, {});
            console.log(`Cleared ${existingCount} existing citations`);
          }
        } catch {}

        // Migrate
        let migrated = 0;
        for (const citation of citations) {
          try {
            const sessionId = citation.session_id
              ? idMappings.researchSessions[citation.session_id]
              : undefined;
            const documentId = citation.document_id
              ? idMappings.documents[citation.document_id.toString()]
              : undefined;

            await convex.mutation(api["citations/mutations"].insertFromMigration, {
              sessionId,
              documentId,
              sourceUrl: citation.source_url,
              sourceTitle: citation.source_title ?? undefined,
              sourceDomain: citation.source_domain ?? undefined,
              claimText: citation.claim_text,
              claimMarker: citation.claim_marker ?? undefined,
              retrievedAt: toTimestamp(citation.retrieved_at),
            });
            migrated++;
          } catch (error) {
            console.error(`Failed to migrate citation ${citation.id}:`, error);
          }
        }

        // Verify
        const convexCount = await convex.query(api["citations/queries"].count, {});
        const success = convexCount === count;
        console.log(`Citations: ${count} → ${migrated} migrated (${convexCount} in Convex) ${success ? "✓" : "✗"}`);

        results.push({
          table: "citations",
          sourceCount: count,
          migratedCount: migrated,
          skippedCount: count - migrated,
          success,
        });
      }
    }
  } catch (error) {
    console.error("Failed to migrate citations:", error);
    results.push({ table: "citations", sourceCount: 1, migratedCount: 1, skippedCount: 1, success: false });
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

// run migration
migrateAll()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error during migration:", error);
    process.exit(1);
  });
