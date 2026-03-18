import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Core tables
  conversations: defineTable({
    title: v.string(),
    titleSetByUser: v.optional(v.boolean()), // true if user manually set title, prevents auto-generation
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
    embedding: v.optional(v.array(v.float64())), // 1024 dimensions (Z.ai embedding-2/embedding-3)
    createdAt: v.number(),
  })
    .index("by_creationTime", ["createdAt"])
    .searchIndex("by_category", { searchField: "category" })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
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
    researchType: v.optional(v.string()), // "deep" | "simple"
    maxIterations: v.optional(v.number()),
    status: v.string(),
    currentIteration: v.optional(v.number()),
    refinedTopic: v.optional(v.string()),
    currentCoverageScore: v.optional(v.number()),
    // Confidence tracking
    finalConfidenceSummary: v.optional(v.object({
      highConfidenceCount: v.number(),
      mediumConfidenceCount: v.number(),
      lowConfidenceCount: v.number(),
      averageConfidenceScore: v.number(),
      claimsWithMultipleSources: v.number(),
      totalClaims: v.number(),
    })),
    outputConfidenceFilter: v.optional(v.string()), // HIGH_ONLY | HIGH_MEDIUM | ALL
    errorReason: v.optional(v.string()), // timeout | unknown - populated when status is "error"
    documentId: v.optional(v.id("documents")), // Link to generated document
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
    // Short human-readable summary of what was found (3-6 words)
    summary: v.optional(v.string()),
    // Confidence stats for this iteration
    confidenceStats: v.optional(v.object({
      highConfidenceCount: v.number(),
      mediumConfidenceCount: v.number(),
      lowConfidenceCount: v.number(),
      averageConfidenceScore: v.number(),
      claimsWithMultipleSources: v.number(),
      totalClaims: v.number(),
    })),
    embedding: v.optional(v.array(v.float64())), // 1024 dimensions (Z.ai embedding-2/embedding-3)
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
    }),

  // Research findings with per-claim confidence tracking
  researchFindings: defineTable({
    sessionId: v.id("deepResearchSessions"),
    iterationId: v.id("deepResearchIterations"),
    claimText: v.string(),
    claimCategory: v.optional(v.string()),
    // 5-factor confidence scores (0-100)
    sourceCredibilityScore: v.number(),
    evidenceQualityScore: v.number(),
    corroborationScore: v.number(),
    recencyScore: v.number(),
    expertConsensusScore: v.number(),
    // Calculated confidence
    confidenceScore: v.number(),
    confidenceLevel: v.string(), // HIGH | MEDIUM | LOW
    citationIds: v.array(v.id("citations")),
    confidenceFactors: v.optional(v.any()), // Full factor details for transparency
    caveats: v.optional(v.array(v.string())), // MEDIUM confidence caveats
    warnings: v.optional(v.array(v.string())), // LOW confidence warnings
    embedding: v.optional(v.array(v.float64())), // 1024 dimensions (Z.ai embedding-2/embedding-3)
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_iteration", ["iterationId"])
    .index("by_confidence", ["confidenceLevel"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
    }),

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

  // Citations with extended credibility metadata
  citations: defineTable({
    sessionId: v.optional(v.id("researchSessions")),
    documentId: v.optional(v.id("documents")),
    deepResearchSessionId: v.optional(v.id("deepResearchSessions")),
    sourceUrl: v.string(),
    sourceTitle: v.optional(v.string()),
    sourceDomain: v.optional(v.string()),
    claimText: v.string(),
    claimMarker: v.optional(v.string()),
    // Credibility metadata for confidence scoring
    sourceType: v.optional(v.string()), // official_documentation | expert_blog | academic_paper | forum | news | social_media | unknown
    credibilityScore: v.optional(v.number()), // 0-100
    evidenceType: v.optional(v.string()), // primary | secondary | tertiary | anecdotal
    publishedDate: v.optional(v.string()), // ISO date string
    authorCredentials: v.optional(v.string()), // Description of author expertise
    retrievedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_document", ["documentId"])
    .index("by_deep_research_session", ["deepResearchSessionId"]),

  // Subscription system
  subscriptionSources: defineTable({
    sourceType: v.union(
      v.literal("youtube"),
      v.literal("newsletter"),
      v.literal("changelog"),
      v.literal("reddit"),
      v.literal("ebay"),
      v.literal("whats-new"),
      v.literal("creator")
    ),
    identifier: v.string(), // @handle, r/subreddit, search query, etc.
    name: v.string(),
    url: v.optional(v.string()),
    feedUrl: v.optional(v.string()),
    fetchMethod: v.string(), // rss, api, web_search
    configJson: v.optional(v.any()),
    autoResearch: v.boolean(),
    lastChecked: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["sourceType"])
    .index("by_identifier", ["identifier"])
    .index("by_auto_research", ["autoResearch"]),

  subscriptionContent: defineTable({
    sourceId: v.id("subscriptionSources"),
    contentId: v.string(), // video ID, post ID, item ID, etc.
    title: v.string(),
    url: v.optional(v.string()),
    metadataJson: v.optional(v.any()),
    passedFilter: v.boolean(),
    filterReason: v.optional(v.string()),
    researchStatus: v.union(
      v.literal("pending"),
      v.literal("queued"),
      v.literal("researched"),
      v.literal("skipped")
    ),
    discoveredAt: v.number(),
    researchedAt: v.optional(v.number()),
    documentId: v.optional(v.id("documents")), // Link to created document
  })
    .index("by_source", ["sourceId", "discoveredAt"])
    .index("by_source_content", ["sourceId", "contentId"])
    .index("by_status", ["researchStatus"])
    .index("by_content_id", ["contentId"]),

  subscriptionFilters: defineTable({
    sourceId: v.optional(v.id("subscriptionSources")), // null = type-level rule
    sourceType: v.optional(v.string()), // for type-level rules
    ruleName: v.string(),
    ruleType: v.string(), // keyword_whitelist, keyword_blacklist, min_score, etc.
    ruleValue: v.any(),
    weight: v.number(),
    createdAt: v.number(),
  })
    .index("by_source", ["sourceId"])
    .index("by_type", ["sourceType"]),

  // Whats-new reports
  whatsNewReports: defineTable({
    periodStart: v.number(), // Unix timestamp
    periodEnd: v.number(), // Unix timestamp
    days: v.number(),
    focus: v.string(), // all | tools | releases | trends | people
    discoveryOnly: v.boolean(),
    findingsCount: v.number(),
    discoveryCount: v.number(),
    releaseCount: v.number(),
    trendCount: v.number(),
    reportPath: v.string(), // Path to saved markdown report
    summaryJson: v.optional(v.any()), // Structured summary data
    documentId: v.optional(v.id("documents")), // Link to full report document
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_period", ["periodStart", "periodEnd"]),

  // Toolbelt tools - Developer tools knowledge base
  toolbeltTools: defineTable({
    // Core fields
    title: v.string(),
    description: v.optional(v.string()),
    content: v.optional(v.string()),

    // Category and status
    category: v.union(
      v.literal("libraries"),
      v.literal("cli"),
      v.literal("framework"),
      v.literal("service"),
      v.literal("database"),
      v.literal("tool")
    ),
    status: v.union(
      v.literal("complete"),
      v.literal("draft"),
      v.literal("archived")
    ),

    // Source metadata
    sourceUrl: v.optional(v.string()),
    sourceType: v.union(
      v.literal("github"),
      v.literal("npm"),
      v.literal("pypi"),
      v.literal("website"),
      v.literal("cargo"),
      v.literal("go"),
      v.literal("other")
    ),

    // Toolbelt-specific metadata
    tags: v.optional(v.array(v.string())),
    useCases: v.optional(v.array(v.string())),
    keywords: v.optional(v.array(v.string())),
    language: v.optional(v.string()),

    // Timestamps (matching toolbelt frontmatter)
    date: v.optional(v.string()),  // YYYY-MM-DD
    time: v.optional(v.string()),  // HH:MM

    // Vector embedding
    embedding: v.optional(v.array(v.float64())),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_creationTime", ["createdAt"])
    .index("by_category", ["category"])
    .index("by_sourceType", ["sourceType"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
    }),

  // Shop sessions - Product search sessions
  shopSessions: defineTable({
    conversationId: v.optional(v.id("conversations")),
    query: v.string(),
    condition: v.optional(v.string()), // "new" | "used" | "any"
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
    retailers: v.optional(v.array(v.string())),
    status: v.string(), // "pending" | "searching" | "completed" | "failed"
    totalListings: v.optional(v.number()),
    bestDealId: v.optional(v.id("shopListings")),
    errorReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  // Shop listings - Individual product listings
  shopListings: defineTable({
    sessionId: v.id("shopSessions"),
    title: v.string(),
    price: v.number(), // In cents
    originalPrice: v.optional(v.number()),
    currency: v.string(),
    condition: v.string(),
    retailer: v.string(),
    seller: v.optional(v.string()),
    sellerRating: v.optional(v.number()),
    url: v.string(),
    imageUrl: v.optional(v.string()),
    inStock: v.optional(v.boolean()),
    productHash: v.string(), // For deduplication
    isDuplicate: v.boolean(),
    dealScore: v.optional(v.number()), // 0-100 computed score
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_deal_score", ["sessionId", "dealScore"])
    .index("by_product_hash", ["productHash"]),

  // Assimilation metadata for Borg-themed repository analysis
  assimilationMetadata: defineTable({
    documentId: v.id("documents"),
    repositoryUrl: v.string(),
    repositoryName: v.string(),
    primaryLanguage: v.optional(v.string()),
    stars: v.optional(v.number()),
    sophisticationRating: v.number(), // 1-5 scale
    trackRatings: v.object({
      architecture: v.number(), // 1-5 scale
      patterns: v.number(), // 1-5 scale
      documentation: v.number(), // 1-5 scale
      dependencies: v.number(), // 1-5 scale
      testing: v.number(), // 1-5 scale
    }),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_repository", ["repositoryName"])
    .index("by_language", ["primaryLanguage"])
    .index("by_rating", ["sophisticationRating"]),
});
