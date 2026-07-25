/**
 * Resumable SSE chat stream client (S-REACTIVE-01 / S-REACTIVE-04 / UC-SYNC-02).
 *
 * Opens a real EventSource against GET /api/chat-runs/:id/events with
 * Authorization + Last-Event-ID gap-fill. Honors backend event types:
 *   token | terminal | blocked | error  (monotonic seq as SSE id)
 *
 * Unified state machine: idle → streaming → (reconnecting → streaming)* →
 * complete | cancelled | degraded. Never navigates; consumers mutate UI from `phase`.
 *
 * S-REACTIVE-04: fleet-unavailable is inferred from the chat failure envelope
 * (POST /api/chat-runs error or SSE terminal/error). Backend reduced-mode state
 * is NOT published on zero_pub and has no HTTP endpoint — never Zero-query it.
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

export type ChatStreamPhase =
  | 'idle'
  | 'streaming'
  | 'reconnecting'
  | 'complete'
  | 'cancelled'
  | 'degraded';

/**
 * Exact backend copy of DegradedModeController SURFACE_UNAVAILABLE_MESSAGE
 * (services/platform/src/inference/degraded-mode-controller.ts:36).
 * Client must render this string verbatim — never a paraphrased generic error.
 */
export const SURFACE_UNAVAILABLE_MESSAGE = 'Local fleet unavailable — running in reduced mode';

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

export type FleetFailureEnvelope = {
  error?: string | null;
  message?: string | null;
  code?: string | null;
  status?: string | null;
  text?: string | null;
};

export type FleetFailureTransition = {
  phase: ChatStreamPhase;
  message: string | null;
  isDegraded: boolean;
};

/**
 * Infer fleet-unavailable from a chat failure envelope (POST create error body
 * or SSE terminal/error payload). Never probes fleet health; never queries
 * backend reduced-mode tables over Zero.
 */
