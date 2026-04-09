"use node";

import { action, ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";

import { generateText } from "ai";
import { zaiFlash } from "../lib/ai/zai_provider";
import { DOCUMENT_CATEGORIES, isValidCategory } from "../lib/categories";

/**
 * Slash command parser
 * AC-3: Route slash commands to appropriate handler
 */
interface ParsedCommand {
  isCommand: boolean;
  command?: string;
  args?: string;
}

function parseSlashCommand(content: string): ParsedCommand {
  const trimmed = content.trim();
  if (!trimmed.startsWith("/")) {
    return { isCommand: false };
  }
  const [command, ...argParts] = trimmed.slice(1).split(" ");
  return {
    isCommand: true,
    command: command.toLowerCase(),
    args: argParts.join(" ").trim() || undefined,
  };
}

/**
 * Card data types for result_card messages
 */
interface CategoryListCard {
  card_type: "category_list";
  categories: Array<{
    name: string;
    count: number;
  }>;
}

interface BrowseArticleCard {
  card_type: "article";
  title: string;
  date?: string;
  researchType?: string;
  document_id: string;
}

interface SearchArticleCard {
  card_type: "article";
  title: string;
  category: string;
  snippet: string;
  document_id: string;
  metadata?: {
    relevance_score?: number;
  };
}

interface NoResultsCard {
  card_type: "no_results";
  message: string;
}

interface CategoryNotFoundCard {
  card_type: "category_not_found";
  valid_categories: string[];
}

interface StatsCard {
  card_type: "stats";
  total_count: number;
  category_breakdown: Array<{
    category: string;
    count: number;
  }>;
}

interface SearchResultsCard {
  card_type: "search_results";
  items: SearchArticleCard[];
}

interface SimpleResearchResultCard {
  card_type: "simple_research_result";
  session_id: string;
  topic: string;
  summary: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  duration_ms: number;
}

interface ShopListingCard {
  card_type: "shop_listing";
  listing_id: string;
  title: string;
  price: number;
  original_price?: number;
  currency: string;
  condition: string;
  retailer: string;
  seller?: string;
  seller_rating?: number;
  url: string;
  image_url?: string;
  in_stock: boolean;
  deal_score?: number;
}

interface ShopResultsCard {
  card_type: "shop_results";
  session_id: string;
  query: string;
  total_listings: number;
  best_deal_id?: string;
  listings: ShopListingCard[];
  status: "searching" | "completed" | "failed";
  duration_ms?: number;
}

interface ShopLoadingCard {
  card_type: "shop_loading";
  session_id: string;
  query: string;
  message?: string;
}

interface SubscriptionAddedCard {
  card_type: "subscription_added";
  subscription_id: string;
  source_type: string;
  identifier: string;
  name: string;
  url?: string;
}

interface SubscriptionListCard {
  card_type: "subscription_list";
  subscriptions: Array<{
    id: string;
    source_type: string;
    identifier: string;
    name: string;
    auto_research: boolean;
    created_at: number;
  }>;
  filter_type?: string;
}

interface WhatsNewReportCard {
  card_type: "whats_new_report";
  report_id: string;
  period_start: number;
  period_end: number;
  days: number;
  findings_count: number;
  discovery_count: number;
  release_count: number;
  trend_count: number;
  content?: string;
  is_from_today: boolean;
  // Extended fields for enhanced filtering and ranking
  top_engagement_velocity?: number; // Highest engagement score in this report
  total_corroboration_count?: number; // Total cross-source mentions
  sources?: string[]; // List of sources in this report
}

interface WhatsNewLoadingCard {
  card_type: "whats_new_loading";
  message?: string;
}

interface ToolSearchResultsCard {
  card_type: "tool_search_results";
  query: string;
  results: Array<{
    id: string;
    title: string;
    description?: string;
    category: string;
    source_type: string;
    language?: string;
    tags?: string[];
    score: number;
  }>;
}

interface ToolAddingCard {
  card_type: "tool_adding";
  url: string;
  message?: string;
}

interface ToolAddedCard {
  card_type: "tool_added";
  tool_id: string;
  title: string;
  description?: string;
  category: string;
  source_type: string;
  url: string;
}

interface DocumentSavedCard {
  card_type: "document_saved";
  document_id: string;
  title: string;
  category?: string;
}

type CardData =
  | CategoryListCard
  | BrowseArticleCard
  | BrowseArticleCard[]
  | SearchArticleCard
  | SearchArticleCard[]
  | SearchResultsCard
  | NoResultsCard
  | CategoryNotFoundCard
  | StatsCard
  | SimpleResearchResultCard
  | ShopResultsCard
  | ShopLoadingCard
  | ShopListingCard[]
  | SubscriptionAddedCard
  | SubscriptionListCard
  | WhatsNewReportCard
  | WhatsNewLoadingCard
  | ToolSearchResultsCard
  | ToolAddingCard
  | ToolAddedCard
  | DocumentSavedCard;


/**
 * Generate help response for /help command
 */
function generateHelpResponse(): string {
  return `Available commands:

**Search & Browse**
/search <query> - Search the knowledge base
/browse [category] - Browse articles by category
/stats - View knowledge base statistics

**Research**
/research <topic> - Quick research on a topic
/deep-research <topic> - Multi-iteration deep research
/cancel - Cancel active deep research session

**Shopping**
/shop <product> - Search for product deals across retailers

**Subscriptions**
/subscribe <type> <id> [name] - Add a subscription source
  Types: youtube, newsletter, changelog, reddit, ebay, whats-new, creator
/unsubscribe <id> - Remove a subscription
/subscriptions [type] - List your subscriptions
/check-subs - Check subscriptions for new content

**Tools & Content**
/whats-new [days] - Get AI news briefing (default: 1 day)
/toolbelt <query or url> - Search tools or add from URL
/save <title> [category] - Save document to knowledge base

**Improvements**
/improve <description> - Submit an improvement request`;
}

/**
 * Agent response format
 */
interface AgentResponse {
  content: string;
  messageType: "text" | "result_card" | "error";
  cardData?: CardData;
}

/**
 * Handle /search command
 * Uses hybrid search (vector + keyword) for best results
 */
async function handleSearchCommand(
  query: string,
  ctx: ActionCtx,
): Promise<AgentResponse> {
  try {
    const searchResults = await ctx.runAction(
      api.documents.search.hybridSearch,
      {
        query,
        limit: 3,
      },
    );

    // No results found
    if (!searchResults || searchResults.length === 0) {
      return {
        content: `No results found`,
        messageType: "result_card",
        cardData: {
          card_type: "no_results",
          message: `No articles found matching "${query}"`,
        } as NoResultsCard,
      };
    }

    // Build article cards from search results
    const articleCards: SearchArticleCard[] = searchResults.map((doc: { _id: string; title: string; category: string; content?: string; score?: number }) => ({
      card_type: "article",
      title: doc.title,
      category: doc.category,
      snippet: doc.content
        ? doc.content.substring(0, 150) +
          (doc.content.length > 150 ? "..." : "")
        : "",
      document_id: doc._id,
      metadata: {
        relevance_score: doc.score,
      },
    }));

    return {
      content: `Found ${searchResults.length} article${searchResults.length === 1 ? "" : "s"} matching "${query}"`,
      messageType: "result_card",
      cardData: { card_type: "search_results", items: articleCards },
    };
  } catch (error) {
    return {
      content: `Sorry, I encountered an error while searching: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

/**
 * Handle /browse command
 * Browse documents by category
 */
async function handleBrowseCommand(
  categoryArg: string | undefined,
  ctx: ActionCtx,
): Promise<AgentResponse> {
  try {
    // No category arg - list all categories with counts
    if (!categoryArg) {
      const categoryCounts = await ctx.runQuery(
        api.documents.queries.countByCategory,
        {},
      );

      const categories = Object.entries(categoryCounts)
        .map(([name, count]) => ({ name, count: count as number }))
        .sort((a, b) => b.count - a.count);

      return {
        content: "Browse articles by category",
        messageType: "result_card",
        cardData: {
          card_type: "category_list",
          categories,
        } as CategoryListCard,
      };
    }

    // Validate category
    const normalizedCategory = categoryArg.toLowerCase().trim();
    if (!isValidCategory(normalizedCategory)) {
      return {
        content: `Category "${categoryArg}" not found. Valid categories: ${DOCUMENT_CATEGORIES.join(", ")}`,
        messageType: "result_card",
        cardData: {
          card_type: "category_not_found",
          valid_categories: [...DOCUMENT_CATEGORIES],
        } as CategoryNotFoundCard,
      };
    }

    // Fetch documents by category
    const listResult = await ctx.runQuery(api.documents.queries.list, {
      category: normalizedCategory,
      limit: 10,
    });

    const articles = listResult?.documents ?? [];

    if (!articles || articles.length === 0) {
      return {
        content: `No articles found in category "${categoryArg}"`,
        messageType: "text",
      };
    }

    // Build article cards
    const articleCards: BrowseArticleCard[] = articles.map((doc: { _id: string; title: string; date?: string; researchType?: string }) => ({
      card_type: "article",
      title: doc.title,
      date: doc.date || undefined,
      researchType: doc.researchType || undefined,
      document_id: doc._id,
    }));

    return {
      content: `Found ${listResult?.metadata?.totalCount ?? articles.length} article${(listResult?.metadata?.totalCount ?? articles.length) === 1 ? "" : "s"} in ${categoryArg}`,
      messageType: "result_card",
      cardData: { card_type: "search_results", items: articleCards },
    };
  } catch (error) {
    return {
      content: `Sorry, I encountered an error while browsing: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

/**
 * Handle /stats command
 * Return knowledge base statistics
 */
async function handleStatsCommand(ctx: ActionCtx): Promise<AgentResponse> {
  try {
    const categoryCounts = await ctx.runQuery(
      api.documents.queries.countByCategory,
      {},
    );

    const totalCount = Object.values(categoryCounts).reduce(
      (sum: number, count: unknown) => sum + (count as number),
      0,
    );

    const categoryBreakdown = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count: count as number }))
      .sort((a, b) => b.count - a.count);

    return {
      content: `Knowledge Base Statistics

Total Documents: ${totalCount}

By Category:
${categoryBreakdown.map(({ category, count }) => `  ${category}: ${count}`).join("\n")}`,
      messageType: "result_card",
      cardData: {
        card_type: "stats",
        total_count: totalCount,
        category_breakdown: categoryBreakdown,
      } as StatsCard,
    };
  } catch (error) {
    return {
      content: `Sorry, I encountered an error fetching statistics: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

// generateAIResponse removed: natural language messages are now dispatched to
// internal.chat.agent.run via ctx.scheduler.runAfter in the send action.

/**
 * Generate chat title using Z.ai GLM-4.5-Flash
 * Task #784: Auto-generate short descriptive chat titles
 */
// Max retries for scheduled retry (exponential backoff: 5s, 30s, 2min)
const TITLE_RETRY_DELAYS_MS = [5_000, 30_000, 120_000];
const TITLE_MAX_ATTEMPTS = 3; // inline retries per invocation
const TITLE_INLINE_RETRY_DELAY_MS = 1_000;

export const generateChatTitle = action({
  args: {
    conversationId: v.id("conversations"),
    attempt: v.optional(v.number()), // scheduled retry attempt (0-indexed)
  },
  handler: async (
    ctx,
    { conversationId, attempt = 0 },
  ): Promise<
    | { skipped: true; reason: string }
    | { success: false; error: string; willRetry: boolean }
    | { success: true; title: string }
  > => {
    // 1. Fetch conversation to check if user has set title
    const conversation = await ctx.runQuery(api.conversations.queries.get, {
      id: conversationId,
    });

    // Skip if user has manually set the title
    if (conversation?.titleSetByUser) {
      return { skipped: true, reason: "user_set_title" };
    }

    // Skip if title was already generated (another retry may have succeeded)
    const currentTitle = conversation?.title;
    if (
      currentTitle &&
      currentTitle !== "New Chat" &&
      currentTitle !== "Untitled Chat"
    ) {
      return { skipped: true, reason: "already_titled" };
    }

    // 2. Fetch first 3-5 messages
    const messages = await ctx.runQuery(
      api.chatMessages.queries.listByConversation,
      {
        conversationId,
        limit: 5,
      },
    );

    // Skip if not enough messages (need at least 2: user + agent)
    if (messages.length < 2) {
      return { skipped: true, reason: "insufficient_messages" };
    }

    // 3. Build context for title generation
    const context: string = messages
      .slice(0, 5)
      .reverse() // Reverse because listByConversation returns newest first
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n\n");

    // Helper: truncate title to max 50 chars
    const truncate = (t: string) =>
      t.length > 50 ? t.slice(0, 47) + "..." : t;

    // Helper: derive a fallback title from the first user message
    const fallbackTitle = (): string => {
      const firstUserMsg = messages
        .slice()
        .reverse()
        .find((m: { role: string; content: string }) => m.role === "user");
      if (!firstUserMsg) return "Untitled Chat";
      const content = firstUserMsg.content;
      // Strip leading slash commands for cleaner titles
      const cleaned = content.replace(/^\/\S+\s*/, "").trim();
      if (!cleaned) return "Untitled Chat";
      if (cleaned.length <= 50) return cleaned;
      const cut = cleaned.slice(0, 47);
      const lastSpace = cut.lastIndexOf(" ");
      return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "...";
    };

    // 4. Try AI title generation with inline retries
    let lastError: unknown = null;
    for (let i = 0; i < TITLE_MAX_ATTEMPTS; i++) {
      try {
        const result = await generateText({
          model: zaiFlash(),
          system:
            "Generate a short, descriptive title (3-5 words, max 50 chars) for this chat conversation. Return ONLY the title, no quotes or explanations.",
          prompt: `Conversation:\n\n${context}`,
        });

        const title: string = result.text?.trim() || "";
        if (title) {
          const truncatedTitle = truncate(title);
          await ctx.runMutation(api.conversations.mutations.update, {
            id: conversationId,
            title: truncatedTitle,
          });
          return { success: true, title: truncatedTitle };
        }

        // Empty response — count as failure, retry
        lastError = new Error("AI returned empty title");
      } catch (error) {
        lastError = error;
      }

      // Wait before inline retry (skip wait on last attempt)
      if (i < TITLE_MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, TITLE_INLINE_RETRY_DELAY_MS));
      }
    }

    // 5. All inline retries exhausted — schedule a delayed retry if attempts remain
    const errorMsg =
      lastError instanceof Error ? lastError.message : "api_error";
    console.error(
      `Title generation failed (attempt ${attempt + 1}/${TITLE_RETRY_DELAYS_MS.length + 1}):`,
      errorMsg,
    );

    if (attempt < TITLE_RETRY_DELAYS_MS.length) {
      const delay = TITLE_RETRY_DELAYS_MS[attempt];
      
      ctx.scheduler.runAfter(delay, api.chat.index.generateChatTitle, {
        conversationId,
        attempt: attempt + 1,
      });
      return { success: false, error: errorMsg, willRetry: true };
    }

    // 6. All retries exhausted — use fallback title from first user message
    const title = truncate(fallbackTitle());
    
    await ctx.runMutation(api.conversations.mutations.update, {
      id: conversationId,
      title,
    });
    return { success: true, title };
  },
});

/**
 * Send a chat message
 * AC-1: Persist user message and return AI response
 * AC-3: Route slash commands
 * AC-4: Handle AI errors
 * US-786: Support lazy conversation creation
 */
export const send = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    content: v.string(),
    messageType: v.optional(
      v.union(v.literal("text"), v.literal("slash_command")),
    ),
  },
  handler: async (
    ctx,
    { conversationId, content, messageType = "text" },
  ): Promise<{
    userMessageId: Id<"chatMessages">;
    agentMessageId: Id<"chatMessages"> | null;
    conversationId: Id<"conversations">;
  }> => {
    const now = Date.now();

    // US-786 AC-1: If no conversationId provided, create conversation first
    let finalConversationId = conversationId;
    if (!finalConversationId) {
      finalConversationId = await ctx.runMutation(
        api.conversations.mutations.create,
        {
          title: "New Chat",
        },
      );
    }

    // 1. Parse for slash commands (AC-3)
    const parsed = parseSlashCommand(content);
    const actualMessageType = parsed.isCommand ? "slash_command" : messageType;

    // 2. Persist user message (AC-1)
    const userMessageId: Id<"chatMessages"> = await ctx.runMutation(
      api.chatMessages.mutations.create,
      {
        conversationId: finalConversationId,
        role: "user",
        content,
        messageType: actualMessageType,
        createdAt: now,
      },
    );

    // 3. Update conversation metadata
    const preview =
      content.length > 100 ? content.slice(0, 97) + "..." : content;
    await ctx.runMutation(api.conversations.mutations.touch, {
      id: finalConversationId,
      lastMessagePreview: preview,
    });

    // 4. Route message and generate response
    let agentResponse: AgentResponse;

    if (parsed.isCommand) {
      // AC-3: Route slash commands
      if (parsed.command === "help") {
        agentResponse = {
          content: generateHelpResponse(),
          messageType: "text",
        };
      } else if (parsed.command === "search") {
        const query = parsed.args || "";
        if (!query) {
          agentResponse = {
            content: "Please provide a search query. Usage: /search <query>",
            messageType: "text",
          };
        } else {
          agentResponse = await handleSearchCommand(query, ctx);
        }
      } else if (parsed.command === "browse") {
        agentResponse = await handleBrowseCommand(parsed.args, ctx);
      } else if (parsed.command === "stats") {
        agentResponse = await handleStatsCommand(ctx);
      } else if (parsed.command === "shop") {
        const query = parsed.args || "";
        if (!query) {
          agentResponse = {
            content: "Please provide a product to search for. Usage: /shop <product>",
            messageType: "text",
          };
        } else {
          // Fire-and-forget: background action posts its own loading/result/error cards
          ctx.scheduler.runAfter(0, api.shop.index.startShopSearch, {
            conversationId: finalConversationId,
            query,
          });
          agentResponse = {
            content: `Searching for "${query}"...`,
            messageType: "text",
          };
        }
      } else if (parsed.command === "deep-research") {
        const topic = parsed.args || "";
        if (!topic) {
          agentResponse = {
            content: "Please provide a topic. Usage: /deep-research <topic>",
            messageType: "text",
          };
        } else {
          // Trigger async research workflow (fire-and-forget pattern)
          ctx.scheduler.runAfter(0, api.research.actions.startDeepResearch, {
            conversationId: finalConversationId,
            topic,
            maxIterations: 5,
          });

          agentResponse = {
            content: `Started deep research: "${topic}"`,
            messageType: "text",
          };
        }
      } else if (parsed.command === "research") {
        const topic = parsed.args || "";
        if (!topic) {
          agentResponse = {
            content: "Please provide a topic. Usage: /research <topic>",
            messageType: "text",
          };
        } else {
          // Trigger async research workflow (fire-and-forget pattern)
          ctx.scheduler.runAfter(0, api.research.actions.startSimpleResearch, {
            conversationId: finalConversationId,
            topic,
          });

          agentResponse = {
            content: `Researching: "${topic}"`,
            messageType: "text",
          };
        }
      } else if (parsed.command === "subscribe") {
        // /subscribe <type> <identifier> [name]
        const parts = (parsed.args || "").split(" ");
        const sourceType = parts[0] as "youtube" | "newsletter" | "changelog" | "reddit" | "ebay" | "whats-new" | "creator" | "github";
        const identifier = parts[1];
        const name = parts.slice(2).join(" ") || identifier;

        const validTypes = ["youtube", "newsletter", "changelog", "reddit", "ebay", "whats-new", "creator", "github"];
        if (!sourceType || !identifier) {
          agentResponse = {
            content: "Usage: /subscribe <type> <identifier> [name]\nTypes: youtube, newsletter, changelog, reddit, ebay, whats-new, creator",
            messageType: "text",
          };
        } else if (!validTypes.includes(sourceType)) {
          agentResponse = {
            content: `Invalid subscription type: ${sourceType}\nValid types: ${validTypes.join(", ")}`,
            messageType: "text",
          };
        } else {
          try {
            const result: { _id: string; url?: string } | null = await ctx.runMutation(
              api.subscriptions.mutations.add,
              {
                sourceType,
                identifier,
                name,
              }
            );
            agentResponse = {
              content: `Subscribed to ${name}`,
              messageType: "result_card",
              cardData: {
                card_type: "subscription_added",
                subscription_id: result?._id ?? "",
                source_type: sourceType,
                identifier,
                name,
                url: result?.url,
              } as SubscriptionAddedCard,
            };
          } catch (error) {
            agentResponse = {
              content: `Failed to add subscription: ${error instanceof Error ? error.message : "Unknown error"}`,
              messageType: "error",
            };
          }
        }
      } else if (parsed.command === "unsubscribe") {
        // /unsubscribe <id>
        const subscriptionId = parsed.args;
        if (!subscriptionId) {
          agentResponse = {
            content: "Usage: /unsubscribe <subscription_id>",
            messageType: "text",
          };
        } else {
          try {
            await ctx.runMutation(api.subscriptions.mutations.remove, {
              subscriptionId: subscriptionId as Id<"subscriptionSources">,
            });
            agentResponse = {
              content: `Unsubscribed successfully`,
              messageType: "text",
            };
          } catch (error) {
            agentResponse = {
              content: `Failed to unsubscribe: ${error instanceof Error ? error.message : "Unknown error"}`,
              messageType: "error",
            };
          }
        }
      } else if (parsed.command === "subscriptions") {
        // /subscriptions [type]
        const filterType = parsed.args as "youtube" | "newsletter" | "changelog" | "reddit" | "ebay" | "whats-new" | undefined;
        try {
          const subscriptions: Array<{ _id: string; sourceType: string; identifier: string; name: string; autoResearch: boolean; createdAt: number }> = await ctx.runQuery(
            api.subscriptions.queries.list,
            { sourceType: filterType || undefined }
          );

          if (subscriptions.length === 0) {
            agentResponse = {
              content: filterType
                ? `No ${filterType} subscriptions found`
                : "No subscriptions found. Use /subscribe to add one.",
              messageType: "text",
            };
          } else {
            agentResponse = {
              content: `Found ${subscriptions.length} subscription${subscriptions.length === 1 ? "" : "s"}`,
              messageType: "result_card",
              cardData: {
                card_type: "subscription_list",
                subscriptions: subscriptions.map((s) => ({
                  id: s._id,
                  source_type: s.sourceType,
                  identifier: s.identifier,
                  name: s.name,
                  auto_research: s.autoResearch,
                  created_at: s.createdAt,
                })),
                filter_type: filterType,
              } as SubscriptionListCard,
            };
          }
        } catch (error) {
          agentResponse = {
            content: `Failed to list subscriptions: ${error instanceof Error ? error.message : "Unknown error"}`,
            messageType: "error",
          };
        }
      } else if (parsed.command === "check-subs") {
        // /check-subs - trigger subscription check (fire-and-forget)
        try {
          ctx.scheduler.runAfter(0, api.subscriptions.actions.check, {});
          agentResponse = {
            content: "Checking subscriptions for new content...",
            messageType: "text",
          };
        } catch (error) {
          agentResponse = {
            content: `Failed to trigger subscription check: ${error instanceof Error ? error.message : "Unknown error"}`,
            messageType: "error",
          };
        }
      } else if (parsed.command === "whats-new") {
        // /whats-new [days]
        const rawDays = parsed.args ? parseInt(parsed.args, 10) : 1
        const days = Number.isNaN(rawDays) ? 1 : Math.max(1, Math.min(30, rawDays));
        try {
          const reportData = await ctx.runQuery(
            api.whatsNew.queries.getLatestReport,
            {}
          );

          if (!reportData || !reportData.report) {
            // No report exists, trigger generation
            ctx.scheduler.runAfter(0, api.whatsNew.actions.generate, { days });
            agentResponse = {
              content: "Generating AI news briefing...",
              messageType: "result_card",
              cardData: {
                card_type: "whats_new_loading",
                message: `Generating ${days}-day briefing...`,
              } as WhatsNewLoadingCard,
            };
          } else {
            const report = reportData.report;
            const summaryJson = report?.summaryJson;

            agentResponse = {
              content: `What's New in AI (${report?.days} days)`,
              messageType: "result_card",
              cardData: {
                card_type: "whats_new_report",
                report_id: report?._id ?? "",
                period_start: report?.periodStart ?? 0,
                period_end: report?.periodEnd ?? 0,
                days: report?.days ?? 0,
                findings_count: report?.findingsCount ?? 0,
                discovery_count: report?.discoveryCount ?? 0,
                release_count: report?.releaseCount ?? 0,
                trend_count: report?.trendCount ?? 0,
                content: reportData.content,
                is_from_today: reportData.isFromToday ?? false,
                // Extended fields
                top_engagement_velocity: summaryJson?.topEngagementVelocity,
                total_corroboration_count: summaryJson?.totalCorroborationCount,
                sources: summaryJson?.sources,
              } as WhatsNewReportCard,
            };
          }
        } catch (error) {
          agentResponse = {
            content: `Failed to get news briefing: ${error instanceof Error ? error.message : "Unknown error"}`,
            messageType: "error",
          };
        }
      } else if (parsed.command === "toolbelt") {
        // /toolbelt <query or url> - Smart routing
        const input = parsed.args || "";
        if (!input) {
          agentResponse = {
            content: "Usage: /toolbelt <query or url>\n\nExamples:\n- /toolbelt database migrations (search)\n- /toolbelt https://orm.drizzle.team (add tool)",
            messageType: "text",
          };
        } else {
          // Simple URL detection (starts with http:// or https://)
          const isUrl = /^https?:\/\//.test(input);

          if (isUrl) {
            // Insert the loading card message first so we have its ID.
            // The scheduled action will UPDATE this message in place once the
            // tool is saved (replacing the spinner with a tool_added card).
            const loadingMessageId: Id<"chatMessages"> = await ctx.runMutation(
              api.chatMessages.mutations.create,
              {
                conversationId: finalConversationId,
                role: "agent" as const,
                content: `Adding tool from ${input}...`,
                messageType: "result_card" as const,
                cardData: {
                  card_type: "tool_adding",
                  url: input,
                  message: "Fetching metadata...",
                },
                createdAt: Date.now(),
              },
            );

            await ctx.scheduler.runAfter(
              0,
              api.toolbelt.actions.addFromUrl,
              {
                url: input,
                conversationId: finalConversationId,
                loadingMessageId,
              },
            );

            // Return early — we've already persisted the agent message.
            return {
              userMessageId,
              agentMessageId: loadingMessageId,
              conversationId: finalConversationId,
            };
          } else {
            // Search toolbelt
            try {
              const results: Array<{ _id: string; title: string; description?: string; category: string; sourceType: string; language?: string; tags?: string[]; score?: number }> = await ctx.runQuery(
                api.toolbelt.queries.fullTextSearch,
                { query: input, limit: 5 }
              );

              if (results.length === 0) {
                agentResponse = {
                  content: `No tools found for "${input}"`,
                  messageType: "text",
                };
              } else {
                agentResponse = {
                  content: `Found ${results.length} tool${results.length === 1 ? "" : "s"} matching "${input}"`,
                  messageType: "result_card",
                  cardData: {
                    card_type: "tool_search_results",
                    query: input,
                    results: results.map((t) => ({
                      id: t._id,
                      title: t.title,
                      description: t.description,
                      category: t.category,
                      source_type: t.sourceType,
                      language: t.language,
                      tags: t.tags,
                      score: t.score || 0,
                    })),
                  } as ToolSearchResultsCard,
                };
              }
            } catch (error) {
              agentResponse = {
                content: `Failed to search toolbelt: ${error instanceof Error ? error.message : "Unknown error"}`,
                messageType: "error",
              };
            }
          }
        }
      } else if (parsed.command === "save") {
        // /save <title> [category]
        const parts = (parsed.args || "").split(" ");
        const title = parts[0];
        const category = parts[1];

        if (!title) {
          agentResponse = {
            content: "Usage: /save <title> [category]\n\nSaves the conversation context as a document to the knowledge base.",
            messageType: "text",
          };
        } else {
          try {
            // Create a summary of the conversation for the document content
            const messages = await ctx.runQuery(
              api.chatMessages.queries.listByConversation,
              { conversationId: finalConversationId, limit: 20 }
            );

            const conversationSummary = messages
              .reverse()
              .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
              .join("\n\n");

            const result: { documentId: string } = await ctx.runAction(
              api.documents.storage.createWithEmbedding,
              {
                title,
                content: conversationSummary,
                category: category || "notes",
                status: "complete",
              }
            );

            agentResponse = {
              content: `Saved "${title}" to knowledge base`,
              messageType: "result_card",
              cardData: {
                card_type: "document_saved",
                document_id: result.documentId,
                title,
                category: category || "notes",
              } as DocumentSavedCard,
            };
          } catch (error) {
            agentResponse = {
              content: `Failed to save document: ${error instanceof Error ? error.message : "Unknown error"}`,
              messageType: "error",
            };
          }
        }
      } else if (parsed.command === "improve") {
        const description = parsed.args || "";
        if (!description) {
          agentResponse = {
            content:
              "Please provide a description. Usage: /improve <description>",
            messageType: "text",
          };
        } else {
          try {
            await ctx.runMutation(api.improvements.mutations.submit, {
              description,
              sourceScreen: "chat",
            });
            agentResponse = {
              content: `Improvement submitted: "${description.slice(0, 80)}". It will be processed through AI dedup analysis.`,
              messageType: "text",
            };
          } catch (error) {
            agentResponse = {
              content: `Failed to submit improvement: ${error instanceof Error ? error.message : "Unknown error"}`,
              messageType: "error",
            };
          }
        }
      } else if (parsed.command === "cancel") {
        // TODO: Implement cancel logic
        agentResponse = {
          content: "Cancel functionality will be available soon!",
          messageType: "text",
        };
      } else {
        agentResponse = {
          content: `Unknown command: /${parsed.command}. Type /help to see available commands.`,
          messageType: "text",
        };
      }
    } else {
      // Natural language chat - dispatch to agent.run (agent persists its own response)
      await ctx.scheduler.runAfter(0, internal.chat.agent.run, {
        conversationId: finalConversationId,
      });

      // 6. Auto-generate chat title after first exchange (natural language path)
      const messageCount = await ctx
        .runQuery(api.chatMessages.queries.listByConversation, {
          conversationId: finalConversationId,
          limit: 100,
        })
        .then((msgs: unknown[]) => msgs.length);

      if (messageCount >= 1) {
        const currentConversation = await ctx.runQuery(
          api.conversations.queries.get,
          { id: finalConversationId },
        );
        const title = currentConversation?.title;
        const shouldGenerateTitle =
          !title || title === "New Chat" || title === "Untitled Chat";

        if (shouldGenerateTitle) {
          ctx.scheduler.runAfter(0, api.chat.index.generateChatTitle, {
            conversationId: finalConversationId,
          });
        }
      }

      return {
        userMessageId,
        agentMessageId: null,
        conversationId: finalConversationId,
      };
    }

    // 5. Persist agent response (slash command path only)
    const agentMessageId: Id<"chatMessages"> = await ctx.runMutation(
      api.chatMessages.mutations.create,
      {
        conversationId: finalConversationId,
        role: "agent",
        content: agentResponse.content,
        messageType: agentResponse.messageType,
        cardData: agentResponse.cardData || undefined,
        createdAt: Date.now(),
      },
    );

    // 6. Auto-generate chat title after first exchange
    // Check if we should generate a title (2+ messages, no custom title yet)
    const messageCount = await ctx
      .runQuery(api.chatMessages.queries.listByConversation, {
        conversationId: finalConversationId,
        limit: 100, // Get all messages to count accurately
      })
      .then((msgs: unknown[]) => msgs.length);

    if (messageCount >= 2) {
      const currentConversation = await ctx.runQuery(
        api.conversations.queries.get,
        {
          id: finalConversationId,
        },
      );
      const title = currentConversation?.title;
      const shouldGenerateTitle =
        !title || title === "New Chat" || title === "Untitled Chat";

      if (shouldGenerateTitle) {
        // Fire-and-forget: trigger title generation async
        // This doesn't block the chat response
        ctx.scheduler.runAfter(0, api.chat.index.generateChatTitle, {
          conversationId: finalConversationId,
        });
      }
    }

    return {
      userMessageId,
      agentMessageId,
      conversationId: finalConversationId,
    };
  },
});
