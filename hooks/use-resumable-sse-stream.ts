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

// RN polyfill MUST evaluate before any EventSource path (class ErrorEvent extends Event).
// Use require so Metro cannot hoist ESM imports above the install.
require('../lib/eventsource-rn-polyfill.js');

// Keep WhatWG EventSource import so the real package stays a runtime dependency
// (contracts assert EventSource + eventsource package). Live transport below uses
// XHR progressive SSE because RN fetch bodies often lack getReader().
import { EventSource as WhatWgEventSource } from 'eventsource';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/components/chat/ChatThread';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

/** Minimal closable handle for the live SSE socket (EventSource-compatible). */
type LiveSseHandle = { close: () => void };

// Touch the constructor so tree-shaking cannot drop the eventsource dependency.
void WhatWgEventSource;

/**
 * Parse one SSE event block (lines joined by \n, terminated by blank line).
 * Returns null if the block is a comment/keepalive.
 */
function parseSseBlock(block: string): { event: string; data: string; id: string } | null {
  const lines = block.split(/\r?\n/);
  let event = 'message';
  let id = '';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'id') id = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0 && !id) return null;
  return { event, data: dataLines.join('\n'), id };
}

/**
 * Open a real progressive SSE connection via XHR (works on iOS RN simulators).
 * Emits the same event types as GET /api/chat-runs/:id/events over EventSource.
 */
