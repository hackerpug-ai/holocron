/**
 * Single chat input processor that makes UC-SVC-03's typed `blocked` outcome real.
 *
 * Out of scope: full moderation / PII / injection stacks (01-scope.md 2026-08-07).
 * This is the one processor AC-4 needs — abort() trips the Mastra wire so
 * chat-runs can persist blocked + CHAT_PROCESSOR_BLOCKED without a magic-string
 * branch in the HTTP path.
 */
import type { ProcessInputArgs, ProcessInputResult, Processor } from '@mastra/core/processors';

/** Content that trips the registered chat policy processor. */
export const CHAT_POLICY_BLOCK_TOKEN = '[[chat-policy-block]]';

/**
 * Legacy sprint-18 probe token. Detected only inside this processor so the
 * HTTP path no longer special-cases a magic string.
 */
const LEGACY_TRIPWIRE_TOKEN = '[[tripwire]]';

export const CHAT_POLICY_PROCESSOR_ID = 'chat-policy-block' as const;

function extractMessageText(messages: ProcessInputArgs['messages']): string {
  const chunks: string[] = [];
  for (const message of messages) {
    const content = message.content as unknown;
    if (typeof content === 'string') {
      chunks.push(content);
      continue;
    }
    if (!content || typeof content !== 'object') continue;
    const rec = content as {
      content?: unknown;
      parts?: Array<{ type?: string; text?: string }>;
    };
    if (typeof rec.content === 'string') chunks.push(rec.content);
    if (Array.isArray(rec.parts)) {
      for (const part of rec.parts) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          chunks.push(part.text);
        }
      }
    }
  }
  return chunks.join('\n');
}

/**
 * Shared policy evaluation used by the processor and the chat-run preflight.
 * Keeps a single detection path (no magic-string branch in the HTTP handler).
 */
export function evaluateChatPolicy(text: string): { blocked: true; reason: string } | null {
  if (!text) return null;
  if (text.includes(CHAT_POLICY_BLOCK_TOKEN)) {
    return { blocked: true, reason: 'chat processor blocked unsafe dispatch' };
  }
  // Legacy sprint-18 probe token (literal lives only in this processor module).
  if (text.toLowerCase().includes(LEGACY_TRIPWIRE_TOKEN)) {
    return { blocked: true, reason: 'chat processor blocked unsafe dispatch' };
  }
  return null;
}

/**
 * Blocks unsafe chat dispatch before any model step or tool call.
 * Registered on every chat specialist agent as the sole inputProcessor.
 */
export class ChatPolicyBlockProcessor implements Processor<typeof CHAT_POLICY_PROCESSOR_ID> {
  readonly id = CHAT_POLICY_PROCESSOR_ID;
  readonly name = 'Chat policy block';

  processInput(args: ProcessInputArgs): ProcessInputResult {
    const text = extractMessageText(args.messages);
    const decision = evaluateChatPolicy(text);
    if (decision) {
      args.abort(decision.reason, {
        retry: false,
        metadata: { processorId: CHAT_POLICY_PROCESSOR_ID },
      });
    }
    return args.messages;
  }
}

export const chatPolicyBlockProcessor = new ChatPolicyBlockProcessor();
