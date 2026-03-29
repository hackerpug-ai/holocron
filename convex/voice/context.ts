import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { buildConversationContext } from "../chat/context";

const VOICE_TOKEN_BUDGET = 8000;
const MAX_VOICE_EXCHANGES = 20;
const MAX_CHARS_PER_EXCHANGE = 200;

/**
 * Base system prompt for the Holocron voice assistant.
 * Establishes the voice assistant's role and behavior.
 */
const BASE_VOICE_SYSTEM_PROMPT = `You are the Holocron voice assistant. You help users search their knowledge base, manage tasks, check on research, and navigate the app. Before calling any function tool, briefly announce what you're about to do. When a function call is pending and the user asks about it, say you're still waiting on the result.

Always respond in English.`;

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

    // If no exchanges, return just the base prompt
    if (truncatedExchanges.length === 0) {
      return BASE_VOICE_SYSTEM_PROMPT;
    }

    // Combine base prompt with conversation history
    const conversationHistory = truncatedExchanges.join("\n\n");
    return `${BASE_VOICE_SYSTEM_PROMPT}\n\nConversation history:\n\n${conversationHistory}`;
  },
});
