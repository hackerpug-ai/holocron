/**
 * holo verify:no-shells — prove per-domain pipeline shells are gone (pipes-3 AC-5 / NEVER).
 *
 * Scans:
 * 1. Platform pipeline shell directories (must be absent).
 * 2. Convex residual agentic pipeline modules — must be absent OR contain the
 *    honest deprecation marker `MIGRATED_TO_MISSION_ENGINE` (thin stubs only).
 *
 * Do NOT scope the scanner to ignore NEVER surfaces (residual Convex pipelines).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Platform pipeline shell dirs that must be gone after pipes-3.
 */
export const PER_DOMAIN_SHELL_DIRS = [
  'packages/platform/src/whatsnew',
  'packages/platform/src/assimilate',
  'packages/platform/src/shop',
  'packages/platform/src/subscriptions',
] as const;

/**
 * Convex agentic pipeline modules that must not still run full pipelines.
 * Allowed residual forms: missing file OR file body contains MIGRATED_TO_MISSION_ENGINE.
 */
export const CONVEX_AGENTIC_PIPELINE_FILES = [
  // Entry-point pipeline runners (must be migrated stubs). Pure helpers such as
  // whatsNew/llm.ts and shop/output.ts are intentionally excluded — they are not
  // agentic pipeline shells.
  'convex/whatsNew/actions.ts',
  'convex/whatsNew/workflow.ts',
  'convex/whatsNew/processing.ts',
  'convex/assimilate/scheduled.ts',
  'convex/shop/dispatcher.ts',
  'convex/shop/search.ts',
  'convex/shop/index.ts',
  'convex/subscriptions/actions.ts',
  'convex/subscriptions/internal.ts',
  'convex/subscriptions/ai_scoring.ts',
  'convex/subscriptions/deduplication.ts',
] as const;

/** Marker required in residual Convex agentic files that remain as deprecation stubs. */
export const MIGRATED_TO_MISSION_ENGINE = 'MIGRATED_TO_MISSION_ENGINE' as const;

export type NoShellsResult = {
  ok: boolean;
  found: string[];
  n: number;
  message: string;
  scanned: readonly string[];
  convexResidual: string[];
  platformShells: string[];
};

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function fileContainsMarker(absPath: string, marker: string): boolean {
  try {
    const body = readFileSync(absPath, 'utf8');
    return body.includes(marker);
  } catch {
    return false;
  }
}

export function scanPerDomainShells(repoRoot: string): NoShellsResult {
  const platformShells: string[] = [];
  for (const rel of PER_DOMAIN_SHELL_DIRS) {
    const abs = resolve(repoRoot, rel);
    if (isDirectory(abs)) {
      platformShells.push(rel.endsWith('/') ? rel : `${rel}/`);
    }
  }

  // Surface any platform/src children matching shell names (case-insensitive).
  const platformSrc = resolve(repoRoot, 'packages/platform/src');
  try {
    if (isDirectory(platformSrc)) {
      for (const name of readdirSync(platformSrc)) {
        if (/^(whatsnew|assimilate|shop|subscriptions)$/i.test(name)) {
          const rel = `packages/platform/src/${name}/`;
          if (isDirectory(resolve(repoRoot, rel)) && !platformShells.includes(rel)) {
            platformShells.push(rel);
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // Convex residual agentic pipelines: must be migrated stubs or deleted.
  const convexResidual: string[] = [];
  for (const rel of CONVEX_AGENTIC_PIPELINE_FILES) {
    const abs = resolve(repoRoot, rel);
    if (!isFile(abs)) continue;
    if (!fileContainsMarker(abs, MIGRATED_TO_MISSION_ENGINE)) {
      convexResidual.push(rel);
    }
  }

  const found = [...platformShells, ...convexResidual];
  const n = found.length;
  const parts: string[] = [];
  if (platformShells.length === 0 && convexResidual.length === 0) {
    parts.push('0 per-domain modules found');
  } else {
    if (platformShells.length > 0) {
      parts.push(`platform shells: ${platformShells.join(', ')}`);
    }
    if (convexResidual.length > 0) {
      parts.push(
        `convex residual agentic (missing ${MIGRATED_TO_MISSION_ENGINE}): ${convexResidual.join(', ')}`
      );
    }
  }

  return {
    ok: n === 0,
    found,
    n,
    platformShells,
    convexResidual,
    scanned: [...PER_DOMAIN_SHELL_DIRS, ...CONVEX_AGENTIC_PIPELINE_FILES],
    message:
      n === 0 ? '0 per-domain modules found' : `found ${n} per-domain modules: ${parts.join('; ')}`,
  };
}
