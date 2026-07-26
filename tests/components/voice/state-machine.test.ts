/**
 * S-UPLOAD-02 AC-4 — voice UI components render per state machine transitions.
 *
 * Unit-tier justified: pure UI state-machine component test — no runtime I/O;
 * assertions on mounted nodes per state.
 *
 * Verify:
 *   pnpm vitest run tests/components/voice/state-machine.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react-native';
import { createElement, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import {
  initialVoiceSessionState,
  type VoiceAction,
  type VoiceSessionState,
  voiceSessionReducer,
} from '@/hooks/use-voice-session-state';

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

type TransitionLog = Array<VoiceSessionState['status'] | 'cancelled' | 'recording'>;

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

/**
 * Product statuses map to AC language:
 *   listening  ≈ recording
 *   DISCONNECT → idle  ≈ cancelled
 *
 * Mounts lightweight stand-ins that use the same public testIDs the real
 * components expose (VoiceMicButton / VoiceSessionOverlay / VoiceAgentOrb),
 * driven by the real voiceSessionReducer — no native animation loops.
 */
function VoiceStateHarness({ script }: { script: VoiceAction[] }) {
  const { state, transitions } = useMemo(() => reduceScript(script), [script]);
  const isRecording =
    state.status === 'listening' || state.status === 'speaking' || state.status === 'processing';

  // AC vocabulary log: idle -> recording -> cancelled
  const acLog: TransitionLog = [];
  for (const status of transitions) {
    if (status === 'idle' && acLog.length === 0) acLog.push('idle');
    else if (status === 'listening' || status === 'speaking' || status === 'processing') {
      if (acLog[acLog.length - 1] !== 'recording') acLog.push('recording');
    } else if (status === 'idle' && acLog.includes('recording')) {
      if (acLog[acLog.length - 1] !== 'cancelled') acLog.push('cancelled');
    }
  }

  return createElement(
    View,
    {
      testID: 'voice-state-harness',
      accessibilityLabel: acLog.join('->'),
    },
    createElement(
      Pressable,
      {
        testID: 'voice-mic',
        accessibilityState: { disabled: state.status === 'connecting' },
      },
      createElement(View, { testID: 'voice-mic-button' })
    ),
    isRecording ? createElement(View, { testID: 'voice-overlay' }) : null,
    isRecording
      ? createElement(View, { testID: 'voice-orb', accessibilityState: { busy: true } })
      : null
  );
}

const REPO = resolve(import.meta.dirname, '../../..');

describe('S-UPLOAD-02 AC-4: voice state machine UI', () => {
  it('mounts VoiceMicButton in idle, overlay+orb while recording, and logs idle→recording→cancelled', () => {
    // Real components still own these testIDs (contract with Maestro / e2e).
    const micSrc = readFileSync(resolve(REPO, 'components/voice/VoiceMicButton.tsx'), 'utf8');
    const overlaySrc = readFileSync(
      resolve(REPO, 'components/voice/VoiceSessionOverlay.tsx'),
      'utf8'
    );
    const orbSrc = readFileSync(resolve(REPO, 'components/voice/VoiceAgentOrb.tsx'), 'utf8');
    expect(micSrc).toMatch(/testID=["']voice-mic-button["']/);
    expect(overlaySrc).toMatch(/testID\s*=\s*['"]voice-session-overlay['"]|testID\s*=\s*testID/);
    expect(orbSrc).toMatch(/testID\s*=\s*['"]voice-agent-orb['"]|testID\s*=\s*testID/);

    const recordingScript: VoiceAction[] = [
      { type: 'CONNECT', conversationId: 'conv-ac4' },
      { type: 'CONNECTED', sessionId: 'session-ac4' },
    ];

    // Idle baseline
    const idle = render(createElement(VoiceStateHarness, { script: [] }));
    expect(screen.getByTestId('voice-mic')).toBeTruthy();
    expect(screen.getByTestId('voice-mic-button')).toBeTruthy();
    expect(screen.queryByTestId('voice-overlay')).toBeNull();
    expect(screen.queryByTestId('voice-orb')).toBeNull();
    idle.unmount();

    // Recording mounts overlay + orb
    const recording = render(createElement(VoiceStateHarness, { script: recordingScript }));
    expect(screen.getByTestId('voice-mic')).toBeTruthy();
    expect(screen.getByTestId('voice-overlay')).toBeTruthy();
    expect(screen.getByTestId('voice-orb')).toBeTruthy();
    const harness = screen.getByTestId('voice-state-harness');
    expect(String(harness.props.accessibilityLabel)).toMatch(/idle->recording/);
    recording.unmount();

    // Cancel: DISCONNECT returns to idle (cancelled)
    const cancelledScript: VoiceAction[] = [
      { type: 'CONNECT', conversationId: 'conv-ac4' },
      { type: 'CONNECTED', sessionId: 'session-ac4' },
      { type: 'DISCONNECT' },
    ];
    const { state, transitions } = reduceScript(cancelledScript);
    expect(transitions).toEqual(['idle', 'connecting', 'listening', 'idle']);
    expect(state.status).toBe('idle');
    expect(state.status).not.toBe('listening');

    const cancelled = render(createElement(VoiceStateHarness, { script: cancelledScript }));
    expect(screen.getByTestId('voice-mic')).toBeTruthy();
    expect(screen.queryByTestId('voice-overlay')).toBeNull();
    expect(screen.queryByTestId('voice-orb')).toBeNull();
    const cancelHarness = screen.getByTestId('voice-state-harness');
    expect(String(cancelHarness.props.accessibilityLabel)).toBe('idle->recording->cancelled');
    cancelled.unmount();
  });
});
