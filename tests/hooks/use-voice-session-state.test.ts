/**
 * US-005: useVoiceSessionState reducer tests
 *
 * Tests the voice session state machine for valid transitions,
 * invalid transition rejection, and state metadata management.
 */

import { describe, it, expect } from "vitest";
import {
  voiceSessionReducer,
  initialVoiceSessionState,
  type VoiceSessionState,
  type VoiceAction,
} from "@/hooks/use-voice-session-state";

/** Helper to create state at a given status with defaults */
function stateAt(
  overrides: Partial<VoiceSessionState> = {}
): VoiceSessionState {
  return { ...initialVoiceSessionState, ...overrides };
}

describe("US-005: voiceSessionReducer", () => {
  describe("initial state", () => {
    it("starts in idle with all fields cleared", () => {
      expect(initialVoiceSessionState).toEqual({
        status: "idle",
        sessionId: null,
        conversationId: null,
        errorMessage: null,
        errorKind: null,
        transcript: "",
        transcripts: [],
        isInterrupted: false,
        activeTool: null,
      });
    });
  });

  // --- AC-1: IDLE + CONNECT -> CONNECTING with conversationId set ---
  describe("AC-1: IDLE + CONNECT -> CONNECTING", () => {
    it("transitions to connecting with conversationId set", () => {
      const result = voiceSessionReducer(initialVoiceSessionState, {
        type: "CONNECT",
        conversationId: "conv-123",
      });
      expect(result.status).toBe("connecting");
      expect(result.conversationId).toBe("conv-123");
    });

    it("clears previous error state on connect", () => {
      const errorState = stateAt({
        status: "error",
        errorMessage: "prev error",
        sessionId: "old-session",
      });
      const result = voiceSessionReducer(errorState, {
        type: "CONNECT",
        conversationId: "conv-456",
      });
      expect(result.status).toBe("connecting");
      expect(result.conversationId).toBe("conv-456");
      expect(result.errorMessage).toBeNull();
      expect(result.sessionId).toBeNull();
    });
  });

  // --- AC-2: CONNECTING + CONNECTED -> LISTENING with sessionId set ---
  describe("AC-2: CONNECTING + CONNECTED -> LISTENING", () => {
    it("transitions to listening with sessionId set", () => {
      const connecting = stateAt({
        status: "connecting",
        conversationId: "conv-123",
      });
      const result = voiceSessionReducer(connecting, {
        type: "CONNECTED",
        sessionId: "session-abc",
      });
      expect(result.status).toBe("listening");
      expect(result.sessionId).toBe("session-abc");
      expect(result.conversationId).toBe("conv-123");
    });
  });

  // --- AC-3: LISTENING + ERROR -> ERROR with error message preserved ---
  describe("AC-3: LISTENING + ERROR -> ERROR", () => {
    it("transitions to error with error message preserved", () => {
      const listening = stateAt({
        status: "listening",
        sessionId: "session-abc",
        conversationId: "conv-123",
      });
      const result = voiceSessionReducer(listening, {
        type: "ERROR",
        error: "Connection lost",
      });
      expect(result.status).toBe("error");
      expect(result.errorMessage).toBe("Connection lost");
      expect(result.sessionId).toBe("session-abc");
      expect(result.conversationId).toBe("conv-123");
    });
  });

  // --- AC-4: IDLE + START_SPEAKING -> IDLE (invalid transition ignored) ---
  describe("AC-4: invalid transition ignored", () => {
    it("IDLE + START_SPEAKING remains IDLE unchanged", () => {
      const result = voiceSessionReducer(initialVoiceSessionState, {
        type: "START_SPEAKING",
      });
      expect(result).toEqual(initialVoiceSessionState);
      expect(result).toBe(initialVoiceSessionState); // same reference
    });

    it("IDLE + CONNECTED is ignored", () => {
      const result = voiceSessionReducer(initialVoiceSessionState, {
        type: "CONNECTED",
        sessionId: "session-xyz",
      });
      expect(result).toBe(initialVoiceSessionState);
    });

    it("IDLE + STOP_SPEAKING is ignored", () => {
      const result = voiceSessionReducer(initialVoiceSessionState, {
        type: "STOP_SPEAKING",
      });
      expect(result).toBe(initialVoiceSessionState);
    });

    it("IDLE + START_LISTENING is ignored", () => {
      const result = voiceSessionReducer(initialVoiceSessionState, {
        type: "START_LISTENING",
      });
      expect(result).toBe(initialVoiceSessionState);
    });

    it("IDLE + ERROR is ignored", () => {
      const result = voiceSessionReducer(initialVoiceSessionState, {
        type: "ERROR",
        error: "some error",
      });
      expect(result).toBe(initialVoiceSessionState);
    });

    it("CONNECTING + START_SPEAKING is ignored", () => {
      const connecting = stateAt({ status: "connecting" });
      const result = voiceSessionReducer(connecting, {
        type: "START_SPEAKING",
      });
      expect(result).toBe(connecting);
    });

    it("SPEAKING + CONNECTED is ignored", () => {
      const speaking = stateAt({ status: "speaking", sessionId: "s1" });
      const result = voiceSessionReducer(speaking, {
        type: "CONNECTED",
        sessionId: "s2",
      });
      expect(result).toBe(speaking);
    });
  });

  // --- AC-5: SPEAKING + DISCONNECT -> IDLE with sessionId and error cleared ---
  describe("AC-5: SPEAKING + DISCONNECT -> IDLE", () => {
    it("transitions to idle with sessionId and error cleared", () => {
      const speaking = stateAt({
        status: "speaking",
        sessionId: "session-abc",
        conversationId: "conv-123",
        transcript: "some transcript",
      });
      const result = voiceSessionReducer(speaking, { type: "DISCONNECT" });
      expect(result.status).toBe("idle");
      expect(result.sessionId).toBeNull();
      expect(result.errorMessage).toBeNull();
      expect(result.conversationId).toBeNull();
      expect(result.transcript).toBe("");
    });
  });

  // --- Additional transition coverage ---
  describe("additional valid transitions", () => {
    it("LISTENING + START_SPEAKING -> SPEAKING", () => {
      const listening = stateAt({ status: "listening", sessionId: "s1" });
      const result = voiceSessionReducer(listening, {
        type: "START_SPEAKING",
      });
      expect(result.status).toBe("speaking");
      expect(result.isInterrupted).toBe(false);
    });

    it("SPEAKING + STOP_SPEAKING -> LISTENING", () => {
      const speaking = stateAt({ status: "speaking", sessionId: "s1" });
      const result = voiceSessionReducer(speaking, { type: "STOP_SPEAKING" });
      expect(result.status).toBe("listening");
    });

    it("SPEAKING + START_LISTENING -> LISTENING with isInterrupted true", () => {
      const speaking = stateAt({ status: "speaking", sessionId: "s1" });
      const result = voiceSessionReducer(speaking, {
        type: "START_LISTENING",
      });
      expect(result.status).toBe("listening");
      expect(result.isInterrupted).toBe(true);
    });

    it("PROCESSING + START_SPEAKING -> SPEAKING", () => {
      const processing = stateAt({ status: "processing", sessionId: "s1" });
      const result = voiceSessionReducer(processing, {
        type: "START_SPEAKING",
      });
      expect(result.status).toBe("speaking");
    });

    it("PROCESSING + START_LISTENING -> LISTENING", () => {
      const processing = stateAt({ status: "processing", sessionId: "s1" });
      const result = voiceSessionReducer(processing, {
        type: "START_LISTENING",
      });
      expect(result.status).toBe("listening");
      expect(result.isInterrupted).toBe(false);
    });

    it("ERROR + CONNECT -> CONNECTING (retry)", () => {
      const error = stateAt({
        status: "error",
        errorMessage: "failed",
        sessionId: "old",
      });
      const result = voiceSessionReducer(error, {
        type: "CONNECT",
        conversationId: "retry-conv",
      });
      expect(result.status).toBe("connecting");
      expect(result.conversationId).toBe("retry-conv");
      expect(result.sessionId).toBeNull();
      expect(result.errorMessage).toBeNull();
    });

    it("ERROR + DISCONNECT -> IDLE", () => {
      const error = stateAt({
        status: "error",
        errorMessage: "failed",
        sessionId: "s1",
      });
      const result = voiceSessionReducer(error, { type: "DISCONNECT" });
      expect(result.status).toBe("idle");
      expect(result.sessionId).toBeNull();
      expect(result.errorMessage).toBeNull();
    });

    it("CONNECTING + ERROR -> ERROR", () => {
      const connecting = stateAt({
        status: "connecting",
        conversationId: "c1",
      });
      const result = voiceSessionReducer(connecting, {
        type: "ERROR",
        error: "WebRTC failed",
      });
      expect(result.status).toBe("error");
      expect(result.errorMessage).toBe("WebRTC failed");
    });

    it("CONNECTING + TIMEOUT -> IDLE", () => {
      const connecting = stateAt({
        status: "connecting",
        conversationId: "c1",
      });
      const result = voiceSessionReducer(connecting, { type: "TIMEOUT" });
      expect(result.status).toBe("idle");
      expect(result.conversationId).toBeNull();
    });

    it("LISTENING + TIMEOUT -> IDLE", () => {
      const listening = stateAt({
        status: "listening",
        sessionId: "s1",
        conversationId: "c1",
      });
      const result = voiceSessionReducer(listening, { type: "TIMEOUT" });
      expect(result.status).toBe("idle");
      expect(result.sessionId).toBeNull();
    });

    it("DISCONNECT from any active state -> IDLE", () => {
      const states: VoiceSessionState[] = [
        stateAt({ status: "connecting" }),
        stateAt({ status: "listening", sessionId: "s1" }),
        stateAt({ status: "processing", sessionId: "s1" }),
        stateAt({ status: "speaking", sessionId: "s1" }),
        stateAt({ status: "error", errorMessage: "err" }),
      ];
      for (const s of states) {
        const result = voiceSessionReducer(s, { type: "DISCONNECT" });
        expect(result.status).toBe("idle");
        expect(result.sessionId).toBeNull();
        expect(result.errorMessage).toBeNull();
      }
    });
  });

  describe("full lifecycle", () => {
    it("completes a full conversation cycle: idle -> connecting -> listening -> speaking -> listening -> idle", () => {
      let state: VoiceSessionState = initialVoiceSessionState;

      // Connect
      state = voiceSessionReducer(state, {
        type: "CONNECT",
        conversationId: "conv-1",
      });
      expect(state.status).toBe("connecting");

      // Connected
      state = voiceSessionReducer(state, {
        type: "CONNECTED",
        sessionId: "sess-1",
      });
      expect(state.status).toBe("listening");
      expect(state.sessionId).toBe("sess-1");

      // AI starts speaking
      state = voiceSessionReducer(state, { type: "START_SPEAKING" });
      expect(state.status).toBe("speaking");

      // AI finishes speaking
      state = voiceSessionReducer(state, { type: "STOP_SPEAKING" });
      expect(state.status).toBe("listening");

      // User disconnects
      state = voiceSessionReducer(state, { type: "DISCONNECT" });
      expect(state.status).toBe("idle");
      expect(state.sessionId).toBeNull();
      expect(state.conversationId).toBeNull();
    });
  });

  describe("type safety", () => {
    it("returns current state for unknown action type", () => {
      const state = stateAt({ status: "listening" });
      const result = voiceSessionReducer(
        state,
        { type: "UNKNOWN" } as unknown as VoiceAction
      );
      expect(result).toBe(state);
    });
  });
});
