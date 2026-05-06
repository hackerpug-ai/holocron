import { useCallback, useReducer } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2;

export type NarrationStatus =
  | 'idle'
  | 'generating'
  | 'partially_ready'
  | 'ready'
  | 'playing'
  | 'paused';

export interface NarrationState {
  status: NarrationStatus;
  /** -1 when idle / not yet started */
  activeParagraphIndex: number;
  totalParagraphs: number;
  generatedCount: number;
  currentTimeSeconds: number;
  totalTimeSeconds: number;
  playbackSpeed: PlaybackSpeed;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

type NarrationAction =
  | { type: 'ENTER_MODE'; totalParagraphs: number; startParagraphIndex: number }
  | { type: 'EXIT_MODE' }
  | { type: 'PARAGRAPH_READY'; generatedCount: number; totalTimeSeconds?: number }
  | { type: 'ALL_READY' }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE_PLAY_PAUSE' }
  | { type: 'TICK'; currentTimeSeconds: number }
  | { type: 'SKIP_TO'; paragraphIndex: number }
  | { type: 'SKIP_PREVIOUS' }
  | { type: 'SKIP_NEXT' }
  | { type: 'SET_SPEED'; speed: PlaybackSpeed }
  | { type: 'REGENERATE' };

// ─── Initial State ────────────────────────────────────────────────────────────

const INITIAL_STATE: NarrationState = {
  status: 'idle',
  activeParagraphIndex: -1,
  totalParagraphs: 0,
  generatedCount: 0,
  currentTimeSeconds: 0,
  totalTimeSeconds: 0,
  playbackSpeed: 1,
};

function clampParagraphIndex(index: number, totalParagraphs: number): number {
  if (totalParagraphs <= 0) return -1;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), totalParagraphs - 1);
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function narrationReducer(state: NarrationState, action: NarrationAction): NarrationState {
  switch (action.type) {
    case 'ENTER_MODE': {
      const activeParagraphIndex = clampParagraphIndex(
        action.startParagraphIndex,
        action.totalParagraphs
      );
      return {
        ...INITIAL_STATE,
        status: activeParagraphIndex >= 0 ? 'playing' : 'generating',
        activeParagraphIndex,
        totalParagraphs: action.totalParagraphs,
        playbackSpeed: state.playbackSpeed,
      };
    }

    case 'EXIT_MODE':
      return { ...INITIAL_STATE };

    case 'PARAGRAPH_READY': {
      const newStatus =
        action.generatedCount >= 1 && state.status === 'generating'
          ? 'partially_ready'
          : state.status;
      return {
        ...state,
        status: newStatus,
        generatedCount: action.generatedCount,
        totalTimeSeconds: action.totalTimeSeconds ?? state.totalTimeSeconds,
      };
    }

    case 'ALL_READY':
      // Don't interrupt active playback — only transition to 'ready' from
      // generating/partially_ready states. If the user is already playing
      // or paused, keep that status so audio isn't disrupted.
      if (state.status === 'playing' || state.status === 'paused') {
        return { ...state, generatedCount: state.totalParagraphs };
      }
      return { ...state, status: 'ready' };

    case 'PLAY':
      return {
        ...state,
        status: 'playing',
        activeParagraphIndex: state.activeParagraphIndex === -1 ? 0 : state.activeParagraphIndex,
      };

    case 'PAUSE':
      return { ...state, status: 'paused' };

    case 'TOGGLE_PLAY_PAUSE':
      if (state.status === 'playing') {
        return { ...state, status: 'paused' };
      }
      if (
        state.status === 'paused' ||
        state.status === 'ready' ||
        state.status === 'partially_ready' ||
        state.status === 'generating'
      ) {
        return {
          ...state,
          status: 'playing',
          activeParagraphIndex: state.activeParagraphIndex === -1 ? 0 : state.activeParagraphIndex,
        };
      }
      return state;

    case 'TICK':
      return { ...state, currentTimeSeconds: action.currentTimeSeconds };

    case 'SKIP_TO': {
      const canPlay =
        state.status === 'playing' ||
        state.status === 'paused' ||
        state.status === 'ready' ||
        state.status === 'partially_ready';
      return {
        ...state,
        status: canPlay ? 'playing' : state.status,
        activeParagraphIndex: action.paragraphIndex,
        currentTimeSeconds: 0,
      };
    }

    case 'SKIP_PREVIOUS':
      return {
        ...state,
        status:
          state.status === 'playing' ||
          state.status === 'paused' ||
          state.status === 'ready' ||
          state.status === 'partially_ready'
            ? 'playing'
            : state.status,
        activeParagraphIndex: Math.max(0, state.activeParagraphIndex - 1),
        currentTimeSeconds: 0,
      };

    case 'SKIP_NEXT':
      return {
        ...state,
        status:
          state.status === 'playing' ||
          state.status === 'paused' ||
          state.status === 'ready' ||
          state.status === 'partially_ready'
            ? 'playing'
            : state.status,
        activeParagraphIndex: Math.min(state.totalParagraphs - 1, state.activeParagraphIndex + 1),
        currentTimeSeconds: 0,
      };

    case 'SET_SPEED':
      return { ...state, playbackSpeed: action.speed };

    case 'REGENERATE':
      return {
        ...state,
        status: 'generating',
        generatedCount: 0,
        currentTimeSeconds: 0,
        totalTimeSeconds: 0,
        activeParagraphIndex: -1,
      };

    default:
      return state;
  }
}

