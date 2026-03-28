import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Core tables
  conversations: defineTable({
    title: v.string(),
    titleSetByUser: v.optional(v.boolean()), // true if user manually set title, prevents auto-generation
    lastMessagePreview: v.optional(v.string()),
    agentBusy: v.optional(v.boolean()),
    agentBusySince: v.optional(v.number()),
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
      v.literal("error"),
      v.literal("tool_approval"),
      v.literal("agent_plan")
    ),
    cardData: v.optional(v.any()),
    sessionId: v.optional(v.id("researchSessions")),
    documentId: v.optional(v.id("documents")),
    deleted: v.optional(v.boolean()),
    toolCallId: v.optional(v.string()),
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
    isPublic: v.optional(v.boolean()),
    shareToken: v.optional(v.string()),
  })
    .index("by_creationTime", ["createdAt"])
    .index("by_shareToken", ["shareToken"])
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
    creatorProfileId: v.optional(v.id("creatorProfiles")), // Link to creator profile (for multi-platform aggregation)
    lastChecked: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["sourceType"])
    .index("by_identifier", ["identifier"])
    .index("by_auto_research", ["autoResearch"])
    .index("by_creator", ["creatorProfileId"]),

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
    embedding: v.optional(v.array(v.float64())), // 1024 dimensions for semantic deduplication
    // Feed metadata fields (FR-002)
    feedItemId: v.optional(v.id("feedItems")), // Link to aggregated feed item
    inFeed: v.optional(v.boolean()), // Whether this content appears in the feed
    thumbnailUrl: v.optional(v.string()), // Content thumbnail/image URL
    duration: v.optional(v.number()), // Content duration in seconds
    authorHandle: v.optional(v.string()), // Content author/creator handle
    likesCount: v.optional(v.number()), // Engagement metrics
    commentsCount: v.optional(v.number()), // Engagement metrics
    contentCategory: v.optional(v.string()), // Content category/type
  })
    .index("by_source", ["sourceId", "discoveredAt"])
    .index("by_source_content", ["sourceId", "contentId"])
    .index("by_status", ["researchStatus"])
    .index("by_content_id", ["contentId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
    }),

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
    toolSuggestionsJson: v.optional(v.string()), // JSON string of ToolSuggestion[] for one-click add
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
    .index("by_sourceUrl", ["sourceUrl"])
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
    planId: v.optional(v.id("executionPlans")), // Link to execution plan
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
    .index("by_created", ["createdAt"])
    .index("by_plan", ["planId"]),

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

  // Tool call approvals for human-in-the-loop tool execution
  toolCalls: defineTable({
    conversationId: v.id("conversations"),
    messageId: v.id("chatMessages"),
    toolName: v.string(),
    toolDisplayName: v.string(),
    toolArgs: v.any(),
    reasoning: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("timed_out")
    ),
    resultMessageId: v.optional(v.id("chatMessages")),
    error: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_status", ["status"]),

  // Agent plan tables
  agentPlans: defineTable({
    conversationId: v.id("conversations"),
    messageId: v.id("chatMessages"),
    title: v.string(),
    status: v.union(
      v.literal("created"),
      v.literal("executing"),
      v.literal("awaiting_approval"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    currentStepIndex: v.number(),
    totalSteps: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_status", ["status"])
    .index("by_message", ["messageId"]),

  agentPlanSteps: defineTable({
    planId: v.id("agentPlans"),
    stepIndex: v.number(),
    toolName: v.string(),
    toolDisplayName: v.string(),
    toolArgs: v.any(),
    description: v.string(),
    requiresApproval: v.boolean(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("awaiting_approval"),
      v.literal("approved"),
      v.literal("completed"),
      v.literal("skipped"),
      v.literal("failed")
    ),
    toolCallId: v.optional(v.id("toolCalls")),
    resultSummary: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_plan", ["planId", "stepIndex"]),

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

  assimilationSessions: defineTable({
    conversationId: v.optional(v.id("conversations")),
    repositoryUrl: v.string(),
    repositoryName: v.string(),
    profile: v.string(),
    status: v.string(),
    currentIteration: v.number(),
    maxIterations: v.number(),
    planContent: v.optional(v.string()),
    planSummary: v.optional(v.string()),
    planFeedback: v.optional(v.string()),
    autoApprove: v.optional(v.boolean()),
    accumulatedNotes: v.optional(v.string()),
    coveragePlan: v.optional(v.any()),
    nextDimension: v.optional(v.string()),
    failureConstraints: v.optional(v.array(v.string())),
    dimensionScores: v.optional(v.object({
      architecture: v.number(),
      patterns: v.number(),
      documentation: v.number(),
      dependencies: v.number(),
      testing: v.number(),
    })),
    terminationCriteria: v.object({
      maxIterations: v.number(),
      minOverallCoverage: v.number(),
      maxCostUsd: v.number(),
      maxDurationMs: v.number(),
      noveltyThreshold: v.number(),
    }),
    steeringNote: v.optional(v.string()),
    estimatedCostUsd: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    documentId: v.optional(v.id("documents")),
    metadataId: v.optional(v.id("assimilationMetadata")),
    errorReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_repositoryUrl", ["repositoryUrl"])
    .index("by_repositoryUrl_and_status", ["repositoryUrl", "status"])
    .index("by_conversation", ["conversationId"])
    .index("by_created", ["createdAt"]),

  assimilationIterations: defineTable({
    sessionId: v.id("assimilationSessions"),
    iterationNumber: v.number(),
    dimension: v.string(),
    iterationType: v.string(),
    findings: v.optional(v.string()),
    notesContribution: v.optional(v.string()),
    summary: v.optional(v.string()),
    dimensionCoverageScore: v.optional(v.number()),
    gapsIdentified: v.optional(v.array(v.string())),
    noveltyScore: v.optional(v.number()),
    nextAction: v.optional(v.object({
      shouldContinue: v.boolean(),
      nextDimension: v.optional(v.string()),
      reason: v.string(),
      trigger: v.optional(v.string()),
    })),
    status: v.string(),
    durationMs: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_dimension", ["sessionId", "dimension"]),

  audioSegments: defineTable({
    documentId: v.id("documents"),
    paragraphIndex: v.number(),
    paragraphHash: v.string(),
    storageId: v.optional(v.id("_storage")),
    status: v.union(v.literal("pending"), v.literal("generating"), v.literal("completed"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
    voiceId: v.string(),
    durationMs: v.optional(v.number()),
    jobId: v.optional(v.id("audioJobs")),
    retryCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_document", ["documentId", "paragraphIndex"])
    .index("by_document_and_status", ["documentId", "status"]),

  audioJobs: defineTable({
    documentId: v.id("documents"),
    voiceId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    totalSegments: v.number(),
    completedSegments: v.number(),
    failedSegments: v.number(),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_status", ["status"]),

  // Video transcripts storage (hybrid approach like audioSegments)
  videoTranscripts: defineTable({
    contentId: v.string(), // YouTube video ID
    sourceUrl: v.string(), // YouTube video URL
    transcriptType: v.union(v.literal("api"), v.literal("generated"), v.literal("node_fallback"), v.literal("jina_fallback")),
    transcriptSource: v.string(), // youtube_api, jina_reader_api
    storageId: v.id("_storage"), // Full transcript in file storage
    previewText: v.string(), // First 500 chars for search/display
    wordCount: v.number(),
    durationMs: v.optional(v.number()),
    language: v.optional(v.string()),
    metadataJson: v.optional(v.any()),
    generatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_content_id", ["contentId"])
    .index("by_source_url", ["sourceUrl"]),

  // Transcript generation jobs (follows audioJobs pattern)
  transcriptJobs: defineTable({
    contentId: v.string(),
    sourceUrl: v.string(),
    status: v.union(v.literal("pending"), v.literal("downloading"), v.literal("transcribing"), v.literal("completed"), v.literal("failed"), v.literal("no_captions")),
    priority: v.number(), // 0-10, higher = sooner
    retryCount: v.number(),
    errorMessage: v.optional(v.string()),
    transcriptId: v.optional(v.id("videoTranscripts")),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_content", ["contentId"])
    .index("by_priority", ["priority", "createdAt"]),

  // Notifications
  notifications: defineTable({
    type: v.union(
      v.literal("research_complete"),
      v.literal("research_failed"),
      v.literal("audio_complete"),
      v.literal("whats_new"),
      v.literal("subscription_update"),
      v.literal("assimilate_complete"),
      v.literal("system"),
      v.literal("feed_digest")
    ),
    title: v.string(),
    body: v.string(),
    route: v.string(),
    referenceId: v.optional(v.string()),
    read: v.boolean(),
    createdAt: v.number(),
    // Feed digest support (optional fields for backward compatibility)
    feedItemIds: v.optional(v.array(v.id("feedItems"))),
    digestCount: v.optional(v.number()),
    digestSummary: v.optional(v.string()),
  })
    .index("by_unread", ["read", "createdAt"])
    .index("by_created", ["createdAt"]),

  // Creator profiles for multi-platform subscription management
  creatorProfiles: defineTable({
    // Canonical identity
    name: v.string(), // Display name: "Anders Hejlsberg"
    handle: v.string(), // Primary handle: "ahejlsberg" (normalized, lowercase)
    canonicalType: v.union(v.literal("person"), v.literal("organization")),
    // Platform presence (validated via APIs)
    platforms: v.object({
      youtube: v.optional(
        v.object({
          handle: v.string(), // @channel without @
          channelId: v.optional(v.string()), // UCxxxxx (from API)
          verified: v.boolean(), // API-validated
          subscriberCount: v.optional(v.number()),
        })
      ),
      twitter: v.optional(
        v.object({
          handle: v.string(), // @user without @
          userId: v.optional(v.string()), // Numeric ID (from API)
          verified: v.boolean(),
          followerCount: v.optional(v.number()),
        })
      ),
      bluesky: v.optional(
        v.object({
          handle: v.string(), // @user.bsky.social or custom
          did: v.optional(v.string()), // Decentralized ID (from API)
          verified: v.boolean(),
          followerCount: v.optional(v.number()),
        })
      ),
      github: v.optional(
        v.object({
          handle: v.string(), // username
          userId: v.optional(v.number()), // Numeric ID (from API)
          verified: v.boolean(),
          followerCount: v.optional(v.number()),
        })
      ),
      website: v.optional(
        v.object({
          url: v.string(),
          validated: v.boolean(), // HTTP 200 check
        })
      ),
    }),
    // Metadata
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    lastVerifiedAt: v.number(), // Last API check
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_handle", ["handle"])
    .index("by_name", ["name"])
    .searchIndex("by_name_search", { searchField: "name" }),

  // Subscription links for shareable subscription URIs
  subscriptionLinks: defineTable({
    token: v.string(), // Short unique token (8 chars, base62)
    creatorProfileId: v.optional(v.id("creatorProfiles")), // Link to profile OR
    // Direct subscription data (if no profile)
    subscriptions: v.optional(
      v.array(
        v.object({
          sourceType: v.union(
            v.literal("youtube"),
            v.literal("newsletter"),
            v.literal("changelog"),
            v.literal("reddit"),
            v.literal("ebay"),
            v.literal("whats-new"),
            v.literal("creator")
          ),
          identifier: v.string(),
          name: v.string(),
          url: v.optional(v.string()),
          feedUrl: v.optional(v.string()),
          configJson: v.optional(v.any()),
        })
      )
    ),
    createdBy: v.string(), // User who created the link
    expiresAt: v.optional(v.number()), // Optional expiry
    clickCount: v.number(), // Track usage
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_profile", ["creatorProfileId"]),

  // Feed items - Aggregated content grouped by creator
  feedItems: defineTable({
    // Grouping key - creator handle or "unlinked-{hash}"
    groupKey: v.string(),
    // Display fields
    title: v.string(),
    summary: v.optional(v.string()),
    // Content type union
    contentType: v.union(
      v.literal("video"),
      v.literal("blog"),
      v.literal("social")
    ),
    // Aggregation metadata
    itemCount: v.number(), // Number of items in this group
    itemIds: v.array(v.id("subscriptionContent")), // Linked content items
    // Creator relationship (optional - may be unlinked)
    creatorProfileId: v.optional(v.id("creatorProfiles")),
    subscriptionIds: v.array(v.id("subscriptionSources")), // Source subscriptions
    // Media
    thumbnailUrl: v.optional(v.string()),
    // View tracking
    viewed: v.boolean(),
    viewedAt: v.optional(v.number()),
    // Timestamps
    publishedAt: v.number(), // Earliest publishedAt in group
    discoveredAt: v.number(), // When this feed item was created
    createdAt: v.number(),
  })
    .index("by_groupKey", ["groupKey"])
    .index("by_viewed", ["viewed", "discoveredAt"])
    .index("by_created", ["createdAt"])
    .index("by_creator", ["creatorProfileId"]),

  // Feed sessions - Track user reading sessions
  feedSessions: defineTable({
    // Session timing
    startTime: v.number(),
    endTime: v.optional(v.number()),
    // Engagement metrics
    itemsViewed: v.number(), // Items marked as viewed
    itemsConsumed: v.number(), // Items opened/consumed
    // Source tracking
    sessionSource: v.optional(v.string()), // "push", "direct", "cron_notification"
  })
    .index("by_start", ["startTime"])
    .index("by_period", ["startTime", "endTime"]),

  // Rate limit tracking for synthesis providers (Z.ai, YouTube, Jina)
  rateLimitTracking: defineTable({
    provider: v.string(), // "zai", "youtube", "jina"
    quotaLimit: v.number(), // Daily/max quota (YouTube: 10000, Z.ai: -1 for token-based)
    quotaUsed: v.number(), // Quota consumed in current period
    quotaResetAt: v.number(), // Unix timestamp when quota resets
    concurrentRequests: v.number(), // Current active requests
    maxConcurrent: v.number(), // Max concurrent allowed
    status: v.union(v.literal("available"), v.literal("throttled"), v.literal("exhausted")),
    lastError: v.optional(v.string()), // Last error message (429, etc.)
    lastErrorTime: v.optional(v.number()), // Unix timestamp of last error
    // Token budget tracking (Z.ai specific)
    tokenBudget: v.optional(v.number()), // Remaining token budget
    tokensUsed: v.optional(v.number()), // Tokens used in current period
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider", ["provider"])
    .index("by_status", ["status"]),

  // Feed settings - Singleton document for user feed preferences
  // Uses fixed ID "user_settings" for single-user app pattern
  feedSettings: defineTable({
    enablePushNotifications: v.boolean(),
    enableInAppNotifications: v.boolean(),
    showThumbnails: v.boolean(),
    autoPlayVideos: v.boolean(),
    contentFilter: v.union(v.literal("all"), v.literal("videos-only"), v.literal("blogs-only")),
    updatedAt: v.number(),
  }),

  // Universal plan execution system
  executionPlans: defineTable({
    // Plan identification
    type: v.union(
      v.literal("deep-research"),
      v.literal("shop"),
      v.literal("assimilation")
    ),
    // Plan status workflow
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    // Plan content (structured JSON)
    content: v.optional(v.any()),
    // Additional metadata for execution context
    metadata: v.optional(v.any()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_created", ["createdAt"])
    .index("by_status_and_type", ["status", "type"]),

  // Plan approval tracking
  planApprovals: defineTable({
    // Link to execution plan
    planId: v.id("executionPlans"),
    // User who approved/rejected (for multi-user future-proofing)
    approvedBy: v.string(),
    // Approval timestamp
    approvedAt: v.number(),
    // Approval decision
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    // Rejection reason (if rejected)
    rejectionReason: v.optional(v.string()),
    // Additional feedback
    feedback: v.optional(v.string()),
  })
    .index("by_plan", ["planId"])
    .index("by_approved_by", ["approvedBy"])
    .index("by_decision", ["decision"]),
});
