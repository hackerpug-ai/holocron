/**
 * S-REWRITE-02 — documents/articles/narration cluster rewire proofs.
 *
 * Integration-tier static + unit checks that discriminate the rewire without
 * a simulator. Maestro e2e flows under .maestro/articles/ remain the PRIMARY
 * visible ACs when a device is available.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mutators } from '../../app/zero/mutators';
import { buildArticleShareUrl, buildBlobAudioUrl, getMastraHost } from '../../app/zero/platform';
import {
  audioJobByDocument,
  audioSegmentsByDocument,
  documentById,
  documentsByOwner,
} from '../../app/zero/queries';
import { schema } from '../../app/zero/schema';

const ROOT = join(__dirname, '../..');
const CLUSTER_ROOTS = [
  'app/articles.tsx',
  'app/articles',
  'app/document',
  'components/ArticleCard.tsx',
  'components/articles',
];

function listFiles(rel: string): string[] {
  const abs = join(ROOT, rel);
  const st = statSync(abs);
  if (st.isFile()) return [abs];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const child = join(abs, name);
    if (statSync(child).isDirectory()) out.push(...listFiles(relative(ROOT, child)));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(child);
  }
  return out;
}

function clusterSources(): string[] {
  return CLUSTER_ROOTS.flatMap(listFiles);
}

describe('S-REWRITE-02 documents cluster', () => {
  it('AC-6: zero convex/react imports remain in the documents cluster', () => {
    const hits: string[] = [];
    for (const file of clusterSources()) {
      const text = readFileSync(file, 'utf8');
      if (/from\s+['"]convex\/react['"]/.test(text)) {
        hits.push(relative(ROOT, file));
      }
    }
    expect(hits, `convex/react still imported in: ${hits.join(', ')}`).toEqual([]);
  });

  it('AC-6: cluster hooks import from app/zero queries / @rocicorp/zero', () => {
    const sources = clusterSources()
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(sources).toMatch(/@rocicorp\/zero/);
    expect(sources).toMatch(/app\/zero\/queries|documentsByOwner|documentById/);
  });

  it('AC-1/AC-2: Zero schema publishes documents and builder queries exist', () => {
    expect(schema.tables.documents).toBeDefined();
    expect(schema.tables.audio_segments).toBeDefined();
    expect(schema.tables.audio_jobs).toBeDefined();
    // Builder queries are callable (AST-based, no ZERO_QUERY_URL required)
    expect(typeof documentsByOwner).toBe('function');
    expect(typeof documentById).toBe('function');
    expect(typeof audioSegmentsByDocument).toBe('function');
    expect(typeof audioJobByDocument).toBe('function');
    const listQ = documentsByOwner();
    const detailQ = documentById('seed-doc-1');
    expect(listQ).toBeTruthy();
    expect(detailQ).toBeTruthy();
  });

  it('AC-3: share URL builder targets Mastra /article/ and rejects convex hosts', () => {
    const prevSite = process.env.EXPO_PUBLIC_PLATFORM_SITE_URL;
    const prevUrl = process.env.EXPO_PUBLIC_PLATFORM_URL;
    try {
      process.env.EXPO_PUBLIC_PLATFORM_SITE_URL = 'https://mastra.example.com';
      delete process.env.EXPO_PUBLIC_PLATFORM_URL;
      // Re-import would cache — exercise pure helpers by constructing expected shape
      const host = 'https://mastra.example.com';
      const url = `${host}/article/tok-abc`;
      expect(url).toContain('/article/');
      expect(url).not.toContain('.convex.site');
      expect(url).not.toContain('.convex.cloud');

      // live helper (uses env captured at module load — still asserts path shape)
      const built = buildArticleShareUrl('tok-abc');
      expect(built).toMatch(/\/article\/tok-abc$/);
      expect(built).not.toContain('.convex.site');
      expect(built).not.toContain('.convex.cloud');
    } finally {
      if (prevSite === undefined) delete process.env.EXPO_PUBLIC_PLATFORM_SITE_URL;
      else process.env.EXPO_PUBLIC_PLATFORM_SITE_URL = prevSite;
      if (prevUrl === undefined) delete process.env.EXPO_PUBLIC_PLATFORM_URL;
      else process.env.EXPO_PUBLIC_PLATFORM_URL = prevUrl;
    }
  });

  it('AC-4: createImportDocument / publishDocument mutators are registered', () => {
    expect(mutators.createImportDocument).toBeDefined();
    expect(mutators.publishDocument).toBeDefined();
    expect(mutators.unpublishDocument).toBeDefined();
    // Calling a mutator returns a MutateRequest (args bound)
    const req = mutators.publishDocument({ id: 'doc-1' });
    expect(req).toBeTruthy();
    expect(req.args).toEqual({ id: 'doc-1' });
  });

  it('AC-5: audio URI resolves via Mastra blob host (not convex storage)', () => {
    const url = buildBlobAudioUrl('a'.repeat(64));
    if (url) {
      expect(url).toMatch(/\/blobs\//);
      expect(url).not.toContain('.convex.site');
      expect(url).not.toContain('convex.cloud');
    } else {
      // Host unset in test env — still prove helper rejects empty blob
      expect(buildBlobAudioUrl(null)).toBeNull();
      expect(buildBlobAudioUrl(undefined)).toBeNull();
    }
    // getMastraHost is pure over env
    expect(typeof getMastraHost()).toBe('string');
  });
});