// ─── Return Type ──────────────────────────────────────────────────────────────

export interface UseNarrationStateReturn {
  state: NarrationState;
  /** true when status is anything other than 'idle' */
  isNarrationMode: boolean;
  enterNarrationMode: (startParagraphIndex?: number) => void;
  exitNarrationMode: () => void;
  /** PLAY if status is 'paused' or 'ready', PAUSE if status is 'playing' */
  togglePlayPause: () => void;
  skipToParagraph: (index: number) => void;
  /** Skip to activeParagraphIndex - 1, clamped to 0 */
  skipPrevious: () => void;
  /** Skip to activeParagraphIndex + 1, clamped to totalParagraphs - 1 */
  skipNext: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  regenerate: () => void;
  onParagraphReady: (generatedCount: number, totalTimeSeconds?: number) => void;
  onAllReady: () => void;
  onTick: (currentTimeSeconds: number) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNarrationState(totalParagraphs: number): UseNarrationStateReturn {
  const [state, dispatch] = useReducer(narrationReducer, INITIAL_STATE);

  const isNarrationMode = state.status !== 'idle';

  const enterNarrationMode = useCallback(
    (startParagraphIndex = 0) => {
      dispatch({ type: 'ENTER_MODE', totalParagraphs, startParagraphIndex });
    },
    [totalParagraphs]
  );

  const exitNarrationMode = useCallback(() => {
    dispatch({ type: 'EXIT_MODE' });
  }, []);

  const togglePlayPause = useCallback(() => {
    dispatch({ type: 'TOGGLE_PLAY_PAUSE' });
  }, []);

  const skipToParagraph = useCallback((index: number) => {
    dispatch({ type: 'SKIP_TO', paragraphIndex: index });
  }, []);

  const skipPrevious = useCallback(() => {
    dispatch({ type: 'SKIP_PREVIOUS' });
  }, []);

  const skipNext = useCallback(() => {
    dispatch({ type: 'SKIP_NEXT' });
  }, []);

  const setSpeed = useCallback((speed: PlaybackSpeed) => {
    dispatch({ type: 'SET_SPEED', speed });
  }, []);

  const regenerate = useCallback(() => {
    dispatch({ type: 'REGENERATE' });
  }, []);

  const onParagraphReady = useCallback((generatedCount: number, totalTimeSeconds?: number) => {
    dispatch({ type: 'PARAGRAPH_READY', generatedCount, totalTimeSeconds });
  }, []);

  const onAllReady = useCallback(() => {
    dispatch({ type: 'ALL_READY' });
  }, []);

  const onTick = useCallback((currentTimeSeconds: number) => {
    dispatch({ type: 'TICK', currentTimeSeconds });
  }, []);

  return {
    state,
    isNarrationMode,
    enterNarrationMode,
    exitNarrationMode,
    togglePlayPause,
    skipToParagraph,
    skipPrevious,
    skipNext,
    setSpeed,
    regenerate,
    onParagraphReady,
    onAllReady,
    onTick,
  };
}
