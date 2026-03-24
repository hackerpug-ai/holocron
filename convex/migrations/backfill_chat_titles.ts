/**
 * Migration: Backfill missing titles for conversations
 *
 * Finds all conversations with default "New Chat" title (or empty)
 * and generates titles using the LLM-driven naming flow.
 *
 * Respects titleSetByUser flag - won't overwrite user-set titles.
 *
 * Run with: npx convex run migrations/backfill_chat_titles:backfill
 * Run with dry run: npx convex run migrations/backfill_chat_titles:backfill '{"dryRun": true}'
 * Check status: npx convex run migrations/backfill_chat_titles:status
 */

import { action, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

interface ConversationNeedingTitle {
  _id: Id<"conversations">;
  title: string;
  titleSetByUser?: boolean;
}

interface BackfillResult {
  status: "complete" | "partial";
  processed: number;
  scheduled: number;
  skipped: number;
  errors: number;
  remaining: number;
  message?: string;
  conversationIds?: string[];
}

/**
 * Internal query to find conversations needing titles
 */
export const getConversationsNeedingTitles = internalQuery({
  args: {},
  handler: async (ctx): Promise<ConversationNeedingTitle[]> => {
    const conversations = await ctx.db.query("conversations").collect();

    // Filter to conversations that need titles:
    // - Title is "New Chat" or empty/whitespace
    // - titleSetByUser is NOT true (respect user-set titles)
    return conversations.filter((conv) => {
      const needsTitle =
        !conv.title ||
        conv.title.trim() === "" ||
        conv.title === "New Chat";
      const notUserSet = conv.titleSetByUser !== true;
      return needsTitle && notUserSet;
    });
  },
});

/**
 * Backfill titles for conversations
 *
 * Processes conversations in batches to avoid timeout. Safe to re-run idempotently.
 */
export const backfill = action({
  args: {
    batchSize: v.optional(v.number()), // Process in batches to avoid timeouts (default: 10)
    dryRun: v.optional(v.boolean()), // Log what would be done without executing
  },
  handler: async (
    ctx,
    { batchSize = 10, dryRun = false }
  ): Promise<BackfillResult> => {
    console.log(
      `[backfillChatTitles] Starting - dryRun: ${dryRun}, batchSize: ${batchSize}`
    );

    // Step 1: Find all conversations needing titles
    const allConversations = (await ctx.runQuery(
      internal.migrations.backfill_chat_titles.getConversationsNeedingTitles,
      {}
    )) as ConversationNeedingTitle[];

    const totalConversations = allConversations.length;
    console.log(
      `[backfillChatTitles] Found ${totalConversations} conversations needing titles`
    );

    if (totalConversations === 0) {
      return {
        status: "complete",
        processed: 0,
        scheduled: 0,
        skipped: 0,
        errors: 0,
        remaining: 0,
        message: "All conversations already have titles",
      };
    }

    // Step 2: Process in batches
    let scheduled = 0;
    let skipped = 0;
    let errors = 0;
    const processedConversationIds: string[] = [];

    for (let i = 0; i < Math.min(batchSize, allConversations.length); i++) {
      const conversation = allConversations[i];

      try {
        if (dryRun) {
          console.log(
            `[backfillChatTitles] DRY RUN: Would generate title for conversation ${conversation._id} - "${conversation.title}"`
          );
          scheduled++;
          processedConversationIds.push(conversation._id);
        } else {
          // Schedule title generation using the existing generateChatTitle action
          // Adding a small delay between each to avoid rate limiting
          await ctx.scheduler.runAfter(
            i * 1000, // Stagger by 1 second each
            (internal as any).chat.index.generateChatTitle,
            { conversationId: conversation._id }
          );
          console.log(
            `[backfillChatTitles] Scheduled title generation for conversation ${conversation._id}`
          );
          scheduled++;
          processedConversationIds.push(conversation._id);
        }
      } catch (error) {
        console.error(
          `[backfillChatTitles] Error processing conversation ${conversation._id}:`,
          error
        );
        errors++;
      }
    }

    const remaining = totalConversations - Math.min(batchSize, totalConversations);

    const message = dryRun
      ? `DRY RUN: Would generate titles for ${scheduled} conversations. Run again with dryRun: false to execute.`
      : `Scheduled ${scheduled} title generations. ${remaining} conversations remaining.${remaining > 0 ? " Run again to process more." : ""}`;

    return {
      status: remaining > 0 ? "partial" : "complete",
      processed: Math.min(batchSize, totalConversations),
      scheduled,
      skipped,
      errors,
      remaining,
      message,
      conversationIds: processedConversationIds,
    };
  },
});

/**
 * Check the status of conversations needing titles
 *
 * Returns count of conversations without titles for monitoring
 */
export const status = action({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    conversationsNeedingTitles: number;
    sampleTitles: string[];
  }> => {
    const conversationsNeeding = (await ctx.runQuery(
      internal.migrations.backfill_chat_titles.getConversationsNeedingTitles,
      {}
    )) as ConversationNeedingTitle[];

    const sampleTitles = conversationsNeeding
      .slice(0, 10)
      .map((c) => `${c._id}: "${c.title}"`);

    return {
      conversationsNeedingTitles: conversationsNeeding.length,
      sampleTitles,
    };
  },
});
