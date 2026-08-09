import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DOCKER_CANDIDATES = [
  '/usr/local/bin/docker',
  '/opt/homebrew/bin/docker',
  '/usr/bin/docker',
] as const;

const sleepSync = (milliseconds: number): void => {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
};

const assertDockerResourceName = (name: string): void => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)) {
    throw new Error(`Refusing unsafe Docker resource name: ${name}`);
  }
};

export const dockerBin = (): string =>
  DOCKER_CANDIDATES.find((candidate) => existsSync(candidate)) ?? 'docker';

export const cleanupDockerVolumes = (names: string[]): void => {
  if (names.length === 0) return;
  names.forEach(assertDockerResourceName);
  spawnSync(dockerBin(), ['volume', 'rm', '-f', ...names], {
    encoding: 'utf8',
    timeout: 30_000,
  });
};

/**
 * Remove only the exact disposable namespace created by the restore harness.
 * Production and unrelated resources cannot match because callers must supply
 * the fully resolved, allowlisted host name.
 */
export const cleanupDisposableDockerHost = (repoRoot: string, host: string): void => {
  assertDockerResourceName(host);
  const retryHost = `${host}-retry`;
  assertDockerResourceName(retryHost);
  const docker = dockerBin();

  spawnSync(docker, ['rm', '-f', host, retryHost], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  cleanupDockerVolumes([
    `${host}-pgdata`,
    `${host}-blobs`,
    `${retryHost}-pgdata`,
    `${retryHost}-blobs`,
  ]);
  spawnSync(docker, ['network', 'rm', `${host}-net`, `${retryHost}-net`], {
    encoding: 'utf8',
    timeout: 30_000,
  });

  for (const staging of [
    resolve(repoRoot, `.tmp/fresh-restore/${host}`),
    resolve(repoRoot, `.tmp/fresh-restore/${retryHost}`),
  ]) {
    rmSync(staging, { recursive: true, force: true });
  }

  const fireDrillLock = resolve(repoRoot, '.tmp/fire-drill-host.lockdir');
  if (existsSync(resolve(fireDrillLock, 'pid'))) {
    try {
      const ownerPid = Number(readFileSync(resolve(fireDrillLock, 'pid'), 'utf8').trim());
      process.kill(ownerPid, 0);
    } catch {
      rmSync(fireDrillLock, { recursive: true, force: true });
    }
  }
};

export type DisposableDockerLock = {
  release: () => void;
};

/**
 * Cross-process lock for storage-heavy live restore tests. A concurrent run
 * fails quickly instead of multiplying Docker containers and volumes.
 */
export const acquireDisposableDockerLock = (
  lockPath: string,
  timeoutMs = 5_000
): DisposableDockerLock => {
  mkdirSync(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      mkdirSync(lockPath);
      writeFileSync(resolve(lockPath, 'pid'), `${process.pid}\n`, {
        mode: 0o600,
      });
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;

      let ownerPid = 0;
      try {
        ownerPid = Number(readFileSync(resolve(lockPath, 'pid'), 'utf8').trim());
      } catch {
        ownerPid = 0;
      }

      if (ownerPid <= 0 && Date.now() < deadline) {
        sleepSync(250);
        continue;
      }

      let ownerAlive = false;
      if (ownerPid > 0) {
        try {
          process.kill(ownerPid, 0);
          ownerAlive = true;
        } catch {
          ownerAlive = false;
        }
      }

      if (!ownerAlive) {
        rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Disposable Docker lock is held by pid ${ownerPid}: ${lockPath}`);
      }
      sleepSync(250);
    }
  }

  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      try {
        const ownerPid = Number(readFileSync(resolve(lockPath, 'pid'), 'utf8').trim());
        if (ownerPid === process.pid) {
          rmSync(lockPath, { recursive: true, force: true });
        }
      } catch {
        // Best-effort cleanup; stale locks are reclaimed by the next caller.
      }
    },
  };
};
