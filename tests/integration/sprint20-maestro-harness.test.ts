import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const harness = 'scripts/e2e/run-maestro-reference-flow.sh';

describe('Sprint 20 Maestro harness', () => {
  it('fails closed when the named simulator contract is absent', () => {
    const result = spawnSync(harness, ['--check'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MAESTRO_DEVICE: '',
        DATABASE_URL: 'postgres://127.0.0.1:5432/holocron_nonprod',
        FLEET_URL: 'http://127.0.0.1:4545',
        PLATFORM_URL: 'http://127.0.0.1:4111',
      },
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('MAESTRO_DEVICE');
  });
});
