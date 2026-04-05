import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

const MAX_VOICE_EXCHANGES = 20;
const MAX_CHARS_PER_EXCHANGE = 200;

/**
 * Base system prompt for the Holocron voice assistant.
 *
 * Intent → tool mapping keeps the model from answering from memory.
 * All 21 tools are listed so the model always knows which tool to call.
 *
 * Keep this under ~1500 chars. Language instruction appended dynamically.
 */
const BASE_VOICE_SYSTEM_PROMPT = `You are the Holocron voice assistant. ALWAYS call tools — never answer from memory.

INTENT → TOOL:
• Search knowledge base → search_knowledge_base
• Browse a category → browse_category
• KB stats → knowledge_base_stats
• Save document → save_document
• Update document → update_document
• Get document → get_document
• Quick web research → quick_research
• Deep/comprehensive research → deep_research
• Shop / find products → shop_search
• Subscribe to source → subscribe
• Unsubscribe → unsubscribe
• List subscriptions → list_subscriptions
• Check for new content → check_subscriptions
• AI/tech news, what's new → whats_new
• Find developer tools → toolbelt_search
• Analyze a GitHub repo → assimilate
• Submit improvement/feature request → add_improvement
• Search improvements → search_improvements
• Get improvement details → get_improvement
• List improvements → list_improvements
• Go to a screen → navigate_app

For long-running tasks (deep research, repo analysis, shopping) say "I've started that, it'll be ready in your chat shortly." Use the most specific tool when multiple match. Before any tool call, briefly announce what you're doing. Results arrive later as a message starting with '[Background task completed]' — summarize them conversationally.`;

/**
 * Internal query that builds voice instructions for a conversation.
 *
 * Reads the last 20 user/assistant chatMessages directly via the
 * by_conversation index (desc) — no token-budget arithmetic needed
 * since voice context is capped by exchange count and char truncation.
 *
 * @param args.conversationId - The conversation to build instructions for
 * @returns Combined system prompt + conversation history as a string
 */
export const buildVoiceInstructions = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    // Look up user's preferred voice language
    const prefs = await ctx.db.query("userPreferences").first();
    const language = prefs?.voiceLanguage ?? "English";
    const systemPrompt = `${BASE_VOICE_SYSTEM_PROMPT}\n\nAlways respond in ${language}.`;

    // Read last 20 chatMessages for this conversation, newest first
    const rawMessages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(MAX_VOICE_EXCHANGES * 2); // fetch extra to account for non-user/assistant messages

    // Filter to user/assistant exchanges only, take last MAX_VOICE_EXCHANGES
    const exchanges = rawMessages
      .filter((m) => m.role === "user" || m.role === "agent")
      .slice(0, MAX_VOICE_EXCHANGES)
      .reverse(); // chronological order (oldest first)

    // If no exchanges, return just the system prompt with language
    if (exchanges.length === 0) {
      return systemPrompt;
    }

    // Truncate each exchange to ~200 chars
    const truncatedExchanges = exchanges.map((msg) => {
      const truncated =
        msg.content.length > MAX_CHARS_PER_EXCHANGE
          ? msg.content.slice(0, MAX_CHARS_PER_EXCHANGE) + "..."
          : msg.content;
      return `${msg.role}: ${truncated}`;
    });

    // Combine system prompt with conversation history
    const conversationHistory = truncatedExchanges.join("\n\n");
    return `${systemPrompt}\n\nConversation history:\n\n${conversationHistory}`;
  },
});
