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

import { useCallback, useEffect, useRef, useReducer, useState } from "react";
import * as Haptics from "expo-haptics";
import { useAction, useMutation, useConvex } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  voiceSessionReducer,
  initialVoiceSessionState,
  type VoiceSessionState,
} from "@/hooks/use-voice-session-state";
import { useVoiceResultBridge } from "@/hooks/use-voice-result-bridge";
import { WebRTCConnection } from "@/lib/voice/webrtc-connection";
import type { MediaStream } from "react-native-webrtc-web-shim";
import { createEventHandler } from "@/lib/voice/event-handler";
import { createTranscriptRecorder } from "@/lib/voice/transcript-recorder";
import { SessionTimeout, WarmConnection } from "@/lib/voice/session-timeout";
import { createRetryManager } from "@/lib/voice/retry-manager";
import { createVoiceErrorHandler } from "@/lib/voice/error-handler";
import { getToolDefinitions } from "@/lib/voice/tool-definitions";
import { dispatchFunctionCall, type DispatcherDeps } from "@/lib/voice/function-dispatcher";

/**
 * Build session.update for warm-path reactivation only.
 *
 * Static config (model, voice, turn_detection, truncation, transcription) is
 * now embedded in the /client_secrets POST body by the backend createSession
 * action, so the cold-path session.update is no longer needed. This function
 * only sends the fields that change per-conversation on warm reuse: fresh
 * instructions, the current tool list, and the tool_choice policy.
 *
 * NOTE: Do NOT use this on the cold path — the backend already sent all static
 * config via /client_secrets.
 */
function buildSessionUpdateEvent(instructions: string) {
  return {
    type: "session.update",
    session: {
      instructions,
      tools: getToolDefinitions(),
      tool_choice: "auto",
    },
  };
}

export interface UseVoiceSessionReturn {
  state: VoiceSessionState;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  mute: () => void;
  unmute: () => void;
  transcript: string;
  transcripts: Array<{ role: 'user' | 'agent'; content: string; timestamp: number }>;
  /** True when a warm connection is available for fast re-activation */
  isWarm: boolean;
  /** User-facing spoken feedback message during network retry (null when idle) */
  retryMessage: string | null;
  /** Current microphone audio level (0.0–1.0), updated at ~10Hz */
  audioLevel: number;
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
  const convex = useConvex();
  const router = useRouter();

  const connectionRef = useRef<WebRTCConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<string>("");
  const retryMessageRef = useRef<string | null>(null);
  const ephemeralKeyRef = useRef<string | null>(null);
  const instructionsRef = useRef<string>("");
  /** Mirrors state.status so predicates can read it without stale closures. Updated each render. */
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  const [audioLevel, setAudioLevel] = useState(0);

  // Voice result bridge: push async tool results to OpenAI when they complete
  const sendEventToOpenAI = useCallback((event: Record<string, unknown>) => {
    if (connectionRef.current) {
      connectionRef.current.sendEvent(event);
    }
  }, []);

  const isSessionActive =
    state.status === "listening" ||
    state.status === "processing" ||
    state.status === "speaking" ||
    state.status === "muted";

  useVoiceResultBridge(conversationId, isSessionActive, sendEventToOpenAI);

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
        setAudioLevel(0);
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

    console.time("voice:cold-start");
    dispatch({ type: "CONNECT", conversationId });

    // Error handler provides user-friendly messages and resource cleanup.
    const errorHandler = createVoiceErrorHandler({
      onError: (voiceError) => {
        dispatch({
          type: "ERROR",
          error: voiceError.userMessage,
          errorKind: voiceError.kind,
        });
      },
      onCleanup: async () => {
        if (connectionRef.current) {
          connectionRef.current.destroy();
          connectionRef.current = null;
        }
        const sid = sessionIdRef.current;
        if (sid) {
          sessionIdRef.current = null;
          try {
            await endSession({ sessionId: sid as Id<"voiceSessions"> });
          } catch {
            // Best-effort cleanup
          }
        }
      },
    });

