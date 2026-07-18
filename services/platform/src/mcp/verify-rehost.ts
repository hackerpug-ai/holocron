import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

export function verifyMcpRehost(options?: { cwd?: string }): VerifyRehostResult {
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
  const sourceRoot = resolve(cwd, 'services/platform/src/mcp');
  const convexRefs = walk(sourceRoot).flatMap((path) => {
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
