import { GenericDatabaseReader } from "convex/server";
import { DataModel, Id } from "../_generated/dataModel";

type LlmMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const CHARS_PER_TOKEN = 4;
const MAX_MESSAGES_TO_FETCH = 200;
const MIN_RECENT_MESSAGES = 10;
const MAX_DOCUMENT_CONTEXT_CHARS = 2000;
const MAX_DOCUMENT_CONTEXT_COUNT = 5;

export async function buildConversationContext(
  db: GenericDatabaseReader<DataModel>,
  conversationId: Id<"conversations">,
  tokenBudget: number = 60000
): Promise<LlmMessage[]> {
  // Fetch the last 200 messages for this conversation, ordered by createdAt ascending
  const allMessages = await db
    .query("chatMessages")
    .withIndex("by_conversation", (q) =>
      q.eq("conversationId", conversationId)
    )
    .order("desc")
    .take(MAX_MESSAGES_TO_FETCH);

  // Filter out deleted messages
  const messages = allMessages.filter((m) => m.deleted !== true);

  // Build context from newest to oldest, respecting the token budget
  // but always including the last MIN_RECENT_MESSAGES messages
  const charBudget = tokenBudget * CHARS_PER_TOKEN;
  let accumulatedChars = 0;
  const includedMessages: typeof messages = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const messageChars = message.content.length;
    const isWithinMinRecent = i < MIN_RECENT_MESSAGES;

    if (isWithinMinRecent || accumulatedChars + messageChars <= charBudget) {
      includedMessages.push(message);
      accumulatedChars += messageChars;
    } else {
      // Budget exceeded and we've already included the minimum recent messages
      break;
    }
  }

  // Reverse to get oldest-first order for the LLM
  const orderedMessages = includedMessages.reverse();

  // Collect unique documentIds from all fetched messages (up to MAX_DOCUMENT_CONTEXT_COUNT)
  const documentIdSet = new Set<Id<"documents">>();
  for (const message of orderedMessages) {
    if (message.documentId && documentIdSet.size < MAX_DOCUMENT_CONTEXT_COUNT) {
      documentIdSet.add(message.documentId);
    }
  }

  // Fetch referenced documents and build system context
  const documentContextParts: string[] = [];
  for (const documentId of documentIdSet) {
    const document = await db.get(documentId);
    if (document) {
      const truncatedContent =
        document.content.length > MAX_DOCUMENT_CONTEXT_CHARS
          ? document.content.slice(0, MAX_DOCUMENT_CONTEXT_CHARS) + "..."
          : document.content;
      documentContextParts.push(
        `--- Document: ${document.title} ---\n${truncatedContent}`
      );
    }
  }

  // Fetch all toolCalls for this conversation to represent tool interactions clearly
  const allToolCalls = await db
    .query("toolCalls")
    .withIndex("by_conversation", (q) =>
      q.eq("conversationId", conversationId)
    )
    .collect();

  // Index tool calls by their approval messageId and track result messageIds
  const toolCallByApprovalMessageId = new Map<string, typeof allToolCalls[number]>();
  const resultMessageIds = new Set<string>();
  for (const tc of allToolCalls) {
    toolCallByApprovalMessageId.set(tc.messageId, tc);
    if (tc.resultMessageId) {
      resultMessageIds.add(tc.resultMessageId);
    }
  }

  // Map chat messages to LLM format
  // Tool interactions are represented as plain text so all models can understand them
  const llmMessages: LlmMessage[] = [];

  for (const message of orderedMessages) {
    // tool_approval messages → convert to descriptive assistant text + include result
    if (message.messageType === "tool_approval") {
      const tc = toolCallByApprovalMessageId.get(message._id);
      if (!tc) continue;

      // Represent the tool call as a natural assistant message
      const argsStr = tc.toolArgs
        ? Object.entries(tc.toolArgs as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
            .join(", ")
        : "";
      const callDescription = `[I used the ${tc.toolDisplayName} tool${argsStr ? ` with ${argsStr}` : ""}]`;

      if (tc.status === "completed" && tc.resultMessageId) {
        // Find the result message content
        const resultMsg = orderedMessages.find((m) => m._id === tc.resultMessageId);
        const resultContent = resultMsg?.content ?? "Tool completed successfully.";
        llmMessages.push({
          role: "assistant",
          content: `${callDescription}\n\nResults:\n${resultContent}`,
        });
      } else if (tc.status === "rejected") {
        llmMessages.push({
          role: "assistant",
          content: `${callDescription}\n\nThe user rejected this tool call.`,
        });
      } else if (tc.status === "failed") {
        llmMessages.push({
          role: "assistant",
          content: `${callDescription}\n\nTool execution failed: ${tc.error ?? "Unknown error"}`,
        });
      }
      // Skip pending/approved — not yet resolved
      continue;
    }

    // Skip result_card messages that are already included in tool call descriptions above
    if (resultMessageIds.has(message._id)) {
      continue;
    }

    if (message.role === "user") {
      llmMessages.push({ role: "user", content: message.content });
    } else if (message.role === "system") {
      llmMessages.push({ role: "system", content: message.content });
    } else {
      // role === "agent" — text, error, progress, result_card messages
      llmMessages.push({ role: "assistant", content: message.content });
    }
  }

  // Prepend document context as a system message if any documents were found
  if (documentContextParts.length > 0) {
    const systemMessage: LlmMessage = {
      role: "system",
      content:
        "The following documents are referenced in this conversation:\n\n" +
        documentContextParts.join("\n\n"),
    };
    return [systemMessage, ...llmMessages];
  }

  return llmMessages;
}
