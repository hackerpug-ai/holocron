/**
 * Telemetry mutations for agent triage intelligence
 *
 * These internal mutations record triage classification results
 * for later analysis and improvement of the triage system.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// Valid intent categories from triage.ts
const VALID_INTENTS = [
  "conversation",
  "knowledge",
  "research",
  "commerce",
  "subscriptions",
  "discovery",
  "documents",
  "analysis",
  "improvements",
  "multi_step",
] as const;

// Valid confidence levels
const VALID_CONFIDENCES = ["high", "medium", "low"] as const;

// Valid classification sources
const VALID_CLASSIFICATION_SOURCES = [
  "triage_agent",
  "heuristic",
  "manual_override",
  "cached",
] as const;

/**
 * Record a triage classification result for telemetry.
 * Stores intent, confidence, source, and raw LLM response for analysis.
 *
 * @param conversationId - The conversation being triaged
 * @param messageId - The message that was classified
 * @param intent - The classified intent category
 * @param confidence - The confidence level of the classification
 * @param classificationSource - How the classification was made
 * @param rawLlmResponse - Raw response from LLM (truncated to 2000 chars)
 * @param processingMs - Time taken to classify in milliseconds
 * @returns The ID of the inserted telemetry record
 */
export const recordTriage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("chatMessages"),
    intent: v.string(),
    confidence: v.string(),
    classificationSource: v.string(),
    rawLlmResponse: v.string(),
    processingMs: v.number(),
  },
  handler: async (ctx, args) => {
    // Truncate rawLlmResponse to 2000 characters
    const truncatedResponse = args.rawLlmResponse.slice(0, 2000);

    const id = await ctx.db.insert("agentTelemetry", {
      conversationId: args.conversationId,
      messageId: args.messageId,
      intent: args.intent as any,
      confidence: args.confidence as any,
      classificationSource: args.classificationSource as any,
      rawLlmResponse: truncatedResponse,
      processingMs: args.processingMs,
      createdAt: Date.now(),
    });

    return id;
  },
});

/**
 * Delete telemetry records older than the cutoff timestamp.
 * Used for periodic cleanup of old telemetry data.
 *
 * @param cutoffTimestamp - Delete records with createdAt < this timestamp
 * @returns The number of records deleted
 */
export const deleteOldTelemetry = internalMutation({
  args: {
    cutoffTimestamp: v.number(),
  },
  handler: async (ctx, { cutoffTimestamp }) => {
    // Query for all telemetry records
    const oldRecords = await ctx.db
      .query("agentTelemetry")
      .collect();

    // Filter records older than cutoff and delete them
    let deletedCount = 0;
    for (const record of oldRecords) {
      if (record.createdAt < cutoffTimestamp) {
        await ctx.db.delete(record._id);
        deletedCount++;
      }
    }

    return deletedCount;
  },
});
