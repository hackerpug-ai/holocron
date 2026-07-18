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
      // Sprint 11 — durable leased queue (priority lanes + DLQ)
      'services/platform/tests/integration/queue-priority.test.ts',
      'services/platform/tests/integration/queue-dlq.test.ts',
      // Sprint 12 — inference telemetry stream (tokens/wall-ms/endpoint/role)
      'services/platform/tests/integration/inference-telemetry.test.ts',
      // Sprint 12 — research mission → durable inference_telemetry (obs-5 H1)
      'services/platform/tests/integration/mission-telemetry.test.ts',
      // Sprint 12 — observability / Langfuse per-run traces (obs-1)
      'services/platform/tests/integration/observability-traces.test.ts',
      // Sprint 12 — versioned eval scorers / datasets / baselines / drift (obs-3)
      'services/platform/tests/integration/evals-versioning.test.ts',
      // Sprint 12 — CI regression gate (threshold + deterministic invariants) (obs-4)
      'services/platform/tests/integration/evals-ci-gate.test.ts',
      // Sprint 13 — fail-closed integration lane
      'services/platform/tests/integration/fail-closed-lane.test.ts',
      // Sprint 14 — ETL + content-addressed blob verify
      'services/platform/tests/integration/sprint14-etl-and-blob.test.ts',
      // Sprint 15 — mission engine durable resumable templates
      'services/platform/tests/integration/mission-engine-red.test.ts',
      // Sprint 17 — deterministic research gate and distinct ASSAY/CHALLENGE fleet calls
      'services/platform/tests/integration/sprint17-research-engine.test.ts',
    ],
    setupFiles: ['tests/setup/react-native.ts'],
    exclude: ['node_modules', 'dist', '.expo'],
  },
});
