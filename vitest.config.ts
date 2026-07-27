import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { reactNative } from 'vitest-native';
import { projects } from './vitest.workspace';

// Root vitest config. Per-lane `include`/`exclude`/`name` live in vitest.workspace.ts
// (`test.projects`, vitest 4 model). Projects use `extends: true` to inherit the
// plugins / resolve.alias / globals / setupFiles declared here.
//
// Lanes (F3 widening — imp-widen-integration-ci):
//   pnpm test:unit         →  vitest run --project unit         (~978 tests, no infra)
//   pnpm test:integration  →  vitest run --project integration  (~159 files, PLATFORM_IT-gated)
//   pnpm test:live         →  vitest run --project live         (real Postgres + PLATFORM_IT)
//   pnpm test:lanes        →  AC-6 file-count guard (scripts/check-test-lanes.ts)
export default defineConfig({
  plugins: [reactNative()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['tests/setup/react-native.ts'],
    exclude: ['node_modules', 'dist', '.expo'],
    projects,
  },
});
