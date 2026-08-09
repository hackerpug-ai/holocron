/**
 * S31-FE-05 — Delete client dead code and type-only Convex residue.
 *
 * Integration contracts against the real repository tree (no mocks):
 *   AC-1: components tree holds no Convex residue including orphan filenames
 *   AC-4: no client root references convex/_generated
 *   AC-6: eventsource dependency removal is importer-gated; polyfill retained
 *
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/s31-fe-05-convex-residue.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

const ORPHANS = [
  'lib/rn-sse-fetch.ts',
  'components/ResearchProgressWithConvex.tsx',
  'components/ResearchProgress.tsx',
  'screens/ChatScreen.tsx',
] as const;

const CLIENT_ROOTS = ['app', 'components', 'hooks', 'lib', 'screens'] as const;

function rg(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('rg', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bun', [join(REPO_ROOT, 'services/platform/src/cli/holo.ts'), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('S31-FE-05 client Convex residue cleanup', () => {
  it('components tree holds no convex residue', () => {
    for (const rel of ORPHANS) {
      expect(existsSync(join(REPO_ROOT, rel)), `orphan must be deleted: ${rel}`).toBe(false);
    }

    // Filename / path residue that blocked UC-SYNC-05 AC-1
    const orphanName = rg(['-ni', 'ResearchProgressWithConvex', 'components']);
    expect(
      orphanName.stdout.trim(),
      `ResearchProgressWithConvex still present under components/:\n${orphanName.stdout}`
    ).toBe('');
    expect([1, null]).toContain(orphanName.status); // rg: 1 = no match

    // Type-only generated imports under components must be gone (import paths only)
    const generatedInComponents = rg([
      '-n',
      String.raw`from ['"]@?/convex/_generated|from ['"]\.\.?/.*convex/_generated`,
      'components',
    ]);
    expect(
      generatedInComponents.stdout.trim(),
      `convex/_generated imports still under components/:\n${generatedInComponents.stdout}`
    ).toBe('');

    const verify = runHolo(['verify:no-convex-client']);
    expect(verify.status, `${verify.stdout}\n${verify.stderr}`).toBe(0);
    expect(verify.stdout).toMatch(/zero convex\/react|status: OK/i);

    // ls-style filename probe: no *convex* file names under components/
    const convexFilenames = spawnSync(
      'bash',
      ['-lc', 'ls components 2>/dev/null | rg -i convex || true'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(
      (convexFilenames.stdout ?? '').trim(),
      `convex-named files under components/:\n${convexFilenames.stdout}`
    ).toBe('');
  });

  it('no convex generated types under the client roots', () => {
    const hits = rg([
      '-n',
      String.raw`from ['"]@?/convex/_generated|from ['"]\.\.?/.*convex/_generated|convex/_generated/dataModel`,
      ...CLIENT_ROOTS,
    ]);
    expect(hits.stdout.trim(), `convex/_generated residue:\n${hits.stdout}`).toBe('');
    expect([1, null]).toContain(hits.status);

    // Replacement types must not be `any` aliases or silence via ts-expect-error
    for (const rel of [
      'components/AssimilationCard.tsx',
      'components/subscriptions/types.ts',
      'components/subscriptions/SubscriptionCard.tsx',
    ]) {
      const src = spawnSync('cat', [join(REPO_ROOT, rel)], { encoding: 'utf8' });
      const text = src.stdout ?? '';
      expect(text, rel).not.toMatch(/@ts-expect-error|@ts-ignore/);
      expect(text, rel).not.toMatch(/:\s*any\b|as\s+any\b/);
      expect(text, rel).not.toMatch(/from\s+['"]@\/convex\/_generated/);
    }
  });

  it('eventsource dependency removal is importer-gated', () => {
    const importers = rg([
      '-n',
      'from [\'"]eventsource[\'"]',
      '--glob',
      '!node_modules/**',
      '--glob',
      '!.tmp/**',
      '--glob',
      '!**/.git/**',
      '.',
    ]);
    const lines = importers.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      // ignore this test file's pattern string and package lock noise
      .filter((l) => !l.includes('s31-fe-05-convex-residue.test.ts'))
      .filter((l) => !l.includes('package-lock') && !l.includes('pnpm-lock'));

    // Hook must not import WhatWG eventsource (live path is XHR)
    const hookImport = lines.filter((l) => l.includes('hooks/use-resumable-sse-stream.ts'));
    expect(hookImport, `hook still imports eventsource:\n${hookImport.join('\n')}`).toEqual([]);

    // Load-bearing polyfill retained and required from the hook
    expect(existsSync(join(REPO_ROOT, 'lib/eventsource-rn-polyfill.js'))).toBe(true);
    const hookPolyfill = rg(['-n', 'eventsource-rn-polyfill', 'hooks/use-resumable-sse-stream.ts']);
    expect(hookPolyfill.stdout).toMatch(/eventsource-rn-polyfill\.js/);

    // package.json may keep eventsource only while real importers remain (e.g. live SSE test)
    const pkg = JSON.parse(
      spawnSync('cat', [join(REPO_ROOT, 'package.json')], { encoding: 'utf8' }).stdout ?? '{}'
    ) as { dependencies?: Record<string, string> };
    const nonHookImporters = lines.filter((l) => !l.includes('hooks/use-resumable-sse-stream.ts'));
    if (nonHookImporters.length === 0) {
      expect(pkg.dependencies?.eventsource).toBeUndefined();
    } else {
      // Importers remain — dependency must stay (do not brick the live EventSource test)
      expect(
        pkg.dependencies?.eventsource,
        `eventsource importers remain:\n${nonHookImporters.join('\n')}`
      ).toBeTruthy();
    }
  });
});
