import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { auditNoDupValidation, toolsAsRecord } from '../tools/registry.ts';
import { defaultManifestPath, loadManifest } from './manifest-loader.ts';

type VerifyRehostResult = {
  ok: boolean;
  manifestTools: number;
  registeredTools: number;
  missingTools: string[];
  extraTools: string[];
  missingExecutors: string[];
  convexRefs: string[];
  duplicateValidationSites: string[];
  issues: string[];
};

/**
 * Relative paths under the served source root that may legitimately import Convex
 * (cutover rollback / fence tooling). Never expand this to a whole package root.
 */
export const CONVEX_RESIDUE_ALLOWLIST = [
  'cutover/convex-fence-client.ts',
  'cutover/convex-live-attestation.ts',
  'cutover/data-plane-content.ts',
  'cutover/ponr.ts',
] as const;

const ALLOWLIST_SET: ReadonlySet<string> = new Set(CONVEX_RESIDUE_ALLOWLIST);

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(path);
  }
  return out;
}

function isAllowlistedResidue(sourceRoot: string, absolutePath: string): boolean {
  const rel = relative(sourceRoot, absolutePath).replace(/\\/g, '/');
  return ALLOWLIST_SET.has(rel);
}

export function verifyMcpRehost(options?: {
  cwd?: string;
  /** Override scan root (defaults to services/platform/src under cwd). */
  sourceRoot?: string;
}): VerifyRehostResult {
  const cwd = options?.cwd ?? process.cwd();
  const manifest = loadManifest(defaultManifestPath(cwd));
  const manifestIds = new Set(manifest.tools.map((tool) => tool.id));
  const registeredIds = new Set(Object.keys(toolsAsRecord()));
  const missingTools = [...manifestIds].filter((id) => !registeredIds.has(id)).sort();
  const extraTools = [...registeredIds].filter((id) => !manifestIds.has(id)).sort();
  const executorPath = resolve(cwd, 'services/platform/src/mcp/executor.ts');
  const executorText = readFileSync(executorPath, 'utf8');
  const executorIds = new Set(
    [...executorText.matchAll(/case ['"]([^'"]+)['"]/g)].map((match) => match[1])
  );
  const missingExecutors = [...manifestIds].filter((id) => !executorIds.has(id)).sort();
  // Widened past src/mcp so Convex imports anywhere under the served source are visible.
  const sourceRoot = options?.sourceRoot ?? resolve(cwd, 'services/platform/src');
  const convexRefs = walk(sourceRoot).flatMap((path) => {
    if (isAllowlistedResidue(sourceRoot, path)) return [];
    const text = readFileSync(path, 'utf8');
    return /convex\/(browser|server)|from ['"]convex['"]/.test(text) ? [path] : [];
  });
  const duplicateValidationSites = auditNoDupValidation().sites;
  const issues = [
    ...(missingTools.length ? [`missing manifest tools: ${missingTools.join(', ')}`] : []),
    ...(missingExecutors.length
      ? [`missing Postgres executors: ${missingExecutors.join(', ')}`]
      : []),
    ...(duplicateValidationSites.length
      ? [`duplicate validation sites: ${duplicateValidationSites.join(', ')}`]
      : []),
    ...(extraTools.length ? [`unmanifested registered tools: ${extraTools.join(', ')}`] : []),
    ...(convexRefs.length ? [`Convex imports remain: ${convexRefs.join(', ')}`] : []),
    ...(manifest.header.stateless !== true ? ['manifest must declare stateless transport'] : []),
    ...(manifest.header.no_server_sampling !== true
      ? ['manifest must disable server sampling']
      : []),
  ];
  return {
    ok: issues.length === 0,
    manifestTools: manifestIds.size,
    registeredTools: registeredIds.size,
    missingTools,
    extraTools,
    missingExecutors,
    convexRefs,
    duplicateValidationSites,
    issues,
  };
}
