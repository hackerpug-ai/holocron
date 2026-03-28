/**
 * US-008 + US-017: useVoiceSession — integration hook
 *
 * Orchestrates the full voice session lifecycle:
 *   1. Convex createSession action → ephemeral key + sessionId
 *   2. WebRTC connect with ephemeral key
 *   3. Send session.update via data channel
 *   4. Wire data channel events → state machine transitions
 *   5. Idle timeout with spoken farewell (UC-VSESS-03)
 *   6. Warm connection kept for 5 minutes for quick re-activation
 *   7. Cleanup on stop() or unmount
 *
 * Consumer API: { state, start, stop, transcript }
 * NEVER exposes WebRTC internals.
 */

import { useCallback, useEffect, useRef, useReducer } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  voiceSessionReducer,
  initialVoiceSessionState,
  type VoiceSessionState,
} from "@/hooks/use-voice-session-state";
import { WebRTCConnection } from "@/lib/voice/webrtc-connection";
import { createEventHandler } from "@/lib/voice/event-handler";
import { createTranscriptRecorder } from "@/lib/voice/transcript-recorder";
import { SessionTimeout, WarmConnection } from "@/lib/voice/session-timeout";
import { createRetryManager } from "@/lib/voice/retry-manager";

/**
 * Session config sent via data channel after WebRTC connects.
 * Matches 02-session-config.md specification.
 * idle_timeout_ms: 30000 — OpenAI fires the idle event after 30s silence.
 */
const SESSION_UPDATE_EVENT = {
  type: "session.update",
  session: {
    model: "gpt-realtime",
    modalities: ["text", "audio"],
    voice: "cedar",
    instructions:
      "You are the Holocron voice assistant. You help users search their knowledge base, manage tasks, check on research, and navigate the app. Before calling any function tool, briefly announce what you're about to do. When a function call is pending and the user asks about it, say you're still waiting on the result.",
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
      idle_timeout_ms: 30000,
    },
    tools: [] as unknown[],
    tool_choice: "auto",
    truncation: { type: "retention_ratio", retention_ratio: 0.8 },
    input_audio_transcription: { model: "gpt-4o-transcribe" },
  },
} as const;

export interface UseVoiceSessionReturn {
  state: VoiceSessionState;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  transcript: string;
  /** True when a warm connection is available for fast re-activation */
  isWarm: boolean;
  /** User-facing spoken feedback message during network retry (null when idle) */
  retryMessage: string | null;
}

