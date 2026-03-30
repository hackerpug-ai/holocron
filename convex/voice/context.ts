import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { buildConversationContext } from "../chat/context";

const VOICE_TOKEN_BUDGET = 8000;
const MAX_VOICE_EXCHANGES = 20;
const MAX_CHARS_PER_EXCHANGE = 200;

/**
 * Base system prompt for the Holocron voice assistant.
 * Establishes the voice assistant's role and behavior.
 * The language instruction is appended dynamically from user preferences.
 */
const BASE_VOICE_SYSTEM_PROMPT = `You are the Holocron voice assistant. Tools: knowledge base search/browse; quick and deep research; product shopping; subscriptions (YouTube, Reddit, newsletters, changelogs, eBay); What's New in AI/tech; developer toolbelt; document management; repo analysis; improvement requests; app navigation. For long-running tasks (deep research, repo analysis, shopping), say "I've started that, it'll be ready in your chat shortly." Use the most specific tool when multiple match. Before any tool call, briefly announce what you're doing. When a call is pending and user asks, say you're still waiting. Tools like knowledge base search, saving, and updating return results immediately — narrate them. For research, shopping, and news, acknowledge the request briefly. Results arrive later as a message starting with '[Background task completed]' — when you see this, summarize the findings conversationally.`;

/**
 * Internal query that builds voice instructions for a conversation.
 *
 * This query:
 * 1. Takes a conversationId as input
 * 2. Reuses buildConversationContext() with a reduced token budget (~8000)
 * 3. Takes last ~20 user/assistant exchanges, truncating each to ~200 chars
 * 4. Prepends the base voice system prompt
 * 5. Adds explicit language instruction: "Always respond in English."
 * 6. Returns combined instructions string
 * 7. If conversation is empty, returns just the base prompt (zero regression)
 *
 * @param args.conversationId - The conversation to build instructions for
 * @returns Combined system prompt + conversation context as a string
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

    // Build conversation context with reduced token budget for voice
    const messages = await buildConversationContext(
      ctx.db,
      args.conversationId,
      VOICE_TOKEN_BUDGET
    );

    // Filter to only user/assistant exchanges (skip system messages)
    const exchanges = messages.filter(
      (m) => m.role === "user" || m.role === "assistant"
    );

    // Take last ~20 exchanges
    const recentExchanges = exchanges.slice(-MAX_VOICE_EXCHANGES);

    // Truncate each exchange to ~200 chars
    const truncatedExchanges = recentExchanges.map((msg) => {
      const truncated =
        msg.content.length > MAX_CHARS_PER_EXCHANGE
          ? msg.content.slice(0, MAX_CHARS_PER_EXCHANGE) + "..."
          : msg.content;
      return `${msg.role}: ${truncated}`;
    });

    // If no exchanges, return just the system prompt with language
    if (truncatedExchanges.length === 0) {
      return systemPrompt;
    }

    // Combine system prompt with conversation history
    const conversationHistory = truncatedExchanges.join("\n\n");
    return `${systemPrompt}\n\nConversation history:\n\n${conversationHistory}`;
  },
});
