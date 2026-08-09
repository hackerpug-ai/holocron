/**
 * S31-FE-04 — pure reconciler regressions (AC-1 / AC-2 / AC-3).
 *
 * UNIT_TEST_JUSTIFIED: pure array-in/array-out reducer with 0 I/O.
 * Live Zero / SSE paths are covered by AC-4, AC-5, AC-6 e2e.
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/components/chat/ChatThread';
import {
  applyTokenEvent,
  reconcileThreadMessages,
  type StreamOverlay,
  type TokenAssemblyState,
} from '@/hooks/use-resumable-sse-stream';

const Q1 = 'Summarise the quarterly report for Q1';
const Q2 = 'Summarise the quarterly report for Q2';

function userMsg(id: string, content: string, t = 1): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    message_type: 'text',
    createdAt: new Date(t),
  };
}

describe('S31-FE-04 reconcileThreadMessages', () => {
  it('optimistic bubble collapses into durable row', () => {
    const pending = { clientId: 'cli-abc', content: Q1 };
    const overlay: StreamOverlay | null = null;

    // Pending alone must paint one optimistic user bubble (keyed by clientId).
    const optimisticOnly = reconcileThreadMessages([], overlay, pending);
    expect(optimisticOnly).toHaveLength(1);
    expect(optimisticOnly[0]?.id).toBe('cli-abc');
    expect(optimisticOnly[0]?.content).toBe(Q1);
    expect(optimisticOnly[0]?.role).toBe('user');

    // Same content durable lands → collapse to durable id (no second bubble).
    const durable: ChatMessage[] = [userMsg('srv-user-1', Q1)];
    const result = reconcileThreadMessages(durable, overlay, pending);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('srv-user-1');
    expect(result[0]?.content).toBe(Q1);
    expect(result.some((m) => m.id === 'cli-abc')).toBe(false);
  });

  it('replayed events below lastSeq are ignored', () => {
    let assembly: TokenAssemblyState = { lastSeq: 0, text: '', tokenCount: 0 };
    assembly = applyTokenEvent(assembly, 1, 'alpha');
    assembly = applyTokenEvent(assembly, 2, ' ');
    assembly = applyTokenEvent(assembly, 3, 'beta');
    assembly = applyTokenEvent(assembly, 4, ' ');
    assembly = applyTokenEvent(assembly, 5, 'gamma');
    // pad seq to 7 without changing text
    assembly = applyTokenEvent(assembly, 6, '');
    assembly = applyTokenEvent(assembly, 7, '');

    expect(assembly.lastSeq).toBe(7);
    expect(assembly.text).toBe('alpha beta gamma');

    const durable: ChatMessage[] = [userMsg('u1', 'hi')];
    const overlay: StreamOverlay = {
      durableMessageId: 'asst-1',
      content: assembly.text,
      phase: 'streaming',
    };
    const pre = reconcileThreadMessages(durable, overlay);
    const preLen = pre.length;
    const preContent = pre.find((m) => m.id === 'asst-1')?.content;

    // Replay seq 3, 5, 7 — must not change assembly or reconciled result
    assembly = applyTokenEvent(assembly, 3, 'beta');
    assembly = applyTokenEvent(assembly, 5, 'gamma');
    assembly = applyTokenEvent(assembly, 7, '');

    expect(assembly.lastSeq).toBe(7);
    expect(assembly.text).toBe('alpha beta gamma');
    expect(assembly.text.includes('gamma gamma')).toBe(false);

    const postOverlay: StreamOverlay = {
      durableMessageId: 'asst-1',
      content: assembly.text,
      phase: 'streaming',
    };
    const post = reconcileThreadMessages(durable, postOverlay);
    expect(post.length).toBe(preLen);
    expect(post.find((m) => m.id === 'asst-1')?.content).toBe(preContent);
    expect(post.filter((m) => m.id === 'asst-1')).toHaveLength(1);
  });

  it('prefix collision keeps messages distinct', () => {
    // Shared first 24 chars: "Summarise the quarterly " (24)
    expect(Q1.slice(0, 24)).toBe(Q2.slice(0, 24));
    expect(Q1.slice(0, 24).length).toBe(24);

    const durable: ChatMessage[] = [userMsg('m1', Q1, 1), userMsg('m2', Q2, 2)];
    const overlay: StreamOverlay = {
      durableMessageId: 'm2',
      content: Q2,
      phase: 'complete',
    };

    const result = reconcileThreadMessages(durable, overlay);

    expect(result).toHaveLength(2);
    expect(result.some((m) => m.content.endsWith('Q1'))).toBe(true);
    expect(result.some((m) => m.content.endsWith('Q2'))).toBe(true);
    expect(result.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });
});
