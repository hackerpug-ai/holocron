/**
 * @vitest-environment jsdom
 *
 * S31-FE-02 AC-5 — useZeroRowWatchdog fires only for enabled-and-still-undefined.
 *
 * UNIT_TEST_JUSTIFIED: pure timer-over-inputs reducer with 0 I/O; real Zero
 * integration is covered by AC-1 / AC-2 / AC-3 e2e scenarios.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useZeroRowWatchdog,
  ZERO_ROW_WATCHDOG_DEADLINE_MS,
  ZERO_ROW_WATCHDOG_MESSAGE,
} from '@/hooks/use-zero-row-watchdog';

describe('useZeroRowWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('useZeroRowWatchdog fires on enabled and undefined', () => {
    const { result, unmount } = renderHook(() => useZeroRowWatchdog(undefined, true));

    expect(result.current).toBeNull();

    act(() => {
      vi.advanceTimersByTime(ZERO_ROW_WATCHDOG_DEADLINE_MS);
    });

    expect(result.current).toBeInstanceOf(Error);
    expect(result.current?.message).toBe(ZERO_ROW_WATCHDOG_MESSAGE);
    expect(ZERO_ROW_WATCHDOG_MESSAGE.length).toBeGreaterThanOrEqual(20);
    expect(ZERO_ROW_WATCHDOG_DEADLINE_MS).toBeGreaterThanOrEqual(15_000);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useZeroRowWatchdog stays null when disabled', () => {
    const { result, unmount } = renderHook(() => useZeroRowWatchdog(undefined, false));

    act(() => {
      vi.advanceTimersByTime(ZERO_ROW_WATCHDOG_DEADLINE_MS + 5_000);
    });

    expect(result.current).toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useZeroRowWatchdog stays null when row is defined from the start', () => {
    const { result, unmount } = renderHook(() => useZeroRowWatchdog({ id: 'row-1' }, true));

    act(() => {
      vi.advanceTimersByTime(ZERO_ROW_WATCHDOG_DEADLINE_MS + 5_000);
    });

    expect(result.current).toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useZeroRowWatchdog cancels on row arrival', () => {
    const { result, rerender, unmount } = renderHook(
      ({ row, enabled }: { row: unknown; enabled: boolean }) => useZeroRowWatchdog(row, enabled),
      { initialProps: { row: undefined as unknown, enabled: true } }
    );

    act(() => {
      vi.advanceTimersByTime(Math.floor(ZERO_ROW_WATCHDOG_DEADLINE_MS * 0.6));
    });
    expect(result.current).toBeNull();

    rerender({ row: { id: 'arrived' }, enabled: true });

    act(() => {
      vi.advanceTimersByTime(ZERO_ROW_WATCHDOG_DEADLINE_MS);
    });

    expect(result.current).toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
