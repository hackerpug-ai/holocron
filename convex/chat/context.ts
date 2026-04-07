import { GenericDatabaseReader } from "convex/server";
import { DataModel, Id } from "../_generated/dataModel";

/**
 * Normalize cardData to an array of card objects.
 * Handles: arrays (legacy), { items: [...] } (post-migration), single objects.
 */
function normalizeCardData(cardData: unknown): Record<string, unknown>[] {
  if (Array.isArray(cardData)) return cardData;
  if (typeof cardData === "object" && cardData !== null) {
    const obj = cardData as Record<string, unknown>;
    if (obj.card_type === "search_results" && Array.isArray(obj.items)) {
      return obj.items as Record<string, unknown>[];
    }
    return [obj];
  }
  return [];
}

type LlmMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type DocumentContextCardData = {
  card_type: "document_context";
  document_id: string;
  title: string;
  category?: string;
  scope: "full" | "excerpt";
  excerpt?: string;
  blockIndex?: number;
  snippet?: string;
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

  // Build a brief summary of excluded messages so the agent is aware of earlier topics
  const excludedCount = messages.length - includedMessages.length;
  let conversationSummary: LlmMessage | null = null;

  if (excludedCount > 0) {
    const excludedMessages = messages.slice(includedMessages.length);
    const topics: string[] = [];

    for (const msg of excludedMessages) {
      // Collect document titles referenced
      if (msg.documentId) {
        const doc = await db.get(msg.documentId);
        if (doc?.title) {
          const label = `document "${doc.title}"`;
          if (!topics.includes(label)) topics.push(label);
        }
      }

      // Collect tool names used
      if (msg.messageType === "tool_approval") {
        const tc = msg.content.match(/\b(\w+)\s+tool\b/i);
        if (tc) {
          const label = `${tc[1]} tool usage`;
          if (!topics.includes(label)) topics.push(label);
        }
      }

      // Collect first sentence of user messages
      if (msg.role === "user" && msg.content) {
        const firstSentence = msg.content.split(/[.!?\n]/)[0]?.trim();
        if (firstSentence && firstSentence.length > 5) {
          topics.push(`"${firstSentence}"`);
        }
      }
    }

    if (topics.length > 0) {
      let summaryText = `Earlier in this conversation, topics included: ${topics.join(", ")}`;
      if (summaryText.length > 500) {
        summaryText = summaryText.slice(0, 497) + "...";
      }
      conversationSummary = { role: "system", content: summaryText };
    }
  }

  // Reverse to get oldest-first order for the LLM
  const orderedMessages = includedMessages.reverse();

  // Collect document context info from messages, tracking cardData for section-aware injection.
  // Maps documentId → the first cardData encountered (or null for legacy messages).
  const documentContextMap = new Map<
    Id<"documents">,
    DocumentContextCardData | null
  >();

  for (const message of orderedMessages) {
    if (!message.documentId) continue;
    if (documentContextMap.size >= MAX_DOCUMENT_CONTEXT_COUNT) break;
    if (documentContextMap.has(message.documentId)) continue;

    const cardData = message.cardData as DocumentContextCardData | undefined;
    if (cardData && cardData.card_type === "document_context") {
      documentContextMap.set(message.documentId, cardData);
    } else {
      // Legacy message: no cardData or different card type → full injection
      documentContextMap.set(message.documentId, null);
    }
  }

  // Second pass: extract document IDs from result_card messages with cardData
  // This makes the agent aware of articles cited in chat history
  for (const message of orderedMessages) {
    if (message.messageType !== "result_card") continue;
    if (!message.cardData) continue;

    const cards = normalizeCardData(message.cardData);

    for (const card of cards) {
      if (documentContextMap.size >= MAX_DOCUMENT_CONTEXT_COUNT) break;

      const cardType = card.card_type as string;
      const documentId = card.document_id;

      // Only process specific card types that contain document references
      if (
        documentId &&
        ["article", "document_saved", "document_full", "final_result"].includes(cardType)
      ) {
        const docId = documentId as Id<"documents">;
        if (!documentContextMap.has(docId)) {
          // Store null for cardData since we don't have full context info
          documentContextMap.set(docId, null);
        }
      }
    }
  }

  // Fetch referenced documents and build system context
  const documentContextParts: string[] = [];
  for (const [documentId, cardData] of documentContextMap) {
    if (cardData && cardData.scope === "excerpt") {
      // Excerpt scope: the excerpt text is already in the message content.
      // Emit a light header so the agent knows the source document.
      const blockRef =
        cardData.blockIndex !== undefined
          ? ` from block ${cardData.blockIndex}`
          : "";
      documentContextParts.push(
        `--- Document: ${cardData.title} (excerpt${blockRef}) ---\n[Full document available via ID: ${documentId}]`
      );
    } else {
      // Full scope or legacy: fetch and inject truncated content with document ID reference.
      const document = await db.get(documentId);
      if (document) {
        const truncatedContent =
          document.content.length > MAX_DOCUMENT_CONTEXT_CHARS
            ? document.content.slice(0, MAX_DOCUMENT_CONTEXT_CHARS) + "..."
            : document.content;
        documentContextParts.push(
          `--- Document: ${document.title} (ID: ${documentId}) ---\n${truncatedContent}`
        );
      }
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
    // agent_plan messages → convert to structured plan text for the assistant
    if (message.messageType === "agent_plan") {
      const cardData = message.cardData as { plan_id?: string } | undefined;
      const planId = cardData?.plan_id;
      if (!planId) continue;

      const plan = await db.get(planId as Id<"agentPlans">);
      if (!plan) continue;

      const steps = await db
        .query("agentPlanSteps")
        .withIndex("by_plan", (q) =>
          q.eq("planId", planId as Id<"agentPlans">)
        )
        .order("asc")
        .collect();

      const statusLabel = (
        s: string
      ): string => {
        const map: Record<string, string> = {
          pending: "pending",
          running: "running",
          awaiting_approval: "awaiting approval",
          approved: "approved",
          completed: "completed",
          skipped: "skipped",
          failed: "failed",
        };
        return map[s] ?? s;
      };

      const stepLines = steps.map((step, idx) => {
        let suffix = "";
        if (step.status === "completed" && step.resultSummary) {
          suffix = ` → ${step.resultSummary}`;
        } else if (step.status === "failed" && step.errorMessage) {
          suffix = ` → Error: ${step.errorMessage}`;
        }
        return `Step ${idx + 1} (${statusLabel(step.status)}): ${step.description}${suffix}`;
      });

      const planText = `[I created a plan: "${plan.title}"]\n${stepLines.join("\n")}`;
      llmMessages.push({ role: "assistant", content: planText });
      continue;
    }

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

    // Skip result_card messages that are already represented in tool_approval descriptions,
    // UNLESS they contain document references that the agent needs for get_document/update_document
    if (resultMessageIds.has(message._id)) {
      // Still include if it has document references in cardData
      const hasDocRefs =
        message.cardData &&
        normalizeCardData(message.cardData).some((c) => c.document_id);
      if (!hasDocRefs) {
        continue;
      }
    }

    // For result_card messages with document references in cardData, include document IDs
    if (message.messageType === "result_card" && message.cardData) {
      const cards = normalizeCardData(message.cardData);
      const docRefs = cards
        .filter(
          (c) =>
            c.document_id &&
            [
              "article",
              "document_saved",
              "document_context",
              "document_full",
              "final_result",
            ].includes(c.card_type as string)
        )
        .map((c: any) => `- "${c.title || "Untitled"}" [ID: ${c.document_id}]`);

      if (docRefs.length > 0) {
        const enrichedContent = `${message.content}\n\nDocuments referenced:\n${docRefs.join("\n")}`;
        llmMessages.push({ role: "assistant", content: enrichedContent });
        continue;
      }
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

  // Prepend context system messages: conversation summary first, then document context
  const prefixMessages: LlmMessage[] = [];

  if (conversationSummary) {
    prefixMessages.push(conversationSummary);
  }

  if (documentContextParts.length > 0) {
    prefixMessages.push({
      role: "system",
      content:
        "The following documents are referenced in this conversation:\n\n" +
        documentContextParts.join("\n\n"),
    });
  }

  return [...prefixMessages, ...llmMessages];
}
