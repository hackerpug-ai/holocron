/**
 * search-1 — embed() prefix asymmetry + chunkDocument (~512 tok).
 *
 * RED (search-4): missing embed.ts / chunk.ts → ReferenceError.
 * GREEN (search-1): live fleet embed, 1024-dim, query≠document; chunk preserves past-8K.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - Mock always returns a 1024-dim vector (false green)
 * - prefix policy bypassed so query/document vectors are identical
 * - chunkDocument returns a single 8K-truncated passage
 * - embed() swallows fleet errors and returns null / zero vector
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts
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
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/search-1');
const LEGACY_EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/search-4');

function writeArtifact(name: string, body: unknown): string {
  for (const dir of [EVIDENCE_DIR, LEGACY_EVIDENCE_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(path, payload, 'utf8');
  writeFileSync(resolve(LEGACY_EVIDENCE_DIR, name), payload, 'utf8');
  return path;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 1;
  const cosine = dot / denom;
  return 1 - cosine;
}

type EmbedFn = (
  text: string,
  mode: 'query' | 'document',
  options?: { endpointOverride?: string }
) => Promise<number[]>;

type ChunkFn = (
  text: string,
  opts?: { title?: string; maxTokens?: number; overlap?: number }
) => Array<{ text: string; ordinal: number; tokenCount: number; situatingHeader: string }>;

/**
 * Dynamically load embed() so module collection does not crash on missing file.
 * RED: missing module → ReferenceError: embed is not defined
 */
