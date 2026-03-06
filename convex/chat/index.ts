"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

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

type CardData =
  | CategoryListCard
  | BrowseArticleCard
  | BrowseArticleCard[]
  | SearchArticleCard
  | SearchArticleCard[]
  | NoResultsCard
  | CategoryNotFoundCard
  | StatsCard;

/**
 * Valid document categories
 */
const VALID_CATEGORIES = ["code", "design", "business", "llm-prompt", "other"] as const;
type DocumentCategory = (typeof VALID_CATEGORIES)[number];

/**
 * Generate help response for /help command
 */
function generateHelpResponse(): string {
  return `Available commands:

/help - Show this help message
/search <query> - Search the knowledge base
/browse [category] - Browse articles by category
/stats - View knowledge base statistics
/deep-research <topic> - Start multi-iteration deep research
/resume <session-id> - Resume a previous research session
/cancel - Cancel active deep research session`;
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
async function handleSearchCommand(query: string, ctx: any): Promise<AgentResponse> {
  try {
    const searchResults = await ctx.runQuery(api.documents.queries.fullTextSearch, {
      query,
      limit: 10,
    });

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
        ? doc.content.substring(0, 150) + (doc.content.length > 150 ? "..." : "")
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
async function handleBrowseCommand(categoryArg: string | undefined, ctx: any): Promise<AgentResponse> {
  try {
    // No category arg - list all categories with counts
    if (!categoryArg) {
      const categoryCounts = await ctx.runQuery(api.documents.queries.countByCategory, {});

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
    if (!VALID_CATEGORIES.includes(normalizedCategory as DocumentCategory)) {
      return {
        content: `Category "${categoryArg}" not found. Valid categories: ${VALID_CATEGORIES.join(", ")}`,
        messageType: "result_card",
        cardData: {
          card_type: "category_not_found",
          valid_categories: [...VALID_CATEGORIES],
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
    const categoryCounts = await ctx.runQuery(api.documents.queries.countByCategory, {});

    const totalCount = Object.values(categoryCounts).reduce((sum: number, count: any) => sum + (count as number), 0);

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
  ctx: any
): Promise<AgentResponse> {
  try {
    // Detect natural language searches (questions, what/how/why queries)
    const searchPatterns = [
      /^(what|how|who|where|when|why|which|can you|tell me|explain)/i,
      /\?$/,
    ];
    const looksLikeSearch = searchPatterns.some((pattern) => pattern.test(content.trim()));

    if (looksLikeSearch) {
      return await handleSearchCommand(content, ctx);
    }

    // Simple pattern matching for demo purposes
    // In production, this would call an actual AI service
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes("hello") || lowerContent.includes("hi")) {
      return {
        content: "Hello! I'm your research assistant. How can I help you today?",
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
      content: "I received your message. Full AI responses will be available soon!",
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
 * Send a chat message
 * AC-1: Persist user message and return AI response
 * AC-3: Route slash commands
 * AC-4: Handle AI errors
 */
export const send = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    messageType: v.optional(v.union(v.literal("text"), v.literal("slash_command"))),
  },
  handler: async (ctx, { conversationId, content, messageType = "text" }): Promise<{
    userMessageId: any;
    agentMessageId: any;
  }> => {
    const now = Date.now();

    // 1. Parse for slash commands (AC-3)
    const parsed = parseSlashCommand(content);
    const actualMessageType = parsed.isCommand ? "slash_command" : messageType;

    // 2. Persist user message (AC-1)
    const userMessageId: any = await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "user",
      content,
      messageType: actualMessageType,
      createdAt: now,
    });

    // 3. Update conversation metadata
    const preview = content.length > 100 ? content.slice(0, 97) + "..." : content;
    await ctx.runMutation(api.conversations.mutations.touch, {
      id: conversationId,
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
            conversationId,
            topic,
            maxIterations: 5,
          });

          agentResponse = {
            content: `Started deep research: "${topic}"`,
            messageType: "text",
          };
        }
      } else if (parsed.command === "resume") {
        const sessionId = parsed.args || "";
        if (!sessionId) {
          agentResponse = {
            content: "Please provide a session ID. Usage: /resume <session-id>",
            messageType: "text",
          };
        } else {
          // TODO: Implement resume logic
          agentResponse = {
            content: `Resume functionality for session "${sessionId}" will be available soon!`,
            messageType: "text",
          };
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
    const agentMessageId: any = await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId,
      role: "agent",
      content: agentResponse.content,
      messageType: agentResponse.messageType,
      cardData: agentResponse.cardData || undefined,
      createdAt: Date.now(),
    });

    return {
      userMessageId,
      agentMessageId,
    };
  },
});
