/**
 * search-4 AC-1 — RED: embed() produces 1024-dim vectors (empty impl).
 *
 * Proves the absent `services/platform/src/inference/embed.ts` fails with
 * ReferenceError: embed is not defined. GREEN after search-1 lands.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - Test file has a syntax error so zero tests are collected
 * - Static import of missing module crashes collection without the named test
 * - Mock always returns a 1024-dim vector (false green)
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts
 *
 * RED state: ReferenceError: embed is not defined
 * GREEN state (search-1): real fleet embed, length 1024, non-zero finite components
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 120_000;
const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout: number = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

/** Repo root: services/platform/tests/integration → ../../../.. */
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/search-4');

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

/**
 * Dynamically load embed() so module collection does not crash on missing file.
 * RED: missing module → ReferenceError: embed is not defined
 */
async function loadEmbed(): Promise<
  (text: string, mode: 'query' | 'document') => Promise<number[]>
> {
  // Join defeats static import analysis (struct-* RED harness pattern).
  const modPath = ['../../src/inference', 'embed'].join('/');
  try {
    const mod = (await import(modPath)) as {
      embed?: (text: string, mode: 'query' | 'document') => Promise<number[]>;
    };
    if (typeof mod.embed !== 'function') {
      throw new ReferenceError('embed is not defined');
    }
    return mod.embed.bind(mod);
  } catch (err) {
    if (
      err instanceof ReferenceError ||
      (err instanceof Error &&
        (/Cannot find|Failed to resolve|Cannot resolve|ERR_MODULE_NOT_FOUND/i.test(err.message) ||
          err.message.includes('embed is not defined')))
    ) {
      const refErr = new ReferenceError('embed is not defined');
      refErr.cause = err instanceof ReferenceError ? err.cause : err;
      throw refErr;
    }
    throw err;
  }
}

/**
 * Dynamically load chunkDocument() (used by secondary embed-helper assertions).
 * RED: missing module → ReferenceError: chunkDocument is not defined
 */
async function loadChunkDocument(): Promise<
  (
    text: string,
    opts?: { title?: string; maxTokens?: number; overlap?: number }
  ) => Array<{ text: string; ordinal: number; tokenCount: number; situatingHeader: string }>
> {
  const modPath = ['../../src/inference', 'chunk'].join('/');
  try {
    const mod = (await import(modPath)) as {
      chunkDocument?: (
        text: string,
        opts?: { title?: string; maxTokens?: number; overlap?: number }
      ) => Array<{ text: string; ordinal: number; tokenCount: number; situatingHeader: string }>;
    };
    if (typeof mod.chunkDocument !== 'function') {
      throw new ReferenceError('chunkDocument is not defined');
    }
    return mod.chunkDocument.bind(mod);
  } catch (err) {
    if (
      err instanceof ReferenceError ||
      (err instanceof Error &&
        (/Cannot find|Failed to resolve|Cannot resolve|ERR_MODULE_NOT_FOUND/i.test(err.message) ||
          err.message.includes('chunkDocument is not defined')))
    ) {
      const refErr = new ReferenceError('chunkDocument is not defined');
      refErr.cause = err instanceof ReferenceError ? err.cause : err;
      throw refErr;
    }
    throw err;
  }
}

describe('search-4 AC-1: embed helper 1024-dim vectors (RED)', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  afterAll(() => {
    // no persistent state from this suite
  });

  itLive('embed produces 1024-dim vector', async () => {
    let caught: unknown;
    try {
      const embed = await loadEmbed();
      const result = await embed('machine learning transformer attention', 'query');

      // GREEN assertions — only reachable once search-1 implements embed()
      expect(Array.isArray(result), 'embed must return number[]').toBe(true);
      expect(result.length, `vector dim must be 1024, got ${result.length}`).toBe(1024);
      expect(
        result.every((v) => typeof v === 'number' && Number.isFinite(v)),
        'all components must be finite numbers'
      ).toBe(true);
      // 0 null/wrong-dim / all-zero vectors rejected
      const nonZero = result.some((v) => v !== 0);
      expect(nonZero, 'vector must not be all-zero (null/stub embedding)').toBe(true);

      writeArtifact('AC-1-green-embed-1024.json', {
        length: result.length,
        sample: result.slice(0, 4),
        nonZero,
      });
    } catch (err) {
      caught = err;
      writeArtifact('AC-1-red-against-start.txt', {
        test: 'embed produces 1024-dim vector',
        error:
          caught instanceof Error ? { name: caught.name, message: caught.message } : String(caught),
        RED_state: true,
        must_observe: 'ReferenceError: embed is not defined',
      });
      // Surface RED signature: ReferenceError: embed is not defined
      if (caught instanceof ReferenceError) {
        expect(caught.message).toMatch(/embed is not defined/);
        throw caught;
      }
      throw caught;
    }
  });

  itLive('chunkDocument preserves past-8K marker span', async () => {
    // Secondary RED for search-1 AC-2 — fails until chunk.ts exists
    const marker = 'ZZZ_RELEVANT_SPAN_AT_8400_ZZZ';
    // 8400 + marker(28) + 1620 = 10048 (fixture golden-past-8k-doc length)
    const prefix = 'A'.repeat(8400);
    const longDoc = `${prefix}${marker}${'B'.repeat(1620)}`;
    expect(longDoc.length).toBeGreaterThanOrEqual(10048);
    expect(longDoc.indexOf(marker)).toBe(8400);

    const chunkDocument = await loadChunkDocument();
    const passages = chunkDocument(longDoc, {
      title: 'Embedding Guide',
      maxTokens: 512,
      overlap: 64,
    });
    expect(passages.length).toBeGreaterThanOrEqual(2);
    expect(passages.some((p) => p.text.includes(marker))).toBe(true);
    expect(passages.every((p) => p.tokenCount <= 512)).toBe(true);
    expect(passages[0]?.situatingHeader.includes('Embedding Guide')).toBe(true);
  });
});
