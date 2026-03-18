"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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
  documentId: string;
}

interface SearchArticleCard {
  card_type: "article";
  title: string;
  category: string;
  snippet: string;
  documentId: string;
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
/whats-new [days] - Get AI news briefing (default: 7 days)
/toolbelt <query or url> - Search tools or add from URL
/save <title> [category] - Save document to knowledge base`;
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
 * Uses full-text search (hybrid search requires embeddings, deferred to later)
 */
async function handleSearchCommand(
  query: string,
  ctx: any,
): Promise<AgentResponse> {
  try {
    const searchResults = await ctx.runQuery(
      api.documents.queries.fullTextSearch,
      {
        query,
        limit: 10,
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
    const articleCards: SearchArticleCard[] = searchResults.map((doc: any) => ({
      card_type: "article",
      title: doc.title,
      category: doc.category,
      snippet: doc.content
        ? doc.content.substring(0, 150) +
          (doc.content.length > 150 ? "..." : "")
        : "",
      documentId: doc._id,
      metadata: {
        relevance_score: doc.score,
      },
    }));

    return {
      content: `Found ${searchResults.length} article${searchResults.length === 1 ? "" : "s"} matching "${query}"`,
      messageType: "result_card",
      cardData: articleCards,
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
  ctx: any,
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
    const articles = await ctx.runQuery(api.documents.queries.list, {
      category: normalizedCategory,
      limit: 10,
    });

    if (!articles || articles.length === 0) {
      return {
        content: `No articles found in category "${categoryArg}"`,
        messageType: "text",
      };
    }

    // Build article cards
    const articleCards: BrowseArticleCard[] = articles.map((doc: any) => ({
      card_type: "article",
      title: doc.title,
      date: doc.date || undefined,
      researchType: doc.researchType || undefined,
      documentId: doc._id,
    }));

    return {
      content: `Found ${articles.length} article${articles.length === 1 ? "" : "s"} in ${categoryArg}`,
      messageType: "result_card",
      cardData: articleCards,
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
async function handleStatsCommand(ctx: any): Promise<AgentResponse> {
  try {
    const categoryCounts = await ctx.runQuery(
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

/**
 * Generate AI response for natural language messages
 * AC-1: AI responds to user messages
 * AC-4: Handle AI failures gracefully
 */
async function generateAIResponse(
  content: string,
  ctx: any,
): Promise<AgentResponse> {
  try {
    // Detect natural language searches (questions, what/how/why queries)
    const searchPatterns = [
      /^(what|how|who|where|when|why|which|can you|tell me|explain)/i,
      /\?$/,
    ];
    const looksLikeSearch = searchPatterns.some((pattern) =>
      pattern.test(content.trim()),
    );

    if (looksLikeSearch) {
      return await handleSearchCommand(content, ctx);
    }

    // Simple pattern matching for demo purposes
    // In production, this would call an actual AI service
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes("hello") || lowerContent.includes("hi")) {
      return {
        content:
          "Hello! I'm your research assistant. How can I help you today?",
        messageType: "text",
      };
    }

    if (lowerContent.includes("help")) {
      return {
        content:
          "I can help you search your knowledge base, conduct research, and manage articles. Try asking me a question or use /help to see available commands.",
        messageType: "text",
      };
    }

    // Default response
    return {
      content:
        "I received your message. Full AI responses will be available soon!",
      messageType: "text",
    };
  } catch (error) {
    // AC-4: Return error message on AI failure
    return {
      content: `Sorry, I encountered an error generating a response: ${error instanceof Error ? error.message : "Unknown error"}`,
      messageType: "error",
    };
  }
}

/**
 * Generate chat title using Z.ai GLM-4.5-Flash
 * Task #784: Auto-generate short descriptive chat titles
 */
export const generateChatTitle = action({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (
    ctx,
    { conversationId },
  ): Promise<
    | { skipped: true; reason: string }
    | { success: false; error: string }
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
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n\n");

    try {
      // 4. Call Z.ai GLM-4.5 Flash using AI SDK
      const result = await generateText({
        model: zaiFlash(),
        system:
          "Generate a short, descriptive title (3-5 words, max 50 chars) for this chat conversation. Return ONLY the title, no quotes or explanations.",
        prompt: `Conversation:\n\n${context}`,
      });

      const title: string = result.text?.trim() || "Untitled Chat";

      // 5. Truncate if too long (max 50 chars)
      const truncatedTitle: string =
        title.length > 50 ? title.slice(0, 47) + "..." : title;

      // 6. Update conversation title (not user-set, so titleSetByUser stays false/undefined)
      await ctx.runMutation(api.conversations.mutations.update, {
        id: conversationId,
        title: truncatedTitle,
      });

      return { success: true, title: truncatedTitle };
    } catch (error) {
      console.error("Title generation error:", error);
      return { success: false, error: error instanceof Error ? error.message : "api_error" };
    }
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
    userMessageId: any;
    agentMessageId: any;
    conversationId: any;
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
    const userMessageId: any = await ctx.runMutation(
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
          // Call shop search action directly
          const shopResult: any = await ctx.runAction(
            api.shop.index.startShopSearch,
            {
              conversationId: finalConversationId,
              query,
            }
          );

          // Fetch listings if we got results
          if (shopResult.totalListings > 0) {
            const listingsData = await ctx.runQuery(
              api.shop.queries.getShopListings,
              {
                sessionId: shopResult.sessionId,
                limit: 10,
                excludeDuplicates: true,
                sortBy: "dealScore",
              }
            );

            const listings: ShopListingCard[] = (listingsData || []).map((l: any) => ({
              card_type: "shop_listing",
              listing_id: l._id,
              title: l.title,
              price: l.price,
              original_price: l.originalPrice,
              currency: l.currency || "USD",
              condition: l.condition,
              retailer: l.retailer,
              seller: l.seller,
              seller_rating: l.sellerRating,
              url: l.url,
              image_url: l.imageUrl,
              in_stock: l.inStock ?? true,
              deal_score: l.dealScore,
            }));

            agentResponse = {
              content: `Found ${shopResult.totalListings} product${shopResult.totalListings === 1 ? "" : "s"} for "${query}"`,
              messageType: "result_card",
              cardData: {
                card_type: "shop_results",
                session_id: shopResult.sessionId,
                query,
                total_listings: shopResult.totalListings,
                best_deal_id: shopResult.bestDealId,
                listings,
                status: shopResult.status,
                duration_ms: shopResult.durationMs,
              } as ShopResultsCard,
            };
          } else {
            agentResponse = {
              content: `No products found for "${query}". Try a different search term.`,
              messageType: "text",
            };
          }
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
          // Call simple research action directly (synchronous, completes quickly)
          const researchResult: any = await ctx.runAction(
            api.research.actions.startSimpleResearch,
            {
              conversationId: finalConversationId,
              topic,
            }
          );

          agentResponse = {
            content: researchResult.summary,
            messageType: "result_card",
            cardData: {
              card_type: "simple_research_result",
              session_id: researchResult.sessionId,
              topic,
              summary: researchResult.summary,
              confidence: researchResult.confidence,
              duration_ms: researchResult.durationMs,
            },
          };
        }
      } else if (parsed.command === "subscribe") {
        // /subscribe <type> <identifier> [name]
        const parts = (parsed.args || "").split(" ");
        const sourceType = parts[0] as "youtube" | "newsletter" | "changelog" | "reddit" | "ebay" | "whats-new" | "creator";
        const identifier = parts[1];
        const name = parts.slice(2).join(" ") || identifier;

        const validTypes = ["youtube", "newsletter", "changelog", "reddit", "ebay", "whats-new", "creator"];
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
            const result: any = await ctx.runMutation(
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
                subscription_id: result._id,
                source_type: sourceType,
                identifier,
                name,
                url: result.url,
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
              subscriptionId: subscriptionId as any,
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
          const subscriptions: any[] = await ctx.runQuery(
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
                subscriptions: subscriptions.map((s: any) => ({
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
        const days = parsed.args ? parseInt(parsed.args, 10) : 7;
        try {
          const reportData: any = await ctx.runQuery(
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
            agentResponse = {
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
            // Fire-and-forget: add tool from URL
            // For now, return a loading state (tool storage action would be implemented separately)
            agentResponse = {
              content: `Adding tool from ${input}...`,
              messageType: "result_card",
              cardData: {
                card_type: "tool_adding",
                url: input,
                message: "Fetching metadata...",
              } as ToolAddingCard,
            };
            // TODO: ctx.scheduler.runAfter(0, api.toolbelt.actions.addFromUrl, { url: input });
          } else {
            // Search toolbelt
            try {
              const results: any[] = await ctx.runQuery(
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
              .map((m: any) => `${m.role}: ${m.content}`)
              .join("\n\n");

            const result: any = await ctx.runAction(
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
      // Natural language chat - call AI (AC-1, AC-4)
      agentResponse = await generateAIResponse(content, ctx);
    }

    // 5. Persist agent response
    const agentMessageId: any = await ctx.runMutation(
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
      .then((msgs: any[]) => msgs.length);

    if (messageCount >= 2) {
      const currentConversation = await ctx.runQuery(
        api.conversations.queries.get,
        {
          id: finalConversationId,
        },
      );
      const shouldGenerateTitle =
        !currentConversation?.title || currentConversation.title === "New Chat";

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
