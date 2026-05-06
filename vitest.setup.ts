/**
 * Vitest setup file for React Native testing
 *
 * This file runs before all tests and sets up mocks for problematic modules.
 */

import { View } from 'react-native';
import { vi } from 'vitest';

// Mock react-native-svg to avoid codegenNativeComponent errors
vi.mock('react-native-svg', () => ({
  Circle: 'Circle',
  Rect: 'Rect',
  Path: 'Path',
  Line: 'Line',
  G: 'G',
  Svg: 'Svg',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Stop: 'Stop',
}));

// Mock Animated.loop to prevent infinite animation loops in skeleton tests
vi.mock('react-native', async () => {
  const actual = await vi.importActual<typeof import('react-native')>('react-native');
  return {
    ...actual,
    Animated: {
      ...(actual.Animated as Record<string, unknown>),
      loop: (animation: unknown) => ({
        start: vi.fn(),
        stop: vi.fn(),
      }),
      timing: (value: unknown, config: unknown) => ({
        start: (callback?: () => void) => callback?.(),
        stop: vi.fn(),
        reset: vi.fn(),
      }),
      sequence: (animations: unknown) => ({
        start: vi.fn(),
        stop: vi.fn(),
      }),
    },
  };
});
