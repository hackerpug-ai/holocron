/**
 * Bridges async tool results to the OpenAI Realtime voice session.
 *
 * CAP-CUT-01 / Sprint 20/24: pure no-op — MUST NOT import convex/react so chat
 * cold-boots under ZeroProvider only. Platform voice result streaming will
 * replace this when productized.
 *
 * When a new result_card or error message appears from the agent, the legacy
 * Convex path injected it into the OpenAI conversation so the model could
 * speak the results. That path is intentionally disabled here.
 */

type SendEventFn = (event: Record<string, unknown>) => void;

export function useVoiceResultBridge(
  _conversationId: string | null,
  _isActive: boolean,
  _sendEvent: SendEventFn | null
): void {
  // No-op: Convex watchQuery path removed for Zero cold-boot safety.
}
