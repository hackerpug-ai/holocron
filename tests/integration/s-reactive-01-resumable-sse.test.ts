/**
 * S-REACTIVE-01 — Resumable SSE chat streaming client with exactly-once reconciliation.
 *
 * Static + pure-logic contracts (always run). Behavioral Maestro ACs are
 * exercised via `.maestro/reactive/*.yml` when a simulator is available.
 *
 * Negative control (red-against-start): before the hook exists, these contracts
 * MUST fail. After GREEN they pass.
 *
 * No EventSource / Zero / Postgres mocks (TESTING-HIERARCHY).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const HOOK_PATH = join(REPO_ROOT, 'hooks', 'use-resumable-sse-stream.ts');
const CHAT_SCREEN_PATH = join(REPO_ROOT, 'app', '(drawer)', 'chat', '[conversationId].tsx');
const CHAT_THREAD_PATH = join(REPO_ROOT, 'components', 'chat', 'ChatThread.tsx');
const CHAT_HISTORY_PATH = join(REPO_ROOT, 'hooks', 'use-chat-history.ts');

const MAESTRO_FLOWS = [
  'token-streaming.yml',
  'reconnect-exactly-once.yml',
  'exactly-one-final-message.yml',
  'last-event-id-gap-fill.yml',
  'cancel-stops-stream.yml',
] as const;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('S-REACTIVE-01 resumable SSE client contracts', () => {
  describe('AC-1..AC-5 deliverables exist', () => {
    it('hooks/use-resumable-sse-stream.ts exists (NEW)', () => {
      expect(existsSync(HOOK_PATH), 'use-resumable-sse-stream.ts must exist').toBe(true);
    });

    for (const flow of MAESTRO_FLOWS) {
      it(`.maestro/reactive/${flow} exists`, () => {
        expect(existsSync(join(REPO_ROOT, '.maestro', 'reactive', flow))).toBe(true);
      });
    }
  });

  describe('AC-1 / AC-2 / AC-4 — real SSE socket + Last-Event-ID', () => {
    it('hook uses EventSource (not a mock stub) and opens /api/chat-runs/:id/events', () => {
      const src = read(HOOK_PATH);
      expect(src).toMatch(/EventSource/);
      expect(src).toMatch(/\/api\/chat-runs\/.+\/events|chat-runs\/\$\{.*\}\/events/);
      // Must not mock EventSource for tests
      expect(src).not.toMatch(/vi\.mock\(['"]eventsource['"]\)|jest\.mock\(['"]eventsource['"]\)/);
      expect(src).not.toMatch(/mockEventSource|FakeEventSource|stubEventSource/);
    });

    it('hook sends Last-Event-ID on resume (gap-fill only seq > afterSeq)', () => {
      const src = read(HOOK_PATH);
      expect(src).toMatch(/Last-Event-ID/);
      // Must track last observed seq for resume
      expect(src).toMatch(/lastSeq|lastEventId|afterSeq/);
    });

    it('hook handles token / terminal / blocked / error event types', () => {
      const src = read(HOOK_PATH);
      expect(src).toMatch(/['"]token['"]/);
      expect(src).toMatch(/['"]terminal['"]/);
      expect(src).toMatch(/['"]blocked['"]/);
      expect(src).toMatch(/['"]error['"]/);
    });
  });

  describe('AC-2 / AC-3 / AC-5 — unified state machine', () => {
    it('exports a state machine with idle/streaming/reconnecting/complete/cancelled', () => {
      const src = read(HOOK_PATH);
      for (const phase of ['idle', 'streaming', 'reconnecting', 'complete', 'cancelled'] as const) {
        expect(src, `phase ${phase} missing`).toMatch(new RegExp(`['"]${phase}['"]`));
      }
    });

    it('chat screen wires useResumableSSEStream (no new screen file)', () => {
      const src = read(CHAT_SCREEN_PATH);
      expect(src).toMatch(/useResumableSSEStream|use-resumable-sse-stream/);
      expect(src).toMatch(/\/api\/chat-runs/);
      expect(src).not.toMatch(/from\s+['"]convex\/react['"]/);
      // No sibling streaming screen
      expect(
        existsSync(join(REPO_ROOT, 'app', '(drawer)', 'chat', 'ChatStreamingScreen.tsx'))
      ).toBe(false);
    });

    it('cancel posts to POST /api/chat-runs/:id/cancel', () => {
      const hook = read(HOOK_PATH);
      const screen = read(CHAT_SCREEN_PATH);
      const combined = `${hook}\n${screen}`;
      expect(combined).toMatch(/\/api\/chat-runs\/.+\/cancel|chat-runs\/\$\{.*\}\/cancel/);
    });
  });

  describe('AC-3 — exactly-once durable reconciliation', () => {
    it('use-chat-history reconciles streaming preview with Zero durable rows', () => {
      const src = read(CHAT_HISTORY_PATH);
      expect(src).toMatch(/stream|reconcil|durable|overlay/i);
      expect(src).toMatch(/chatMessagesByConversation/);
      expect(src).not.toMatch(/from\s+['"]convex\/react['"]/);
    });

    it('ChatThread surfaces streaming phase / reconnecting / streamingMessageId', () => {
      const src = read(CHAT_THREAD_PATH);
      expect(src).toMatch(/streamingMessageId/);
      // reconnecting indicator or streamPhase for AC-2 UX
      expect(src).toMatch(/reconnect|streamPhase|streamStatus/i);
    });
  });

  describe('pure token assembly — zero duplicates (AC-2 / AC-4)', () => {
    it('applyTokenEvent ignores seq <= lastSeq (no duplicates on gap-fill)', async () => {
      // Dynamic import so RED fails cleanly when the module is absent
      const mod = await import('../../hooks/use-resumable-sse-stream');
      expect(typeof mod.applyTokenEvent).toBe('function');

      let state = { lastSeq: 0, text: '', tokenCount: 0 };
      state = mod.applyTokenEvent(state, 1, 'Hel');
      state = mod.applyTokenEvent(state, 2, 'lo');
      // Replay of seq 1 and 2 must be ignored
      state = mod.applyTokenEvent(state, 1, 'Hel');
      state = mod.applyTokenEvent(state, 2, 'lo');
      // Gap-fill after Last-Event-ID=2
      state = mod.applyTokenEvent(state, 3, '!');
      expect(state.text).toBe('Hello!');
      expect(state.lastSeq).toBe(3);
      expect(state.tokenCount).toBe(3);
    });

    it('reconcileThreadMessages yields exactly one assistant bubble for a stream', async () => {
      const mod = await import('../../hooks/use-resumable-sse-stream');
      expect(typeof mod.reconcileThreadMessages).toBe('function');

      const durableId = 'durable-msg-1';
      const durable = [
        {
          id: 'user-1',
          role: 'user' as const,
          content: 'hi',
          createdAt: new Date(1),
        },
      ];

      // While streaming and durable not yet synced: inject one preview
      const mid = mod.reconcileThreadMessages(durable, {
        durableMessageId: durableId,
        content: 'Four',
        phase: 'streaming',
      });
      expect(mid.filter((m: { role: string }) => m.role === 'agent')).toHaveLength(1);
      expect(mid.find((m: { id: string }) => m.id === durableId)?.content).toBe('Four');

      // After durable arrives: exactly one agent row (Zero authoritative)
      const withDurable = [
        ...durable,
        {
          id: durableId,
          role: 'agent' as const,
          content: 'Four',
          createdAt: new Date(2),
        },
      ];
      const done = mod.reconcileThreadMessages(withDurable, {
        durableMessageId: durableId,
        content: 'Four',
        phase: 'complete',
      });
      expect(done.filter((m: { role: string }) => m.role === 'agent')).toHaveLength(1);
      expect(done.filter((m: { id: string }) => m.id === durableId)).toHaveLength(1);
    });
  });
});
