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
    cardData: v.optional(v.record(v.string(), v.any())), // Card payload — arrays migrated to { card_type: "search_results", items: [...] }
    sessionId: v.optional(v.id("researchSessions")),
    voiceSessionId: v.optional(v.id("voiceSessions")),
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
    .searchIndex("by_title_content", { searchField: "title" })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
    }),

  // Document counters for efficient counting (BP-005)
  documentCounters: defineTable({
    name: v.string(), // "total" | "withoutEmbeddings" | "{category}"
    count: v.number(),
  })
    .index("by_name", ["name"]),

  // Research tables
  researchSessions: defineTable({
    query: v.string(),
    researchType: v.string(),
    inputType: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("in_progress"),
      v.literal("searching"),
      v.literal("analyzing"),
      v.literal("synthesizing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("error"),
      v.literal("paused"),
      v.literal("pending_approval"),
      v.literal("processing")
    ),
    maxIterations: v.optional(v.number()),
    currentIteration: v.optional(v.number()),
    coverageScore: v.optional(v.number()),
    plan: v.optional(v.record(v.string(), v.any())), // Complex JSON from execution plan (tracks, content, metadata)
    findings: v.optional(v.string()), // Synthesized findings text from iterations
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
    sources: v.optional(v.array(v.record(v.string(), v.any()))), // Array of source objects (url, title, snippet, etc.)
    reviewScore: v.optional(v.number()),
    reviewFeedback: v.optional(v.string()),
    reviewGaps: v.optional(v.array(v.string())), // Identified research gaps as string list
    refinedQueries: v.optional(v.array(v.string())), // Follow-up queries for next iteration
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // Deep research tables
  deepResearchSessions: defineTable({
    conversationId: v.id("conversations"),
    taskId: v.optional(v.id("tasks")),
    topic: v.string(),
    researchType: v.optional(v.string()), // "deep" | "simple"
    researchMode: v.optional(v.string()), // "OVERVIEW" | "ACTIONABLE" | "COMPARATIVE" | "EXPLORATORY"
    maxIterations: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("running"),
      v.literal("in_progress"),
      v.literal("in-progress"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("error"),
      v.literal("failed"),
      v.literal("timeout")
    ),
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
    refinedQueries: v.optional(v.array(v.string())), // Follow-up queries for next iteration
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("running"),
      v.literal("in_progress"),
      v.literal("in-progress"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("error")
    ),
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
    confidenceFactors: v.optional(v.object({
      sourceCredibilityScore: v.number(), // 0-100
      evidenceQualityScore: v.number(), // 0-100
      corroborationScore: v.number(), // 0-100
      recencyScore: v.number(), // 0-100
      expertConsensusScore: v.number(), // 0-100
    })), // Full 5-factor confidence scores for transparency
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
    status: v.union(
      v.literal("pending"),
      v.literal("queued"),
      v.literal("loading"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("error"),
      v.literal("cancelled")
    ),
    config: v.optional(v.record(v.string(), v.any())), // Task-type-specific config (varies by taskType: deep-research, research, shop, etc.)
    currentStep: v.optional(v.number()),
    totalSteps: v.optional(v.number()),
    progressMessage: v.optional(v.string()),
    result: v.optional(v.record(v.string(), v.any())), // Task-type-specific result (varies by taskType)
    errorMessage: v.optional(v.string()),
    errorDetails: v.optional(v.record(v.string(), v.any())), // Error context (stack, cause, etc.)
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
      v.literal("creator"),
      v.literal("github")
    ),
    identifier: v.string(), // @handle, r/subreddit, search query, etc.
    name: v.string(),
    url: v.optional(v.string()),
    feedUrl: v.optional(v.string()),
    fetchMethod: v.string(), // rss, api, web_search
    configJson: v.optional(v.record(v.string(), v.any())), // Source-type-specific config (creatorProfileId, platform handles, tiers, etc.)
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
    metadataJson: v.optional(v.record(v.string(), v.any())), // Platform-specific media metadata (duration, viewCount, publishedAt, etc.)
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
    aiRelevanceScore: v.optional(v.number()), // 0-1 AI-scored relevance
    aiRelevanceReason: v.optional(v.string()), // Brief AI explanation
  })
    .index("by_source", ["sourceId", "discoveredAt"])
    .index("by_source_content", ["sourceId", "contentId"])
    .index("by_status", ["researchStatus"])
    .index("by_status_document", ["researchStatus", "documentId"])
    .index("by_content_id", ["contentId"])
    .index("by_inFeed_discoveredAt", ["inFeed", "discoveredAt"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
    })
    .searchIndex("by_title_search", { searchField: "title" }),

  subscriptionFilters: defineTable({
    sourceId: v.optional(v.id("subscriptionSources")), // null = type-level rule
    sourceType: v.optional(
      v.union(
        v.literal("youtube"),
        v.literal("newsletter"),
        v.literal("changelog"),
        v.literal("reddit"),
        v.literal("ebay"),
        v.literal("whats-new"),
        v.literal("creator"),
        v.literal("github")
      )
    ), // for type-level rules - matches subscriptionSources.sourceType
    ruleName: v.string(),
    ruleType: v.string(), // keyword_whitelist, keyword_blacklist, min_score, etc.
    ruleValue: v.union(
      v.string(),
      v.number(),
      v.array(v.string())
    ), // Rule-type-specific value: string[] for keyword rules, number for min_score/max_age, string for other rule types
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
    summaryJson: v.optional(v.record(v.string(), v.any())), // Structured summary data — shape evolves with report versions (discoveries, releases, top5, trends, etc.)
    documentId: v.optional(v.id("documents")), // Link to full report document
    toolSuggestionsJson: v.optional(v.string()), // JSON string of ToolSuggestion[] for one-click add
    findingsJson: v.optional(v.string()), // JSON string of Finding[] for card rendering
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_period", ["periodStart", "periodEnd"]),

  // What's New workflow orchestration - splits monolithic report generation into timeout-safe phases
  whatsNewWorkflows: defineTable({
    phase: v.union(
      v.literal("pending"),
      v.literal("fetching"),
      v.literal("enriching"),
      v.literal("synthesizing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    days: v.number(),
    force: v.boolean(),
    startedAt: v.number(), // Workflow start timestamp
    updatedAt: v.number(), // Last phase update timestamp
    completedAt: v.optional(v.number()), // Completion timestamp
    findingsCount: v.number(), // Number of findings after deduplication
    findingsJson: v.optional(v.string()), // JSON string of findings (evolves: raw → enriched)
    error: v.optional(v.string()), // Error message if failed
    reportId: v.optional(v.id("whatsNewReports")), // Link to final report when complete
  })
    .index("by_updated", ["updatedAt"])
    .index("by_phase", ["phase"]),

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
    verifiedOnly: v.optional(v.boolean()), // Filter for verified sellers only
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
    // Trust fields for seller verification and trustworthiness
    trustTier: v.optional(v.number()), // 1-5 tier classification
    sellerTrustScore: v.optional(v.number()), // 0-100 trust score
    isVerifiedSeller: v.optional(v.boolean()), // Platform-verified seller
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_deal_score", ["sessionId", "dealScore"])
    .index("by_product_hash", ["productHash"])
    .index("by_trust_tier", ["sessionId", "trustTier"]),

  // Tool call approvals for human-in-the-loop tool execution
  toolCalls: defineTable({
    conversationId: v.id("conversations"),
    messageId: v.id("chatMessages"),
    toolName: v.string(),
    toolDisplayName: v.string(),
    toolArgs: v.record(v.string(), v.any()), // Tool-specific arguments — shape varies per tool name
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
    messageId: v.optional(v.id("chatMessages")),
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
    toolArgs: v.record(v.string(), v.any()), // Tool-specific arguments — shape varies per tool name
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
    coveragePlan: v.optional(v.object({
      dimensions: v.optional(v.array(v.object({
        name: v.string(),
        keyFiles: v.optional(v.array(v.string())),
        description: v.optional(v.string()),
      }))),
    })), // Structured coverage plan with per-dimension key files
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
    metadataJson: v.optional(v.record(v.string(), v.any())), // Transcript source metadata (apiVersion, captionTrack, etc.) — varies by transcriptSource
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
    importance: v.optional(v.union(v.literal("high"), v.literal("normal"))),
    createdAt: v.number(),
    // Feed digest support (optional fields for backward compatibility)
    feedItemIds: v.optional(v.array(v.id("feedItems"))),
    digestCount: v.optional(v.number()),
    digestSummary: v.optional(v.string()),
  })
    .index("by_unread", ["read", "createdAt"])
    .index("by_created", ["createdAt"]),

  // User preferences (singleton)
  userPreferences: defineTable({
    notificationsLastSeenAt: v.optional(v.number()),
    voiceLanguage: v.optional(v.string()),
    hasSeenNavTooltip: v.optional(v.boolean()),
    updatedAt: v.number(),
  }),

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
            v.literal("creator"),
            v.literal("github")
          ),
          identifier: v.string(),
          name: v.string(),
          url: v.optional(v.string()),
          feedUrl: v.optional(v.string()),
          configJson: v.optional(v.record(v.string(), v.any())), // Source-type-specific config (same as subscriptionSources.configJson)
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
    // Author info (for social/video cards)
    authorHandle: v.optional(v.string()),
    creatorName: v.optional(v.string()),
    // View tracking
    viewed: v.boolean(),
    viewedAt: v.optional(v.number()),
    // User feedback
    userFeedback: v.optional(v.union(v.literal("up"), v.literal("down"))),
    userFeedbackAt: v.optional(v.number()),
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
      v.literal("assimilation"),
      v.literal("revenue-validation"),
      v.literal("competitive-analysis"),
      v.literal("ai-roi"),
      v.literal("flights")
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
    content: v.optional(v.record(v.string(), v.any())), // Plan-type-specific content (tracks, queries, config) — shape varies by type
    // Additional metadata for execution context
    metadata: v.optional(v.record(v.string(), v.any())), // Execution context metadata (conversationId, userId, etc.) — shape varies by type
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

  // Improvement/bug reporting system
  improvementRequests: defineTable({
    description: v.string(),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("closed")),
    sourceScreen: v.string(),
    sourceComponent: v.optional(v.string()),
    agentDecision: v.optional(v.object({
      action: v.union(v.literal("create_new"), v.literal("merge")),
      mergeTargetId: v.optional(v.id("improvementRequests")),
      confidence: v.number(),
      reasoning: v.string(),
      similarRequests: v.array(v.object({
        id: v.id("improvementRequests"),
        title: v.string(),
        similarity: v.number(),
      })),
    })),
    mergedIntoId: v.optional(v.id("improvementRequests")),
    mergedFromIds: v.optional(v.array(v.id("improvementRequests"))),
    userFeedback: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    // Closure metadata — set when status transitions to "closed"
    closureReason: v.optional(v.string()),
    closureEvidence: v.optional(v.array(v.string())),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"])
    .index("by_mergedInto", ["mergedIntoId"])
    .searchIndex("by_title_search", { searchField: "title", filterFields: ["status"] })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1024,
    }),

  improvementImages: defineTable({
    requestId: v.id("improvementRequests"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_request", ["requestId"]),

  // Voice assistant tables
  voiceSessions: defineTable({
    conversationId: v.id("conversations"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    turnCount: v.number(),
    totalDurationMs: v.optional(v.number()),
    metadata: v.optional(v.object({
      deviceType: v.string(),
      platform: v.string(),
      appVersion: v.string(),
    })),
    errorMessage: v.optional(v.string()),
    audioStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_started", ["startedAt"])
    .index("by_created", ["createdAt"]),

  voiceCommands: defineTable({
    sessionId: v.id("voiceSessions"),
    transcript: v.string(),
    intent: v.string(),
    entities: v.array(v.object({
      type: v.string(),
      value: v.string(),
      confidence: v.number(),
    })),
    actionType: v.string(),
    actionParams: v.optional(v.record(v.string(), v.string())),
    result: v.optional(v.object({
      success: v.boolean(),
      data: v.optional(v.any()), // Action-specific result data — shape varies by actionType (navigate, search, research, etc.)
      error: v.optional(v.string()),
    })),
    success: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId", "createdAt"]),

  // Revenue Validation sessions
  revenueValidationSessions: defineTable({
    productName: v.string(),
    codebaseUrl: v.optional(v.string()),
    status: v.string(), // "pending" | "analyzing" | "completed" | "failed"
    // DVF Scores (Desirability / Viability / Feasibility) — each 0-10
    desirabilityScore: v.optional(v.number()),
    viabilityScore: v.optional(v.number()),
    feasibilityScore: v.optional(v.number()),
    totalScore: v.optional(v.number()), // Sum of DVF (0-30)
    verdict: v.optional(v.string()), // "GO" | "CAUTION" | "NO-GO"
    confidenceLevel: v.optional(v.string()), // "HIGH" | "MEDIUM" | "LOW"
    // Market sizing
    tam: v.optional(v.string()), // Total Addressable Market (formatted string e.g. "$5B")
    sam: v.optional(v.string()), // Serviceable Addressable Market
    som: v.optional(v.string()), // Serviceable Obtainable Market
    // Unit economics (stored as JSON for flexibility across scenarios)
    unitEconomics: v.optional(v.object({
      base: v.optional(v.object({ ltv: v.optional(v.string()), cac: v.optional(v.string()), ltvCacRatio: v.optional(v.string()), paybackMonths: v.optional(v.number()) })),
      bull: v.optional(v.object({ ltv: v.optional(v.string()), cac: v.optional(v.string()), ltvCacRatio: v.optional(v.string()), paybackMonths: v.optional(v.number()) })),
      bear: v.optional(v.object({ ltv: v.optional(v.string()), cac: v.optional(v.string()), ltvCacRatio: v.optional(v.string()), paybackMonths: v.optional(v.number()) })),
    })), // { base: {ltv, cac, payback}, bull: {...}, bear: {...} }
    // Summary
    executiveSummary: v.optional(v.string()),
    agentCount: v.optional(v.number()),
    documentId: v.optional(v.id("documents")),
    errorReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  revenueValidationEvidence: defineTable({
    sessionId: v.id("revenueValidationSessions"),
    claim: v.string(),
    tier: v.number(), // 1-4 (T1=primary data, T4=anecdotal)
    sourceTitle: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    dimension: v.string(), // "desirability" | "viability" | "feasibility"
    challengeStatus: v.optional(v.string()), // "validated" | "contested" | "refuted"
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_dimension", ["sessionId", "dimension"]),

  revenueValidationCompetitors: defineTable({
    sessionId: v.id("revenueValidationSessions"),
    name: v.string(),
    pricing: v.optional(v.string()),
    differentiator: v.optional(v.string()),
    url: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"]),

  // Competitive Analysis sessions
  competitiveAnalysisSessions: defineTable({
    market: v.string(), // Market or category being analyzed
    status: v.string(), // "pending" | "analyzing" | "completed" | "failed"
    // Porter's Five Forces ratings (each "HIGH" | "MEDIUM" | "LOW")
    porterRivalry: v.optional(v.string()),
    porterNewEntrants: v.optional(v.string()),
    porterSubstitutes: v.optional(v.string()),
    porterBuyerPower: v.optional(v.string()),
    porterSupplierPower: v.optional(v.string()),
    // Summary
    marketVerdict: v.optional(v.string()),
    sourceCount: v.optional(v.number()),
    documentId: v.optional(v.id("documents")),
    errorReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  competitiveAnalysisCompetitors: defineTable({
    sessionId: v.id("competitiveAnalysisSessions"),
    name: v.string(),
    focus: v.optional(v.string()),
    founded: v.optional(v.string()),
    funding: v.optional(v.string()),
    strengths: v.optional(v.array(v.string())),
    weaknesses: v.optional(v.array(v.string())),
    url: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"]),

  competitiveAnalysisFeatures: defineTable({
    sessionId: v.id("competitiveAnalysisSessions"),
    featureName: v.string(),
    ourSupport: v.string(), // "yes" | "partial" | "no"
    competitorSupport: v.record(v.string(), v.string()), // Record<competitorName, "yes"|"partial"|"no">
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"]),

  // AI ROI Analysis sessions
  aiRoiSessions: defineTable({
    company: v.string(), // Company or domain being analyzed
    status: v.string(), // "pending" | "analyzing" | "completed" | "failed"
    executiveSummary: v.optional(v.string()),
    sourceCount: v.optional(v.number()),
    topOpportunityName: v.optional(v.string()),
    topOpportunitySavings: v.optional(v.string()), // Formatted e.g. "$150K/yr"
    topOpportunityConfidence: v.optional(v.string()), // "HIGH" | "MEDIUM" | "LOW"
    documentId: v.optional(v.id("documents")),
    errorReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  aiRoiOpportunities: defineTable({
    sessionId: v.id("aiRoiSessions"),
    rank: v.number(),
    name: v.string(),
    confidence: v.string(), // "HIGH" | "MEDIUM" | "LOW"
    currentProcess: v.optional(v.string()),
    proposedAutomation: v.optional(v.string()),
    // Cost/benefit metrics
    currentTimePerWeek: v.optional(v.string()), // e.g. "20hrs"
    automatedTimePerWeek: v.optional(v.string()),
    currentCostPerYear: v.optional(v.string()), // e.g. "$120K"
    automatedCostPerYear: v.optional(v.string()),
    savingsPerYear: v.optional(v.string()),
    errorRateBefore: v.optional(v.string()),
    errorRateAfter: v.optional(v.string()),
    // Implementation phase
    phase: v.optional(v.string()), // "quick-win" | "medium-term" | "strategic"
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_rank", ["sessionId", "rank"]),

  aiRoiEvidence: defineTable({
    sessionId: v.id("aiRoiSessions"),
    opportunityId: v.optional(v.id("aiRoiOpportunities")),
    claim: v.string(),
    tier: v.number(), // 1-5 (T5 excluded from base case)
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    challengeStatus: v.optional(v.string()), // "validated" | "contested"
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_opportunity", ["opportunityId"]),

  // Flights sessions
  flightsSessions: defineTable({
    origin: v.string(), // Airport code or city
    destination: v.string(),
    dateRange: v.optional(v.string()), // e.g. "2026-05 to 2026-06"
    status: v.string(), // "pending" | "searching" | "completed" | "failed"
    // Best deal
    bestDealPrice: v.optional(v.number()), // In cents
    bestDealAirline: v.optional(v.string()),
    bestDealDates: v.optional(v.string()),
    season: v.optional(v.string()), // "shoulder" | "peak" | "off-peak"
    // Tips
    cheapestDay: v.optional(v.string()),
    shoulderSeason: v.optional(v.string()),
    bookBy: v.optional(v.string()),
    documentId: v.optional(v.id("documents")),
    errorReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  flightsRoutes: defineTable({
    sessionId: v.id("flightsSessions"),
    airline: v.string(),
    departDate: v.string(), // YYYY-MM-DD
    returnDate: v.optional(v.string()),
    price: v.number(), // In cents
    stops: v.number(),
    duration: v.optional(v.string()), // e.g. "5h30m"
    isBestDeal: v.boolean(),
    bookingUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_price", ["sessionId", "price"]),

  flightsPriceCalendar: defineTable({
    sessionId: v.id("flightsSessions"),
    date: v.string(), // YYYY-MM-DD
    dayOfWeek: v.string(), // "Mon" | "Tue" | ...
    weekNumber: v.number(), // 1-5 within the month
    price: v.number(), // In cents (lowest price for that date)
    isCheapest: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_date", ["sessionId", "date"]),

  // Multi-source text imports
  imports: defineTable({
    documentId: v.id("documents"),
    source: v.string(), // "chat", "manual", "chatgpt", "claude", "perplexity", etc.
    text: v.string(),
    importedAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_source", ["source"])
    .index("by_importedAt", ["importedAt"]),

  // API rate limit events for sliding-window tracking (research/shop endpoints)
  // Each record represents one request; old records are cleaned up automatically
  rateLimits: defineTable({
    key: v.string(), // endpoint identifier: "exa", "jina", "jina-reader"
    timestamp: v.number(), // Unix timestamp (ms) when the request was made
  })
    .index("by_key", ["key"])
    .index("by_key_timestamp", ["key", "timestamp"]),
});
