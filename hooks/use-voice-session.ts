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
import { createVoiceErrorHandler } from "@/lib/voice/error-handler";

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

    try {
      // 1. Create Convex session → ephemeral key
      let ephemeralKey: string;
      let sessionId: string;
      try {
        const result = await createSession({ conversationId });
        ephemeralKey = result.ephemeralKey;
        sessionId = result.sessionId;
      } catch (tokenError) {
        errorHandler.handleTokenGenerationFailure(
          tokenError instanceof Error ? tokenError : new Error("Token generation failed")
        );
        return;
      }
      sessionIdRef.current = sessionId;

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
            errorHandler.handleSuccess();
            try {
              conn.sendEvent(
                SESSION_UPDATE_EVENT as unknown as Record<string, unknown>
              );
            } catch {
              // Data channel may not be ready yet; session.update is best-effort
            }
          },
          onSpeechStarted: () => {
            errorHandler.handleSuccess();
            dispatch({ type: "START_LISTENING" });
          },
          onSpeechStopped: () => {
            // speech_stopped indicates user stopped speaking — model will process
            // No direct state transition here; model response triggers START_SPEAKING
          },
          onTranscript: (transcript: string) => {
            errorHandler.handleSuccess();
            transcriptRef.current = transcript;
            transcriptRecorder.onAgentTranscript(transcript);
          },
          onUserTranscript: (transcript: string) => {
            transcriptRecorder.onUserTranscript(transcript);
          },
          onError: (error) => {
            // Count consecutive mid-session errors; triggers cleanup after 3
            errorHandler.handleConsecutiveError();
            // Also dispatch immediate error state for single errors
            dispatch({ type: "ERROR", error: error.message });
          },
        },
        { debug: () => {} } // Silence debug logging in production
      );

      conn.setCallbacks({
        onEvent: (event) => {
          // The WebRTC connection already parses JSON; event handler expects raw string
          handleRawEvent(JSON.stringify(event));
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

      // 4. Transition to LISTENING
      dispatch({ type: "CONNECTED", sessionId });
    } catch (error) {
      // Unexpected error path — clean up and show generic service unavailable
      if (connectionRef.current) {
        connectionRef.current.destroy();
        connectionRef.current = null;
      }

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
  };
}
