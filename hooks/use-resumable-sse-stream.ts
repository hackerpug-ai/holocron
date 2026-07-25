/**
 * Resumable SSE chat stream client (S-REACTIVE-01 / UC-SYNC-02).
 *
 * Opens a real EventSource against GET /api/chat-runs/:id/events with
 * Authorization + Last-Event-ID gap-fill. Honors backend event types:
 *   token | terminal | blocked | error  (monotonic seq as SSE id)
 *
 * Unified state machine: idle → streaming → (reconnecting → streaming)* →
 * complete | cancelled. Never navigates; consumers mutate UI from `phase`.
 *
 * Exactly-once: only apply events with seq > lastSeq; durable Zero row is
 * authoritative after terminal (see reconcileThreadMessages).
 */

import { EventSource } from 'eventsource';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/components/chat/ChatThread';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export type ChatStreamPhase = 'idle' | 'streaming' | 'reconnecting' | 'complete' | 'cancelled';

export type TokenAssemblyState = {
  lastSeq: number;
  text: string;
  tokenCount: number;
};

export type StreamOverlay = {
  durableMessageId: string | null;
  content: string;
  phase: ChatStreamPhase;
};

export type UseResumableSSEStreamOptions = {
  platformUrl?: string | null;
  apiKey?: string | null;
};

export type UseResumableSSEStreamReturn = {
  phase: ChatStreamPhase;
  runId: string | null;
  durableMessageId: string | null;
  streamedText: string;
  lastSeq: number;
  tokenCount: number;
  error: Error | null;
  isActive: boolean;
  /** Attach to a run returned by POST /api/chat-runs */
  connect: (args: { runId: string; durableMessageId?: string | null }) => void;
  /** POST /api/chat-runs/:id/cancel and finalize partial turn */
  cancel: () => Promise<void>;
  /** Return to idle (after Zero has caught up) */
  reset: () => void;
};

/**
 * Apply one SSE token event. Events with seq <= lastSeq are ignored so
 * Last-Event-ID gap-fill never duplicates tokens (AC-2 / AC-4).
 */
export function applyTokenEvent(
  state: TokenAssemblyState,
  seq: number,
  token: string
): TokenAssemblyState {
  if (!Number.isFinite(seq) || seq <= state.lastSeq) {
    return state;
  }
  return {
    lastSeq: seq,
    text: state.text + token,
    tokenCount: state.tokenCount + 1,
  };
}

/**
 * Merge Zero durable messages with an optional in-flight SSE preview so the
 * thread always shows exactly one assistant bubble for the active run.
 *
 * - While streaming and durable not yet synced: inject one preview row
 * - When durable row exists: Zero is authoritative (no second bubble)
 */
export function reconcileThreadMessages(
  durable: ChatMessage[],
  overlay: StreamOverlay | null | undefined
): ChatMessage[] {
  if (!overlay?.durableMessageId) return durable;
  if (overlay.phase === 'idle') return durable;

  const already = durable.some((m) => m.id === overlay.durableMessageId);
  if (already) {
    // Durable row won — never inject a second bubble with the same id.
    return durable;
  }

  // Preview only while we have content (or are waiting for first token).
  if (
    overlay.phase === 'streaming' ||
    overlay.phase === 'reconnecting' ||
    overlay.phase === 'complete' ||
    overlay.phase === 'cancelled'
  ) {
    const preview: ChatMessage = {
      id: overlay.durableMessageId,
      role: 'agent',
      content: overlay.content,
      message_type: 'text',
      createdAt: new Date(),
    };
    return [...durable, preview];
  }

  return durable;
}

function parseSeq(raw: string | null | undefined): number {
  if (raw == null || raw === '') return 0;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseEventData(data: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // non-JSON payloads are ignored
  }
  return {};
}

/**
 * Hook: real EventSource SSE client with Last-Event-ID resume.
 */
