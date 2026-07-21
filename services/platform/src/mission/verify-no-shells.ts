/**
 * holo verify:no-shells — prove per-domain pipeline shells are gone (pipes-3 AC-5).
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Platform pipeline shell dirs that must be gone after pipes-3.
 * Convex residual app surfaces are intentional (see pipes-3 scope note).
 */
export const PER_DOMAIN_SHELL_DIRS = [
  'services/platform/src/whatsnew',
  'services/platform/src/assimilate',
  'services/platform/src/shop',
  'services/platform/src/subscriptions',
] as const;

export type NoShellsResult = {
  ok: boolean;
  found: string[];
  n: number;
  message: string;
  scanned: readonly string[];
};

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function scanPerDomainShells(repoRoot: string): NoShellsResult {
  const found: string[] = [];
  for (const rel of PER_DOMAIN_SHELL_DIRS) {
    const abs = resolve(repoRoot, rel);
    if (isDirectory(abs)) {
      found.push(rel.endsWith('/') ? rel : `${rel}/`);
    }
  }

  // Surface any platform/src children matching shell names (case-insensitive).
  const platformSrc = resolve(repoRoot, 'services/platform/src');
  try {
    if (isDirectory(platformSrc)) {
      for (const name of readdirSync(platformSrc)) {
        if (/^(whatsnew|assimilate|shop|subscriptions)$/i.test(name)) {
          const rel = `services/platform/src/${name}/`;
          if (isDirectory(resolve(repoRoot, rel)) && !found.includes(rel)) {
            found.push(rel);
          }
        }
      }
    }
  } catch {
    // ignore
  }

  const n = found.length;
  return {
    ok: n === 0,
    found,
    n,
    scanned: PER_DOMAIN_SHELL_DIRS,
    message:
      n === 0 ? '0 per-domain modules found' : `found ${n} per-domain modules: ${found.join(', ')}`,
  };
}
