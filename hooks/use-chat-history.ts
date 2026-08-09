/**
 * Chat history via Zero reactive query (S-REWRITE-01) + SSE overlay
 * reconciliation (S-REACTIVE-01 / S31-FE-04).
 *
 * Reads `chat_messages` through `chatMessagesByConversation` (client-data-contract).
 * Soft-deleted rows (`deleted === true`) are excluded client-side.
 *
 * When a resumable SSE stream is active, `reconcileThreadMessages` merges a
 * single in-progress assistant preview (and optional optimistic user entry)
 * with durable Zero rows so the thread never shows duplicate bubbles for one run.
 */

import { useQuery } from '@rocicorp/zero/react';
import { chatMessagesByConversation } from '@/app/zero/queries';
import type { ChatMessage } from '@/components/chat/ChatThread';
import {
  type ChatStreamPhase,
  type PendingUserOverlay,
  reconcileThreadMessages,
  type StreamOverlay,
} from '@/hooks/use-resumable-sse-stream';
import { useZeroRowWatchdog } from '@/hooks/use-zero-row-watchdog';

interface UseChatHistoryReturn {
  messages: ChatMessage[];
  /** Durable Zero rows only (no streaming overlay) — for content equality checks */
  durableMessages: ChatMessage[];
  isLoading: boolean;
  error: Error | null;
}

type ZeroChatMessageRow = {
  id: string;
  role: string;
  content?: string | null;
  message_type?: string | null;
  card_data?: Record<string, unknown> | null;
  tool_call_id?: string | null;
  voice_session_id?: string | null;
  deleted?: boolean | null;
  created_at: number;
};

export type ChatHistoryStreamOverlay = {
  durableMessageId: string | null;
  content: string;
  phase: ChatStreamPhase;
};

/**
 * Fetch chat history for a conversation with automatic real-time updates via Zero.
 *
 * @param conversationId - ID of the conversation (null skips the query)
 * @param limit - Optional limit for number of messages (applied client-side)
 * @param streamOverlay - Optional live SSE preview reconciled to durable rows
 * @param pendingUser - Optional optimistic user bubble (component-scoped client id)
 */
export function useChatHistory(
  conversationId: string | null,
  limit?: number,
  streamOverlay?: ChatHistoryStreamOverlay | null,
  pendingUser?: PendingUserOverlay | null
): UseChatHistoryReturn {
  const enabled = conversationId !== null;
  const [rawRows, details] = useQuery(
    conversationId ? chatMessagesByConversation(conversationId) : undefined
  );

  const rows = (rawRows ?? []) as unknown as ZeroChatMessageRow[];

  // Pending only while Zero has not produced a definitive result yet.
  // Empty `[]` after a complete sync is a defined row (no watchdog).
  const stillPending =
    enabled && details.type === 'unknown' && (rawRows === undefined || rows.length === 0);
  const rowForWatchdog = stillPending ? undefined : (rawRows ?? rows);
  const error = useZeroRowWatchdog(rowForWatchdog, enabled);

  const filtered = rows.filter((msg) => msg.deleted !== true);
  const limited = typeof limit === 'number' ? filtered.slice(-limit) : filtered;

  const durableMessages: ChatMessage[] = limited.map((msg) => ({
    id: msg.id,
    // Backend durable agent rows use role='agent'; seed may use 'assistant' — normalize.
    role: (msg.role === 'assistant' ? 'agent' : msg.role) as ChatMessage['role'],
    content: msg.content ?? '',
    message_type: (msg.message_type ?? undefined) as ChatMessage['message_type'],
    card_data: (msg.card_data as Record<string, unknown> | null | undefined) ?? null,
    toolCallId: msg.tool_call_id ?? null,
    voiceSessionId: msg.voice_session_id ?? null,
    createdAt: new Date(msg.created_at),
  }));

  const overlay: StreamOverlay | null | undefined = streamOverlay
    ? {
        durableMessageId: streamOverlay.durableMessageId,
        content: streamOverlay.content,
        phase: streamOverlay.phase,
      }
    : null;

  const messages = reconcileThreadMessages(durableMessages, overlay, pendingUser ?? null);

  const isLoading = stillPending && error === null;

  return {
    messages,
    durableMessages,
    isLoading,
    error,
  };
}
