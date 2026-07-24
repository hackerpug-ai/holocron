/**
 * DEPENDENCY-S24-E2E-SUBSTRATE AC-2 — zero_cache boot path is enabled (honest probe).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/zero-cache-boot.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT, REPO_ROOT, runHolo } from './fixtures/harness';

const itLive = PLATFORM_IT ? it : it.skip;

describe('AC-2: zero_cache boot path (supervisor + plist)', () => {
  it('plist template is no longer a /usr/bin/true placeholder-only unit', () => {
    const plist = resolve(REPO_ROOT, 'services/platform/deploy/launchd/holocron-zerocache.plist');
    expect(existsSync(plist), 'zerocache plist template must exist').toBe(true);
    const body = readFileSync(plist, 'utf8');
    // Real boot path: wrapper script or zero-cache binary — not only /usr/bin/true
    expect(body).toMatch(/run-zero-cache|zero-cache/);
    expect(body).not.toMatch(/HONESTLY DISABLED \(not fake-healthy\)[\s\S]*\/usr\/bin\/true/);
  });

  it('supervisor no longer hard-disables zero_cache on every stack up', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'services/platform/src/stack/supervisor.ts'),
      'utf8'
    );
    // Old Sprint-20 deferral lines must be gone
    expect(src).not.toMatch(/Never bootstrap zerocache \(Sprint 20\)/);
    expect(src).not.toMatch(/zero_cache: disabled \(Sprint 20\)/);
    // Boot path present
    expect(src).toMatch(/zero_cache|zerocache|ZERO_CACHE|HOLO_ENABLE_ZERO_CACHE/);
  });

  it('enable runbook exists with exact operator commands', () => {
    const doc = resolve(REPO_ROOT, 'docs/ops/zero-cache-enable.md');
    expect(existsSync(doc), 'docs/ops/zero-cache-enable.md must exist').toBe(true);
    const body = readFileSync(doc, 'utf8');
    expect(body).toMatch(/HOLO_ENABLE_ZERO_CACHE|ZERO_ADMIN_PASSWORD|zero-cache/);
    expect(body).toMatch(/holo stack (up|status)/);
  });

  itLive('stack status reports zero_cache with a real state token', () => {
    const r = runHolo(['stack', 'status']);
    expect(r.status, r.combined).toBe(0);
    expect(r.combined.toLowerCase()).toMatch(
      /zero[_-]?cache[^\n]*(healthy|disabled|not_implemented|pending|unhealthy)/
    );
    // If healthy, /keepalive must answer (probe is real)
    if (/zero[_-]?cache[^\n]*healthy/i.test(r.combined)) {
      const curl = runHolo(['stack', 'status', '--json']);
      expect(curl.status).toBe(0);
      const body = curl.stdout.includes('{')
        ? curl.stdout.slice(curl.stdout.indexOf('{'))
        : curl.stdout;
      const parsed = JSON.parse(body) as { zero_cache?: string };
      expect(parsed.zero_cache).toBe('healthy');
    }
  });
});
