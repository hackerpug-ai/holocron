/**
 * CAP-CUT-01 / S-REWRITE-05 — grep gate: zero convex/react client imports.
 *
 * Scans app/, components/, hooks/, screens/ (override with --roots).
 * Exit 0 iff zero hits; fail closed naming file:line on any hit.
 * Uses real `rg` — never mocked.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { resolveRepoRoot } from '../../config/secrets.ts';

export const DEFAULT_NO_CONVEX_CLIENT_ROOTS = ['app', 'components', 'hooks', 'screens'] as const;

const RG_GLOBS = [
  '!**/.git/**',
  '!**/node_modules/**',
  '!**/.spec/**',
  '!**/__tests__/**',
  '!**/*.test.ts',
  '!**/*.test.tsx',
  '!**/*.spec.ts',
  '!**/*.spec.tsx',
  '!**/tests/fixtures/**',
] as const;

/** Pattern assembled so this file does not itself match as a hit when scanned. */
function convexReactImportPattern(): string {
  const pkg = ['convex', 'react'].join('/');
  // import … from 'convex/react' | "convex/react" | require('convex/react')
  return `${pkg}`;
}

export type ConvexClientHit = {
  file: string;
  line: number;
  text: string;
};

export type VerifyNoConvexClientReport = {
  ok: boolean;
  hit_count: number;
  hits: ConvexClientHit[];
  roots: string[];
  root_count: number;
  message: string;
};

export function parseRootsFlag(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [...DEFAULT_NO_CONVEX_CLIENT_ROOTS];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Real rg against the repo. status 1 + 0 hits = clean; status 0 = hits found.
 */
export function verifyNoConvexClient(options?: {
  repoRoot?: string;
  roots?: readonly string[];
}): VerifyNoConvexClientReport {
  const repoRoot = options?.repoRoot ?? resolveRepoRoot();
  const roots = [...(options?.roots ?? DEFAULT_NO_CONVEX_CLIENT_ROOTS)];
  const pattern = convexReactImportPattern();

  const args: string[] = [
    '-n',
    '--no-heading',
    '--color',
    'never',
    '-g',
    '*.{ts,tsx,js,jsx,mjs,cjs}',
  ];
  for (const g of RG_GLOBS) {
    args.push('--glob', g);
  }
  // Restrict to import/require of convex/react (not incidental path mentions in comments if possible)
  args.push('-e', `from ['"]${pattern}['"]|require\\(['"]${pattern}['"]\\)`);
  args.push(...roots);

  const result = spawnSync('rg', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.error) {
    return {
      ok: false,
      hit_count: 0,
      hits: [],
      roots,
      root_count: roots.length,
      message: `rg failed to start: ${result.error.message}`,
    };
  }

  if (result.status === 2) {
    return {
      ok: false,
      hit_count: 0,
      hits: [],
      roots,
      root_count: roots.length,
      message: `rg error: ${result.stderr || result.stdout}`,
    };
  }

  const hits: ConvexClientHit[] = [];
  if (result.status === 0) {
    for (const raw of (result.stdout ?? '').split('\n')) {
      const line = raw.trimEnd();
      if (!line) continue;
      const m = line.match(/^([^:]+):(\d+):(.*)$/);
      if (!m) {
        hits.push({ file: line, line: 0, text: line });
        continue;
      }
      hits.push({
        file: m[1]!,
        line: Number(m[2]),
        text: m[3] ?? '',
      });
    }
  }

  const hit_count = hits.length;
  const clean = hit_count === 0 && result.status === 1;

  if (clean) {
    return {
      ok: true,
      hit_count: 0,
      hits: [],
      roots,
      root_count: roots.length,
      message: 'zero convex/react client imports (clean)',
    };
  }

  if (hit_count === 0) {
    return {
      ok: false,
      hit_count: 0,
      hits: [],
      roots,
      root_count: roots.length,
      message: `unexpected rg status ${result.status}: ${result.stderr || result.stdout}`,
    };
  }

  const noun = hit_count === 1 ? 'import' : 'imports';
  return {
    ok: false,
    hit_count,
    hits,
    roots,
    root_count: roots.length,
    message: `Found ${hit_count} convex/react client ${noun}`,
  };
}

export function formatVerifyNoConvexClientText(report: VerifyNoConvexClientReport): string {
  const lines: string[] = [];
  lines.push('holo verify:no-convex-client — CAP-CUT-01 build gate');
  lines.push(`  scanned_roots (${report.root_count}): ${report.roots.join(', ')}`);
  lines.push(`  ${report.message}`);
  if (report.hits.length > 0) {
    lines.push('');
    for (const h of report.hits) {
      if (h.line > 0) {
        lines.push(`${h.file}:${h.line}: ${h.text.trim()}`);
      } else {
        lines.push(h.file);
      }
    }
  }
  lines.push(report.ok ? '  status: OK' : '  status: FAIL');
  return lines.join('\n');
}

/** Resolve --roots paths relative to repo root when not absolute. */
export function resolveScanRoots(roots: readonly string[], repoRoot: string): string[] {
  return roots.map((r) => (r.startsWith('/') ? r : resolve(repoRoot, r)));
}
