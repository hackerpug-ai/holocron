/**
 * Plan Generation Service
 *
 * Generates execution plans for different workflow types.
 * Each generator creates structured plans with steps, estimates, and dependencies.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * Generate a deep research plan
 *
 * Creates a research track plan with worker assignments.
 * Includes steps for: topic analysis, source discovery, deep research, synthesis.
 *
 * AC-1: Research context -> Generate plan -> Returns plan with research tracks
 */
export const generateDeepResearchPlan = mutation({
  args: {
    topic: v.string(),
    maxIterations: v.optional(v.number()),
    outputFormat: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args): Promise<Id<"executionPlans">> => {
    const now = Date.now();

    // Generate research tracks based on topic complexity
    const tracks = generateResearchTracks(args.topic);

    // Build plan content
    const content = {
      title: `Deep Research: ${args.topic}`,
      description: `Comprehensive research on "${args.topic}" using multiple tracks`,
      tracks,
      maxIterations: args.maxIterations ?? 5,
      outputFormat: args.outputFormat ?? "document",
      estimatedSteps: tracks.length * 2 + 2, // Analysis + tracks + synthesis + output
      estimatedDurationMs: estimateResearchDuration(tracks.length, args.maxIterations ?? 5),
    };

    // Create execution plan
    const planId = await ctx.db.insert("executionPlans", {
      type: "deep-research",
      status: "draft",
      content,
      metadata: {
        conversationId: args.conversationId,
        topic: args.topic,
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    return planId;
  },
});

/**
 * Generate a shop plan
 *
 * Creates a retailer dispatch plan for product search.
 * Includes steps for: retailer selection, parallel search, deal scoring.
 *
 * AC-2: Shop context -> Generate plan -> Returns plan with retailer assignments
 */
export const generateShopPlan = mutation({
  args: {
    query: v.string(),
    condition: v.optional(v.string()),
    priceMin: v.optional(v.number()),
    priceMax: v.optional(v.number()),
    retailers: v.optional(v.array(v.string())),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args): Promise<Id<"executionPlans">> => {
    const now = Date.now();

    // Determine retailers to search
    const targetRetailers = args.retailers ?? getDefaultRetailers();

    // Build plan content
    const content = {
      title: `Shop: ${args.query}`,
      description: `Find best deals for "${args.query}" across ${targetRetailers.length} retailers`,
      query: args.query,
      condition: args.condition ?? "any",
      priceRange: {
        min: args.priceMin,
        max: args.priceMax,
      },
      retailers: targetRetailers.map((retailer) => ({
        name: retailer,
        enabled: true,
        priority: getRetailerPriority(retailer),
      })),
      estimatedSteps: targetRetailers.length + 2, // Setup + retailers + scoring
      estimatedDurationMs: estimateShopDuration(targetRetailers.length),
    };

    // Create execution plan
    const planId = await ctx.db.insert("executionPlans", {
      type: "shop",
      status: "draft",
      content,
      metadata: {
        conversationId: args.conversationId,
        query: args.query,
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    return planId;
  },
});

/**
 * Generate an assimilation plan
 *
 * Creates a repository assimilation analysis plan.
 * Includes steps for: repository discovery, multi-dimensional analysis, synthesis.
 *
 * AC-3: Assimilation context -> Generate plan -> Returns plan with analysis dimensions
 */
export const generateAssimilationPlan = mutation({
  args: {
    repositoryUrl: v.string(),
    profile: v.optional(v.string()),
    maxIterations: v.optional(v.number()),
    autoApprove: v.optional(v.boolean()),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args): Promise<Id<"executionPlans">> => {
    const now = Date.now();

    // Parse repository URL
    const repoInfo = parseRepositoryUrl(args.repositoryUrl);

    // Generate analysis dimensions
    const dimensions = [
      { name: "architecture", description: "Code structure and design patterns", priority: 1 },
      { name: "patterns", description: "Coding patterns and conventions", priority: 2 },
      { name: "documentation", description: "Documentation quality and completeness", priority: 3 },
      { name: "dependencies", description: "External dependencies and integrations", priority: 4 },
      { name: "testing", description: "Test coverage and testing approach", priority: 5 },
    ];

    // Build plan content
    const content = {
      title: `Assimilate: ${repoInfo.name}`,
      description: `Analyzing repository ${repoInfo.name} across ${dimensions.length} dimensions`,
      repositoryUrl: args.repositoryUrl,
      repositoryName: repoInfo.name,
      profile: args.profile ?? "standard",
      dimensions: dimensions.map((dim) => ({
        ...dim,
        status: "pending",
        coverageScore: null,
      })),
      maxIterations: args.maxIterations ?? 10,
      autoApprove: args.autoApprove ?? false,
      estimatedSteps: dimensions.length + 3, // Discovery + dimensions + synthesis + output
      estimatedDurationMs: estimateAssimilationDuration(dimensions.length, args.maxIterations ?? 10),
    };

    // Create execution plan
    const planId = await ctx.db.insert("executionPlans", {
      type: "assimilation",
      status: "draft",
      content,
      metadata: {
        conversationId: args.conversationId,
        repositoryUrl: args.repositoryUrl,
        autoApprove: args.autoApprove ?? false,
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    return planId;
  },
});

/**
 * Generate plan (main entry point)
 *
 * Routes to the appropriate generator based on plan type.
 *
 * AC-4: Any context -> Generate plan -> Routes to correct generator
 */
export const generatePlan = mutation({
  args: {
    type: v.union(
      v.literal("deep-research"),
      v.literal("shop"),
      v.literal("assimilation")
    ),
    context: v.any(),
  },
  handler: async (ctx, args): Promise<Id<"executionPlans">> => {
    const now = Date.now();

    switch (args.type) {
      case "deep-research": {
        const context = args.context as {
          topic: string;
          maxIterations?: number;
          outputFormat?: string;
          conversationId?: Id<"conversations">;
        };

        const tracks = generateResearchTracks(context.topic);
        const content = {
          title: `Deep Research: ${context.topic}`,
          description: `Comprehensive research on "${context.topic}" using multiple tracks`,
          tracks,
          maxIterations: context.maxIterations ?? 5,
          outputFormat: context.outputFormat ?? "document",
          estimatedSteps: tracks.length * 2 + 2,
          estimatedDurationMs: estimateResearchDuration(tracks.length, context.maxIterations ?? 5),
        };

        return await ctx.db.insert("executionPlans", {
          type: "deep-research",
          status: "draft",
          content,
          metadata: {
            conversationId: context.conversationId,
            topic: context.topic,
            createdAt: now,
          },
          createdAt: now,
          updatedAt: now,
        });
      }

      case "shop": {
        const context = args.context as {
          query: string;
          condition?: string;
          priceMin?: number;
          priceMax?: number;
          retailers?: string[];
          conversationId?: Id<"conversations">;
        };

        const targetRetailers = context.retailers ?? getDefaultRetailers();
        const content = {
          title: `Shop: ${context.query}`,
          description: `Find best deals for "${context.query}" across ${targetRetailers.length} retailers`,
          query: context.query,
          condition: context.condition ?? "any",
          priceRange: {
            min: context.priceMin,
            max: context.priceMax,
          },
          retailers: targetRetailers.map((retailer) => ({
            name: retailer,
            enabled: true,
            priority: getRetailerPriority(retailer),
          })),
          estimatedSteps: targetRetailers.length + 2,
          estimatedDurationMs: estimateShopDuration(targetRetailers.length),
        };

        return await ctx.db.insert("executionPlans", {
          type: "shop",
          status: "draft",
          content,
          metadata: {
            conversationId: context.conversationId,
            query: context.query,
            createdAt: now,
          },
          createdAt: now,
          updatedAt: now,
        });
      }

      case "assimilation": {
        const context = args.context as {
          repositoryUrl: string;
          profile?: string;
          maxIterations?: number;
          autoApprove?: boolean;
          conversationId?: Id<"conversations">;
        };

        const repoInfo = parseRepositoryUrl(context.repositoryUrl);
        const dimensions = [
          { name: "architecture", description: "Code structure and design patterns", priority: 1 },
          { name: "patterns", description: "Coding patterns and conventions", priority: 2 },
          { name: "documentation", description: "Documentation quality and completeness", priority: 3 },
          { name: "dependencies", description: "External dependencies and integrations", priority: 4 },
          { name: "testing", description: "Test coverage and testing approach", priority: 5 },
        ];

        const content = {
          title: `Assimilate: ${repoInfo.name}`,
          description: `Analyzing repository ${repoInfo.name} across ${dimensions.length} dimensions`,
          repositoryUrl: context.repositoryUrl,
          repositoryName: repoInfo.name,
          profile: context.profile ?? "standard",
          dimensions: dimensions.map((dim) => ({
            ...dim,
            status: "pending",
            coverageScore: null,
          })),
          maxIterations: context.maxIterations ?? 10,
          autoApprove: context.autoApprove ?? false,
          estimatedSteps: dimensions.length + 3,
          estimatedDurationMs: estimateAssimilationDuration(dimensions.length, context.maxIterations ?? 10),
        };

        return await ctx.db.insert("executionPlans", {
          type: "assimilation",
          status: "draft",
          content,
          metadata: {
            conversationId: context.conversationId,
            repositoryUrl: context.repositoryUrl,
            autoApprove: context.autoApprove ?? false,
            createdAt: now,
          },
          createdAt: now,
          updatedAt: now,
        });
      }

      default:
        throw new Error(`Unknown plan type: ${args.type}`);
    }
  },
});

// ============================================================
// Helper Functions
// ============================================================

/**
 * Generate research tracks based on topic complexity
 */
function generateResearchTracks(topic: string): Array<{
  name: string;
  description: string;
  workerType: string;
  priority: number;
}> {
  // Base tracks for all research
  const tracks = [
    {
      name: "official",
      description: "Official documentation and specifications",
      workerType: "web_research",
      priority: 1,
    },
    {
      name: "expert",
      description: "Expert blogs and technical articles",
      workerType: "web_research",
      priority: 2,
    },
    {
      name: "community",
      description: "Community discussions and forums",
      workerType: "web_research",
      priority: 3,
    },
  ];

  // Add academic track for complex topics
  if (topic.length > 50 || topic.includes("research") || topic.includes("academic")) {
    tracks.push({
      name: "academic",
      description: "Academic papers and research publications",
      workerType: "scholar_research",
      priority: 4,
    });
  }

  return tracks;
}

/**
 * Get default retailers for shopping
 */
function getDefaultRetailers(): string[] {
  return ["eBay", "Amazon", "Craigslist"];
}

/**
 * Get retailer priority for search ordering
 */
function getRetailerPriority(retailer: string): number {
  const priorities: Record<string, number> = {
    "eBay": 1,
    "Amazon": 2,
    "Craigslist": 3,
  };
  return priorities[retailer] ?? 99;
}

/**
 * Parse repository URL to extract info
 */
function parseRepositoryUrl(url: string): { name: string; owner?: string } {
  try {
    // Handle GitHub URLs
    const githubMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (githubMatch) {
      return { name: githubMatch[2], owner: githubMatch[1] };
    }

    // Extract name from path
    const parts = url.split("/").filter(Boolean);
    const name = parts[parts.length - 1] ?? "unknown";
    return { name };
  } catch {
    return { name: "unknown" };
  }
}

/**
 * Estimate research duration based on tracks and iterations
 */
function estimateResearchDuration(trackCount: number, maxIterations: number): number {
  // Base time: 5 min per track per iteration
  const msPerMinute = 60 * 1000;
  return trackCount * maxIterations * 5 * msPerMinute;
}

/**
 * Estimate shop duration based on retailer count
 */
function estimateShopDuration(retailerCount: number): number {
  // Base time: 30 seconds per retailer
  const msPerSecond = 1000;
  return retailerCount * 30 * msPerSecond;
}

/**
 * Estimate assimilation duration based on dimensions and iterations
 */
function estimateAssimilationDuration(dimensionCount: number, maxIterations: number): number {
  // Base time: 3 min per dimension per iteration
  const msPerMinute = 60 * 1000;
  return dimensionCount * maxIterations * 3 * msPerMinute;
}
