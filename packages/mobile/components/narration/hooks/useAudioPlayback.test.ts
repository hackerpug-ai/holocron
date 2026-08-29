/**
 * @vitest-environment jsdom
 */

import { renderHook, waitFor } from '@testing-library/react';
import { type AudioSegment, useAudioPlayback } from './useAudioPlayback';
import type { UseNarrationStateReturn } from './useNarrationState';

const audioMocks = vi.hoisted(() => {
  const player = {
    pause: vi.fn(),
    remove: vi.fn(),
    play: vi.fn(),
    setPlaybackRate: vi.fn(),
    setActiveForLockScreen: vi.fn(),
    addListener: vi.fn(),
    clearLockScreenControls: vi.fn(),
    shouldCorrectPitch: false,
  };

  return {
    player,
    createAudioPlayer: vi.fn(() => player),
    setAudioModeAsync: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('expo-audio', () => ({
  createAudioPlayer: audioMocks.createAudioPlayer,
  setAudioModeAsync: audioMocks.setAudioModeAsync,
}));

function makeNarration(): UseNarrationStateReturn {
  return {
    state: {
      status: 'playing',
      activeParagraphIndex: 0,
      totalParagraphs: 1,
      generatedCount: 0,
      currentTimeSeconds: 0,
      totalTimeSeconds: 0,
      playbackSpeed: 1,
    },
    isNarrationMode: true,
    enterNarrationMode: vi.fn(),
    exitNarrationMode: vi.fn(),
    togglePlayPause: vi.fn(),
    skipToParagraph: vi.fn(),
    skipPrevious: vi.fn(),
    skipNext: vi.fn(),
    setSpeed: vi.fn(),
    regenerate: vi.fn(),
    onParagraphReady: vi.fn(),
    onAllReady: vi.fn(),
    onTick: vi.fn(),
  };
}

const pendingSegment: AudioSegment = {
  _id: 'segment-1',
  paragraphIndex: 0,
  status: 'generating',
  audioUrl: null,
};

const readySegment: AudioSegment = {
  ...pendingSegment,
  status: 'completed',
  audioUrl: 'https://example.com/audio/segment-1.mp3',
  durationMs: 1500,
};

describe('useAudioPlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audioMocks.player.shouldCorrectPitch = false;
  });

  it('auto-loads and plays when playback intent exists and the active segment URL arrives', async () => {
    const narration = makeNarration();
    const { rerender } = renderHook(
      ({ segments }) => useAudioPlayback(segments, narration, { title: 'Article' }),
      {
        initialProps: { segments: [pendingSegment] },
      }
    );

    expect(audioMocks.createAudioPlayer).not.toHaveBeenCalled();

    rerender({ segments: [readySegment] });

    await waitFor(() => {
      expect(audioMocks.createAudioPlayer).toHaveBeenCalledWith(readySegment.audioUrl);
    });
    expect(audioMocks.player.play).toHaveBeenCalledTimes(1);
  });
});