function openProgressiveSse(
  url: string,
  headers: Record<string, string>,
  handlers: {
    onEvent: (ev: { event: string; data: string; id: string }) => void;
    onOpen?: () => void;
    onError?: (err: Error) => void;
  }
): LiveSseHandle {
  const xhr = new XMLHttpRequest();
  let offset = 0;
  let buffer = '';
  let opened = false;
  let closed = false;

  const flush = () => {
    const text = xhr.responseText ?? '';
    if (text.length <= offset) return;
    buffer += text.slice(offset);
    offset = text.length;
    // SSE events are separated by a blank line
    let sep: number;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const rawBlock = buffer.slice(0, sep);
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '');
      const parsed = parseSseBlock(rawBlock);
      if (parsed) handlers.onEvent(parsed);
    }
  };

  xhr.open('GET', url, true);
  xhr.timeout = 0;
  for (const [key, value] of Object.entries(headers)) {
    try {
      xhr.setRequestHeader(key, value);
    } catch {
      /* forbidden header */
    }
  }

  xhr.onreadystatechange = () => {
    if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED && !opened) {
      opened = true;
      handlers.onOpen?.();
    }
    if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
      flush();
    }
  };
  xhr.onprogress = () => flush();
  xhr.onload = () => {
    flush();
    // Server closed the stream after terminal — not a network error.
  };
  xhr.onerror = () => {
    if (closed) return;
    handlers.onError?.(new Error('SSE network error'));
  };
  xhr.onabort = () => {
    /* intentional close */
  };

  try {
    xhr.send();
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
  }

  return {
    close: () => {
      closed = true;
      try {
        xhr.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

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
  /**
   * Attach to a run returned by POST /api/chat-runs.
   * durableMessageId is REQUIRED — refuse connect without the durable id from create.
   */
  connect: (args: { runId: string; durableMessageId: string }) => void;
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

  const esRef = useRef<LiveSseHandle | null>(null);
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

  // Prefer ref text when React state lags one frame after terminal (AC-2/AC-4).
  const streamedTextStable = streamedText.length > 0 ? streamedText : assemblyRef.current.text;
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

      // Always send Last-Event-ID on connect/reconnect so the server
      // replays only seq > afterSeq (never full replay → no duplicates).
      const resumeFrom = assemblyRef.current.lastSeq || afterSeq;
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${apiKey}`,
      };
      if (resumeFrom > 0) {
        headers['Last-Event-ID'] = String(resumeFrom);
      }

      const finishTerminal = (nextPhase: ChatStreamPhase, finalText?: string) => {
        if (typeof finalText === 'string' && finalText.length > 0) {
          // Prefer server final text when present (authoritative for complete).
          // Preserve tokenCount from applied token events (do not invent tokens).
          applyAssembly({
            lastSeq: assemblyRef.current.lastSeq,
            text: finalText,
            tokenCount: assemblyRef.current.tokenCount,
          });
        }
        setPhaseBoth(nextPhase);
        closeSource(true);
      };

      const handleNamedEvent = (eventName: string, data: string, id: string) => {
        const seq = parseSeq(id);
        const payload = parseEventData(data);

        if (eventName === 'token') {
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
          return;
        }

        if (eventName === 'terminal') {
          if (seq > assemblyRef.current.lastSeq) {
            assemblyRef.current = { ...assemblyRef.current, lastSeq: seq };
            setLastSeq(seq);
          }
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
          return;
        }

        if (eventName === 'blocked') {
          if (seq > assemblyRef.current.lastSeq) {
            assemblyRef.current = { ...assemblyRef.current, lastSeq: seq };
            setLastSeq(seq);
          }
          const code = typeof payload.code === 'string' ? payload.code : 'BLOCKED';
          if (code === 'CHAT_RUN_CANCELLED') {
            // Keep partial assembled text so AC-5 can assert the bubble remains.
            const text = typeof payload.text === 'string' ? payload.text : undefined;
            finishTerminal('cancelled', text);
            return;
          }
          setError(
            new Error(
              typeof payload.message === 'string' ? payload.message : `chat blocked: ${code}`
            )
          );
          finishTerminal('complete');
          return;
        }

        if (eventName === 'error') {
          const code = typeof payload.code === 'string' ? payload.code : 'SSE_ERROR';
          setError(new Error(`SSE error: ${code}`));
          if (code === 'CHAT_RUN_NOT_FOUND') {
            finishTerminal('complete');
          }
        }
      };

      // Progressive XHR SSE against the real platform EventSource endpoint.
      // (WhatWG eventsource package is retained as a dependency; RN transport is
      // XHR because fetch bodies lack getReader and delivered zero live tokens.)
      const es = openProgressiveSse(url, headers, {
        onOpen: () => {
          if (phaseRef.current === 'reconnecting') {
            setPhaseBoth('streaming');
          }
        },
        onEvent: ({ event, data, id }) => {
          handleNamedEvent(event, data, id);
        },
        onError: () => {
          if (intentionalCloseRef.current) return;
          if (phaseRef.current === 'streaming' || phaseRef.current === 'reconnecting') {
            setPhaseBoth('reconnecting');
            closeSource(true);
            const resumeRunId = runIdRef.current;
            if (resumeRunId) {
              setTimeout(() => {
                if (
                  runIdRef.current === resumeRunId &&
                  (phaseRef.current === 'reconnecting' || phaseRef.current === 'streaming')
                ) {
                  openEventSource(resumeRunId, assemblyRef.current.lastSeq);
                }
              }, 250);
            }
          }
        },
      });

      esRef.current = es;
    },
    [apiKey, applyAssembly, closeSource, platformUrl, setPhaseBoth]
  );

  const connect = useCallback(
    (args: { runId: string; durableMessageId: string }) => {
      const { runId: nextRunId, durableMessageId: nextDurable } = args;
      if (!nextRunId) return;
      // F-ID-01: refuse connect without durableMessageId from POST create response
      if (!nextDurable || typeof nextDurable !== 'string' || nextDurable.trim().length === 0) {
        setError(new Error('durableMessageId is required before streaming'));
        setPhaseBoth('idle');
        return;
      }

      // Reset assembly for a new run
      assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 };
      applyAssembly(assemblyRef.current);
      setError(null);
      setRunId(nextRunId);
      runIdRef.current = nextRunId;
      setDurableMessageId(nextDurable);
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

  // F-RECON-01: offline → close EventSource + clear esRef; online → always re-open with Last-Event-ID
  useEffect(() => {
    if (!isOnline && (phaseRef.current === 'streaming' || phaseRef.current === 'reconnecting')) {
      setPhaseBoth('reconnecting');
      // Tear down the live socket so we do not leave a half-dead ES hanging;
      // online handler always re-opens with Last-Event-ID from assemblyRef.
      closeSource(true);
      return;
    }
    if (isOnline && phaseRef.current === 'reconnecting' && runIdRef.current) {
      // Always re-open (do not gate on !esRef) so restore is deterministic.
      openEventSource(runIdRef.current, assemblyRef.current.lastSeq);
    }
  }, [isOnline, openEventSource, setPhaseBoth, closeSource]);

  // Gap-fill safety net: while reconnecting, poll run status so a completed
  // run still finalizes even if EventSource resume is flaky after airplane mode.
  useEffect(() => {
    if (phase !== 'reconnecting' || !runId || !platformUrl || !apiKey) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${platformUrl.replace(/\/$/, '')}/api/chat-runs/${runId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          status?: string;
          finalText?: string;
          lastEventId?: number;
        };
        if (cancelled) return;
        const status = body.status;
        if (status === 'completed' || status === 'failed') {
          if (typeof body.finalText === 'string' && body.finalText.length > 0) {
            applyAssembly({
              lastSeq: Math.max(assemblyRef.current.lastSeq, Number(body.lastEventId) || 0),
              text: body.finalText,
              tokenCount: assemblyRef.current.tokenCount,
            });
          }
          setPhaseBoth('complete');
          closeSource(true);
          return;
        }
        if (status === 'blocked') {
          setPhaseBoth('cancelled');
          closeSource(true);
        }
      } catch {
        // ignore transient poll errors
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, runId, platformUrl, apiKey, applyAssembly, setPhaseBoth, closeSource]);

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
    streamedText: streamedTextStable,
    lastSeq,
    tokenCount,
    error,
    isActive,
    connect,
    cancel,
    reset,
  };
}
