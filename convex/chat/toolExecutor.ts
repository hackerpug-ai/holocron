"use node";

/**
 * Tool Executor
 *
 * Maps AI tool call names to existing Convex backend handlers.
 * Mirrors the slash-command routing logic in convex/chat/index.ts so that
 * agent tool calls and /commands share the same backend logic.
 */

import { api, internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { DOCUMENT_CATEGORIES, isValidCategory } from "../lib/categories";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentResponse = {
  content: string;
  messageType: string;
  cardData?: any;
  /** When true, the caller should NOT schedule continueAfterTool.
   *  Used by fire-and-forget tools (research, etc.) that post their
   *  own results asynchronously. */
  skipContinuation?: boolean;
};

// ---------------------------------------------------------------------------
// search_knowledge_base
// ---------------------------------------------------------------------------

async function executeSearchKnowledgeBase(
  ctx: ActionCtx,
  args: Record<string, any>,
  conversationId: Id<"conversations">,
): Promise<AgentResponse> {
  const query: string = args.query ?? "";
  const limit: number = args.limit ?? 5;

  if (!query) {
    return { content: "Please provide a search query.", messageType: "text" };
  }

  // Fire-and-forget: background action posts its own result/error cards
  ctx.scheduler.runAfter(
    0,
    internal.chat.toolActions.searchKnowledgeBaseAsync,
    { conversationId, query, limit },
  );

  return {
    content: `Searching knowledge base for "${query}"...`,
    messageType: "text",
    skipContinuation: true,
  };
}

// ---------------------------------------------------------------------------
// browse_category
// ---------------------------------------------------------------------------

async function executeBrowseCategory(
  ctx: ActionCtx,
  args: Record<string, any>,
): Promise<AgentResponse> {
  const category: string | undefined = args.category;

  try {
    if (!category) {
      const categoryCounts: any = await ctx.runQuery(
        api.documents.queries.countByCategory,
        {},
      );

      const categories = Object.entries(categoryCounts)
        .map(([name, count]) => ({ name, count: count as number }))
        .sort((a, b) => b.count - a.count);

      return {
        content: "Browse articles by category",
        messageType: "result_card",
        cardData: { card_type: "category_list", categories },
      };
    }

    const normalizedCategory = category.toLowerCase().trim();
    if (!isValidCategory(normalizedCategory)) {
      return {
        content: `Category "${category}" not found. Valid categories: ${DOCUMENT_CATEGORIES.join(", ")}`,
        messageType: "result_card",
        cardData: {
          card_type: "category_not_found",
          valid_categories: [...DOCUMENT_CATEGORIES],
        },
      };
    }

    const articles: any[] = await ctx.runQuery(api.documents.queries.list, {
      category: normalizedCategory,
      limit: 10,
    });

    if (!articles || articles.length === 0) {
      return {
        content: `No articles found in category "${category}"`,
        messageType: "text",
      };
    }

    const articleCards = articles.map((doc: any) => ({
      card_type: "article",
      title: doc.title,
      date: doc.date || undefined,
      researchType: doc.researchType || undefined,
      document_id: doc._id,
    }));

    return {
      content: `Found ${articles.length} article${articles.length === 1 ? "" : "s"} in ${category}`,
      messageType: "result_card",
      cardData: articleCards,
    };
  } catch (error) {
    return {
      content: `Browse failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

// ---------------------------------------------------------------------------
// knowledge_base_stats
// ---------------------------------------------------------------------------

async function executeKnowledgeBaseStats(
  ctx: ActionCtx,
): Promise<AgentResponse> {
  try {
    const categoryCounts: any = await ctx.runQuery(
      api.documents.queries.countByCategory,
      {},
    );

    const totalCount = Object.values(categoryCounts).reduce(
      (sum: number, count: any) => sum + (count as number),
      0,
    );

    const categoryBreakdown = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count: count as number }))
      .sort((a, b) => b.count - a.count);

    return {
      content: `Knowledge Base Statistics\n\nTotal Documents: ${totalCount}\n\nBy Category:\n${categoryBreakdown.map(({ category, count }) => `  ${category}: ${count}`).join("\n")}`,
      messageType: "result_card",
      cardData: {
        card_type: "stats",
        total_count: totalCount,
        category_breakdown: categoryBreakdown,
      },
    };
  } catch (error) {
    return {
      content: `Stats fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

// ---------------------------------------------------------------------------
// quick_research
// ---------------------------------------------------------------------------

async function executeQuickResearch(
  ctx: ActionCtx,
  args: Record<string, any>,
  conversationId: Id<"conversations">,
): Promise<AgentResponse> {
  const query: string = args.query ?? "";

  if (!query) {
    return { content: "Please provide a research topic.", messageType: "text" };
  }

  ctx.scheduler.runAfter(0, api.research.actions.startSimpleResearch, {
    conversationId,
    topic: query,
  });

  return { content: `Researching: "${query}"`, messageType: "text", skipContinuation: true };
}

// ---------------------------------------------------------------------------
// deep_research
// ---------------------------------------------------------------------------

async function executeDeepResearch(
  ctx: ActionCtx,
  args: Record<string, any>,
  conversationId: Id<"conversations">,
): Promise<AgentResponse> {
  const topic: string = args.topic ?? "";

  if (!topic) {
    return { content: "Please provide a research topic.", messageType: "text" };
  }

  // Fire-and-forget async workflow using smart routing (replaces startDeepResearch)
  ctx.scheduler.runAfter(0, api.research.actions.startSmartResearch, {
    conversationId,
    topic,
  });

  return {
    content: `Started deep research: "${topic}"`,
    messageType: "text",
    skipContinuation: true,
  };
}

// ---------------------------------------------------------------------------
// shop_search
// ---------------------------------------------------------------------------

async function executeShopSearch(
  ctx: ActionCtx,
  args: Record<string, any>,
  conversationId: Id<"conversations">,
): Promise<AgentResponse> {
  const query: string = args.query ?? "";

  if (!query) {
    return {
      content: "Please provide a product to search for.",
      messageType: "text",
    };
  }

  // Fire-and-forget: background action posts its own loading/result/error cards
  ctx.scheduler.runAfter(0, api.shop.index.startShopSearch, {
    conversationId,
    query,
  });

  return { content: `Searching for "${query}"...`, messageType: "text", skipContinuation: true };
}

// ---------------------------------------------------------------------------
// subscribe
// ---------------------------------------------------------------------------

async function executeSubscribe(
  ctx: ActionCtx,
  args: Record<string, any>,
): Promise<AgentResponse> {
  const { sourceType, identifier, name } = args as {
    sourceType: string;
    identifier: string;
    name: string;
  };

  const validTypes = [
    "youtube",
    "newsletter",
    "changelog",
    "reddit",
    "ebay",
    "whats-new",
    "creator",
  ];

  if (!sourceType || !identifier || !name) {
    return {
      content:
        "Required fields: sourceType, identifier, name.\nValid types: youtube, newsletter, changelog, reddit, ebay, whats-new, creator",
      messageType: "text",
    };
  }

  if (!validTypes.includes(sourceType)) {
    return {
      content: `Invalid subscription type: ${sourceType}\nValid types: ${validTypes.join(", ")}`,
      messageType: "text",
    };
  }

  try {
    const result: any = await ctx.runMutation(api.subscriptions.mutations.add, {
      sourceType: sourceType as any,
      identifier,
      name,
    });

    return {
      content: `Subscribed to ${name}`,
      messageType: "result_card",
      cardData: {
        card_type: "subscription_added",
        subscription_id: result._id,
        source_type: sourceType,
        identifier,
        name,
        url: result.url,
      },
    };
  } catch (error) {
    return {
      content: `Subscription failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

// ---------------------------------------------------------------------------
// unsubscribe
// ---------------------------------------------------------------------------

async function executeUnsubscribe(
  ctx: ActionCtx,
  args: Record<string, any>,
): Promise<AgentResponse> {
  const sourceId: string = args.sourceId ?? "";

  if (!sourceId) {
    return {
      content: "Please provide a sourceId to unsubscribe.",
      messageType: "text",
    };
  }

  try {
    await ctx.runMutation(api.subscriptions.mutations.remove, {
      subscriptionId: sourceId as any,
    });

    return { content: "Unsubscribed successfully", messageType: "text" };
  } catch (error) {
    return {
      content: `Unsubscribe failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

// ---------------------------------------------------------------------------
// list_subscriptions
// ---------------------------------------------------------------------------

async function executeListSubscriptions(
  ctx: ActionCtx,
  args: Record<string, any>,
): Promise<AgentResponse> {
  try {
    const subscriptions: any[] = await ctx.runQuery(
      api.subscriptions.queries.list,
      { sourceType: args.sourceType || undefined },
    );

    if (subscriptions.length === 0) {
      return {
        content: "No subscriptions found. Use the subscribe tool to add one.",
        messageType: "text",
      };
    }

    return {
      content: `Found ${subscriptions.length} subscription${subscriptions.length === 1 ? "" : "s"}`,
      messageType: "result_card",
      cardData: {
        card_type: "subscription_list",
        subscriptions: subscriptions.map((s: any) => ({
          id: s._id,
          source_type: s.sourceType,
          identifier: s.identifier,
          name: s.name,
          auto_research: s.autoResearch,
          created_at: s.createdAt,
        })),
      },
    };
  } catch (error) {
    return {
      content: `List subscriptions failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

// ---------------------------------------------------------------------------
// check_subscriptions
// ---------------------------------------------------------------------------

async function executeCheckSubscriptions(ctx: ActionCtx): Promise<AgentResponse> {
  try {
    ctx.scheduler.runAfter(0, api.subscriptions.actions.check, {});

    return {
      content: "Checking subscriptions for new content...",
      messageType: "text",
      skipContinuation: true,
    };
  } catch (error) {
    return {
      content: `Subscription check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

// ---------------------------------------------------------------------------
// whats_new
// ---------------------------------------------------------------------------

async function executeWhatsNew(
  ctx: ActionCtx,
  args: Record<string, any>,
): Promise<AgentResponse> {
  const days: number = args.days ?? 1;

  try {
    const reportData: any = await ctx.runQuery(
      api.whatsNew.queries.getLatestReport,
      {},
    );

    if (!reportData || !reportData.report) {
      ctx.scheduler.runAfter(0, api.whatsNew.actions.generate, { days });

      return {
        content: "Generating AI news briefing...",
        messageType: "result_card",
        cardData: {
          card_type: "whats_new_loading",
          message: `Generating ${days}-day briefing...`,
        },
        skipContinuation: true,
      };
    }

    const report = reportData.report;

    return {
      content: `What's New in AI (${report.days} days)`,
      messageType: "result_card",
      cardData: {
        card_type: "whats_new_report",
        report_id: report._id,
        period_start: report.periodStart,
        period_end: report.periodEnd,
        days: report.days,
        findings_count: report.findingsCount,
        discovery_count: report.discoveryCount,
        release_count: report.releaseCount,
        trend_count: report.trendCount,
        content: reportData.content,
        is_from_today: reportData.isFromToday,
      },
    };
  } catch (error) {
    return {
      content: `What's new failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

// ---------------------------------------------------------------------------
// toolbelt_search
// ---------------------------------------------------------------------------

async function executeToolbeltSearch(
  ctx: ActionCtx,
  args: Record<string, any>,
): Promise<AgentResponse> {
  const query: string = args.query ?? "";

  if (!query) {
    return {
      content: "Please provide a search query for the toolbelt.",
      messageType: "text",
    };
  }

  try {
    const results: any[] = await ctx.runQuery(
      api.toolbelt.queries.fullTextSearch,
      { query, limit: 5 },
    );

    if (results.length === 0) {
      return {
        content: `No tools found for "${query}"`,
        messageType: "text",
      };
    }

    return {
      content: `Found ${results.length} tool${results.length === 1 ? "" : "s"} matching "${query}"`,
      messageType: "result_card",
      cardData: {
        card_type: "tool_search_results",
        query,
        results: results.map((t: any) => ({
          id: t._id,
          title: t.title,
          description: t.description,
          category: t.category,
          source_type: t.sourceType,
          language: t.language,
          tags: t.tags,
          score: t.score || 0,
        })),
      },
    };
  } catch (error) {
    return {
      content: `Toolbelt search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

// ---------------------------------------------------------------------------
// save_document
// ---------------------------------------------------------------------------

async function executeSaveDocument(
  ctx: ActionCtx,
  args: Record<string, any>,
  conversationId: Id<"conversations">,
): Promise<AgentResponse> {
  const title: string = args.title ?? "";
  const content: string = args.content ?? "";
  const category: string = args.category ?? "notes";

  if (!title || !content) {
    return {
      content: "Required fields: title, content. Category defaults to 'notes'.",
      messageType: "text",
    };
  }

  await ctx.scheduler.runAfter(
    0,
    internal.chat.toolActions.saveDocumentAsync,
    {
      conversationId,
      title,
      content,
      category,
    },
  );

  return {
    content: `Saving "${title}" to knowledge base...`,
    messageType: "text",
    skipContinuation: true,
  };
}

// ---------------------------------------------------------------------------
// assimilate
// ---------------------------------------------------------------------------

async function executeAssimilate(
  ctx: ActionCtx,
  args: Record<string, any>,
  conversationId: Id<"conversations">,
): Promise<AgentResponse> {
  const repositoryUrl: string = args.repositoryUrl ?? "";
  const profile: string = args.profile ?? "standard";

  if (!repositoryUrl) {
    return {
      content: "Please provide a GitHub repository URL.",
      messageType: "text",
    };
  }

  try {
    const result: any = await ctx.runMutation(
      api.assimilate.mutations.startAssimilation,
      { repositoryUrl, profile, conversationId },
    );

    if (result.existing) {
      return {
        content: `Assimilation already in progress for this repository (status: ${result.status})`,
        messageType: "result_card",
        cardData: {
          card_type: "assimilation_started",
          session_id: result.sessionId,
          repository_url: repositoryUrl,
          profile,
          status: result.status,
          existing: true,
        },
      };
    }

    return {
      content: `Started assimilation of ${repositoryUrl} — generating coverage plan...`,
      messageType: "result_card",
      cardData: {
        card_type: "assimilation_started",
        session_id: result.sessionId,
        repository_url: repositoryUrl,
        profile,
        status: result.status,
        existing: false,
      },
    };
  } catch (error) {
    return {
      content: `Assimilation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * executeAgentTool
 *
 * Maps an AI tool call name to the appropriate Convex backend handler and
 * returns a structured AgentResponse.
 */
export async function executeAgentTool(
  ctx: ActionCtx,
  toolName: string,
  toolArgs: Record<string, any>,
  conversationId: Id<"conversations">,
): Promise<AgentResponse> {
  switch (toolName) {
    case "search_knowledge_base":
      return executeSearchKnowledgeBase(ctx, toolArgs, conversationId);

    case "browse_category":
      return executeBrowseCategory(ctx, toolArgs);

    case "knowledge_base_stats":
      return executeKnowledgeBaseStats(ctx);

    case "quick_research":
      return executeQuickResearch(ctx, toolArgs, conversationId);

    case "deep_research":
      return executeDeepResearch(ctx, toolArgs, conversationId);

    case "shop_search":
      return executeShopSearch(ctx, toolArgs, conversationId);

    case "subscribe":
      return executeSubscribe(ctx, toolArgs);

    case "unsubscribe":
      return executeUnsubscribe(ctx, toolArgs);

    case "list_subscriptions":
      return executeListSubscriptions(ctx, toolArgs);

    case "check_subscriptions":
      return executeCheckSubscriptions(ctx);

    case "whats_new":
      return executeWhatsNew(ctx, toolArgs);

    case "toolbelt_search":
      return executeToolbeltSearch(ctx, toolArgs);

    case "save_document":
      return executeSaveDocument(ctx, toolArgs, conversationId);

    case "assimilate":
      return executeAssimilate(ctx, toolArgs, conversationId);

    default:
      return {
        content: `Tool execution pending implementation: unknown tool "${toolName}"`,
        messageType: "text",
      };
  }
}
