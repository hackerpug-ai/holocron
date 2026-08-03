/**
 * S-REWRITE-04 — Research / assimilate / improvements / toolbelt / notifications
 * cluster rewired off convex/react onto Zero (AC-6 + query seam).
 *
 * Static contracts (no live substrate required):
 *   1. Zero query builders exist for the contract registry names.
 *   2. Cluster roots contain 0 `from 'convex/react'` imports.
 *   3. Cluster hooks import from `app/zero/queries` (>=1 Zero import).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

const CLUSTER_ROOTS = [
  'app/(drawer)/research',
  'app/(drawer)/improvements',
  'app/(drawer)/improvements.tsx',
  'app/(drawer)/toolbelt.tsx',
  'app/assimilate',
  'app/toolbelt',
  'components/ResearchProgress.tsx',
  'components/ResearchProgressWithConvex.tsx',
  'components/assimilate',
  'components/improvements',
  'hooks/useResearchSession.ts',
  'hooks/use-agent-activity.ts',
  'hooks/use-notifications.ts',
  'hooks/use-whats-new-feed.ts',
  'hooks/use-subscription-feed.ts',
] as const;

const CONVEX_IMPORT_RE = /from\s+['"]convex\/react['"]/;
const ZERO_QUERIES_IMPORT_RE =
  /from\s+['"]@?\/?app\/zero\/queries['"]|from\s+['"]\.\.\/.*zero\/queries['"]|from\s+['"]@\/app\/zero\/queries['"]/;

function listTsFiles(relPath: string): string[] {
  const abs = join(REPO_ROOT, relPath);
  if (!existsSync(abs)) return [];
  const st = statSync(abs);
  if (st.isFile()) return [abs];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (
        /\.(tsx?|jsx?)$/.test(name) &&
        !name.includes('.test.') &&
        !name.includes('.stories.')
      ) {
        out.push(p);
      }
    }
  };
  walk(abs);
  return out;
}

function collectClusterFiles(): string[] {
  return CLUSTER_ROOTS.flatMap(listTsFiles);
}

describe('S-REWRITE-04 research cluster Zero seam', () => {
  it('exports contract-named Zero query builders from app/zero/queries.ts', () => {
    const src = readFileSync(join(REPO_ROOT, 'app/zero/queries.ts'), 'utf8');
    for (const name of [
      'researchSessionById',
      'deepResearchSessionById',
      'improvementRequestsByOwner',
      'improvementRequestById',
      'assimilationSessionById',
      'toolbeltDocumentsByOwner',
      'notificationsUnread',
      'notificationsRecent',
      'latestWhatsNewReports',
      'feedItemsByOwner',
      'agentActivityByOwner',
    ]) {
      expect(src, `missing export ${name}`).toMatch(new RegExp(`export const ${name}`));
    }
    expect(src).not.toMatch(/defineQuery|defineQueries/);
    // toolbelt list must not be an unfiltered documents dump
    const toolbelt = src.match(
      /toolbeltDocumentsByOwner[\s\S]*?\.orderBy\(\s*['"]created_at['"]/
    )?.[0];
    expect(toolbelt).toBeTruthy();
    expect(toolbelt).toMatch(/\.where\(\(\{\s*cmp\s*,\s*or\s*\}\)\s*=>/);
    expect(toolbelt?.match(/cmp\(\s*['"]category['"]\s*,\s*['"]=['"]/g)).toHaveLength(6);
    expect(toolbelt).toMatch(/\bor\(/);
  });

  it('AC-6: components/notifications has zero convex/react imports', () => {
    const files = listTsFiles('components/notifications');
    const hits: string[] = [];
    for (const file of files) {
      if (file.includes('.test.')) continue;
      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (CONVEX_IMPORT_RE.test(line)) {
          hits.push(`${file.replace(REPO_ROOT + '/', '')}:${i + 1}:${line.trim()}`);
        }
      });
    }
    expect(hits, `convex/react still present in notifications:\n${hits.join('\n')}`).toEqual([]);
  });

  it('AC-6: zero convex/react imports remain in the research cluster roots', () => {
    const files = collectClusterFiles();
    expect(files.length).toBeGreaterThan(5);

    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (CONVEX_IMPORT_RE.test(line)) {
          hits.push(`${file.replace(REPO_ROOT + '/', '')}:${i + 1}:${line.trim()}`);
        }
      });
    }

    expect(hits, `convex/react still present:\n${hits.join('\n')}`).toEqual([]);
  });

  it('AC-6: cluster hooks import from app/zero/queries (>=1 Zero import)', () => {
    const hookFiles = [
      'hooks/useResearchSession.ts',
      'hooks/use-agent-activity.ts',
      'hooks/use-notifications.ts',
      'hooks/use-whats-new-feed.ts',
      'hooks/use-subscription-feed.ts',
    ].map((p) => join(REPO_ROOT, p));

    let zeroImports = 0;
    for (const file of hookFiles) {
      const text = readFileSync(file, 'utf8');
      if (ZERO_QUERIES_IMPORT_RE.test(text) || text.includes('app/zero/queries')) {
        zeroImports += 1;
      }
      expect(text, `${file} still imports convex/react`).not.toMatch(CONVEX_IMPORT_RE);
    }
    expect(zeroImports).toBeGreaterThanOrEqual(1);
  });

  it('Zero schema publishes research-cluster tables', () => {
    const src = readFileSync(join(REPO_ROOT, 'app/zero/schema.ts'), 'utf8');
    for (const table of [
      'research_sessions',
      'improvement_requests',
      'assimilation_sessions',
      'documents',
      'notifications',
      'whats_new_reports',
      'feed_items',
      'agent_plans',
    ]) {
      expect(src).toContain(`table('${table}')`);
    }
    expect(src).toMatch(/enableLegacyQueries:\s*true/);
    expect(src).toMatch(/enableLegacyMutators:\s*true/);
  });
});
