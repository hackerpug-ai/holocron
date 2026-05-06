/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { useNarrationState } from './useNarrationState';

describe('useNarrationState', () => {
  it('starts playback intent at the first paragraph immediately', () => {
    const { result } = renderHook(() => useNarrationState(3));

    act(() => {
      result.current.enterNarrationMode(0);
    });

    expect(result.current.isNarrationMode).toBe(true);
    expect(result.current.state.status).toBe('playing');
    expect(result.current.state.activeParagraphIndex).toBe(0);
  });

  it('starts playback intent at the requested paragraph immediately', () => {
    const { result } = renderHook(() => useNarrationState(5));

    act(() => {
      result.current.enterNarrationMode(3);
    });

    expect(result.current.state.status).toBe('playing');
    expect(result.current.state.activeParagraphIndex).toBe(3);
  });

  it('keeps action function identities stable across narration state changes', () => {
    const { result } = renderHook(() => useNarrationState(3));
    const firstExitNarrationMode = result.current.exitNarrationMode;
    const firstSkipNext = result.current.skipNext;
    const firstOnParagraphReady = result.current.onParagraphReady;

    act(() => {
      result.current.enterNarrationMode(1);
    });

    expect(result.current.exitNarrationMode).toBe(firstExitNarrationMode);
    expect(result.current.skipNext).toBe(firstSkipNext);
    expect(result.current.onParagraphReady).toBe(firstOnParagraphReady);
  });

  it('keeps skip controls using the latest active paragraph', () => {
    const { result } = renderHook(() => useNarrationState(3));

    act(() => {
      result.current.enterNarrationMode(1);
    });
    act(() => {
      result.current.skipNext();
    });
    expect(result.current.state.activeParagraphIndex).toBe(2);

    act(() => {
      result.current.skipPrevious();
    });
    expect(result.current.state.activeParagraphIndex).toBe(1);
  });
});
