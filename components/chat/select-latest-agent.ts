/**
 * GATE-FIX-01 — pick the agent row that may own chat-assistant-message-latest.
 *
 * Empty stream previews / incomplete Zero placeholders must never steal the
 * Maestro success selector while seed or a completed turn still has real text.
 * Pure helper so integration tests can pin the selection without RN natives.
 */

export type LatestAgentCandidate = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
};

function isAgentRole(role: string): boolean {
  // Backend durable uses role='agent'; some seeds historically used 'assistant'.
  return role === 'agent' || role === 'assistant';
}

function hasNonEmptyContent(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.trim().length > 0;
}

/**
 * Newest agent row with non-empty content (by createdAt).
 * Returns null when every agent row is empty — callers must not mint a vanity
 * latest testID on an invisible zero-height bubble.
 */
export function selectLatestAgentMessage<T extends LatestAgentCandidate>(
  messages: ReadonlyArray<T>
): T | null {
  let best: T | null = null;
  for (const m of messages) {
    if (!isAgentRole(m.role)) continue;
    if (!hasNonEmptyContent(m.content)) continue;
    if (!best || m.createdAt.getTime() >= best.createdAt.getTime()) {
      best = m;
    }
  }
  return best;
}
