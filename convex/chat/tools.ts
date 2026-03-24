/**
 * Agent Tools for Chat Assistant
 *
 * 13 tool definitions using Vercel AI SDK `tool()` with zod schemas.
 * These tools give the chat agent capabilities across all holocron features.
 * No `execute` functions — tool calls are returned in result.toolCalls
 * and handled by agent.ts via the human-in-the-loop pattern.
 */

import { tool } from "ai";
import { z } from "zod";

/**
 * search_knowledge_base - Search documents in the knowledge base by query text
 */
const search_knowledge_base = tool({
  description:
    "Search the personal knowledge base for documents matching a query. " +
    "Use this when the user asks about something that might be in their saved documents, " +
    "notes, or research. Returns ranked results with titles, summaries, and categories.",
  inputSchema: z.object({
    query: z.string().describe("The search query to find relevant documents"),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of results to return (default 5)"),
  }),
});

/**
 * browse_category - Browse documents by category
 */
const browse_category = tool({
  description:
    "Browse all documents within a specific category in the knowledge base. " +
    "Use this when the user wants to explore a topic area or see everything saved " +
    "under a particular category like 'research', 'articles', or 'notes'.",
  inputSchema: z.object({
    category: z
      .string()
      .describe(
        "The category name to browse (e.g. 'research', 'articles', 'notes')",
      ),
  }),
});

/**
 * knowledge_base_stats - Get overall knowledge base statistics
 */
const knowledge_base_stats = tool({
  description:
    "Get statistics and counts for the entire knowledge base, broken down by category. " +
    "Use this when the user wants an overview of what's in their knowledge base, " +
    "how many documents exist, or what categories are available.",
  inputSchema: z.object({}),
});

/**
 * quick_research - Perform a quick web research on a topic
 */
const quick_research = tool({
  description:
    "Do a quick web research on a topic and return a concise summary with sources. " +
    "Use this when the user wants fast, current information about something. " +
    "Best for straightforward questions that need up-to-date web data.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The research topic or question to investigate"),
  }),
});

/**
 * deep_research - Launch comprehensive multi-iteration research
 */
const deep_research = tool({
  description:
    "Launch a comprehensive, multi-iteration deep research session on a topic. " +
    "Use this when the user needs thorough, in-depth research with multiple search passes, " +
    "synthesis, and a detailed report. Takes longer but produces high-quality results. " +
    "Best for complex topics requiring broad coverage and multiple perspectives.",
  inputSchema: z.object({
    topic: z
      .string()
      .describe("The research topic or question to investigate deeply"),
    maxIterations: z
      .number()
      .optional()
      .default(3)
      .describe("Maximum number of research iterations (default 3)"),
  }),
});

/**
 * shop_search - Search for products across retailers
 */
const shop_search = tool({
  description:
    "Search for products across retailers including eBay and other sources. " +
    "Use this when the user wants to find items to buy, compare prices, " +
    "or check availability of products. Supports filtering by condition and max price.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The product search query (e.g. 'mechanical keyboard', 'vintage camera')"),
    condition: z
      .enum(["new", "used", "any"])
      .optional()
      .describe("Filter by item condition: 'new', 'used', or 'any' (default)"),
    priceMax: z
      .number()
      .optional()
      .describe("Maximum price filter in USD"),
  }),
});

/**
 * subscribe - Subscribe to a content source
 */
const subscribe = tool({
  description:
    "Subscribe to a content source to receive updates. Supported sources include " +
    "YouTube channels, newsletters, changelogs, Reddit communities, eBay saved searches, " +
    "what's-new feeds, and individual creators. " +
    "Use this when the user wants to follow and receive updates from a source.",
  inputSchema: z.object({
    sourceType: z
      .enum([
        "youtube",
        "newsletter",
        "changelog",
        "reddit",
        "ebay",
        "whats-new",
        "creator",
      ])
      .describe("The type of content source to subscribe to"),
    identifier: z
      .string()
      .describe(
        "The unique identifier for the source (URL, channel ID, subreddit name, etc.)",
      ),
    name: z
      .string()
      .describe("A friendly display name for this subscription"),
  }),
});

/**
 * unsubscribe - Remove a subscription
 */
const unsubscribe = tool({
  description:
    "Remove an existing subscription so you no longer receive updates from that source. " +
    "Use this when the user wants to stop following a channel, feed, or content source. " +
    "Requires the subscription ID from list_subscriptions.",
  inputSchema: z.object({
    sourceId: z
      .string()
      .describe("The subscription ID to remove (from list_subscriptions)"),
  }),
});

/**
 * list_subscriptions - List all active subscriptions
 */
const list_subscriptions = tool({
  description:
    "List all active subscriptions the user is currently following. " +
    "Use this when the user wants to see what they're subscribed to, " +
    "manage their subscriptions, or find a subscription ID to unsubscribe.",
  inputSchema: z.object({}),
});

/**
 * check_subscriptions - Check subscriptions for new content
 */
const check_subscriptions = tool({
  description:
    "Check one or all subscriptions for new content and updates. " +
    "Use this when the user wants to see what's new from their subscribed sources. " +
    "Optionally target a specific subscription or check everything at once.",
  inputSchema: z.object({
    sourceId: z
      .string()
      .optional()
      .describe(
        "Optional subscription ID to check. If omitted, checks all subscriptions.",
      ),
  }),
});

/**
 * whats_new - Generate a what's-new report on AI and developer tools
 */
const whats_new = tool({
  description:
    "Generate a curated what's-new report covering the latest AI models, developer tools, " +
    "software releases, and technology trends. " +
    "Use this when the user wants to catch up on recent developments in AI and tech. " +
    "Can be focused on all news, specific tools, releases, or emerging trends.",
  inputSchema: z.object({
    days: z
      .number()
      .optional()
      .default(7)
      .describe("Number of days to look back for news (default 7)"),
    focus: z
      .enum(["all", "tools", "releases", "trends"])
      .optional()
      .describe(
        "What to focus on: 'all' (default), 'tools', 'releases', or 'trends'",
      ),
  }),
});

/**
 * toolbelt_search - Search the developer toolbelt
 */
const toolbelt_search = tool({
  description:
    "Search the curated developer toolbelt for tools, libraries, and utilities. " +
    "Use this when the user is looking for a specific developer tool, " +
    "wants to find the right library for a task, or is exploring their saved tools collection.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "The search query for finding tools (e.g. 'state management', 'CSS framework', 'CLI tool')",
      ),
  }),
});

/**
 * save_document - Save content to the knowledge base
 */
const save_document = tool({
  description:
    "Save a document or piece of content to the personal knowledge base. " +
    "Use this when the user wants to save research findings, notes, articles, " +
    "or any content for future reference. Requires a title, content body, and category.",
  inputSchema: z.object({
    title: z.string().describe("The title for the document"),
    content: z
      .string()
      .describe("The full text content to save"),
    category: z
      .string()
      .describe(
        "The category to file the document under (e.g. 'research', 'notes', 'articles')",
      ),
  }),
});

/**
 * agentTools - All 13 chat agent tools
 */
export const agentTools = {
  search_knowledge_base,
  browse_category,
  knowledge_base_stats,
  quick_research,
  deep_research,
  shop_search,
  subscribe,
  unsubscribe,
  list_subscriptions,
  check_subscriptions,
  whats_new,
  toolbelt_search,
  save_document,
};
