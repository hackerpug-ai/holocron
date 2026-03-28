/**
 * US-005: Voice session state machine
 *
 * useReducer-based state machine for managing voice UI states.
 * Client-only — NEVER stored in Convex.
 *
 * Valid transitions:
 *   IDLE → CONNECTING (CONNECT)
 *   CONNECTING → LISTENING (CONNECTED)
 *   CONNECTING → ERROR (ERROR)
 *   CONNECTING → IDLE (DISCONNECT, TIMEOUT)
 *   LISTENING → PROCESSING (START_LISTENING → implicit, but PROCESSING via server)
 *   LISTENING → SPEAKING (START_SPEAKING)
 *   LISTENING → ERROR (ERROR)
 *   LISTENING → IDLE (DISCONNECT, TIMEOUT)
 *   PROCESSING → SPEAKING (START_SPEAKING)
 *   PROCESSING → LISTENING (START_LISTENING)
 *   PROCESSING → ERROR (ERROR)
 *   PROCESSING → IDLE (DISCONNECT, TIMEOUT)
 *   SPEAKING → LISTENING (STOP_SPEAKING)
 *   SPEAKING → IDLE (DISCONNECT)
 *   SPEAKING → ERROR (ERROR)
 *   ERROR → IDLE (DISCONNECT)
 *   ERROR → CONNECTING (CONNECT — retry)
 */

import { useReducer } from "react";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export type VoiceAction =
  | { type: "CONNECT"; conversationId: string }
  | { type: "CONNECTED"; sessionId: string }
  | { type: "START_LISTENING" }
  | { type: "START_SPEAKING" }
  | { type: "STOP_SPEAKING" }
  | { type: "ERROR"; error: string }
  | { type: "DISCONNECT" }
  | { type: "TIMEOUT" };

export interface VoiceSessionState {
  status: VoiceState;
  sessionId: string | null;
  conversationId: string | null;
  errorMessage: string | null;
  transcript: string;
  isInterrupted: boolean;
}

export const initialVoiceSessionState: VoiceSessionState = {
  status: "idle",
  sessionId: null,
  conversationId: null,
  errorMessage: null,
  transcript: "",
  isInterrupted: false,
};

/**
 * Pure reducer for voice session state machine.
 * Exported separately for unit testing.
 *
 * Invalid transitions return state unchanged (no-op).
 */
export function voiceSessionReducer(
  state: VoiceSessionState,
  action: VoiceAction
): VoiceSessionState {
  switch (action.type) {
    case "CONNECT": {
      if (state.status !== "idle" && state.status !== "error") return state;
      return {
        ...initialVoiceSessionState,
        status: "connecting",
        conversationId: action.conversationId,
      };
    }

    case "CONNECTED": {
      if (state.status !== "connecting") return state;
      return {
        ...state,
        status: "listening",
        sessionId: action.sessionId,
        errorMessage: null,
      };
    }

    case "START_LISTENING": {
      if (state.status !== "processing" && state.status !== "speaking")
        return state;
      const wasInterrupted = state.status === "speaking";
      return {
        ...state,
        status: "listening",
        isInterrupted: wasInterrupted,
      };
    }

    case "START_SPEAKING": {
      if (state.status !== "listening" && state.status !== "processing")
        return state;
      return {
        ...state,
        status: "speaking",
        isInterrupted: false,
      };
    }

    case "STOP_SPEAKING": {
      if (state.status !== "speaking") return state;
      return {
        ...state,
        status: "listening",
        isInterrupted: false,
      };
    }

    case "ERROR": {
      if (state.status === "idle") return state;
      return {
        ...state,
        status: "error",
        errorMessage: action.error,
      };
    }

    case "DISCONNECT": {
      return {
        ...initialVoiceSessionState,
      };
    }

    case "TIMEOUT": {
      if (state.status === "idle") return state;
      return {
        ...initialVoiceSessionState,
        errorMessage:
          state.status === "error" ? state.errorMessage : "Session timed out",
      };
    }

    default:
      return state;
  }
}

/**
 * Hook for managing voice session state.
 * Uses useReducer for coordinated state changes.
 */
export function useVoiceSessionState() {
  const [state, dispatch] = useReducer(
    voiceSessionReducer,
    initialVoiceSessionState
  );

  return { state, dispatch } as const;
}