async function loadEmbed(): Promise<EmbedFn> {
  // Join defeats static import analysis (struct-* RED harness pattern).
  const modPath = ['../../src/inference', 'embed'].join('/');
  try {
    const mod = (await import(modPath)) as {
      embed?: EmbedFn;
      RoleUnavailableError?: new (
        role: string,
        endpoint: string,
        degradationAction: string,
        causeMessage: string
      ) => Error & { code: string };
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

async function loadRoleUnavailableError(): Promise<
  new (
    role: string,
    endpoint: string,
    degradationAction: string,
    causeMessage: string
  ) => Error & { code: string }
> {
  const modPath = ['../../src/inference', 'embed'].join('/');
  const mod = (await import(modPath)) as {
    RoleUnavailableError?: new (
      role: string,
      endpoint: string,
      degradationAction: string,
      causeMessage: string
    ) => Error & { code: string };
  };
  if (typeof mod.RoleUnavailableError !== 'function') {
    // Fall back to resolve-model export for instanceof checks.
    const rmPath = ['../../src/inference', 'resolve-model'].join('/');
    const rm = (await import(rmPath)) as {
      RoleUnavailableError: new (
        role: string,
        endpoint: string,
        degradationAction: string,
        causeMessage: string
      ) => Error & { code: string };
    };
    return rm.RoleUnavailableError;
  }
  return mod.RoleUnavailableError;
}

/**
 * Dynamically load chunkDocument() (used by secondary embed-helper assertions).
 * RED: missing module → ReferenceError: chunkDocument is not defined
 */
async function loadChunkDocument(): Promise<ChunkFn> {
  const modPath = ['../../src/inference', 'chunk'].join('/');
  try {
    const mod = (await import(modPath)) as {
      chunkDocument?: ChunkFn;
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

describe('search-1: embed helper + chunkDocument', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    mkdirSync(LEGACY_EVIDENCE_DIR, { recursive: true });
  });

  afterAll(() => {
    // no persistent state from this suite
  });

  // ── AC-1 / TC-1 / TC-2 ──────────────────────────────────────────────────
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
      expect(Number.isFinite(result[0]), 'result[0] must be finite').toBe(true);

      writeArtifact('AC-1-green-embed-1024.json', {
        length: result.length,
        sample: result.slice(0, 4),
        nonZero,
        must_observe: {
          'result.length === 1024': result.length === 1024,
          'Number.isFinite(result[0])': Number.isFinite(result[0]),
          'result.some(v => v !== 0)': nonZero,
        },
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

  itLive('embed query/document prefix asymmetry', async () => {
    const embed = await loadEmbed();
    const text = 'machine learning transformer attention';
    const queryResult = await embed(text, 'query');
    const docResult = await embed(text, 'document');

    expect(queryResult.length).toBe(1024);
    expect(docResult.length).toBe(1024);

    const identical =
      queryResult.length === docResult.length && queryResult.every((v, i) => v === docResult[i]);
    expect(identical, 'query and document vectors must not be deepEqual').toBe(false);

    const dist = cosineDistance(queryResult, docResult);
    expect(dist, `cosineDistance must be > 0.0001, got ${dist}`).toBeGreaterThan(0.0001);

    writeArtifact('AC-1-green-prefix-asymmetry.json', {
      queryLength: queryResult.length,
      docLength: docResult.length,
      cosineDistance: dist,
      identical,
      must_observe: {
        'docResult.length === 1024': docResult.length === 1024,
        'cosineDistance > 0.0001': dist > 0.0001,
      },
    });
  });

  // ── AC-2 / TC-3 / TC-4 ──────────────────────────────────────────────────
  itLive('chunkDocument preserves past-8K marker span', async () => {
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
    expect(
      passages.every((p) => p.situatingHeader.length > 0),
      'situatingHeader must be non-empty on every passage'
    ).toBe(true);

    writeArtifact('AC-2-green-chunk-past-8k.json', {
      docLength: longDoc.length,
      passageCount: passages.length,
      markerSurvived: passages.some((p) => p.text.includes(marker)),
      maxTokenCount: Math.max(...passages.map((p) => p.tokenCount)),
      firstHeader: passages[0]?.situatingHeader,
      must_observe: {
        'passages.length >= 2': passages.length >= 2,
        'marker preserved': passages.some((p) => p.text.includes(marker)),
        'tokenCount <= 512': passages.every((p) => p.tokenCount <= 512),
        'header includes title': passages[0]?.situatingHeader.includes('Embedding Guide') === true,
      },
    });
  });

  // ── AC-3 / TC-5 ─────────────────────────────────────────────────────────
  itLive('chunkDocument handles short and empty input', async () => {
    const chunkDocument = await loadChunkDocument();

    const short = chunkDocument('short text', { title: 'Tiny' });
    expect(short.length).toBe(1);
    expect(short[0]?.text).toBe('short text');
    expect(short[0]?.ordinal).toBe(0);

    const empty = chunkDocument('', { title: 'Empty' });
    expect(empty.length).toBe(0);

    writeArtifact('AC-3-green-chunk-boundary.json', {
      shortLength: short.length,
      shortText: short[0]?.text,
      shortOrdinal: short[0]?.ordinal,
      emptyLength: empty.length,
      must_observe: {
        'short passages.length === 1': short.length === 1,
        "short text === 'short text'": short[0]?.text === 'short text',
        'empty passages.length === 0': empty.length === 0,
      },
    });
  });

  // ── AC-4 / TC-6 ─────────────────────────────────────────────────────────
  itLive('embed throws RoleUnavailableError on dead fleet endpoint', async () => {
    const embed = await loadEmbed();
    const RoleUnavailableError = await loadRoleUnavailableError();
    // Port 1 is almost never listening — health probe must fail closed.
    const dead = 'http://127.0.0.1:1';

    let thrown: unknown;
    try {
      const result = await embed('text', 'query', { endpointOverride: dead });
      // If we somehow get a vector, that is a MUST_NOT_OBSERVE failure.
      writeArtifact('AC-4-unexpected-success.json', {
        length: Array.isArray(result) ? result.length : null,
        note: 'embed succeeded against dead endpoint — fail-closed violated',
      });
      expect.fail('embed() must throw RoleUnavailableError against dead endpoint');
    } catch (err) {
      thrown = err;
    }

    expect(thrown, 'must throw').toBeDefined();
    const code =
      thrown && typeof thrown === 'object' && 'code' in thrown
        ? String((thrown as { code: unknown }).code)
        : '';
    const isRoleUnavailable =
      thrown instanceof RoleUnavailableError ||
      (thrown instanceof Error &&
        thrown.name === 'RoleUnavailableError' &&
        code === 'ROLE_UNAVAILABLE');
    expect(isRoleUnavailable, 'must be RoleUnavailableError').toBe(true);
    expect(code).toBe('ROLE_UNAVAILABLE');

    writeArtifact('AC-4-green-role-unavailable.json', {
      errorName: thrown instanceof Error ? thrown.name : typeof thrown,
      code,
      message: thrown instanceof Error ? thrown.message : String(thrown),
      must_observe: {
        'throws RoleUnavailableError': isRoleUnavailable,
        "error code === 'ROLE_UNAVAILABLE'": code === 'ROLE_UNAVAILABLE',
      },
    });
  });
});
