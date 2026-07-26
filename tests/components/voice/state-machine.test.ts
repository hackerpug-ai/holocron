/**
 * S-UPLOAD-02 AC-4 — voice UI components render per state machine transitions.
 *
 * Unit-tier justified: pure UI state-machine component test — no runtime I/O;
 * assertions on mounted product nodes per state.
 *
 * Mounts real VoiceMicButton / VoiceSessionOverlay / VoiceAgentOrb driven by the
 * real voiceSessionReducer. Reanimated/icon/theme mocks follow established
 * project patterns (see NarrationControlBar.test.tsx) — no synthetic stand-ins.
 *
 * Verify:
 *   pnpm vitest run tests/components/voice/state-machine.test.ts
 */
import { render, screen } from '@testing-library/react-native';
import { createElement, useMemo } from 'react';
import { Animated, View } from 'react-native';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { VoiceAgentOrb } from '@/components/voice/VoiceAgentOrb';
import { VoiceMicButton } from '@/components/voice/VoiceMicButton';
import { VoiceSessionOverlay } from '@/components/voice/VoiceSessionOverlay';
import {
  initialVoiceSessionState,
  type VoiceAction,
  type VoiceSessionState,
  voiceSessionReducer,
} from '@/hooks/use-voice-session-state';
import { colors, radius, spacing, typography } from '@/lib/theme';

// Established reanimated mock (NarrationControlBar.test.tsx) — avoids native loops.
vi.mock('react-native-reanimated', () => {
  const { View: RNView } = require('react-native');
  return {
    default: { View: RNView },
    cancelAnimation: vi.fn(),
    Easing: { linear: vi.fn(), bezier: vi.fn() },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (value: unknown) => value,
    withSequence: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    colors: colors.light,
    brandColors: {},
    spacing,
    radius,
    typography,
    isDark: false,
  }),
}));

// Explicit named icon stubs (vitest ESM interop rejects Proxy-only mocks).
vi.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View: RNView } = require('react-native');
  const make = (name: string) =>
    function IconStub(props: Record<string, unknown>) {
      return React.createElement(RNView, { ...props, testID: `icon-${name}` });
    };
  return {
    Mic: make('Mic'),
    MicOff: make('MicOff'),
    Square: make('Square'),
    AlertCircle: make('AlertCircle'),
    X: make('X'),
  };
});

vi.mock('@/components/ui/text', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(Text, props, children),
  };
});

/**
 * vitest-native's Animated.loop runs infinite iterations synchronously and
 * overflows the stack. Mutate the shared Animated object (same reference the
 * product imports) so ListeningIndicator/SpeakingIndicator stay mountable.
 */
beforeAll(() => {
  const noop = () => ({ start: vi.fn(), stop: vi.fn(), reset: vi.fn() });
  Animated.loop = vi.fn(noop) as typeof Animated.loop;
  Animated.sequence = vi.fn(noop) as typeof Animated.sequence;
  Animated.timing = vi.fn(noop) as typeof Animated.timing;
});

type AcStatus = 'idle' | 'recording' | 'cancelled';

function reduceScript(script: VoiceAction[]): {
  state: VoiceSessionState;
  transitions: Array<VoiceSessionState['status']>;
} {
  let current = initialVoiceSessionState;
  const transitions: Array<VoiceSessionState['status']> = [current.status];
  for (const action of script) {
    current = voiceSessionReducer(current, action);
    if (transitions[transitions.length - 1] !== current.status) {
      transitions.push(current.status);
    }
  }
  return { state: current, transitions };
}

/** Map product statuses onto AC vocabulary: listening≈recording, idle-after-recording≈cancelled. */
function toAcLog(transitions: Array<VoiceSessionState['status']>): AcStatus[] {
  const acLog: AcStatus[] = [];
  for (const status of transitions) {
    if (status === 'idle' && acLog.length === 0) acLog.push('idle');
    else if (status === 'listening' || status === 'speaking' || status === 'processing') {
      if (acLog[acLog.length - 1] !== 'recording') acLog.push('recording');
    } else if (status === 'idle' && acLog.includes('recording')) {
      if (acLog[acLog.length - 1] !== 'cancelled') acLog.push('cancelled');
    }
  }
  return acLog;
}