export function useResumableSSEStream(
  options: UseResumableSSEStreamOptions = {}
): UseResumableSSEStreamReturn {
  const platformUrl = options.platformUrl ?? process.env.EXPO_PUBLIC_PLATFORM_URL;
  const apiKey = options.apiKey ?? process.env.EXPO_PUBLIC_RN_API_KEY;

  const [phase, setPhase] = useState<ChatStreamPhase>('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [durableMessageId, setDurableMessageId] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState('');
  const [lastSeq, setLastSeq] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const assemblyRef = useRef<TokenAssemblyState>({ lastSeq: 0, text: '', tokenCount: 0 });
  const phaseRef = useRef<ChatStreamPhase>('idle');
  const runIdRef = useRef<string | null>(null);
  const intentionalCloseRef = useRef(false);
  const { isOnline } = useNetworkStatus();

  const setPhaseBoth = useCallback((next: ChatStreamPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const closeSource = useCallback((intentional: boolean) => {
    intentionalCloseRef.current = intentional;
    const es = esRef.current;
    esRef.current = null;
    if (es) {
      try {
        es.close();
      } catch {
        // ignore
      }
    }
  }, []);

  const applyAssembly = useCallback((next: TokenAssemblyState) => {
    assemblyRef.current = next;
    setLastSeq(next.lastSeq);
    setStreamedText(next.text);
    setTokenCount(next.tokenCount);
  }, []);

  const openEventSource = useCallback(
    (targetRunId: string, afterSeq: number) => {
      if (!platformUrl || !apiKey) {
        setError(new Error('Platform URL or RN API key is not configured'));
        setPhaseBoth('idle');
        return;
      }

      closeSource(true);

      const url = `${platformUrl.replace(/\/$/, '')}/api/chat-runs/${targetRunId}/events`;
      intentionalCloseRef.current = false;

      // Real EventSource with Authorization + Last-Event-ID for gap-fill.
      // Custom fetch injects headers (WhatWG EventSource cannot set them alone).
      const es = new EventSource(url, {
        fetch: (input, init) => {
          const headers: Record<string, string> = {
            ...(init.headers as Record<string, string>),
            Accept: 'text/event-stream',
            Authorization: `Bearer ${apiKey}`,
          };
          // Always send Last-Event-ID on connect/reconnect so the server
          // replays only seq > afterSeq (never full replay → no duplicates).
          const resumeFrom = assemblyRef.current.lastSeq || afterSeq;
          if (resumeFrom > 0) {
            headers['Last-Event-ID'] = String(resumeFrom);
          }
          return fetch(input, {
            ...init,
            headers,
          });
        },
      });

      esRef.current = es;

      const onToken = (ev: MessageEvent) => {
        const seq = parseSeq(ev.lastEventId);
        const payload = parseEventData(ev.data);
        const token = typeof payload.token === 'string' ? payload.token : '';
        if (!token) return;
        const next = applyTokenEvent(assemblyRef.current, seq, token);
        if (next !== assemblyRef.current) {
          applyAssembly(next);
        }
        if (phaseRef.current === 'reconnecting') {
          setPhaseBoth('streaming');
        } else if (phaseRef.current !== 'streaming') {
          setPhaseBoth('streaming');
        }
      };

      const finishTerminal = (nextPhase: ChatStreamPhase, finalText?: string) => {
        if (typeof finalText === 'string' && finalText.length > 0) {
          // Prefer server final text when present (authoritative for complete).
          applyAssembly({
            lastSeq: assemblyRef.current.lastSeq,
            text: finalText,
            tokenCount: assemblyRef.current.tokenCount,
          });
        }
        setPhaseBoth(nextPhase);
        closeSource(true);
      };

      const onTerminal = (ev: MessageEvent) => {
        const seq = parseSeq(ev.lastEventId);
        if (seq > assemblyRef.current.lastSeq) {
          assemblyRef.current = {
            ...assemblyRef.current,
            lastSeq: seq,
          };
          setLastSeq(seq);
        }
        const payload = parseEventData(ev.data);
        const status = typeof payload.status === 'string' ? payload.status : 'completed';
        const text = typeof payload.text === 'string' ? payload.text : undefined;
        if (status === 'failed') {
          setError(
            new Error(typeof payload.error === 'string' ? payload.error : 'chat run failed')
          );
          finishTerminal('complete', text);
          return;
        }
        finishTerminal('complete', text);
      };

      const onBlocked = (ev: MessageEvent) => {
        const seq = parseSeq(ev.lastEventId);
        if (seq > assemblyRef.current.lastSeq) {
          assemblyRef.current = { ...assemblyRef.current, lastSeq: seq };
          setLastSeq(seq);
        }
        const payload = parseEventData(ev.data);
        const code = typeof payload.code === 'string' ? payload.code : 'BLOCKED';
        if (code === 'CHAT_RUN_CANCELLED') {
          finishTerminal('cancelled');
          return;
        }
        setError(
          new Error(typeof payload.message === 'string' ? payload.message : `chat blocked: ${code}`)
        );
        finishTerminal('complete');
      };

      const onErrorEvent = (ev: MessageEvent) => {
        const payload = parseEventData(ev.data);
        const code = typeof payload.code === 'string' ? payload.code : 'SSE_ERROR';
        setError(new Error(`SSE error: ${code}`));
        // CHAT_RUN_NOT_FOUND is terminal for the client
        if (code === 'CHAT_RUN_NOT_FOUND') {
          finishTerminal('complete');
        }
      };

      es.addEventListener('token', onToken as EventListener);
      es.addEventListener('terminal', onTerminal as EventListener);
      es.addEventListener('blocked', onBlocked as EventListener);
      es.addEventListener('error', (ev) => {
        // Named SSE "error" events arrive as MessageEvent with data; connection
        // errors arrive as ErrorEvent without data. Distinguish carefully.
        if (ev instanceof MessageEvent && typeof ev.data === 'string' && ev.data.length > 0) {
          onErrorEvent(ev);
          return;
        }
        if (intentionalCloseRef.current) return;
        if (phaseRef.current === 'streaming' || phaseRef.current === 'reconnecting') {
          setPhaseBoth('reconnecting');
        }
      });

      es.onopen = () => {
        if (phaseRef.current === 'reconnecting') {
          setPhaseBoth('streaming');
        }
      };
    },
    [apiKey, applyAssembly, closeSource, platformUrl, setPhaseBoth]
  );

  const connect = useCallback(
    (args: { runId: string; durableMessageId?: string | null }) => {
      const { runId: nextRunId, durableMessageId: nextDurable } = args;
      if (!nextRunId) return;

      // Reset assembly for a new run
      assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 };
      applyAssembly(assemblyRef.current);
      setError(null);
      setRunId(nextRunId);
      runIdRef.current = nextRunId;
      setDurableMessageId(nextDurable ?? null);
      setPhaseBoth('streaming');
      openEventSource(nextRunId, 0);
    },
    [applyAssembly, openEventSource, setPhaseBoth]
  );

  const cancel = useCallback(async () => {
    const id = runIdRef.current;
    closeSource(true);

    if (id && platformUrl && apiKey) {
      try {
        await fetch(`${platformUrl.replace(/\/$/, '')}/api/chat-runs/${id}/cancel`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error('cancel failed'));
      }
    }

    setPhaseBoth('cancelled');
  }, [apiKey, closeSource, platformUrl, setPhaseBoth]);

  const reset = useCallback(() => {
    closeSource(true);
    runIdRef.current = null;
    setRunId(null);
    setDurableMessageId(null);
    assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 };
    applyAssembly(assemblyRef.current);
    setError(null);
    setPhaseBoth('idle');
  }, [applyAssembly, closeSource, setPhaseBoth]);

  // Network drop → reconnecting; restore → ensure EventSource resumes with Last-Event-ID
  useEffect(() => {
    if (!isOnline && (phaseRef.current === 'streaming' || phaseRef.current === 'reconnecting')) {
      setPhaseBoth('reconnecting');
      return;
    }
    if (isOnline && phaseRef.current === 'reconnecting' && runIdRef.current && !esRef.current) {
      openEventSource(runIdRef.current, assemblyRef.current.lastSeq);
    }
  }, [isOnline, openEventSource, setPhaseBoth]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeSource(true);
    };
  }, [closeSource]);

  const isActive: boolean =
    phase === 'streaming' ||
    phase === 'reconnecting' ||
    phase === 'complete' ||
    phase === 'cancelled';

  return {
    phase,
    runId,
    durableMessageId,
    streamedText,
    lastSeq,
    tokenCount,
    error,
    isActive,
    connect,
    cancel,
    reset,
  };
}
