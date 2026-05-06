import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NarrationState, UseNarrationStateReturn } from './hooks/useNarrationState';
import { NarrationControlBar } from './NarrationControlBar';

vi.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    default: { View },
    cancelAnimation: vi.fn(),
    Easing: { linear: vi.fn() },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

vi.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const SvgStub = (props: Record<string, unknown>) => React.createElement(View, props);
  const CircleStub = (props: Record<string, unknown>) => React.createElement(View, props);
  return {
    default: SvgStub,
    Svg: SvgStub,
    Circle: CircleStub,
  };
});

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#22c55e',
    },
  }),
}));

const baseState: NarrationState = {
  status: 'playing',
  activeParagraphIndex: 0,
  totalParagraphs: 3,
  generatedCount: 0,
  currentTimeSeconds: 0,
  totalTimeSeconds: 120,
  playbackSpeed: 1,
};

function makeNarration(
  stateOverrides: Partial<NarrationState> = {},
  togglePlayPause = vi.fn()
): UseNarrationStateReturn {
  return {
    state: { ...baseState, ...stateOverrides },
    isNarrationMode: true,
    enterNarrationMode: vi.fn(),
    exitNarrationMode: vi.fn(),
    togglePlayPause,
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

describe('NarrationControlBar', () => {
  it('shows a loading ring and keeps the play icon visible while loading', () => {
    render(
      <NarrationControlBar
        narration={makeNarration({ status: 'playing' })}
        isVisible={true}
        isSegmentLoading={true}
      />
    );

    expect(screen.getByTestId('spinner-ring')).toBeTruthy();
    expect(screen.getByTestId('icon-Play')).toBeTruthy();
    expect(screen.queryByTestId('icon-Pause')).toBeNull();
  });

  it('does not toggle playback while loading', () => {
    const togglePlayPause = vi.fn();
    render(
      <NarrationControlBar
        narration={makeNarration({ status: 'playing' }, togglePlayPause)}
        isVisible={true}
        isSegmentLoading={true}
      />
    );

    fireEvent.press(screen.getByTestId('narration-play-pause'));

    expect(togglePlayPause).not.toHaveBeenCalled();
  });

  it.each(['playing', 'paused'] as const)('toggles playback when %s and loaded', (status) => {
    const togglePlayPause = vi.fn();
    render(
      <NarrationControlBar
        narration={makeNarration({ status }, togglePlayPause)}
        isVisible={true}
        isSegmentLoading={false}
      />
    );

    fireEvent.press(screen.getByTestId('narration-play-pause'));

    expect(togglePlayPause).toHaveBeenCalledTimes(1);
  });
});
