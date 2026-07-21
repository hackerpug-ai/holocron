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
      'services/platform/tests/integration/sprint17-mission-template.test.ts',
      // Sprint 18 — idempotent fleet chat runs and resumable SSE
      'services/platform/tests/integration/sprint18-chat-runs.test.ts',
      // Sprint 19 — Streamable HTTP MCP gateway parity and security
      'services/platform/tests/integration/sprint19-mcp-rehost.test.ts',
      // Sprint 20 — Hono chat writes to the Zero-published conversation surface
      'services/platform/tests/integration/sprint20-chat-zero-boundary.test.ts',
      // Sprint 20 REDHAT-FIX-H5 — durable agent row read via live zero-cache (CAP-SYNC-01)
      'services/platform/tests/integration/sprint20-reference-zero-durable.test.ts',
      // Sprint 20 REDHAT-FIX-H7 — live zero-cache namespace reset/read + fingerprint
      'services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts',
      // Sprint 22 pipes-4 — pipeline templates / no-shells / publish RED suite
      'services/platform/tests/integration/red-evidence-research.test.ts',
      'services/platform/tests/integration/red-whatsnew.test.ts',
      'services/platform/tests/integration/red-business-report.test.ts',
      'services/platform/tests/integration/red-no-shells.test.ts',
      'services/platform/tests/integration/red-sub-workflow-publish.test.ts',
      // Sprint 22 pipes-1 — shared evidence-research template GREEN + pure-TS gate
      'services/platform/tests/integration/evidence-research-template.test.ts',
      'services/platform/src/research/evidence-gate.test.ts',
      // Sprint 22 pipes-2 — parameterized business-report (4 kinds) on fleet
      'services/platform/tests/integration/business-report-template.test.ts',
      // Sprint 22 pipes-3 — whatsnew/assimilate/shop/subscriptions + sub-workflow publish
      'services/platform/tests/integration/pipeline-templates.test.ts',
      // Sprint 22 REDHAT-FIX-2 — deterministic CLI mission idempotency defaults (C-2)
      'services/platform/tests/integration/redhat-fix-2-cli-idempotency-defaults.test.ts',
      // Sprint 22 REDHAT-FIX-1 — CAP-EMB-01 research-retrieve wiring (C-1)
      'services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts',
      'services/platform/tests/integration/redhat-fix-3-infer-trace.test.ts',
      'services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts',
    ],
    setupFiles: ['tests/setup/react-native.ts'],
    exclude: ['node_modules', 'dist', '.expo'],
  },
});
