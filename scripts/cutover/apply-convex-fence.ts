/**
 * D06-03 mechanical codemod: rewrite convex write-surface imports onto
 * fenced* builders from convex/lib/migrationFence.ts.
 *
 * Import swap only — never hand-edits handler bodies.
 *
 * Usage:
 *   bun scripts/cutover/apply-convex-fence.ts [--dry-run] [--root <path>]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const FENCED = new Set([
  'mutation',
  'internalMutation',
  'action',
  'internalAction',
  'httpAction',
] as const);

const ALIAS: Record<string, string> = {
  mutation: 'fencedMutation',
  internalMutation: 'fencedInternalMutation',
  action: 'fencedAction',
  internalAction: 'fencedInternalAction',
  httpAction: 'fencedHttpAction',
};

const SKIP_DIRS = new Set(['_generated', 'node_modules', '.git']);
const SKIP_FILES = new Set(['migrationFence.ts']);

function isSkippedPath(abs: string, convexRoot: string): boolean {
  const rel = relative(convexRoot, abs).replace(/\\/g, '/');
  if (rel.startsWith('lib/migrationFence')) return true;
  if (rel.startsWith('migrationFence/')) return true; // unfenced audit module
  if (rel.includes('/_generated/') || rel.startsWith('_generated/')) return true;
  return false;
}

function walkTs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts') && !SKIP_FILES.has(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Relative import path from `fromFile` to convex/lib/migrationFence (no .ts). */
function fenceImportPath(fromFile: string, convexRoot: string): string {
  const target = join(convexRoot, 'lib', 'migrationFence');
  let rel = relative(dirname(fromFile), target).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

/**
 * Rewrite a single source file. Returns { changed, text }.
 *
 * Handles:
 *   import { mutation, query } from '../_generated/server';
 *   import { action, internalAction, mutation, query } from './_generated/server';
 *   import { httpAction } from './_generated/server';
 *
 * Type-only imports are left alone.
 */
export function rewriteSource(
  source: string,
  fromFile: string,
  convexRoot: string
): { changed: boolean; text: string; fencedNames: string[] } {
  const fencePath = fenceImportPath(fromFile, convexRoot);
  const fencedNames: string[] = [];

  // Match value imports from *_generated/server (not type-only)
  const importRe =
    /^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]*_generated\/server)\2;?[ \t]*$/gm;

  let changed = false;
  let text = source.replace(importRe, (full, body: string, _q: string, mod: string) => {
    const parts = body.split(',').map((p) => p.trim()).filter(Boolean);
    const keep: string[] = [];
    const fence: string[] = [];

    for (const part of parts) {
      // skip `type Foo` and `type Foo as Bar`
      if (/^type\s+/.test(part)) {
        keep.push(part);
        continue;
      }
      // `name` or `name as alias`
      const m = part.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (!m) {
        keep.push(part);
        continue;
      }
      const origName = m[1]!;
      const localName = m[2] ?? origName;
      if (FENCED.has(origName as (typeof FENCED extends Set<infer T> ? T : never))) {
        const fenced = ALIAS[origName]!;
        // Preserve local alias if caller already renamed (rare)
        if (localName === origName) {
          fence.push(`${fenced} as ${origName}`);
        } else {
          fence.push(`${fenced} as ${localName}`);
        }
        fencedNames.push(origName);
      } else {
        keep.push(part);
      }
    }

    if (fence.length === 0) return full;

    changed = true;
    const lines: string[] = [];
    if (keep.length > 0) {
      lines.push(`import { ${keep.join(', ')} } from '${mod}';`);
    }
    lines.push(`import { ${fence.join(', ')} } from '${fencePath}';`);
    return lines.join('\n');
  });

  return { changed, text, fencedNames };
}

export type CodemodResult = {
  files_scanned: number;
  files_changed: number;
  files: Array<{ path: string; fencedNames: string[] }>;
  dry_run: boolean;
};

export function applyConvexFenceCodemod(options: {
  convexRoot: string;
  dryRun?: boolean;
}): CodemodResult {
  const convexRoot = resolve(options.convexRoot);
  const dryRun = options.dryRun === true;
  const files = walkTs(convexRoot).filter((f) => !isSkippedPath(f, convexRoot));
  const changedFiles: CodemodResult['files'] = [];

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const { changed, text, fencedNames } = rewriteSource(src, file, convexRoot);
    if (!changed) continue;
    changedFiles.push({
      path: relative(convexRoot, file).replace(/\\/g, '/'),
      fencedNames,
    });
    if (!dryRun) writeFileSync(file, text, 'utf8');
  }

  return {
    files_scanned: files.length,
    files_changed: changedFiles.length,
    files: changedFiles,
    dry_run: dryRun,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  let dryRun = false;
  let root = resolve(process.cwd(), 'convex');
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--root') root = resolve(argv[++i] ?? root);
    else if (a?.startsWith('--root=')) root = resolve(a.slice('--root='.length));
  }

  const result = applyConvexFenceCodemod({ convexRoot: root, dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (result.files_changed === 0) {
    console.error('codemod: no files changed (already applied or no targets)');
  }
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('apply-convex-fence.ts') ||
    process.argv[1].endsWith('apply-convex-fence.js'));

if (isMain) main();
