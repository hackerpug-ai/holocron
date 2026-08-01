import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const TARGET_TEST = resolve(
  REPO_ROOT,
  'services/platform/tests/integration/sprint28-s28r3-qa31-ambient-prefix-execution.test.ts'
);
const TRUSTED_BUN_PATH = '/usr/local/bin/bun';

describe('GATE-FIX-S28R3-QA33 configured-positive failure semantics', () => {
  it('returns nonzero when configured credentials cannot discover a trusted PITR window', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'holo-qa33-configured-positive-'));
    const secrets = resolve(root, 'secrets.yaml');
    writeFileSync(
      secrets,
      [
        'R2_RESTORE_ACCESS_KEY_ID: qa33-access-sentinel',
        'R2_RESTORE_SECRET_ACCESS_KEY: qa33-secret-sentinel',
        '',
      ].join('\n'),
      { mode: 0o600 }
    );

    const env = { ...process.env, HOLO_QA31_SECRETS_PATH: secrets };
    for (const key of Object.keys(env)) {
      if (
        key.startsWith('R2_') ||
        key.startsWith('PGBACKREST_') ||
        key.startsWith('RESTIC_') ||
        key.startsWith('HOLO_SECRETS') ||
        key.startsWith('HOLOCRON_SECRETS')
      ) {
        delete env[key];
      }
    }

    try {
      const result = spawnSync(TRUSTED_BUN_PATH, ['x', 'vitest', 'run', TARGET_TEST], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env,
        timeout: 180_000,
      });
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      expect(result.status, output).not.toBe(0);
      expect(output).toMatch(
        /DEPENDENCY-S28R3-QA32-BUN-TRUST|DEPENDENCY-S28R3-QA33-PITR-WINDOW/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 240_000);
});
