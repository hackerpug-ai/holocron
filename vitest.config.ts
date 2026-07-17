import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { reactNative } from 'vitest-native';

export default defineConfig({
  plugins: [reactNative()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    globals: true,
    include: [
      'tests/**/*.{test,spec}.{js,ts,tsx}',
      'convex/**/*.{test,spec}.{js,ts,tsx}',
      'hooks/**/*.{test,spec}.{js,ts}',
      'components/**/*.{test,spec}.{js,ts,tsx}',
      // Sprint 06 — stack supervisor / secrets / launchd RED+GREEN suite (D01-01+)
      'services/platform/src/cli/__tests__/**/*.{test,spec}.ts',
      // Sprint 10 — local re-embedding + hybrid RRF search (vitest; not bun:test suite)
      'services/platform/tests/integration/embed-helper.test.ts',
      'services/platform/tests/integration/embed-run.test.ts',
      'services/platform/tests/integration/search-recall.test.ts',
      'services/platform/tests/integration/rrf-search.test.ts',
      'services/platform/tests/integration/inline-surfaces-search.test.ts',
    ],
    setupFiles: ['tests/setup/react-native.ts'],
    exclude: ['node_modules', 'dist', '.expo'],
  },
});
