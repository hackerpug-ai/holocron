/**
 * DEPENDENCY-S24 / S-REWRITE-05 — holo verify:no-convex-client (real rg, no mocks).
 *
 * Run:
 *   pnpm vitest run packages/platform/src/cli/commands/__tests__/verify-no-convex-client.test.ts
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REPO_ROOT, runHolo } from '../../__tests__/fixtures/harness';

const tmpRoots: string[] = [];

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function makeCleanTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'no-convex-clean-'));
  tmpRoots.push(root);
  for (const name of ['app', 'components', 'hooks', 'screens']) {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ok.ts'), "export const x = 'zero';\n", 'utf8');
  }
  return root;
}

function makeDirtyTree(): { root: string; dirtyFile: string } {
  const root = makeCleanTree();
  const dirtyFile = join(root, 'app', 'stray-convex.ts');
  writeFileSync(
    dirtyFile,
    "import { useQuery } from 'convex/react';\nexport const bad = useQuery;\n",
    'utf8'
  );
  return { root, dirtyFile };
}

describe('AC-3: holo verify:no-convex-client', () => {
  it('is registered and --print-roots reports the 4 default roots', () => {
    const help = runHolo(['--help']);
    expect(help.combined).toMatch(/verify:no-convex-client/);

    const r = runHolo(['verify:no-convex-client', '--print-roots', '--json']);
    expect(r.status, r.combined).toBe(0);
    expect(r.combined).not.toMatch(/unknown command/i);
    const body = r.stdout.includes('{') ? r.stdout.slice(r.stdout.indexOf('{')) : r.stdout;
    const parsed = JSON.parse(body) as { roots?: string[]; root_count?: number };
    expect(parsed.root_count ?? parsed.roots?.length).toBe(4);
    expect(parsed.roots ?? []).toEqual(
      expect.arrayContaining(['app', 'components', 'hooks', 'screens'])
    );
  });

  it('exits 0 on a clean --roots tree (zero convex/react hits)', () => {
    const root = makeCleanTree();
    const roots = ['app', 'components', 'hooks', 'screens'].map((n) => join(root, n)).join(',');
    const r = runHolo(['verify:no-convex-client', '--roots', roots, '--json'], {
      env: { HOLO_REPO_ROOT: REPO_ROOT },
    });
    // cwd is REPO_ROOT; --roots are absolute so scanner uses them as-is
    expect(r.status, r.combined).toBe(0);
    const body = r.stdout.includes('{') ? r.stdout.slice(r.stdout.indexOf('{')) : r.stdout;
    const parsed = JSON.parse(body) as { ok?: boolean; hit_count?: number };
    expect(parsed.ok).toBe(true);
    expect(parsed.hit_count).toBe(0);
  });

  it('exits non-zero naming file:line when a stray convex/react import is present', () => {
    const { root, dirtyFile } = makeDirtyTree();
    const roots = ['app', 'components', 'hooks', 'screens'].map((n) => join(root, n)).join(',');
    const r = runHolo(['verify:no-convex-client', '--roots', roots]);
    expect(r.status, `must fail closed: ${r.combined}`).toBe(1);
    expect(r.combined).toMatch(/convex\/react/);
    // file:line detail
    expect(r.combined).toMatch(/stray-convex\.ts:\d+/);
    expect(r.combined).toContain('stray-convex.ts');
    // ensure we did not silently pass
    expect(r.combined).not.toMatch(/status:\s*OK\b/i);
    void dirtyFile;
  });

  it('package.json exposes verify:no-convex-client script', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.['verify:no-convex-client']).toMatch(/verify:no-convex-client/);
  });
});
