/**
 * US-008: useVoiceSession — integration hook
 *
 * Orchestrates the full voice session lifecycle:
 *   1. Convex createSession action → ephemeral key + sessionId
 *   2. WebRTC connect with ephemeral key
 *   3. Send session.update via data channel
 *   4. Wire data channel events → state machine transitions
 *   5. Cleanup on stop() or unmount
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
import { createRetryManager } from "@/lib/voice/retry-manager";

/**
 * Session config sent via data channel after WebRTC connects.
 * Matches 02-session-config.md specification.
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

  /**
   * Tear down WebRTC and end the Convex session.
   * Safe to call multiple times — idempotent.
   */
  const cleanup = useCallback(async () => {
    if (connectionRef.current) {
      connectionRef.current.destroy();
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
  }, [endSession]);

  const start = useCallback(async () => {
    // Guard against double-start
    if (state.status !== "idle" && state.status !== "error") return;

    dispatch({ type: "CONNECT", conversationId });

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
            dispatch({ type: "START_LISTENING" });
          },
          onSpeechStopped: () => {
            // speech_stopped indicates user stopped speaking — model will process
            // No direct state transition here; model response triggers START_SPEAKING
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

      // 4. Transition to LISTENING
      dispatch({ type: "CONNECTED", sessionId });
    } catch (error) {
      // Clean up any partial resources
      if (connectionRef.current) {
        connectionRef.current.destroy();
        connectionRef.current = null;
      }

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
  }, [conversationId, createSession, endSession, recordTranscript, state.status]);

  const stop = useCallback(async () => {
    await cleanup();
    dispatch({ type: "DISCONNECT" });
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
    retryMessage: retryMessageRef.current,
  };
}
