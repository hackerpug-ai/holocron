/**
 * Target acquisition — TypeScript port of the crawl-contract §1 gate.
 * git clone / reuse + git ls-files. Root tripwire is load-bearing.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { AssimilateError } from './errors.ts';
import type {
  AssimilateDepth,
  AssimilateExclusion,
  AssimilateFileEntry,
  AssimilateManifest,
  AssimilateShard,
} from './types.ts';
import { ASSIMILATE_DEPTHS } from './types.ts';

const LENSES = 5;
const MAX_FILES = 40;
const MAX_BYTES = 250_000;
const MIN_FILES = 6;
const SPLIT_ABOVE = 4 * MAX_FILES;

const LANG: Record<string, string> = {
  '.rs': 'rust',
  '.go': 'go',
  '.py': 'python',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.c': 'c',
  '.h': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.sh': 'shell',
  '.bash': 'shell',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
};

const BINARY_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.zip',
  '.gz',
  '.tgz',
  '.so',
  '.dylib',
  '.dll',
  '.exe',
  '.bin',
  '.wasm',
  '.class',
  '.pyc',
  '.o',
  '.a',
  '.db',
  '.sqlite',
]);

const LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'go.sum',
  'poetry.lock',
  'Gemfile.lock',
  'composer.lock',
  'Pipfile.lock',
  'bun.lockb',
  'flake.lock',
]);

export type AcquireOptions = {
  target: string;
  depth?: AssimilateDepth;
  focus?: string[];
  reuse?: string;
  allowSelf?: boolean;
  scratchRoot?: string;
  cwd?: string;
};

function scratchRoot(explicit?: string): string {
  const root = explicit ?? process.env.SCRATCH_ROOT ?? join(homedir(), '.cache', 'agent-scratch');
  mkdirSync(root, { recursive: true });
  return root;
}

function runGit(args: string[], cwd?: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function realpath(p: string): string {
  return resolve(p);
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function normalizeTarget(target: string): { kind: 'local' | 'git-url' | 'web-url'; value: string } {
  if (isDir(target)) return { kind: 'local', value: realpath(target) };
  if (target.startsWith('git@') || target.startsWith('ssh://') || target.endsWith('.git')) {
    return { kind: 'git-url', value: target };
  }
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(target)) {
    return { kind: 'git-url', value: `https://github.com/${target}` };
  }
  if (target.startsWith('http://') || target.startsWith('https://')) {
    const probe = runGit(['ls-remote', '--exit-code', target, 'HEAD']);
    if (probe.status === 0) return { kind: 'git-url', value: target };
    throw new AssimilateError(
      'ASSIMILATE_UNREACHABLE',
      `target '${target}' is not a git remote (web fetch is not in this slice)`
    );
  }
  throw new AssimilateError(
    'ASSIMILATE_UNREACHABLE',
    `cannot resolve target '${target}' — expected a URL, owner/repo, or an existing directory`
  );
}

function assertRoot(root: string, allowSelf: boolean, cwd: string): string {
  const real = realpath(root);
  const top = runGit(['rev-parse', '--show-toplevel'], real);
  if (top.status !== 0) {
    throw new AssimilateError(
      'ASSIMILATE_ROOT_TRIPWIRE',
      `'${real}' is not a git checkout — refusing to enumerate arbitrary files`
    );
  }
  const topReal = realpath(top.stdout.trim());
  if (topReal !== real) {
    throw new AssimilateError(
      'ASSIMILATE_ROOT_TRIPWIRE',
      `'${real}' is inside checkout '${topReal}', not its root — refusing partial enumeration`
    );
  }
  if (!allowSelf) {
    const here = runGit(['rev-parse', '--show-toplevel'], cwd);
    if (here.status === 0 && realpath(here.stdout.trim()) === real) {
      throw new AssimilateError(
        'ASSIMILATE_ROOT_TRIPWIRE',
        `target resolved to the CURRENT project (${real}). Pass allowSelf if that is genuinely the target.`
      );
    }
  }
  return real;
}

function acquireGit(value: string, kind: 'local' | 'git-url', options: AcquireOptions): string {
  if (kind === 'local') return value;
  if (options.reuse) {
    if (!isDir(options.reuse)) {
      throw new AssimilateError(
        'ASSIMILATE_UNREACHABLE',
        `reuse path '${options.reuse}' is not a directory`
      );
    }
    return realpath(options.reuse);
  }
  const slug = basename(value.replace(/\.git$/, '')).replace(/[^A-Za-z0-9._-]/g, '') || 'target';
  const dest = mkdtempSync(join(scratchRoot(options.scratchRoot), `assimilate-${slug}.`));
  const repo = join(dest, 'repo');
  const clone = runGit(['clone', '--depth', '1', '--filter=blob:none', '--quiet', value, repo]);
  if (clone.status !== 0) {
    const fallback = runGit(['clone', '--depth', '1', '--quiet', value, repo]);
    if (fallback.status !== 0) {
      rmSync(dest, { recursive: true, force: true });
      throw new AssimilateError(
        'ASSIMILATE_UNREACHABLE',
        `clone failed for ${value}: ${fallback.stderr || clone.stderr}`
      );
    }
  }
  return repo;
}

function classify(path: string, depth: AssimilateDepth, focus: string[]): string | null {
  const parts = path.split('/');
  const base = parts[parts.length - 1] ?? path;
  const ext = extname(base).toLowerCase();
  const dirs = parts.slice(0, -1);

  if (LOCKFILES.has(base) || ext === '.lock') return 'lockfile';
  if (BINARY_EXT.has(ext)) return 'binary';
  if (
    dirs.some((p) => ['vendor', 'third_party', 'thirdparty', 'node_modules', 'Pods'].includes(p))
  ) {
    return 'vendored';
  }
  if (base.endsWith('.min.js') || base.endsWith('.min.css') || base.endsWith('.map'))
    return 'minified';
  if (focus.length > 0 && !focus.some((f) => path === f || path.startsWith(`${f}/`))) {
    return 'out-of-focus';
  }
  if (depth === 'deep') return null;

  if (
    dirs.some((p) =>
      [
        'dist',
        'build',
        'out',
        'target',
        '.next',
        '.nuxt',
        '__pycache__',
        '.venv',
        'coverage',
      ].includes(p)
    )
  ) {
    return 'generated';
  }
  if (base.endsWith('.pb.go') || base.includes('.generated.')) return 'generated';
  if (
    dirs.some((p) => ['testdata', 'fixtures', '__snapshots__', 'golden', 'snapshots'].includes(p))
  ) {
    return 'fixture-data';
  }
  if (depth === 'normal') return null;

  if (
    dirs.some((p) =>
      [
        'test',
        'tests',
        'spec',
        'specs',
        'e2e',
        '__tests__',
        'examples',
        'example',
        'benches',
      ].includes(p)
    )
  ) {
    return 'out-of-scope-quick';
  }
  if (/(^test_|_test\.|\.test\.|\.spec\.|_spec\.)/.test(base)) return 'out-of-scope-quick';
  if (parts.length > 1 && ['docs', 'doc', 'website', 'site'].includes(parts[0] ?? '')) {
    return 'out-of-scope-quick';
  }
  return null;
}

function readMeta(root: string, rel: string): { bytes: number; lines: number } | null {
  let blob: Buffer;
  try {
    blob = readFileSync(join(root, rel));
  } catch {
    return null;
  }
  if (blob.subarray(0, 8000).includes(0)) return null;
  const newlineCount = blob.reduce((n, b) => n + (b === 0x0a ? 1 : 0), 0);
  const nlines = newlineCount + (blob.length === 0 || blob[blob.length - 1] === 0x0a ? 0 : 1);
  return { bytes: blob.length, lines: nlines };
}

function commonDepth(paths: string[]): number {
  if (paths.length < 2) return 0;
  const split = paths.map((p) => p.split('/'));
  let depth = 0;
  while (split.every((s) => (s.length ?? 0) > depth + 1 && s[depth] === split[0]?.[depth])) {
    depth += 1;
  }
  return depth;
}

function keyAt(path: string, baseDepth: number, levelsBelowBase: number): string {
  const parts = path.split('/');
  if (parts.length === 1) return '(root)';
  return parts.slice(0, Math.min(baseDepth + levelsBelowBase, parts.length - 1)).join('/');
}

function shardFiles(files: AssimilateFileEntry[]): AssimilateShard[] {
  const baseDepth = commonDepth(files.map((f) => f.path));
  const buckets = new Map<string, AssimilateFileEntry[]>();
  for (const f of files) {
    const key = keyAt(f.path, baseDepth, 2);
    const group = buckets.get(key) ?? [];
    group.push(f);
    buckets.set(key, group);
  }
  let level = 2;
  while (level < 8) {
    const oversized = [...buckets.entries()]
      .filter(([k, g]) => k !== '(root)' && g.length > SPLIT_ABOVE)
      .map(([k]) => k);
    if (oversized.length === 0) break;
    level += 1;
    for (const k of oversized) {
      const group = buckets.get(k) ?? [];
      buckets.delete(k);
      for (const f of group) {
        const nk = keyAt(f.path, baseDepth, level);
        const next = buckets.get(nk) ?? [];
        next.push(f);
        buckets.set(nk, next);
      }
    }
    const stuck = [...buckets.values()].every(
      (g) => g.length <= SPLIT_ABOVE || g.every((x) => x.path.split('/').length - 1 <= level)
    );
    if (stuck) break;
  }

  const small: AssimilateFileEntry[] = [];
  const sized: Array<[string, AssimilateFileEntry[]]> = [];
  for (const [key, group] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length < MIN_FILES) small.push(...group);
    else sized.push([key, group]);
  }
  if (small.length > 0) sized.push(['(assorted)', small]);

  const shards: AssimilateShard[] = [];
  let sid = 0;
  const flush = (key: string, chunk: AssimilateFileEntry[]) => {
    if (chunk.length === 0) return;
    sid += 1;
    const ident = `S${String(sid).padStart(2, '0')}`;
    for (const f of chunk) f.shard = ident;
    shards.push({
      id: ident,
      key,
      files: chunk.length,
      bytes: chunk.reduce((n, x) => n + x.bytes, 0),
    });
  };
  for (const [key, group] of sized) {
    group.sort((a, b) => a.path.localeCompare(b.path));
    let chunk: AssimilateFileEntry[] = [];
    let chunkBytes = 0;
    for (const f of group) {
      if (chunk.length > 0 && (chunk.length >= MAX_FILES || chunkBytes + f.bytes > MAX_BYTES)) {
        flush(key, chunk);
        chunk = [];
        chunkBytes = 0;
      }
      chunk.push(f);
      chunkBytes += f.bytes;
    }
    flush(key, chunk);
  }
  return shards;
}

export function acquireTarget(options: AcquireOptions): AssimilateManifest {
  const depth = options.depth ?? 'normal';
  if (!ASSIMILATE_DEPTHS.includes(depth)) {
    throw new AssimilateError(
      'ASSIMILATE_USAGE',
      `--depth must be quick|normal|deep (got '${depth}')`
    );
  }
  const focus = (options.focus ?? []).map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean);
  const cwd = options.cwd ?? process.cwd();
  const { kind, value } = normalizeTarget(options.target);
  const checkout = acquireGit(value, kind, options);
  const root = assertRoot(checkout, Boolean(options.allowSelf), cwd);

  const ls = runGit(['ls-files', '-z'], root);
  if (ls.status !== 0) {
    throw new AssimilateError('ASSIMILATE_UNREACHABLE', `git ls-files failed in ${root}`);
  }
  const tracked = ls.stdout.split('\0').filter(Boolean);

  const files: AssimilateFileEntry[] = [];
  const exclCounts = new Map<string, number>();
  const note = (reason: string) => exclCounts.set(reason, (exclCounts.get(reason) ?? 0) + 1);

  for (const path of tracked) {
    const reason = classify(path, depth, focus);
    if (reason) {
      note(reason);
      continue;
    }
    const meta = readMeta(root, path);
    if (!meta) {
      note('binary');
      continue;
    }
    files.push({
      path,
      bytes: meta.bytes,
      lines: meta.lines,
      lang: LANG[extname(path).toLowerCase()] ?? 'other',
      shard: '',
    });
  }

  if (files.length === 0) {
    throw new AssimilateError(
      'ASSIMILATE_EMPTY_SCOPE',
      'empty scope at this depth — widen depth or drop focus'
    );
  }

  const shards = shardFiles(files);
  files.sort((a, b) => a.path.localeCompare(b.path));

  const exclusions: AssimilateExclusion[] = [...exclCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, count]) => ({ pattern: reason, reason, count }));

  const nExcluded = [...exclCounts.values()].reduce((n, c) => n + c, 0);
  const remote = runGit(['config', '--get', 'remote.origin.url'], root).stdout.trim();
  const sha = runGit(['rev-parse', 'HEAD'], root).stdout.trim();
  const advisory =
    shards.length > 60
      ? `Large target (${shards.length} shards). Narrow with --focus or --depth quick; do not lower the coverage floor.`
      : null;

  return {
    schema: 'assimilate/manifest@1',
    target: {
      input: options.target,
      kind: 'git',
      transport: kind === 'local' || options.reuse ? 'git-reuse' : 'git-clone',
      root,
      remote,
      sha,
      acquired_at: new Date().toISOString(),
    },
    depth,
    totals: {
      tracked: tracked.length,
      in_scope: files.length,
      excluded: nExcluded,
      bytes_in_scope: files.reduce((n, f) => n + f.bytes, 0),
    },
    exclusions,
    shards,
    files,
    budget: {
      shards: shards.length,
      lenses: LENSES,
      est_worker_dispatches: shards.length + LENSES + 1,
      advisory,
    },
  };
}

export function writeManifest(manifest: AssimilateManifest, outPath: string): void {
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
