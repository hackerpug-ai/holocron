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
import { createEventHandler } from "@/lib/voice/event-handler";
import { createTranscriptRecorder } from "@/lib/voice/transcript-recorder";
import { SessionTimeout, WarmConnection } from "@/lib/voice/session-timeout";
import { createRetryManager } from "@/lib/voice/retry-manager";
import { createVoiceErrorHandler } from "@/lib/voice/error-handler";
import { getToolDefinitions } from "@/lib/voice/tool-definitions";
import { dispatchFunctionCall, type DispatcherDeps } from "@/lib/voice/function-dispatcher";

/**
 * Build session config sent via data channel after WebRTC connects.
 * Matches 02-session-config.md specification.
 * idle_timeout_ms: 30000 — OpenAI fires the idle event after 30s silence.
 *
 * Takes server-built instructions from createSession() so language directives
 * and dynamic context are preserved (fixes language bug where hardcoded
 * instructions overwrote server instructions).
 */
function buildSessionUpdateEvent(instructions: string) {
  return {
    type: "session.update",
    session: {
      model: "gpt-realtime",
      modalities: ["text", "audio"],
      voice: "cedar",
      instructions,
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
        idle_timeout_ms: 30000,
      },
      tools: getToolDefinitions(),
      tool_choice: "auto",
      truncation: { type: "retention_ratio", retention_ratio: 0.8 },
      input_audio_transcription: { model: "gpt-4o-transcribe" },
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
      // 1. Create Convex session → ephemeral key
      let ephemeralKey: string;
      let sessionId: string;
      try {
        const result = await createSession({ conversationId });
        ephemeralKey = result.ephemeralKey;
        sessionId = result.sessionId;
        instructionsRef.current = result.instructions;
      } catch (tokenError) {
        errorHandler.handleTokenGenerationFailure(
          tokenError instanceof Error ? tokenError : new Error("Token generation failed")
        );
        return;
      }
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
            errorHandler.handleSuccess();
            try {
              conn.sendEvent(
                buildSessionUpdateEvent(instructionsRef.current) as unknown as Record<string, unknown>
              );
            } catch {
              // Data channel may not be ready yet; session.update is best-effort
            }
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

      // 3. Connect WebRTC — microphone permission errors handled here
      try {
        await conn.connect(ephemeralKey);
      } catch (connectError) {
        const errMsg =
          connectError instanceof Error
            ? connectError.message
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
      conn.startAudioLevelMonitoring(setAudioLevel);

      // 4. Transition to LISTENING and start idle timeout
      dispatch({ type: "CONNECTED", sessionId });
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
