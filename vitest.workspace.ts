/**
 * Vitest workspace — 3 first-class lane projects (F3 widening, imp-widen-integration-ci).
 *
 * Vitest 4.1.0 model: `test.projects` in vitest.config.ts references this array.
 * (`test.workspace` + auto-detected `vitest.workspace.ts` were REMOVED in vitest 4 —
 *  see https://vitest.dev/guide/projects.) Each project uses `extends: true` to
 *  inherit the root config's plugins / resolve.alias / globals / setupFiles, then
 *  overrides only include + exclude + name.
 *
 * Lanes:
 *   unit         — no infra. ~100 files / ~978 tests. Runs anywhere.
 *   integration  — PLATFORM_IT-gated. ~159 vitest files (122 tests/integration +
 *                  37 services/platform/tests/integration, 8 bun:test excluded).
 *   live         — real Postgres + PLATFORM_IT. seed:e2e + zero-cache-boot.
 *
 * CI wiring (ci-integration.yml, AC-4 unchanged at the step level):
 *   pnpm test:integration  →  vitest run --project integration
 *        (CI sets PLATFORM_IT=1 + DATABASE_URL + FLEET_URL; full ~159-file collection)
 */
import type { TestProjectConfiguration } from 'vitest/config';

/**
 * Bun:test files in services/platform/tests/integration — different test runner,
 * uncollectable by vitest (errors on import). Excluded from the integration lane;
 * a future `bun test` lane will own them (tracked as a follow-up).
 */
const BUN_TEST_FILES = [
  'services/platform/tests/integration/db-migrate.test.ts',
  'services/platform/tests/integration/jsonb-roundtrip.test.ts',
  'services/platform/tests/integration/merges-collapsed.test.ts',
  'services/platform/tests/integration/nonprod-namespace.test.ts',
  'services/platform/tests/integration/prd-consistency.test.ts',
  'services/platform/tests/integration/replication-ready.test.ts',
  'services/platform/tests/integration/runner-status.test.ts',
  'services/platform/tests/integration/status-check.test.ts',
];

const STANDARD_EXCLUDES = ['node_modules', 'dist', '.expo', '**/node_modules/**', '**/.git/**'];

export const projects: TestProjectConfiguration[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // UNIT LANE — no infra dependencies. Runs in local dev + CI default + pre-commit.
  // AC-3: no --exclude hack needed; the include simply omits integration roots.
  // ─────────────────────────────────────────────────────────────────────────
  {
    extends: true,
    test: {
      name: 'unit',
      include: [
        'tests/**/*.{test,spec}.{js,ts,tsx}',
        'convex/**/*.{test,spec}.{js,ts,tsx}',
        'hooks/**/*.{test,spec}.{js,ts}',
        'components/**/*.{test,spec}.{js,ts,tsx}',
        // Sprint 06 — stack supervisor / secrets / launchd (D01-01+)
        'services/platform/src/cli/__tests__/**/*.{test,spec}.ts',
        // Sprint 24 — verify:no-convex-client gate
        'services/platform/src/cli/commands/__tests__/**/*.{test,spec}.ts',
        // Sprint 22 pipes-1 — pure-TS evidence-gate
        'services/platform/src/research/evidence-gate.test.ts',
        // Sprint 25 / F1 — chat pre-flight gate truth table (pure predicate, no infra)
        'services/platform/src/http/chat-stream-gate.test.ts',
      ],
      exclude: [
        // integration lane owns these
        'tests/integration/**',
        'services/platform/tests/integration/**',
        // live lane owns these (real Postgres + PLATFORM_IT)
        'services/platform/src/cli/__tests__/seed-e2e.test.ts',
        'services/platform/src/cli/__tests__/zero-cache-boot.test.ts',
        ...STANDARD_EXCLUDES,
      ],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // INTEGRATION LANE — PLATFORM_IT-gated. CI runs with full infra.
  //
  // ENV CONTRACT (AC-5):
  //   PLATFORM_IT=1 + DATABASE_URL (holocron_nonprod) + FLEET_URL  → full execution.
  //   ~60 files self-skip via `it.skip` when PLATFORM_IT unset (local collect-and-skip).
  //   Fail-closed files (fail-closed-harness, fail-closed-lane) THROW in beforeAll
  //   when PLATFORM_IT is unset — refusing silent skip-to-green.
  //   ~100 non-self-skip files execute against real Postgres/fleet when PLATFORM_IT=1.
  //
  // ci-integration.yml sets all three env vars before `pnpm test:integration`.
  // ─────────────────────────────────────────────────────────────────────────
  {
    extends: true,
    test: {
      name: 'integration',
      // Real provider/process boundaries routinely exceed Vitest's 5s unit-test default.
      // Individual subprocesses retain their own fail-closed timeout caps.
      testTimeout: 180_000,
      include: [
        'tests/integration/**/*.{test,spec}.{js,ts,tsx}',
        'services/platform/tests/integration/**/*.{test,spec}.{js,ts,tsx}',
      ],
      exclude: [...BUN_TEST_FILES, ...STANDARD_EXCLUDES],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE LANE — real Postgres + PLATFORM_IT (CLI subprocess + DB row assertions).
  //
  // ENV CONTRACT (AC-5):
  //   PLATFORM_IT=1 + DATABASE_URL (holocron_nonprod) required.
  //   Files self-skip via `itLive = PLATFORM_IT ? it : it.skip` without infra.
  //   CI (ci-integration.yml Sprint-24 seed:e2e step) runs this lane with PLATFORM_IT=1.
  // ─────────────────────────────────────────────────────────────────────────
  {
    extends: true,
    test: {
      name: 'live',
      include: [
        'services/platform/src/cli/__tests__/seed-e2e.test.ts',
        'services/platform/src/cli/__tests__/zero-cache-boot.test.ts',
      ],
      exclude: STANDARD_EXCLUDES,
    },
  },
];
