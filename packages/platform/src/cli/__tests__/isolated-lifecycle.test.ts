/**
 * Drives the shipped hermetic lifecycle helpers (not a re-implementation).
 * PLATFORM_IT=1 + holocron_nonprod DATABASE_URL required for live seed proof.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializePhases } from '../../cutover/integration-phases.ts';
import {
  createIsolatedLifecycle,
  seedReferenceAgentState,
} from '../../cutover/isolated-lifecycle.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../../');
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DB = process.env.DATABASE_URL ?? '';
const HAS_NONPROD = DB.includes('holocron_nonprod');

describe('isolated lifecycle (shipped helpers)', () => {
  it('materializePhases assigns residual files not claimed by specialist phases', () => {
    const phases = materializePhases(REPO_ROOT);
    expect(phases.length).toBeGreaterThanOrEqual(5);
    const residual = phases.find((p) => p.name === 'residual-full');
    expect(residual).toBeTruthy();
    expect(
      (residual?.includes.length ?? 0) +
        phases.filter((p) => p.name !== 'residual-full').reduce((n, p) => n + p.includes.length, 0)
    ).toBeGreaterThan(50);
    // Specialist zero phase must include the namespace-reset suite.
    const zero = phases.find((p) => p.name === 'zero');
    expect(zero?.includes.some((f) => f.includes('nonprod-namespace-zero-sync'))).toBe(true);
  });

  it('root .dockerignore ends with explicit secret deny rules after whitelist', () => {
    const ignore = readFileSync(resolve(REPO_ROOT, '.dockerignore'), 'utf8');
    const lastBang = ignore.lastIndexOf('\n!');
    const denyBlock = ignore.slice(lastBang === -1 ? 0 : lastBang);
    // Deny rules must appear after the final whitelist bang.
    const secretsIdx = ignore.indexOf('packages/platform/config/secrets.yaml');
    const envIdx = ignore.indexOf('**/.env');
    const lastWhitelist = ignore.lastIndexOf('!');
    expect(secretsIdx).toBeGreaterThan(lastWhitelist);
    expect(envIdx).toBeGreaterThan(lastWhitelist);
    expect(ignore).toContain('**/.env.*');
    expect(ignore).toContain('**/*.pem');
    expect(ignore).toContain('**/*.key');
    expect(denyBlock.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!PLATFORM_IT || !HAS_NONPROD)(
  'isolated lifecycle live seed + teardown (real Postgres)',
  () => {
    it('seedReferenceAgentState inserts a completed run/agent pair the capstone can bind', () => {
      const seed = seedReferenceAgentState({
        databaseUrl: DB,
        message: `lifecycle-unit-${Date.now()}`,
      });
      expect(seed.runId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(seed.agentMessageId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(seed.requestId).toContain(seed.message);
    });

    it('createIsolatedLifecycle waitReady + seed + stopAll + verifyTeardown on bound cluster', () => {
      const handle = createIsolatedLifecycle({
        repoRoot: REPO_ROOT,
        baseEnv: {
          ...process.env,
          HOLO_GO_NO_GO_DATABASE_URL: DB,
          HOLO_GO_NO_GO_DATABASE_URL_OWNER: process.env.DATABASE_URL_OWNER ?? DB,
          HOLO_GO_NO_GO_PGBACKREST_PG1_PATH:
            process.env.HOLO_GO_NO_GO_PGBACKREST_PG1_PATH ??
            process.env.PGBACKREST_PG1_PATH ??
            '/tmp',
          HOLO_GO_NO_GO_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL ?? 'http://127.0.0.1:3210',
          HOLO_GO_NO_GO_CONVEX_SITE_URL:
            process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? 'http://127.0.0.1:3211',
          HOLO_GO_NO_GO_CONVEX_DEPLOYMENT: 'local:lifecycle-unit',
          HOLO_GO_NO_GO_FLEET_URL: process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1',
          HOLO_GO_NO_GO_AUTOSTART: '0',
        },
        autostart: false,
      });
      try {
        const ready = handle.waitReady(30_000);
        expect(ready.postgres).toBe(true);
        handle.ensurePublication();
        const seed = handle.seedReferenceState({ message: `lifecycle-handle-${Date.now()}` });
        expect(seed.conversationId).toBeTruthy();
        expect(existsSync(handle.evidenceDir)).toBe(true);
      } finally {
        handle.stopAll();
        const teardown = handle.verifyTeardown();
        // Bound (non-started) postgres is allowed to remain; orphans list must not
        // include children we started (we started none).
        expect(teardown.orphans.every((o) => !o.startsWith('zero-cache:'))).toBe(true);
      }
    }, 60_000);
  }
);