/**
 * Product surface: real VoiceMicButton + VoiceSessionOverlay + VoiceAgentOrb,
 * driven by voiceSessionReducer output (Zero-synced session shape).
 */
function VoiceStateMachineSurface({ script }: { script: VoiceAction[] }) {
  const { state, transitions } = useMemo(() => reduceScript(script), [script]);
  const acLog = toAcLog(transitions);
  const isRecording =
    state.status === 'listening' || state.status === 'speaking' || state.status === 'processing';

  return createElement(
    View,
    {
      testID: 'voice-state-harness',
      accessibilityLabel: acLog.join('->'),
    },
    createElement(VoiceMicButton, {
      voiceState: state.status,
      onStart: () => {},
      onStop: () => {},
    }),
    createElement(VoiceSessionOverlay, { state }),
    // Orb stays mounted while session is active (connecting/recording/…) so Maestro can target it.
    state.status !== 'idle'
      ? createElement(VoiceAgentOrb, {
          status: state.status,
          audioLevel: isRecording ? 0.6 : 0,
        })
      : null
  );
}

describe('S-UPLOAD-02 AC-4: voice state machine UI', () => {
  it('mounts real VoiceMicButton / Overlay / Orb and logs idle→recording→cancelled', () => {
    const recordingScript: VoiceAction[] = [
      { type: 'CONNECT', conversationId: 'conv-ac4' },
      { type: 'CONNECTED', sessionId: 'session-ac4' },
    ];

    // Idle baseline — product mic only; overlay returns null; orb not mounted
    const idle = render(createElement(VoiceStateMachineSurface, { script: [] }));
    expect(screen.getByTestId('voice-mic-button')).toBeTruthy();
    expect(screen.queryByTestId('voice-session-overlay')).toBeNull();
    expect(screen.queryByTestId('voice-agent-orb')).toBeNull();
    expect(String(screen.getByTestId('voice-state-harness').props.accessibilityLabel)).toBe('idle');
    idle.unmount();

    // Recording (listening) mounts overlay + orb with product testIDs
    const recording = render(createElement(VoiceStateMachineSurface, { script: recordingScript }));
    expect(screen.getByTestId('voice-mic-button')).toBeTruthy();
    expect(screen.getByTestId('voice-session-overlay')).toBeTruthy();
    expect(screen.getByTestId('voice-agent-orb')).toBeTruthy();
    const recordingHarness = screen.getByTestId('voice-state-harness');
    expect(String(recordingHarness.props.accessibilityLabel)).toMatch(/idle->recording/);
    // Listening indicator from product overlay
    expect(screen.getByTestId('voice-overlay-listening-indicator')).toBeTruthy();
    recording.unmount();

    // Cancel: DISCONNECT returns to idle (AC: cancelled)
    const cancelledScript: VoiceAction[] = [
      { type: 'CONNECT', conversationId: 'conv-ac4' },
      { type: 'CONNECTED', sessionId: 'session-ac4' },
      { type: 'DISCONNECT' },
    ];
    const { state, transitions } = reduceScript(cancelledScript);
    expect(transitions).toEqual(['idle', 'connecting', 'listening', 'idle']);
    expect(state.status).toBe('idle');
    expect(state.status).not.toBe('listening');
    expect(toAcLog(transitions)).toEqual(['idle', 'recording', 'cancelled']);

    const cancelled = render(createElement(VoiceStateMachineSurface, { script: cancelledScript }));
    expect(screen.getByTestId('voice-mic-button')).toBeTruthy();
    expect(screen.queryByTestId('voice-session-overlay')).toBeNull();
    expect(screen.queryByTestId('voice-agent-orb')).toBeNull();
    const cancelHarness = screen.getByTestId('voice-state-harness');
    expect(String(cancelHarness.props.accessibilityLabel)).toBe('idle->recording->cancelled');
    cancelled.unmount();
  });
});
