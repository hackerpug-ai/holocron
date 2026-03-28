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
} from "@/hooks/use-voice-session-state";
import { WebRTCConnection } from "@/lib/voice/webrtc-connection";
import { createEventHandler } from "@/lib/voice/event-handler";

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
  state: typeof initialVoiceSessionState;
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

    try {
      // 1. Create Convex session → ephemeral key
      const { ephemeralKey, sessionId } = await createSession({
        conversationId,
      });
      sessionIdRef.current = sessionId;

      // 2. Set up WebRTC connection with event handler wiring
      const conn = new WebRTCConnection();

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
          },
          onError: (error) => {
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

      // 3. Connect WebRTC
      await conn.connect(ephemeralKey);
      connectionRef.current = conn;

      // 4. Transition to LISTENING
      dispatch({ type: "CONNECTED", sessionId });

      // 5. Send session.update immediately (data channel may be open by now)
      try {
        conn.sendEvent(
          SESSION_UPDATE_EVENT as unknown as Record<string, unknown>
        );
      } catch {
        // Will be sent on session.created event if data channel isn't ready yet
      }
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
  }, [conversationId, createSession, endSession, state.status]);

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