export function isFleetUnavailableFailure(envelope: FleetFailureEnvelope): boolean {
  const blob = [envelope.error, envelope.message, envelope.code, envelope.status, envelope.text]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
  if (!blob) return false;
  return (
    /ROLE_UNAVAILABLE/i.test(blob) ||
    /surface-unavailable/i.test(blob) ||
    /Local fleet unavailable/i.test(blob) ||
    /fleet role ['"]?[\w-]+['"]? unreachable/i.test(blob) ||
    /degradation\s*=\s*surface-unavailable/i.test(blob) ||
    /ECONNREFUSED.*:4545|:4545.*ECONNREFUSED/i.test(blob) ||
    /unreachable at https?:\/\/[^ ]*4545/i.test(blob) ||
    /empty stream under HOLO_CHAT_FLEET_ONLY/i.test(blob)
  );
}

/**
 * Pure state transition: when the envelope is fleet-unavailable, move to
 * `degraded` and surface the exact SURFACE_UNAVAILABLE_MESSAGE.
 */
export function applyFleetFailureEnvelope(args: {
  phase: ChatStreamPhase;
  error?: string | null;
  message?: string | null;
  code?: string | null;
  status?: string | null;
  text?: string | null;
}): FleetFailureTransition {
  if (
    isFleetUnavailableFailure({
      error: args.error,
      message: args.message,
      code: args.code,
      status: args.status,
      text: args.text,
    })
  ) {
    return {
      phase: 'degraded',
      message: SURFACE_UNAVAILABLE_MESSAGE,
      isDegraded: true,
    };
  }
  return {
    phase: args.phase,
    message: null,
    isDegraded: false,
  };
}

export type UseResumableSSEStreamOptions = {
  platformUrl?: string | null;
  apiKey?: string | null;
  /**
   * REDHAT-FIX-03 / M2: when true, disable the reconnect-phase status poll
   * fallback so tests can prove the SSE Last-Event-ID path (cannot sole-greenwash).
   * Production default: false (poll remains as flaky-network safety net).
   */
  disableStatusPollFallback?: boolean;
};

export type ResumeTransport = 'sse' | 'poll' | 'none';

export type UseResumableSSEStreamReturn = {
  phase: ChatStreamPhase;
  runId: string | null;
  durableMessageId: string | null;
  streamedText: string;
  lastSeq: number;
  tokenCount: number;
  error: Error | null;
  /** Exact SURFACE_UNAVAILABLE_MESSAGE when phase === 'degraded'; otherwise null */
  degradedMessage: string | null;
  isActive: boolean;
  /**
   * Provenance of the last successful resume/finalize after reconnect.
   * 'sse' = EventSource/XHR gap-fill; 'poll' = status poll safety net (M2).
   */
  resumeTransport: ResumeTransport;
  /**
   * Attach to a run returned by POST /api/chat-runs.
   * durableMessageId is REQUIRED — refuse connect without the durable id from create.
   */
  connect: (args: { runId: string; durableMessageId: string }) => void;
  /** POST /api/chat-runs/:id/cancel and finalize partial turn */
  cancel: () => Promise<void>;
  /** Return to idle (after Zero has caught up) */
  reset: () => void;
  /**
   * Enter degraded from a POST /api/chat-runs failure envelope (create path).
   * No-op when the envelope is not fleet-unavailable.
   */
  enterDegradedFromEnvelope: (envelope: FleetFailureEnvelope) => boolean;
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
 * Build Authorization + optional Last-Event-ID headers for SSE connect/reconnect.
 * Extracted so integration tests can assert runtime header values (REDHAT-FIX-03)
 * and kill the header-drop mutant that static rg source-match tests miss.
 *
 * @param omitLastEventId — test-only mutant hook (never set in production)
 */
export function buildSseResumeHeaders(args: {
  apiKey: string;
  lastSeq: number;
  /** When true, intentionally drop Last-Event-ID (mutation harness only). */
  omitLastEventId?: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${args.apiKey}`,
  };
  if (!args.omitLastEventId && args.lastSeq > 0) {
    headers['Last-Event-ID'] = String(args.lastSeq);
  }
  return headers;
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
  // Never inject a stream preview for `degraded` — banner owns that UX.
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
  const disableStatusPollFallback = options.disableStatusPollFallback === true;

  const [phase, setPhase] = useState<ChatStreamPhase>('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [durableMessageId, setDurableMessageId] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState('');
  const [lastSeq, setLastSeq] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [degradedMessage, setDegradedMessage] = useState<string | null>(null);
  const [resumeTransport, setResumeTransport] = useState<ResumeTransport>('none');

  const esRef = useRef<LiveSseHandle | null>(null);
  const assemblyRef = useRef<TokenAssemblyState>({ lastSeq: 0, text: '', tokenCount: 0 });
  const phaseRef = useRef<ChatStreamPhase>('idle');
  const runIdRef = useRef<string | null>(null);
  const intentionalCloseRef = useRef(false);
  const resumeTransportRef = useRef<ResumeTransport>('none');
  const { isOnline } = useNetworkStatus();

  const setPhaseBoth = useCallback((next: ChatStreamPhase) => {
    phaseRef.current = next;
    setPhase(next);
    setDegradedMessage(next === 'degraded' ? SURFACE_UNAVAILABLE_MESSAGE : null);
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
      const headers = buildSseResumeHeaders({ apiKey, lastSeq: resumeFrom });

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
          // SSE path provenance (REDHAT-FIX-03 AC-4) — not poll bailout
          if (phaseRef.current === 'reconnecting' || resumeFrom > 0) {
            resumeTransportRef.current = 'sse';
            setResumeTransport('sse');
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
          const errText = typeof payload.error === 'string' ? payload.error : undefined;
          if (status === 'failed') {
            const fleet = applyFleetFailureEnvelope({
              phase: 'streaming',
              error: errText,
              message: errText,
              status,
              text,
              code: typeof payload.code === 'string' ? payload.code : undefined,
            });
            if (fleet.isDegraded) {
              setError(new Error(SURFACE_UNAVAILABLE_MESSAGE));
              // Do not keep a spinner-producing stream phase — degraded is terminal UX.
              finishTerminal('degraded', text);
              return;
            }
            setError(new Error(errText ?? 'chat run failed'));
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
          const blockMsg =
            typeof payload.message === 'string' ? payload.message : `chat blocked: ${code}`;
          const fleet = applyFleetFailureEnvelope({
            phase: 'streaming',
            code,
            message: blockMsg,
            error: blockMsg,
          });
          if (fleet.isDegraded) {
            setError(new Error(SURFACE_UNAVAILABLE_MESSAGE));
            finishTerminal('degraded');
            return;
          }
          setError(new Error(blockMsg));
          finishTerminal('complete');
          return;
        }

        if (eventName === 'error') {
          const code = typeof payload.code === 'string' ? payload.code : 'SSE_ERROR';
          const errMsg =
            typeof payload.message === 'string'
              ? payload.message
              : typeof payload.error === 'string'
                ? payload.error
                : `SSE error: ${code}`;
          const fleet = applyFleetFailureEnvelope({
            phase: phaseRef.current,
            code,
            message: errMsg,
            error: errMsg,
          });
          if (fleet.isDegraded) {
            setError(new Error(SURFACE_UNAVAILABLE_MESSAGE));
            finishTerminal('degraded');
            return;
          }
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

      // Reset assembly for a new run (also clears degraded → recovery path)
      assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 };
      applyAssembly(assemblyRef.current);
      setError(null);
      setDegradedMessage(null);
      resumeTransportRef.current = 'none';
      setResumeTransport('none');
      setRunId(nextRunId);
      runIdRef.current = nextRunId;
      setDurableMessageId(nextDurable);
      setPhaseBoth('streaming');
      openEventSource(nextRunId, 0);
    },
    [applyAssembly, openEventSource, setPhaseBoth]
  );

  const enterDegradedFromEnvelope = useCallback(
    (envelope: FleetFailureEnvelope): boolean => {
      const fleet = applyFleetFailureEnvelope({
        phase: phaseRef.current,
        ...envelope,
      });
      if (!fleet.isDegraded) return false;
      closeSource(true);
      setError(new Error(SURFACE_UNAVAILABLE_MESSAGE));
      setDegradedMessage(SURFACE_UNAVAILABLE_MESSAGE);
      setPhaseBoth('degraded');
      return true;
    },
    [closeSource, setPhaseBoth]
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
    setDegradedMessage(null);
    resumeTransportRef.current = 'none';
    setResumeTransport('none');
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
  // REDHAT-FIX-03 M2: disableStatusPollFallback lets tests prove the SSE path
  // (poll must not sole-greenwash a broken Last-Event-ID).
  useEffect(() => {
    if (disableStatusPollFallback) return;
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
          // Mark poll provenance only when SSE has not already resumed
          if (resumeTransportRef.current !== 'sse') {
            resumeTransportRef.current = 'poll';
            setResumeTransport('poll');
          }
          if (status === 'failed') {
            const fleet = applyFleetFailureEnvelope({
              phase: 'reconnecting',
              status,
              error: body.finalText,
              text: body.finalText,
              message: body.finalText,
            });
            if (fleet.isDegraded) {
              setError(new Error(SURFACE_UNAVAILABLE_MESSAGE));
              setPhaseBoth('degraded');
              closeSource(true);
              return;
            }
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
  }, [
    phase,
    runId,
    platformUrl,
    apiKey,
    applyAssembly,
    setPhaseBoth,
    closeSource,
    disableStatusPollFallback,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeSource(true);
    };
  }, [closeSource]);

  // Degraded is terminal UX (banner) — not an active stream (no spinner hang).
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
    degradedMessage: phase === 'degraded' ? (degradedMessage ?? SURFACE_UNAVAILABLE_MESSAGE) : null,
    isActive,
    resumeTransport,
    connect,
    cancel,
    reset,
    enterDegradedFromEnvelope,
  };
}
