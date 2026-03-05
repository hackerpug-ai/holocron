import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Core tables
  conversations: defineTable({
    title: v.string(),
    lastMessagePreview: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_updated", ["updatedAt"]),

  chatMessages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    content: v.string(),
    messageType: v.union(
      v.literal("text"),
      v.literal("slash_command"),
      v.literal("result_card"),
      v.literal("progress"),
      v.literal("error")
    ),
    cardData: v.optional(v.any()),
    sessionId: v.optional(v.id("researchSessions")),
    documentId: v.optional(v.id("documents")),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId", "createdAt"]),

  documents: defineTable({
    title: v.string(),
    content: v.string(),
    category: v.string(),
    filePath: v.optional(v.string()),
    fileType: v.optional(v.string()),
    status: v.optional(v.string()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
    researchType: v.optional(v.string()),
    iterations: v.optional(v.number()),
    embedding: v.optional(v.array(v.float64())), // 1536 dimensions
    createdAt: v.number(),
  })
    .searchIndex("by_category", { searchField: "category" })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
    }),

  // Research tables
  researchSessions: defineTable({
    query: v.string(),
    researchType: v.string(),
    inputType: v.string(),
    status: v.string(),
    maxIterations: v.optional(v.number()),
    currentIteration: v.optional(v.number()),
    coverageScore: v.optional(v.number()),
    plan: v.optional(v.any()),
    findings: v.optional(v.any()),
    documentId: v.optional(v.id("documents")),
    errorText: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  researchIterations: defineTable({
    sessionId: v.id("researchSessions"),
    iterationNumber: v.number(),
    findingsSummary: v.optional(v.string()),
    sources: v.optional(v.any()),
    reviewScore: v.optional(v.number()),
    reviewFeedback: v.optional(v.string()),
    reviewGaps: v.optional(v.any()),
    refinedQueries: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // Deep research tables
  deepResearchSessions: defineTable({
    conversationId: v.id("conversations"),
    taskId: v.optional(v.id("tasks")),
    topic: v.string(),
    maxIterations: v.optional(v.number()),
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_task", ["taskId"]),

  deepResearchIterations: defineTable({
    sessionId: v.id("deepResearchSessions"),
    iterationNumber: v.number(),
    coverageScore: v.optional(v.number()),
    feedback: v.optional(v.string()),
    findings: v.optional(v.string()),
    refinedQueries: v.optional(v.any()),
    status: v.string(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // Task management
  tasks: defineTable({
    conversationId: v.optional(v.id("conversations")),
    taskType: v.string(),
    status: v.string(),
    config: v.optional(v.any()),
    currentStep: v.optional(v.number()),
    totalSteps: v.optional(v.number()),
    progressMessage: v.optional(v.string()),
    result: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    errorDetails: v.optional(v.any()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  // Citations
  citations: defineTable({
    sessionId: v.optional(v.id("researchSessions")),
    documentId: v.optional(v.id("documents")),
    sourceUrl: v.string(),
    sourceTitle: v.optional(v.string()),
    sourceDomain: v.optional(v.string()),
    claimText: v.string(),
    claimMarker: v.optional(v.string()),
    retrievedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_document", ["documentId"]),
});
