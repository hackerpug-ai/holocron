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
  | "muted"
  | "processing"
  | "speaking"
  | "error";

export type VoiceErrorKind = "service_unavailable" | "permission_denied";

export type VoiceAction =
  | { type: "CONNECT"; conversationId: string }
  | { type: "CONNECTED"; sessionId: string }
  | { type: "START_LISTENING" }
  | { type: "START_SPEAKING" }
  | { type: "STOP_SPEAKING" }
  | { type: "MUTE" }
  | { type: "UNMUTE" }
  | { type: "ADD_TRANSCRIPT"; role: 'user' | 'agent'; content: string }
  | { type: "ERROR"; error: string; errorKind?: VoiceErrorKind }
  | { type: "DISCONNECT" }
  | { type: "TIMEOUT" }
  | { type: "TOOL_START"; toolName: string }
  | { type: "TOOL_END" };

export interface VoiceSessionState {
  status: VoiceState;
  sessionId: string | null;
  conversationId: string | null;
  errorMessage: string | null;
  errorKind: VoiceErrorKind | null;
  transcript: string;
  transcripts: Array<{ role: 'user' | 'agent'; content: string; timestamp: number }>;
  isInterrupted: boolean;
  activeTool: string | null;
}

export const initialVoiceSessionState: VoiceSessionState = {
  status: "idle",
  sessionId: null,
  conversationId: null,
  errorMessage: null,
  errorKind: null,
  transcript: "",
  transcripts: [],
  isInterrupted: false,
  activeTool: null,
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
        transcripts: [], // Clear transcripts on new session
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

    case "MUTE": {
      if (state.status !== "listening" && state.status !== "processing") return state;
      return {
        ...state,
        status: "muted",
      };
    }

    case "UNMUTE": {
      if (state.status !== "muted") return state;
      return {
        ...state,
        status: "listening",
      };
    }

    case "ADD_TRANSCRIPT": {
      const last = state.transcripts[state.transcripts.length - 1];
      if (last && last.role === action.role) {
        // Merge: replace last entry's content (streaming effect)
        const updated = [...state.transcripts];
        updated[updated.length - 1] = {
          ...last,
          content: action.content,
          timestamp: Date.now(), // refresh timestamp so auto-dismiss resets
        };
        return { ...state, transcripts: updated, transcript: action.content };
      }
      // New speaker: append new entry
      return {
        ...state,
        transcripts: [
          ...state.transcripts,
          {
            role: action.role,
            content: action.content,
            timestamp: Date.now(),
          },
        ],
        transcript: action.content,
      };
    }

    case "ERROR": {
      if (state.status === "idle") return state;
      return {
        ...state,
        status: "error",
        errorMessage: action.error,
        errorKind: action.errorKind ?? null,
        activeTool: null,
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

    case "TOOL_START": {
      if (state.status === "idle") return state;
      return {
        ...state,
        activeTool: action.toolName,
      };
    }

    case "TOOL_END": {
      return {
        ...state,
        activeTool: null,
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
