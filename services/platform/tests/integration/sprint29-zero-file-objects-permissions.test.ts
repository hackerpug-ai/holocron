/** Behavioral Zero authorization test for the Sprint 29 file_objects boundary. */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const ORACLE = resolve(process.cwd(), 'scripts/e2e/zero-file-objects-permission-oracle.ts');

describe.skipIf(!PLATFORM_IT)('Sprint 29 Zero file_objects read-only authorization', () => {
  it('reads file_objects but rejects insert, update, and delete through the live zero-cache', () => {
    expect(
      DATABASE_URL,
      'PLATFORM_IT requires an explicit holocron_nonprod DATABASE_URL; live authorization cannot skip'
    ).toContain('holocron_nonprod');
    const result = spawnSync('bun', [ORACLE], {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      timeout: 150_000,
    });
    const lines = (result.stdout ?? '').split('\n').filter((line) => line.startsWith('{'));
    const report = JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>;
    expect(result.status, `${result.stdout ?? ''}\n${result.stderr ?? ''}`).toBe(0);
    expect(report).toMatchObject({
      ok: true,
      read_allowed: true,
      insert_denied: true,
      update_denied: true,
      delete_denied: true,
      allowed_transport_control: true,
    });
  }, 160_000);
});
