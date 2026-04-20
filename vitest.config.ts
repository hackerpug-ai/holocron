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
    ],
    exclude: ['node_modules', 'dist', '.expo'],
  },
});