export function useVoiceSession(
  conversationId: Id<"conversations">
): UseVoiceSessionReturn {
  const [state, dispatch] = useReducer(
    voiceSessionReducer,
    initialVoiceSessionState
  );

  const createSession = useAction(api.voice.actions.createSession);
  const endSession = useMutation(api.voice.mutations.endSession);
  const recordTranscript = useMutation(api.voice.mutations.recordTranscript);

  const connectionRef = useRef<WebRTCConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<string>("");
  const retryMessageRef = useRef<string | null>(null);
  const ephemeralKeyRef = useRef<string | null>(null);

  // US-017: timeout and warm connection managers
  const sessionTimeoutRef = useRef<SessionTimeout | null>(null);
  const warmConnectionRef = useRef<WarmConnection>(new WarmConnection());
  const isWarmRef = useRef<boolean>(false);

  /**
   * Tear down WebRTC and end the Convex session.
   * Safe to call multiple times — idempotent.
   * Does NOT touch the warm connection (caller decides warm vs cold close).
   */
  const cleanup = useCallback(
    async (keepWarm: boolean = false) => {
      // Cancel any pending idle timeout
      if (sessionTimeoutRef.current) {
        sessionTimeoutRef.current.cancel();
      }

      if (connectionRef.current) {
        if (keepWarm) {
          // Hand the connection over to the warm manager — do NOT destroy it
          warmConnectionRef.current.startWarmPeriod(connectionRef.current);
          isWarmRef.current = true;
        } else {
          connectionRef.current.destroy();
          isWarmRef.current = false;
        }
        connectionRef.current = null;
      }

      const sid = sessionIdRef.current;
      if (sid) {
        sessionIdRef.current = null;
        try {
          await endSession({
            sessionId: sid as Id<"voiceSessions">,
          });
        } catch {
          // Best-effort — session may already be ended
        }
      }
    },
    [endSession]
  );

  /**
   * Handle session timeout (UC-VSESS-03):
   * 1. Transition to IDLE (dispatching TIMEOUT)
   * 2. Keep WebRTC connection warm for 5 minutes
   */
  const handleTimeout = useCallback(async () => {
    dispatch({ type: "TIMEOUT" });
    await cleanup(true /* keepWarm */);
  }, [cleanup]);

  const start = useCallback(async () => {
    // Guard against double-start
    if (state.status !== "idle" && state.status !== "error") return;

    dispatch({ type: "CONNECT", conversationId });

    // US-017: check for warm connection (fast re-activation path, <200ms)
    const warmConn = warmConnectionRef.current.reactivate();
    if (warmConn) {
      // Warm re-activation — reuse existing WebRTC connection, create new Convex session
      isWarmRef.current = false;
      connectionRef.current = warmConn as WebRTCConnection;

      try {
        const { sessionId } = await createSession({ conversationId });
        sessionIdRef.current = sessionId;
        dispatch({ type: "CONNECTED", sessionId });

        // Restart idle timeout for re-activated session
        if (!sessionTimeoutRef.current) {
          sessionTimeoutRef.current = new SessionTimeout({ onTimeout: handleTimeout });
        }
        sessionTimeoutRef.current.start();
      } catch (error) {
        connectionRef.current = null;
        const message = error instanceof Error ? error.message : "Unknown connection error";
        dispatch({ type: "ERROR", error: message });
      }
      return;
    }

    try {
      // 1. Create Convex session → ephemeral key
      const { ephemeralKey, sessionId } = await createSession({
        conversationId,
      });
      sessionIdRef.current = sessionId;
      ephemeralKeyRef.current = ephemeralKey;

      // 2. Set up WebRTC connection with event handler wiring
      const conn = new WebRTCConnection();

      // Wire transcript recorder for fire-and-forget persistence
      const transcriptRecorder = createTranscriptRecorder({
        recordTranscript,
        sessionId: sessionId as Id<"voiceSessions">,
        conversationId,
      });

      // Set up idle timeout (US-017)
      sessionTimeoutRef.current = new SessionTimeout({ onTimeout: handleTimeout });

      // Wire data channel events to state machine via event handler
      const handleRawEvent = createEventHandler(
        {
          onSessionCreated: () => {
            // Session created by OpenAI — send session.update config
            try {
              conn.sendEvent(
                SESSION_UPDATE_EVENT as unknown as Record<string, unknown>
              );
            } catch {
              // Data channel may not be ready yet; session.update is best-effort
            }
          },
          onSpeechStarted: () => {
            // US-017: user spoke — cancel any pending timeout (interrupt farewell)
            sessionTimeoutRef.current?.cancel();
            dispatch({ type: "START_LISTENING" });
          },
          onSpeechStopped: () => {
            // speech_stopped indicates user stopped speaking — model will process
            // Restart the idle timeout countdown
            sessionTimeoutRef.current?.start();
          },
          onTranscript: (transcript: string) => {
            transcriptRef.current = transcript;
            transcriptRecorder.onAgentTranscript(transcript);
          },
          onUserTranscript: (transcript: string) => {
            transcriptRecorder.onUserTranscript(transcript);
          },
          onError: (error) => {
            dispatch({ type: "ERROR", error: error.message });
          },
        },
        { debug: () => {} } // Silence debug logging in production
      );

      // Build retry manager bound to this session
      const retryManager = createRetryManager({
        onSpokenFeedback: (message) => {
          retryMessageRef.current = message;
        },
        onStateChange: (retryState) => {
          if (retryState === "connecting") {
            dispatch({ type: "CONNECT", conversationId });
          } else if (retryState === "listening") {
            retryMessageRef.current = null;
            if (sessionIdRef.current) {
              dispatch({ type: "CONNECTED", sessionId: sessionIdRef.current });
            }
          } else if (retryState === "error") {
            dispatch({
              type: "ERROR",
              error: "No internet. Please check your connection.",
            });
          }
        },
        onCleanup: () => {
          if (connectionRef.current) {
            connectionRef.current.destroy();
            connectionRef.current = null;
          }
        },
      });

      conn.setCallbacks({
        onEvent: (event) => {
          // The WebRTC connection already parses JSON; event handler expects raw string
          handleRawEvent(JSON.stringify(event));
        },
        onConnectionFailed: () => {
          // Trigger retry with exponential backoff using current ephemeral key
          const key = ephemeralKeyRef.current;
          if (!key) return;

          retryManager
            .handleConnectionFailure(async () => {
              const newConn = new WebRTCConnection();
              newConn.setCallbacks({
                onEvent: (event) => {
                  handleRawEvent(JSON.stringify(event));
                },
                onConnectionFailed: () => {
                  // Nested failures handled by the outer retry manager
                },
              });
              await newConn.connect(key);
              connectionRef.current = newConn;
            })
            .catch(() => {
              // Retry exhaustion is handled by onStateChange('error')
            });
        },
      });

      // 3. Connect WebRTC
      await conn.connect(ephemeralKey);
      connectionRef.current = conn;

      // 4. Transition to LISTENING and start idle timeout
      dispatch({ type: "CONNECTED", sessionId });
      sessionTimeoutRef.current.start();
    } catch (error) {
      // Clean up any partial resources
      if (connectionRef.current) {
        connectionRef.current.destroy();
        connectionRef.current = null;
      }
      sessionTimeoutRef.current?.cancel();

      const message =
        error instanceof Error ? error.message : "Unknown connection error";
      dispatch({ type: "ERROR", error: message });

      // If we got a sessionId but WebRTC failed, end the Convex session
      if (sessionIdRef.current) {
        const sid = sessionIdRef.current;
        sessionIdRef.current = null;
        try {
          await endSession({
            sessionId: sid as Id<"voiceSessions">,
          });
        } catch {
          // Best-effort cleanup
        }
      }
    }
  }, [conversationId, createSession, endSession, handleTimeout, recordTranscript, state.status]);

  const stop = useCallback(async () => {
    // US-017: destroy warm connection on explicit stop (user intent to fully end)
    warmConnectionRef.current.destroy();
    isWarmRef.current = false;
    await cleanup(false /* cold close */);
    dispatch({ type: "DISCONNECT" });
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel timeout
      sessionTimeoutRef.current?.cancel();
      // Destroy warm connection
      warmConnectionRef.current.destroy();
      isWarmRef.current = false;

      // Fire-and-forget cleanup on unmount
      if (connectionRef.current) {
        connectionRef.current.destroy();
        connectionRef.current = null;
      }
      const sid = sessionIdRef.current;
      if (sid) {
        sessionIdRef.current = null;
        // endSession is async but we can't await in cleanup — best effort
        endSession({ sessionId: sid as Id<"voiceSessions"> }).catch(() => {});
      }
    };
  }, [endSession]);

  return {
    state,
    start,
    stop,
    transcript: transcriptRef.current,
    isWarm: isWarmRef.current,
    retryMessage: retryMessageRef.current,
  };
}
