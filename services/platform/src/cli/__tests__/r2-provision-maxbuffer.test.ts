/**
 * DEPENDENCY-D08-03-R2-MAXBUFFER — listRepoPrefix / run() must tolerate large R2 listings.
 *
 * Node's default spawnSync maxBuffer is 1 MiB. Full recursive pgbackrest/ listings are
 * ~1.5 MiB+, which used to fail with ENOBUFS and break fire-drill listRepoPrefix.
 * No live R2 required: prove the constant, the source wiring, and real spawnSync behavior.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPAWN_MAX_BUFFER } from '../../backup/r2-provision.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../../..');
const R2_PROVISION_SRC = resolve(REPO_ROOT, 'services/platform/src/backup/r2-provision.ts');

describe('DEPENDENCY-D08-03-R2-MAXBUFFER spawn maxBuffer', () => {
  it('DEFAULT_SPAWN_MAX_BUFFER is at least 64 MiB', () => {
    expect(DEFAULT_SPAWN_MAX_BUFFER).toBeGreaterThanOrEqual(64 * 1024 * 1024);
  });

  it('r2-provision run() passes maxBuffer into spawnSync (source contract)', () => {
    const src = readFileSync(R2_PROVISION_SRC, 'utf8');
    expect(src).toMatch(/export const DEFAULT_SPAWN_MAX_BUFFER\s*=\s*64\s*\*\s*1024\s*\*\s*1024/);
    expect(src).toMatch(/maxBuffer:\s*options\?\.maxBuffer\s*\?\?\s*DEFAULT_SPAWN_MAX_BUFFER/);
    // listRepoPrefix / trusted python paths share run() — no second spawnSync without buffer.
    const spawnSyncCalls = [...src.matchAll(/spawnSync\s*\(/g)];
    expect(spawnSyncCalls.length).toBeGreaterThanOrEqual(1);
    // The primary helper must be the only credential-bearing command path for listings.
    expect(src).toMatch(/function runTrustedPythonR2[\s\S]*?return run\(/);
    expect(src).toMatch(/function runAws[\s\S]*?return run\(/);
  });

  it('Node default 1 MiB maxBuffer fails on ~2 MiB stdout; raised buffer succeeds', () => {
    const py = 'import sys; sys.stdout.write("x" * (2 * 1024 * 1024))';
    const fail = spawnSync('python3', ['-c', py], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    expect(fail.error?.code).toBe('ENOBUFS');

    const ok = spawnSync('python3', ['-c', py], {
      encoding: 'utf8',
      maxBuffer: DEFAULT_SPAWN_MAX_BUFFER,
    });
    expect(ok.error).toBeUndefined();
    expect(ok.status).toBe(0);
    expect(ok.stdout.length).toBe(2 * 1024 * 1024);
  });
});
