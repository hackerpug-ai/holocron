/**
 * REDHAT-FIX-11 PATH-A — content byte-equal oracle helpers.
 *
 * Compares rendered latest-assistant bubble text to durable Zero/chat_messages
 * content for the same agent turn. Pure (no RN imports) so integration tests
 * can assert match/mismatch without Expo natives.
 *
 * NEVER treat redhat-fix-04 UNIQUE_TEXT SSE stub equality as a substitute.
 */

export type ChatContentByteEqualOracleId = 'chat-content-byte-equal' | 'chat-content-byte-mismatch';

/** True when rendered text is byte-equal to durable chat_messages.content. */
export function chatContentsAreByteEqual(renderedText: string, durableContent: string): boolean {
  return renderedText === durableContent;
}

/**
 * Resolve Maestro testID for the content equality oracle.
 *
 * - equal → `chat-content-byte-equal`
 * - diverge → `chat-content-byte-mismatch`
 * - no durable content yet (Zero lag / pre-finalize) → null (oracle not mounted)
 */
export function resolveChatContentByteEqualOracleId(
  renderedLatestAgentText: string | null | undefined,
  durableContent: string | null | undefined
): ChatContentByteEqualOracleId | null {
  if (renderedLatestAgentText == null || durableContent == null) return null;
  if (durableContent.length === 0) return null;
  return chatContentsAreByteEqual(renderedLatestAgentText, durableContent)
    ? 'chat-content-byte-equal'
    : 'chat-content-byte-mismatch';
}

/**
 * Pick durable content for the latest agent row (by id) from Zero-only messages.
 */
export function durableContentForMessageId(
  durableMessages: ReadonlyArray<{ id: string; content: string }>,
  messageId: string | null | undefined
): string | null {
  if (!messageId) return null;
  const row = durableMessages.find((m) => m.id === messageId);
  return row ? row.content : null;
}
