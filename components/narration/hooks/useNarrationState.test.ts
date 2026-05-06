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
});
