"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

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
 * Generate help response for /help command
 */
function generateHelpResponse(): string {
  return `Available commands:

/help - Show this help message
/search <query> - Search the knowledge base
/browse [category] - Browse articles by category
/stats - View knowledge base statistics
/deep-research <topic> - Start multi-iteration deep research
/resume - Resume a previous research session
/cancel - Cancel active deep research session`;
}

/**
 * Generate AI response for natural language messages
 * AC-1: AI responds to user messages
 * AC-4: Handle AI failures gracefully
 */
async function generateAIResponse(
  content: string
): Promise<{ content: string; messageType: "text" | "result_card" | "error"; cardData?: any }> {
  try {
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
  handler: async (ctx, { conversationId, content, messageType = "text" }) => {
    const now = Date.now();

    // 1. Parse for slash commands (AC-3)
    const parsed = parseSlashCommand(content);
    const actualMessageType = parsed.isCommand ? "slash_command" : messageType;

    // 2. Persist user message (AC-1)
    const userMessageId = await ctx.runMutation(api.chatMessages.create, {
      conversationId,
      role: "user",
      content,
      messageType: actualMessageType,
      createdAt: now,
    });

    // 3. Update conversation metadata
    const preview = content.length > 100 ? content.slice(0, 97) + "..." : content;
    await ctx.runMutation(api.conversations.touch, {
      id: conversationId,
      lastMessagePreview: preview,
    });

    // 4. Route message and generate response
    let agentResponse: string;
    let responseMessageType: "text" | "result_card" | "error" = "text";
    let cardData: any = undefined;

    if (parsed.isCommand) {
      // AC-3: Route slash commands
      if (parsed.command === "help") {
        agentResponse = generateHelpResponse();
        responseMessageType = "text";
      } else if (parsed.command === "search") {
        const query = parsed.args || "";
        if (!query) {
          agentResponse = "Please provide a search query. Usage: /search <query>";
        } else {
          agentResponse = `Search functionality for "${query}" will be available soon!`;
          responseMessageType = "text";
        }
      } else if (parsed.command === "browse") {
        agentResponse = "Browse functionality will be available soon!";
        responseMessageType = "text";
      } else if (parsed.command === "stats") {
        agentResponse = "Statistics functionality will be available soon!";
        cardData = {
          card_type: "stats",
          total_count: 0,
          category_breakdown: [],
        };
        responseMessageType = "result_card";
      } else if (parsed.command === "deep-research") {
        const topic = parsed.args || "";
        if (!topic) {
          agentResponse = "Please provide a topic. Usage: /deep-research <topic>";
        } else {
          agentResponse = `Deep research for "${topic}" will be available soon!`;
          responseMessageType = "text";
        }
      } else {
        agentResponse = `Unknown command: /${parsed.command}. Type /help to see available commands.`;
        responseMessageType = "text";
      }
    } else {
      // Natural language chat - call AI (AC-1, AC-4)
      const aiResponse = await generateAIResponse(content);
      agentResponse = aiResponse.content;
      responseMessageType = aiResponse.messageType;
      cardData = aiResponse.cardData;
    }

    // 5. Persist agent response
    const agentMessageId = await ctx.runMutation(api.chatMessages.create, {
      conversationId,
      role: "agent",
      content: agentResponse,
      messageType: responseMessageType,
      cardData,
      createdAt: Date.now(),
    });

    return {
      userMessageId,
      agentMessageId,
      agentResponse,
    };
  },
});
