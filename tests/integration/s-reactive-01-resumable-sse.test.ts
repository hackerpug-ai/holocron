/**
 * @vitest-environment jsdom
 */

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
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ModuleStreamHandoff } from '../../hooks/use-resumable-sse-stream';

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

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: (listener: (state: { isConnected: boolean; type: string }) => void) => {
      listener({ isConnected: true, type: 'wifi' });
      return () => {};
    },
    fetch: async () => ({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    }),
  },
}));

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
    it('resumable sse transport uses openProgressiveSse/XMLHttpRequest (not a mock stub)', () => {
      const src = read(HOOK_PATH);
      // Live transport is progressive XHR SSE (RN fetch lacks getReader) — pin to code, not prose.
      expect(src).toMatch(/function openProgressiveSse/);
      expect(src).toMatch(/new XMLHttpRequest\s*\(/);
      expect(src).toMatch(/openProgressiveSse\s*\(/);
      expect(src).toMatch(/eventsource-rn-polyfill\.js/);
      expect(src).toMatch(/\/api\/chat-runs\/.+\/events|chat-runs\/\$\{.*\}\/events/);
      expect(src).toMatch(/Last-Event-ID/);
      // Unused WhatWG eventsource import must not remain after S31-FE-05
      expect(src).not.toMatch(/from\s+['"]eventsource['"]/);
      expect(src).not.toMatch(/WhatWgEventSource/);
      // Must not mock EventSource for tests (3 mock-rejection assertions retained)
      expect(src).not.toMatch(/vi\.mock\(['"]eventsource['"]\)|jest\.mock\(['"]eventsource['"]\)/);
      expect(src).not.toMatch(/mockEventSource|FakeEventSource|stubEventSource/);
      expect(existsSync(join(REPO_ROOT, 'lib', 'eventsource-rn-polyfill.js'))).toBe(true);
      expect(existsSync(join(REPO_ROOT, 'lib', 'eventsource-rn-polyfill.ts'))).toBe(true);
    });

    it('hook sends Last-Event-ID on resume (gap-fill only seq > afterSeq)', () => {
      const src = read(HOOK_PATH);
      expect(src).toMatch(/Last-Event-ID/);
      // Must track last observed seq for resume
      expect(src).toMatch(/lastSeq|lastEventId|afterSeq/);
      // REDHAT-FIX-03: pure header builder used at runtime (mutant-killable)
      expect(src).toMatch(/export function buildSseResumeHeaders/);
      expect(src).toMatch(/buildSseResumeHeaders\(\s*\{\s*apiKey,\s*lastSeq:/);
      // M2: poll fallback can be disabled under test so SSE path is proven
      expect(src).toMatch(/disableStatusPollFallback/);
    });

    it('Maestro reconnect-exactly-once captures numeric lastSeq/tokenCount (not visibility-only)', () => {
      const yml = read(join(REPO_ROOT, '.maestro', 'reactive', 'reconnect-exactly-once.yml'));
      // Must assert value-bearing oracles (H3 fix) — not only chat-stream-last-seq visible
      expect(yml).toMatch(/chat-stream-last-seq-at-least-3/);
      expect(yml).toMatch(/chat-stream-token-count-at-least-3/);
      expect(yml).toMatch(/chat-assistant-bubble-count-1/);
      expect(yml).toMatch(/chat-assistant-message-latest/);
      // Ban the old visibility-only last-seq without numeric threshold
      // (assertVisible chat-stream-last-seq alone is insufficient)
      expect(yml).toMatch(/chat-stream-last-seq-at-least-3/);
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

    it('AC-5: local cancelled/complete supersedes Zero agent_busy (composer not stuck)', () => {
      const src = read(CHAT_SCREEN_PATH);
      // Must not OR agent_busy alone into busy while stream is locally terminal
      expect(src).toMatch(/isLocallyTerminal|suppressAgentBusy/);
      expect(src).toMatch(/streamPhase === 'cancelled'|phase === 'cancelled'/);
      expect(src).toMatch(/setSuppressAgentBusy\(true\)/);
    });
  });

  describe('F-DEP-01 / F-RECON-01 / F-ID-01 remediation contracts', () => {
    it('eventsource is a direct package.json dependency', () => {
      const pkg = JSON.parse(read(join(REPO_ROOT, 'package.json'))) as {
        dependencies?: Record<string, string>;
      };
      expect(pkg.dependencies?.eventsource, 'eventsource must be a direct dependency').toBeTruthy();
    });

    it('offline closes EventSource; online re-opens with Last-Event-ID', () => {
      const src = read(HOOK_PATH);
      expect(src).toMatch(/isOnline/);
      expect(src).toMatch(/closeSource/);
      // Offline path must close the socket, not only flip phase
      expect(src).toMatch(/!isOnline[\s\S]{0,200}closeSource|closeSource[\s\S]{0,120}reconnecting/);
      expect(src).toMatch(/Last-Event-ID/);
    });

    it('connect refuses without durableMessageId from create', () => {
      const hook = read(HOOK_PATH);
      const screen = read(CHAT_SCREEN_PATH);
      expect(hook).toMatch(/durableMessageId is required/);
      expect(screen).toMatch(/durableMessageId/);
      expect(screen).toMatch(
        /omitted durableMessageId|durableMessageId is required|!body\.durableMessageId/
      );
    });

    it('Maestro flows use non-optional stop/complete oracles', () => {
      for (const flow of MAESTRO_FLOWS) {
        const yml = read(join(REPO_ROOT, '.maestro', 'reactive', flow));
        // Success selectors must target the NEW turn, not bare chat-assistant-message
        // (seed rows use chat-assistant-message-<durableId> and must not fake AC pass).
        expect(yml, flow).toMatch(
          /chat-assistant-message-streaming|chat-assistant-message-latest|stop-generating-button/
        );
        // Hardened flows assert stop visibility without optional for core path
        if (flow === 'cancel-stops-stream.yml') {
          expect(yml).toMatch(/assertNotVisible:[\s\S]*stop-generating-button/);
          expect(yml).toMatch(/chat-input/);
          // AC-5: wait for >=3 tokens before cancel (not a blind short sleep)
          expect(yml).toMatch(/chat-stream-token-count-at-least-3/);
          // Ban the old "wait 1.5s then cancel" pattern (word-boundary so 15000 is ok)
          expect(yml).not.toMatch(/timeout:\s*1500\b/);
        }
        if (flow === 'token-streaming.yml') {
          // AC-1 must_observe: non-optional token growth + streaming bubble
          expect(yml).toMatch(/chat-stream-token-count-at-least-1/);
          expect(yml).toMatch(/chat-assistant-message-streaming/);
          expect(yml).toMatch(/assertVisible:[\s\S]*stop-generating-button/);
          // optional: true on token-count oracle is banned
          expect(yml).not.toMatch(/id:\s*"chat-stream-token-count"[\s\S]{0,40}optional:\s*true/);
        }
      }
    });

    it('ChatThread de-fakes seed vs streaming assistant testIDs', () => {
      const src = read(CHAT_THREAD_PATH);
      expect(src).toMatch(/chat-assistant-message-streaming/);
      expect(src).toMatch(/chat-assistant-message-latest/);
      expect(src).toMatch(/chat-stream-token-count-at-least-1/);
      expect(src).toMatch(/chat-stream-token-count-at-least-3/);
      // Bare shared success id must not be assigned to every agent row
      expect(src).not.toMatch(
        /rowTestId = item\.role === ['"]agent['"] \? ['"]chat-assistant-message['"]/
      );
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

    it('GATE-FIX-01: empty durable placeholder merges overlay content (no second bubble)', async () => {
      const mod = await import('../../hooks/use-resumable-sse-stream');
      const durableId = 'durable-empty-1';
      const durable = [
        {
          id: 'seed-agent',
          role: 'agent' as const,
          content: 'Assistant seed reply for Streaming',
          createdAt: new Date(1),
        },
        {
          id: durableId,
          role: 'agent' as const,
          content: '',
          createdAt: new Date(2),
        },
      ];
      const merged = mod.reconcileThreadMessages(durable, {
        durableMessageId: durableId,
        content: 'Streaming reply about five. One two three four five.',
        phase: 'complete',
      });
      const agents = merged.filter((m: { role: string }) => m.role === 'agent');
      expect(agents).toHaveLength(2);
      expect(merged.filter((m: { id: string }) => m.id === durableId)).toHaveLength(1);
      expect(merged.find((m: { id: string }) => m.id === durableId)?.content).toContain(
        'Streaming reply'
      );
    });

    it('GATE-FIX-01: empty terminal overlay is not injected (no invisible latest steal)', async () => {
      const mod = await import('../../hooks/use-resumable-sse-stream');
      const durable = [
        {
          id: 'seed-agent',
          role: 'agent' as const,
          content: 'Assistant seed reply for Streaming',
          createdAt: new Date(1),
        },
      ];
      const out = mod.reconcileThreadMessages(durable, {
        durableMessageId: 'turn-empty',
        content: '',
        phase: 'complete',
      });
      expect(out.filter((m: { role: string }) => m.role === 'agent')).toHaveLength(1);
      expect(out.find((m: { id: string }) => m.id === 'turn-empty')).toBeUndefined();
    });

    it('GATE-FIX-01: selectLatestAgentMessage ignores empty previews', async () => {
      const { selectLatestAgentMessage } = await import(
        '../../components/chat/select-latest-agent'
      );
      const latest = selectLatestAgentMessage([
        {
          id: 'seed',
          role: 'agent',
          content: 'Assistant seed reply for Streaming',
          createdAt: new Date(1),
        },
        {
          id: 'empty-preview',
          role: 'agent',
          content: '',
          createdAt: new Date(99),
        },
      ]);
      expect(latest?.id).toBe('seed');
      expect(latest?.content).toContain('seed reply');
    });

    it('GATE-FIX-01: module stream handoff survives dispose (remount snapshot)', async () => {
      const mod = await import('../../hooks/use-resumable-sse-stream');
      mod.clearModuleStreamHandoff();
      const ctrl = mod.createResumableSseController({
        platformUrl: 'http://127.0.0.1:9',
        apiKey: 'test-key',
        disableStatusPollFallback: true,
        conversationId: 'conv-A',
      });
      // Simulate a completed turn with assembled text without opening SSE.
      // restoreFromHandoff is the remount entry; first write handoff via connect path
      // is network-heavy — unit the pure handoff helpers + restore snapshot instead.
      const handoffSeed: ModuleStreamHandoff = {
        conversationId: 'conv-A',
        runId: 'run-handoff-1',
        durableMessageId: 'durable-handoff-1',
        lastSeq: 5,
        text: 'Streaming reply about five. One two three four five.',
        tokenCount: 5,
        phase: 'complete',
        updatedAt: Date.now(),
      };
      ctrl.restoreFromHandoff(handoffSeed);
      const snap = ctrl.getSnapshot();
      expect(snap.phase).toBe('complete');
      expect(snap.runId).toBe('run-handoff-1');
      expect(snap.durableMessageId).toBe('durable-handoff-1');
      expect(snap.streamedText).toContain('Streaming reply about');
      expect(snap.tokenCount).toBeGreaterThanOrEqual(1);

      // dispose must keep module handoff for the next mount
      ctrl.dispose();
      const handoff = mod.getModuleStreamHandoff();
      expect(handoff).not.toBeNull();
      if (!handoff) {
        throw new Error('expected same-conversation handoff after dispose');
      }
      expect(handoff?.conversationId).toBe('conv-A');
      expect(handoff?.text).toContain('Streaming reply about');
      expect(handoff?.phase).toBe('complete');

      const ctrl2 = mod.createResumableSseController({
        platformUrl: 'http://127.0.0.1:9',
        apiKey: 'test-key',
        disableStatusPollFallback: true,
        conversationId: 'conv-A',
      });
      ctrl2.restoreFromHandoff(handoff);
      expect(ctrl2.getSnapshot().streamedText).toContain('Streaming reply about');
      expect(ctrl2.getSnapshot().phase).toBe('complete');
      ctrl2.reset();
      expect(mod.getModuleStreamHandoff()).toBeNull();
    });

    it('GATE-FIX-02: production hook mount keeps conv-B idle and preserves same-conversation conv-A remount restore', async () => {
      const mod = await import('../../hooks/use-resumable-sse-stream');
      mod.clearModuleStreamHandoff();

      const ctrlA = mod.createResumableSseController({
        platformUrl: 'http://127.0.0.1:9',
        apiKey: 'test-key',
        disableStatusPollFallback: true,
        conversationId: 'conv-A',
      });
      const handoffForConversationA: ModuleStreamHandoff = {
        conversationId: 'conv-A',
        runId: 'run-handoff-A',
        durableMessageId: 'durable-handoff-A',
        lastSeq: 7,
        text: 'REPLY-FROM-A',
        tokenCount: 7,
        phase: 'complete',
        updatedAt: Date.now(),
      };
      ctrlA.restoreFromHandoff(handoffForConversationA);
      ctrlA.dispose();

      const storedA = mod.getModuleStreamHandoff();
      expect(storedA).not.toBeNull();
      if (!storedA) {
        throw new Error('expected conv-A handoff after dispose');
      }
      expect(storedA.conversationId).toBe('conv-A');
      expect(storedA.text).toContain('REPLY-FROM-A');

      const hookB = renderHook(() =>
        mod.useResumableSSEStream({
          platformUrl: 'http://127.0.0.1:9',
          apiKey: 'test-key',
          disableStatusPollFallback: true,
          conversationId: 'conv-B',
        })
      );

      await waitFor(() => {
        expect(hookB.result.current.phase).toBe('idle');
      });
      expect(hookB.result.current.runId).toBeNull();
      expect(hookB.result.current.durableMessageId).toBeNull();
      expect(hookB.result.current.streamedText).toBe('');
      expect(hookB.result.current.lastSeq).toBe(0);
      expect(hookB.result.current.tokenCount).toBe(0);
      expect(hookB.result.current.streamedText).not.toContain('REPLY-FROM-A');

      const storedAfterBMount = mod.getModuleStreamHandoff();
      expect(storedAfterBMount?.conversationId).toBe('conv-A');
      expect(storedAfterBMount?.text).toContain('REPLY-FROM-A');

      hookB.unmount();

      const hookA = renderHook(() =>
        mod.useResumableSSEStream({
          platformUrl: 'http://127.0.0.1:9',
          apiKey: 'test-key',
          disableStatusPollFallback: true,
          conversationId: 'conv-A',
        })
      );

      await waitFor(() => {
        expect(hookA.result.current.phase).toBe('complete');
        expect(hookA.result.current.runId).toBe('run-handoff-A');
      });
      expect(hookA.result.current.durableMessageId).toBe('durable-handoff-A');
      expect(hookA.result.current.streamedText).toContain('REPLY-FROM-A');
      expect(hookA.result.current.lastSeq).toBe(7);
      expect(hookA.result.current.tokenCount).toBe(7);

      const storedAfterARemount = mod.getModuleStreamHandoff();
      expect(storedAfterARemount?.conversationId).toBe('conv-A');
      expect(storedAfterARemount?.text).toContain('REPLY-FROM-A');

      act(() => {
        hookA.result.current.reset();
      });

      await waitFor(() => {
        expect(hookA.result.current.phase).toBe('idle');
      });
      expect(mod.getModuleStreamHandoff()).toBeNull();
      hookA.unmount();
    });

    it('GATE-FIX-01: ChatThread fail-safe requires painted MessageBubble content', () => {
      const src = read(CHAT_THREAD_PATH);
      // Product-tightened: fail-safe must gate on messages.some painted content
      expect(src).toMatch(/messages\.some/);
      expect(src).toMatch(/paintedLatest|fail-safe/);
      // Must not mount latest solely from streamedText without FlatList row
      expect(src).toMatch(/m\.id === latestAgentId/);
    });

    it('GATE-FIX-01: reconnect Maestro asserts non-seed painted assistant text', () => {
      const yml = read(join(REPO_ROOT, '.maestro', 'reactive', 'reconnect-exactly-once.yml'));
      // Mid-body spans stay in viewport when the tall deterministic reply clips its prefix
      expect(yml).toMatch(/One two three|Rivers mountains/);
      // Live user prompt visibility (non-empty yellow bubble)
      expect(yml).toMatch(/number five|detailed multi-sentence|eight words/);
    });

    it('GATE-FIX-01: chat screen keeps optimistic pending user for live turn', () => {
      const src = read(CHAT_SCREEN_PATH);
      expect(src).toMatch(/modulePendingUser|pending-user-/);
      expect(src).toMatch(/pendingUser/);
    });
  });
});
