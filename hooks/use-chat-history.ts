/**
 * Chat history via Zero reactive query (S-REWRITE-01).
 *
 * Reads `chat_messages` through `chatMessagesByConversation` (client-data-contract).
 * Soft-deleted rows (`deleted === true`) are excluded client-side.
 */

import { useQuery } from '@rocicorp/zero/react';
import { chatMessagesByConversation } from '@/app/zero/queries';
import type { ChatMessage } from '@/components/chat/ChatThread';

interface UseChatHistoryReturn {
  messages: ChatMessage[];
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

/**
 * Fetch chat history for a conversation with automatic real-time updates via Zero.
 *
 * @param conversationId - ID of the conversation (null skips the query)
 * @param limit - Optional limit for number of messages (applied client-side)
 */
export function useChatHistory(
  conversationId: string | null,
  limit?: number
): UseChatHistoryReturn {
  const [rawRows, details] = useQuery(
    conversationId ? chatMessagesByConversation(conversationId) : undefined
  );

  const rows = (rawRows ?? []) as unknown as ZeroChatMessageRow[];

  const filtered = rows.filter((msg) => msg.deleted !== true);
  const limited = typeof limit === 'number' ? filtered.slice(-limit) : filtered;

  const messages: ChatMessage[] = limited.map((msg) => ({
    id: msg.id,
    role: msg.role as ChatMessage['role'],
    content: msg.content ?? '',
    message_type: (msg.message_type ?? undefined) as ChatMessage['message_type'],
    card_data: (msg.card_data as Record<string, unknown> | null | undefined) ?? null,
    toolCallId: msg.tool_call_id ?? null,
    voiceSessionId: msg.voice_session_id ?? null,
    createdAt: new Date(msg.created_at),
  }));

  const isLoading = conversationId !== null && details.type === 'unknown' && rows.length === 0;

  return {
    messages,
    isLoading,
    error: null,
  };
}