    // US-017: check for warm connection (fast re-activation path, <200ms)
    const warmConn = warmConnectionRef.current.reactivate();
    if (warmConn) {
      // Warm re-activation — reuse existing WebRTC connection, create new Convex session
      isWarmRef.current = false;
      connectionRef.current = warmConn as WebRTCConnection;

      try {
        const { sessionId, instructions } = await createSession({ conversationId });
        sessionIdRef.current = sessionId;
        instructionsRef.current = instructions;
        dispatch({ type: "CONNECTED", sessionId });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Send fresh session.update with server instructions on warm re-activation
        try {
          (connectionRef.current as WebRTCConnection).sendEvent(
            buildSessionUpdateEvent(instructionsRef.current) as unknown as Record<string, unknown>
          );
        } catch {
          // Data channel may not be ready; session.update is best-effort
        }

        // Restart idle timeout for re-activated session
        if (!sessionTimeoutRef.current) {
          sessionTimeoutRef.current = new SessionTimeout({ onTimeout: handleTimeout });
        }
        sessionTimeoutRef.current.start();
      } catch (error) {
        connectionRef.current = null;
        const message = error instanceof Error ? error.message : "Unknown connection error";
        dispatch({ type: "ERROR", error: message });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    try {
      // Set up WebRTC connection with event handler wiring
      const conn = new WebRTCConnection();

      // Wire transcript recorder for fire-and-forget persistence.
      // sessionId is set after Promise.all but before any events fire,
      // so we wrap recordTranscript to read sessionIdRef at call time.
      const transcriptRecorder = createTranscriptRecorder({
        recordTranscript: (args) =>
          recordTranscript({ ...args, sessionId: sessionIdRef.current as Id<"voiceSessions"> }),
        sessionId: "placeholder" as unknown as Id<"voiceSessions">,
        conversationId,
      });

      // Set up idle timeout (US-017)
      sessionTimeoutRef.current = new SessionTimeout({ onTimeout: handleTimeout });

      // Wire data channel events to state machine via event handler
      const handleEvent = createEventHandler(
        {
          onSessionCreated: () => {
            // Backend already embedded all session config in /client_secrets POST body.
            // No session.update needed on the cold path.
            errorHandler.handleSuccess();
          },
          onSpeechStarted: () => {
            // US-017: user spoke — cancel any pending timeout (interrupt farewell)
            sessionTimeoutRef.current?.cancel();
            errorHandler.handleSuccess();
            dispatch({ type: "START_LISTENING" });
          },
          onSpeechStopped: () => {
            // speech_stopped indicates user stopped speaking — model will process
            // Restart the idle timeout countdown
            sessionTimeoutRef.current?.start();
          },
          onTranscript: (transcript: string) => {
            errorHandler.handleSuccess();
            transcriptRef.current = transcript;
            transcriptRecorder.onAgentTranscript(transcript);
            // Accumulate transcript in state
            dispatch({
              type: "ADD_TRANSCRIPT",
              role: "agent" as const,
              content: transcript,
            });
          },
          onUserTranscript: (transcript: string) => {
            transcriptRecorder.onUserTranscript(transcript);
            // Accumulate transcript in state
            dispatch({
              type: "ADD_TRANSCRIPT",
              role: "user" as const,
              content: transcript,
            });
          },
          onFunctionCall: async (fn) => {
            dispatch({ type: "TOOL_START", toolName: fn.name });
            try {
              const deps: DispatcherDeps = {
                convex: {
                  runAction: (path, args) => convex.action(path as never, args as never),
                  runMutation: (path, args) => convex.mutation(path as never, args as never),
                  runQuery: (path, args) => convex.query(path as never, args as never),
                },
                routerPush: (path) => router.push(path as never),
                sendEvent: (event) => conn.sendEvent(event),
                sessionId: sessionIdRef.current ?? "",
                conversationId,
              };
              await dispatchFunctionCall(fn, deps);
            } catch {
              // Function dispatch errors are handled internally by the dispatcher
              // which sends error results back to OpenAI
            } finally {
              dispatch({ type: "TOOL_END" });
            }
          },
          onError: (error) => {
            // Count consecutive mid-session errors; triggers cleanup after 3
            errorHandler.handleConsecutiveError();
            // Also dispatch immediate error state for single errors
            dispatch({ type: "ERROR", error: error.message });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          } else if (retryState === "error") {
            dispatch({
              type: "ERROR",
              error: "No internet. Please check your connection.",
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
          handleEvent(event);
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
                  handleEvent(event);
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

      // Run token generation and media acquisition in parallel
      dispatch({ type: "SET_CONNECTING_PHASE", phase: "connecting_ai" });
      let tokenResult: { ephemeralKey: string; sessionId: string; instructions: string };
      let mediaStream: MediaStream;
      try {
        const results = await Promise.all([
          createSession({ conversationId }),
          conn.prepareMedia(),
        ]);
        tokenResult = results[0];
        mediaStream = results[1];
      } catch (parallelError) {
        const errMsg =
          parallelError instanceof Error
            ? parallelError.message
            : "Connection failed";
        // Detect microphone permission denial
        if (
          errMsg.toLowerCase().includes("permission") ||
          errMsg.toLowerCase().includes("notallowederror") ||
          errMsg.toLowerCase().includes("not allowed")
        ) {
          errorHandler.handleMicrophonePermissionDenied();
        } else {
          errorHandler.handleTokenGenerationFailure(
            parallelError instanceof Error
              ? parallelError
              : new Error("Connection failed")
          );
        }
        // Cross-cleanup: destroy conn to release any acquired media
        conn.destroy();
        // End any Convex session that may have been created
        const sid = sessionIdRef.current;
        if (sid) {
          sessionIdRef.current = null;
          try {
            await endSession({ sessionId: sid as Id<"voiceSessions"> });
          } catch {
            // Best-effort cleanup
          }
        }
        return;
      }

      sessionIdRef.current = tokenResult.sessionId;
      instructionsRef.current = tokenResult.instructions;
      ephemeralKeyRef.current = tokenResult.ephemeralKey;

      // SDP exchange with pre-acquired media
      dispatch({ type: "SET_CONNECTING_PHASE", phase: "almost_ready" });
      try {
        await conn.connectWithMedia(tokenResult.ephemeralKey, mediaStream);
      } catch (connectError) {
        const errMsg =
          connectError instanceof Error
            ? connectError.message
            : "Connection failed";
        if (
          errMsg.toLowerCase().includes("permission") ||
          errMsg.toLowerCase().includes("notallowederror") ||
          errMsg.toLowerCase().includes("not allowed")
        ) {
          errorHandler.handleMicrophonePermissionDenied();
        } else {
          errorHandler.handleTokenGenerationFailure(
            connectError instanceof Error
              ? connectError
              : new Error("Connection failed")
          );
        }
        // End the Convex session since WebRTC failed after token was generated
        const sid = sessionIdRef.current;
        if (sid) {
          sessionIdRef.current = null;
          try {
            await endSession({ sessionId: sid as Id<"voiceSessions"> });
          } catch {
            // Best-effort cleanup
          }
        }
        return;
      }

      connectionRef.current = conn;
      conn.startAudioLevelMonitoring(setAudioLevel, () =>
        statusRef.current === "listening" || statusRef.current === "speaking"
      );

      // Transition to LISTENING and start idle timeout
      console.timeEnd("voice:cold-start");
      dispatch({ type: "CONNECTED", sessionId: tokenResult.sessionId });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      sessionTimeoutRef.current.start();
    } catch (error) {
      // Unexpected error path — clean up and show generic service unavailable
      if (connectionRef.current) {
        connectionRef.current.destroy();
        connectionRef.current = null;
      }
      sessionTimeoutRef.current?.cancel();

      errorHandler.handleTokenGenerationFailure(
        error instanceof Error ? error : new Error("Unknown connection error")
      );

      if (sessionIdRef.current) {
        const sid = sessionIdRef.current;
        sessionIdRef.current = null;
        try {
          await endSession({ sessionId: sid as Id<"voiceSessions"> });
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

  const mute = useCallback(() => {
    dispatch({ type: "MUTE" });
  }, []);

  const unmute = useCallback(() => {
    dispatch({ type: "UNMUTE" });
  }, []);

  return {
    state,
    start,
    stop,
    mute,
    unmute,
    transcript: transcriptRef.current,
    transcripts: state.transcripts,
    isWarm: isWarmRef.current,
    retryMessage: retryMessageRef.current,
    audioLevel,
  };
}
