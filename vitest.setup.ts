/**
 * Vitest setup file for React Native testing
 *
 * This file runs before all tests and sets up mocks for problematic modules.
 */

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
