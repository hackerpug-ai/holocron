/**
 * DEPENDENCY-S24-E2E-SUBSTRATE AC-2 — zero_cache boot path is enabled (honest probe).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/src/cli/__tests__/zero-cache-boot.test.ts
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSecretValue } from '../../config/secrets.ts';
import { createSql } from '../../db/client.ts';
import { zeroCacheBootEnabled } from '../../stack/supervisor.ts';
import { REPO_ROOT, runHolo } from './fixtures/harness';

describe('AC-2: zero_cache boot path (supervisor + plist)', () => {
  it('plist template is no longer a /usr/bin/true placeholder-only unit', () => {
    const plist = resolve(REPO_ROOT, 'packages/platform/deploy/launchd/holocron-zerocache.plist');
    expect(existsSync(plist), 'zerocache plist template must exist').toBe(true);
    const body = readFileSync(plist, 'utf8');
    // Real boot path: wrapper script or zero-cache binary — not only /usr/bin/true
    expect(body).toMatch(/run-zero-cache|zero-cache/);
    expect(body).not.toMatch(/HONESTLY DISABLED \(not fake-healthy\)[\s\S]*\/usr\/bin\/true/);
  });

  it('supervisor no longer hard-disables zero_cache on every stack up', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'packages/platform/src/stack/supervisor.ts'),
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

  it('enables unattended boot when the canonical secrets file contains the admin password', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'holocron-zero-secrets-'));
    const path = resolve(dir, 'secrets.yaml');
    try {
      writeFileSync(path, 'ZERO_ADMIN_PASSWORD: real-file-backed-presence\n', {
        mode: 0o600,
      });

      expect(
        zeroCacheBootEnabled({
          HOLO_ENABLE_ZERO_CACHE: '1',
          HOLO_SECRETS_PATH: path,
        })
      ).toBe(true);
      expect(
        zeroCacheBootEnabled({
          HOLO_SECRETS_PATH: path,
        })
      ).toBe(true);
      expect(
        zeroCacheBootEnabled({
          HOLO_ENABLE_ZERO_CACHE: '0',
          HOLO_SECRETS_PATH: path,
        })
      ).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps database credentials out of active application LaunchAgent templates', () => {
    for (const name of [
      'holocron-mastra.plist',
      'holocron-scheduler.plist',
      'holocron-zerocache.plist',
    ]) {
      const path = resolve(REPO_ROOT, 'packages/platform/deploy/launchd', name);
      const body = readFileSync(path, 'utf8');
      expect(body, `${name} must resolve the canonical secret store at runtime`).toContain(
        'HOLO_SECRETS_PATH'
      );
      expect(body, `${name} must not materialize DATABASE_URL`).not.toMatch(
        /<key>(?:DATABASE_URL|ZERO_UPSTREAM_DB)<\/key>/
      );
    }

    const installer = readFileSync(resolve(REPO_ROOT, 'scripts/install-launchd.sh'), 'utf8');
    expect(installer).not.toMatch(/echo\s+["']?DATABASE_URL=\$\{?DATABASE_URL/);
  });

  it('stack up starts configured Zero and status reports its real state', async () => {
    const up = runHolo(['stack', 'up']);
    expect(up.status, up.combined).toBe(0);

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
    if (zeroCacheBootEnabled()) {
      expect(r.combined.toLowerCase()).toMatch(/zero[_-]?cache[^\n]*healthy/);

      const databaseUrl = getSecretValue('DATABASE_URL');
      expect(databaseUrl, 'live Zero worker-budget proof requires DATABASE_URL').toBeTruthy();
      const sql = createSql(databaseUrl);
      try {
        const rows = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND application_name LIKE 'zero-sync-worker-%'
        `;
        expect(
          rows[0]?.count ?? 0,
          'four Zero workers with two-connection upstream/CVR pools must use at most 16 DB sessions'
        ).toBeLessThanOrEqual(16);
      } finally {
        await sql.end({ timeout: 0 });
      }
    }
  }, 90_000);
});
