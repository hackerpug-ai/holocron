import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireTarget } from './acquire.ts';
import { AssimilateError } from './errors.ts';

function git(args: string[], cwd: string): void {
  // Isolate fixture git ops from a parent pre-commit hook env (GIT_DIR /
  // GIT_INDEX_FILE / GIT_WORK_TREE leak in and would redirect the subprocess
  // at the parent repo instead of this scratch fixture).
  const env = { ...process.env };
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_COMMON_DIR',
    'GIT_PREFIX',
  ]) {
    delete env[key];
  }
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || args.join(' '));
}

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'acq-fix-'));
  mkdirSync(join(root, 'src', 'render'), { recursive: true });
  mkdirSync(join(root, 'src', 'input'), { recursive: true });
  mkdirSync(join(root, 'vendor'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(
    join(root, 'src', 'render', 'frame.rs'),
    'use crate::theme::Palette;\nfn draw() {}\n'
  );
  writeFileSync(join(root, 'src', 'render', 'color.rs'), 'pub const RESET: &str = "\\x1b[0m";\n');
  writeFileSync(join(root, 'src', 'input', 'keys.rs'), 'fn keymap() {}\n');
  writeFileSync(join(root, 'README.md'), '# Fixture\nhello\n');
  writeFileSync(join(root, 'docs', 'guide.md'), '# Guide\n');
  writeFileSync(join(root, 'vendor', 'lib.rs'), 'junk\n');
  writeFileSync(join(root, 'Cargo.lock'), 'lockdata\n');
  writeFileSync(join(root, 'logo.png'), Buffer.from([0, 1, 2, 3]));
  git(['init', '-q'], root);
  git(['add', '-A'], root);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], root);
  return root;
}

const scratchDirs: string[] = [];

afterEach(() => {
  // fixtures live in os.tmpdir; no extra cleanup required
  scratchDirs.length = 0;
});

describe('acquireTarget', () => {
  it('builds a manifest from a real git checkout with declared exclusions', () => {
    const fix = makeFixture();
    const scratch = mkdtempSync(join(tmpdir(), 'acq-scratch-'));
    const manifest = acquireTarget({
      target: fix,
      depth: 'deep',
      allowSelf: true,
      scratchRoot: scratch,
      cwd: scratch,
    });
    expect(manifest.totals.tracked).toBe(manifest.totals.in_scope + manifest.totals.excluded);
    expect(manifest.files.some((f) => f.path === 'src/render/frame.rs')).toBe(true);
    expect(manifest.files.some((f) => f.path === 'Cargo.lock')).toBe(false);
    const reasons = new Set(manifest.exclusions.map((e) => e.reason));
    expect(reasons.has('lockfile')).toBe(true);
    expect(reasons.has('vendored')).toBe(true);
    expect(reasons.has('binary')).toBe(true);
    expect(manifest.files.find((f) => f.path === 'src/render/frame.rs')?.lines).toBe(2);
    const shardIds = new Set(manifest.shards.map((s) => s.id));
    expect(manifest.files.every((f) => shardIds.has(f.shard))).toBe(true);
    expect(manifest.shards.reduce((n, s) => n + s.files, 0)).toBe(manifest.files.length);
    expect(manifest.budget.est_worker_dispatches).toBe(
      manifest.budget.shards + manifest.budget.lenses + 1
    );
  });

  it('ROOT TRIPWIRE: refuses a non-git directory', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'acq-scratch-'));
    const notRepo = mkdtempSync(join(tmpdir(), 'acq-notgit-'));
    mkdirSync(join(notRepo, 'docs'), { recursive: true });
    writeFileSync(join(notRepo, 'docs', 'a.md'), 'x\n');
    expect(() =>
      acquireTarget({ target: notRepo, scratchRoot: scratch, cwd: scratch, allowSelf: true })
    ).toThrow(AssimilateError);
    try {
      acquireTarget({ target: notRepo, scratchRoot: scratch, cwd: scratch, allowSelf: true });
    } catch (err) {
      expect(err).toBeInstanceOf(AssimilateError);
      expect((err as AssimilateError).code).toBe('ASSIMILATE_ROOT_TRIPWIRE');
    }
  });

  it('ROOT TRIPWIRE: refuses a subdirectory of a checkout', () => {
    const fix = makeFixture();
    const scratch = mkdtempSync(join(tmpdir(), 'acq-scratch-'));
    expect(() =>
      acquireTarget({
        target: join(fix, 'src'),
        scratchRoot: scratch,
        cwd: scratch,
        allowSelf: true,
      })
    ).toThrow(/ASSIMILATE_ROOT_TRIPWIRE/);
  });

  it('ROOT TRIPWIRE: refuses the current project without allowSelf', () => {
    const fix = makeFixture();
    const scratch = mkdtempSync(join(tmpdir(), 'acq-scratch-'));
    expect(() =>
      acquireTarget({ target: fix, scratchRoot: scratch, cwd: fix, allowSelf: false })
    ).toThrow(/ASSIMILATE_ROOT_TRIPWIRE/);
    const ok = acquireTarget({
      target: fix,
      scratchRoot: scratch,
      cwd: fix,
      allowSelf: true,
    });
    expect(ok.files.length).toBeGreaterThan(0);
  });

  it('quick depth drops nested docs from scope and still reconciles totals', () => {
    const fix = makeFixture();
    const scratch = mkdtempSync(join(tmpdir(), 'acq-scratch-'));
    const manifest = acquireTarget({
      target: fix,
      depth: 'quick',
      allowSelf: true,
      scratchRoot: scratch,
      cwd: scratch,
    });
    expect(manifest.files.some((f) => f.path === 'docs/guide.md')).toBe(false);
    expect(manifest.totals.tracked).toBe(manifest.totals.in_scope + manifest.totals.excluded);
  });

  it('--focus restricts scope and declares out-of-focus exclusions', () => {
    const fix = makeFixture();
    const scratch = mkdtempSync(join(tmpdir(), 'acq-scratch-'));
    const manifest = acquireTarget({
      target: fix,
      depth: 'deep',
      focus: ['src/render'],
      allowSelf: true,
      scratchRoot: scratch,
      cwd: scratch,
    });
    expect(manifest.files.map((f) => f.path).sort()).toEqual([
      'src/render/color.rs',
      'src/render/frame.rs',
    ]);
    expect(manifest.totals.tracked).toBe(manifest.totals.in_scope + manifest.totals.excluded);
    expect(manifest.exclusions.some((e) => e.reason === 'out-of-focus' && e.count === 3)).toBe(
      true
    );
  });
});
