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
  /** Dispatch cases whose body is only `throw new Error(...)` — no real executor. */
  throwOnlyCases: string[];
  convexRefs: string[];
  duplicateValidationSites: string[];
  issues: string[];
  violation_class?: 'THROW_ONLY_CASE' | 'REHOST_FAIL';
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

/**
 * Detect switch cases whose body is only `throw new Error(...)` (optional break).
 * A throw-only case is not a real executor — S31-08 negative control.
 */
export function findThrowOnlyCases(executorText: string): string[] {
  const throwOnly: string[] = [];
  const caseRe = /case\s+['"]([^'"]+)['"]\s*:\s*\{/g;
  let match: RegExpExecArray | null = caseRe.exec(executorText);
  while (match) {
    const id = match[1];
    const bodyStart = match.index + match[0].length;
    const rest = executorText.slice(bodyStart);
    const nextBoundary = rest.search(/\n\s*case\s+['"]|\n\s*default\s*:/);
    const rawBody = nextBoundary >= 0 ? rest.slice(0, nextBoundary) : rest;
    // Strip block/line comments and collapse whitespace for a body-shape check.
    const stripped = rawBody
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      // drop trailing close-brace of the case block if present in slice
      .replace(/\}\s*$/u, '')
      .trim();

    // Remove pure throw + break scaffolding; anything left means real work.
    const withoutThrowScaffold = stripped
      .replace(/throw\s+new\s+Error\s*\((?:[^)(]|\([^)(]*\))*\)\s*;?/g, '')
      .replace(/\bbreak\s*;?/g, '')
      .trim();

    const hasThrow = /\bthrow\s+new\s+Error\s*\(/.test(stripped);
    const hasRealWork =
      /\bawait\b/.test(stripped) ||
      /\bsql\s*[`.(]/.test(stripped) ||
      /\bfetch\s*\(/.test(stripped) ||
      /\breturn\s+\{/.test(stripped) ||
      /\breturn\s+[^;]+;/.test(
        stripped.replace(/throw\s+new\s+Error\s*\((?:[^)(]|\([^)(]*\))*\)\s*;?/g, '')
      );

    if (hasThrow && withoutThrowScaffold === '' && !hasRealWork) {
      throwOnly.push(id);
    }
    match = caseRe.exec(executorText);
  }
  return [...new Set(throwOnly)].sort();
}

export function verifyMcpRehost(options?: {
  cwd?: string;
  /** Override scan root (defaults to packages/platform/src under cwd). */
  sourceRoot?: string;
  /** Override executor.ts path (negative-control throw-only seeds). */
  executorPath?: string;
  /** Override MCP manifest path. */
  manifestPath?: string;
}): VerifyRehostResult {
  const cwd = options?.cwd ?? process.cwd();
  const manifest = loadManifest(options?.manifestPath ?? defaultManifestPath(cwd));
  const manifestIds = new Set(manifest.tools.map((tool) => tool.id));
  const registeredIds = new Set(Object.keys(toolsAsRecord()));
  const missingTools = [...manifestIds].filter((id) => !registeredIds.has(id)).sort();
  const extraTools = [...registeredIds].filter((id) => !manifestIds.has(id)).sort();
  const executorPath =
    options?.executorPath ?? resolve(cwd, 'packages/platform/src/mcp/executor.ts');
  const executorText = readFileSync(executorPath, 'utf8');
  const executorIds = new Set(
    [...executorText.matchAll(/case ['"]([^'"]+)['"]/g)].map((match) => match[1])
  );
  const missingExecutors = [...manifestIds].filter((id) => !executorIds.has(id)).sort();
  // S31-08: a case that only throws is not a real Postgres executor.
  const throwOnlyCases = findThrowOnlyCases(executorText);
  // Widened past src/mcp so Convex imports anywhere under the served source are visible.
  const sourceRoot = options?.sourceRoot ?? resolve(cwd, 'packages/platform/src');
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
    ...(throwOnlyCases.length
      ? [`THROW_ONLY_CASE: throw-only executor cases: ${throwOnlyCases.join(', ')}`]
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
  const ok = issues.length === 0;
  return {
    ok,
    manifestTools: manifestIds.size,
    registeredTools: registeredIds.size,
    missingTools,
    extraTools,
    missingExecutors,
    throwOnlyCases,
    convexRefs,
    duplicateValidationSites,
    issues,
    violation_class: !ok
      ? throwOnlyCases.length > 0
        ? 'THROW_ONLY_CASE'
        : 'REHOST_FAIL'
      : undefined,
  };
}
