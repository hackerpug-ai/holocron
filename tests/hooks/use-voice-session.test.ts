/**
 * US-008: useVoiceSession integration hook tests
 *
 * Tests the actual hook via renderHook, exercising real state transitions,
 * cleanup on unmount, and error handling.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { RealtimeEventCallbacks } from "@/lib/voice/types";

// --- Mock expo-haptics (native module not available in test) ---
vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
  NotificationFeedbackType: { Success: "Success", Warning: "Warning", Error: "Error" },
}));

// --- Mock react-native (required for error-handler import) ---
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Linking: {
    openURL: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(() => Promise.resolve()),
  },
}));

// --- Mock Convex ---
const mockCreateSession = vi.fn();
const mockEndSession = vi.fn();

const mockConvexClient = {
  action: vi.fn(),
  mutation: vi.fn(),
  query: vi.fn(),
};

vi.mock("convex/react", () => ({
  useAction: () => mockCreateSession,
  useMutation: () => mockEndSession,
  useConvex: () => mockConvexClient,
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    voice: {
      actions: { createSession: "createSession" },
      mutations: { endSession: "endSession" },
    },
  },
}));

// --- Mock WebRTC Connection ---
const mockConnect = vi.fn();
const mockDestroy = vi.fn();
const mockSendEvent = vi.fn();
const mockSetCallbacks = vi.fn();

function MockWebRTCConnection() {
  return {
    connect: mockConnect,
    destroy: mockDestroy,
    sendEvent: mockSendEvent,
    setCallbacks: mockSetCallbacks,
    startAudioLevelMonitoring: vi.fn(),
    stopAudioLevelMonitoring: vi.fn(),
  };
}

vi.mock("@/lib/voice/webrtc-connection", () => ({
  WebRTCConnection: MockWebRTCConnection,
}));

// --- Mock event handler — capture callbacks for simulating events ---
let capturedCallbacks: RealtimeEventCallbacks = {};
const mockEventHandlerFn = vi.fn();

vi.mock("@/lib/voice/event-handler", () => ({
  createEventHandler: vi.fn((cbs: RealtimeEventCallbacks) => {
    capturedCallbacks = cbs;
    return mockEventHandlerFn;
  }),
}));

vi.mock("@/lib/voice/tool-definitions", () => ({
  getToolDefinitions: () => [],
}));

vi.mock("@/lib/voice/function-dispatcher", () => ({
  dispatchFunctionCall: vi.fn(),
  TOOL_DISPLAY_NAMES: {},
}));

// --- Import hook after mocks ---
import { useVoiceSession } from "@/hooks/use-voice-session";
import type { Id } from "@/convex/_generated/dataModel";

const CONV_ID = "conv-test-123" as Id<"conversations">;

describe("US-008: useVoiceSession (renderHook)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallbacks = {};
    mockCreateSession.mockResolvedValue({
      ephemeralKey: "ek-test-123",
      expiresAt: Date.now() + 60000,
      sessionId: "session-001",
    });
    mockEndSession.mockResolvedValue(null);
    mockConnect.mockResolvedValue(undefined);
  });

  describe("AC-1: start() transitions IDLE -> CONNECTING -> LISTENING", () => {
    it("creates session, connects WebRTC, and transitions to listening", async () => {
      const { result } = renderHook(() => useVoiceSession(CONV_ID));

      expect(result.current.state.status).toBe("idle");

      await act(async () => {
        await result.current.start();
      });

      // Verify Convex createSession was called
      expect(mockCreateSession).toHaveBeenCalledWith({
        conversationId: CONV_ID,
      });

      // Verify WebRTC was connected with ephemeral key
      expect(mockConnect).toHaveBeenCalledWith("ek-test-123");

      // Verify callbacks were wired
      expect(mockSetCallbacks).toHaveBeenCalled();

      // State should be listening after successful start
      expect(result.current.state.status).toBe("listening");
      expect(result.current.state.sessionId).toBe("session-001");
    });

    it("sends session.update only via onSessionCreated callback (no duplicate)", async () => {
      const { result } = renderHook(() => useVoiceSession(CONV_ID));

      await act(async () => {
        await result.current.start();
      });

      // session.update is NOT sent directly after connect —
      // it's sent only when onSessionCreated fires
      expect(mockSendEvent).not.toHaveBeenCalled();

      // Simulate OpenAI sending session.created event
      act(() => {
        capturedCallbacks.onSessionCreated?.({
          id: "sess_abc",
          model: "gpt-realtime",
        });
      });

      // Now session.update should have been sent exactly once
      expect(mockSendEvent).toHaveBeenCalledTimes(1);
      expect(mockSendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "session.update",
          session: expect.objectContaining({
            model: "gpt-realtime",
            voice: "cedar",
          }),
        })
      );
    });
  });

  describe("AC-2: stop() transitions to IDLE, destroys WebRTC, calls endSession", () => {
    it("cleans up all resources and returns to idle", async () => {
      const { result } = renderHook(() => useVoiceSession(CONV_ID));

      // Start a session
      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state.status).toBe("listening");

      // Stop the session
      await act(async () => {
        await result.current.stop();
      });

      // WebRTC destroyed
      expect(mockDestroy).toHaveBeenCalled();

      // Convex session ended
      expect(mockEndSession).toHaveBeenCalledWith({
        sessionId: "session-001",
      });

      // State back to idle
      expect(result.current.state.status).toBe("idle");
      expect(result.current.state.sessionId).toBeNull();
    });
  });

  describe("AC-3: Component unmount cleans up resources", () => {
    it("destroys WebRTC and calls endSession on unmount", async () => {
      const { result, unmount } = renderHook(() => useVoiceSession(CONV_ID));

      // Start a session
      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state.status).toBe("listening");

      // Unmount the hook (simulates component unmount)
      unmount();

      // Cleanup should have fired
      expect(mockDestroy).toHaveBeenCalled();
      expect(mockEndSession).toHaveBeenCalledWith({
        sessionId: "session-001",
      });
    });
  });

  describe("AC-4: Connection failure -> ERROR state", () => {
    it("transitions to error when createSession fails (service unavailable message)", async () => {
      mockCreateSession.mockRejectedValueOnce(
        new Error("Auth token expired")
      );

      const { result } = renderHook(() => useVoiceSession(CONV_ID));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.state.status).toBe("error");
      // US-016: user-friendly message, never expose raw API error details
      expect(result.current.state.errorMessage).toBe(
        "Voice assistant is currently unavailable"
      );
    });

    it("transitions to error when WebRTC connect fails (service unavailable message)", async () => {
      mockConnect.mockRejectedValueOnce(
        new Error("SDP exchange failed: 401")
      );

      const { result } = renderHook(() => useVoiceSession(CONV_ID));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.state.status).toBe("error");
      // US-016: user-friendly message, never expose SDP/API details
      expect(result.current.state.errorMessage).toBe(
        "Voice assistant is currently unavailable"
      );
      // Partial cleanup: end the Convex session
      expect(mockEndSession).toHaveBeenCalledWith({
        sessionId: "session-001",
      });
    });

    it("handles non-Error throws gracefully (service unavailable message)", async () => {
      mockConnect.mockRejectedValueOnce("string error");

      const { result } = renderHook(() => useVoiceSession(CONV_ID));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.state.status).toBe("error");
      // US-016: user-friendly message for connection failures
      expect(result.current.state.errorMessage).toBe(
        "Voice assistant is currently unavailable"
      );
    });
  });

  describe("event handler wiring", () => {
    it("onSpeechStarted dispatches START_LISTENING (no-op from listening)", async () => {
      const { result } = renderHook(() => useVoiceSession(CONV_ID));

      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state.status).toBe("listening");

      // onSpeechStarted fires — but START_LISTENING from 'listening' is a no-op
      // in the state machine (only valid from speaking/processing)
      act(() => {
        capturedCallbacks.onSpeechStarted?.();
      });
      // State stays listening (no invalid transition)
      expect(result.current.state.status).toBe("listening");
    });

    it("onError dispatches ERROR transition", async () => {
      const { result } = renderHook(() => useVoiceSession(CONV_ID));

      await act(async () => {
        await result.current.start();
      });

      act(() => {
        capturedCallbacks.onError?.({
          type: "rate_limit",
          message: "Rate limit exceeded",
        });
      });

      expect(result.current.state.status).toBe("error");
      expect(result.current.state.errorMessage).toBe("Rate limit exceeded");
    });
  });

  describe("guard against double-start", () => {
    it("ignores start() when already connecting/listening", async () => {
      const { result } = renderHook(() => useVoiceSession(CONV_ID));

      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state.status).toBe("listening");

      // Calling start again should be a no-op
      mockCreateSession.mockClear();
      await act(async () => {
        await result.current.start();
      });
      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(result.current.state.status).toBe("listening");
    });
  });

  describe("return type", () => {
    it("state type supports all VoiceState values", async () => {
      const { result } = renderHook(() => useVoiceSession(CONV_ID));

      // TypeScript compilation of this test validates the return type
      // allows checking against all status values
      const status = result.current.state.status;
      expect(
        ["idle", "connecting", "listening", "processing", "speaking", "error"]
      ).toContain(status);
    });
  });
});
