/**
 * Wave-1 research rerank live probe.
 *
 * Real POST to FLEET_URL /rerank with model qwen3-reranker (no fetch mocks).
 * Asserts SequenceClassification weights (not the unservable causal id) and
 * that the RRF document outranks the bananas distractor.
 *
 * Run:
 *   PLATFORM_IT=1 FLEET_URL=http://127.0.0.1:4545/v1 \
 *     DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm vitest run --project integration \
 *     services/platform/tests/integration/research-rerank-live.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 120_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'services/platform/fleet/manifest.json');

const FLEET_URL = process.env.FLEET_URL?.trim() ?? '';
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';

type RerankResult = {
  index?: number;
  relevance_score?: number;
};

type RerankResponse = {
  results?: RerankResult[];
  error?: unknown;
};

beforeAll(() => {
  if (!PLATFORM_IT) {
    throw new Error('research-rerank-live requires PLATFORM_IT=1 (live fleet rerank; no mocks)');
  }
  if (!DATABASE_URL.includes('holocron_nonprod')) {
    throw new Error(
      `research-rerank-live requires DATABASE_URL pointing at holocron_nonprod; got ${DATABASE_URL || '(missing)'}`
    );
  }
  if (!FLEET_URL) {
    throw new Error('research-rerank-live requires FLEET_URL (already includes /v1)');
  }
});

describe('research-rerank-live (PLATFORM_IT)', () => {
  it(
    'POST /rerank ranks RRF above bananas via qwen3-reranker',
    async () => {
      const query = 'reciprocal rank fusion';
      const documents = ['RRF combines rankings from multiple retrievers', 'Bananas are yellow'];

      const response = await fetch(`${FLEET_URL.replace(/\/$/, '')}/rerank`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${process.env.FLEET_KEY ?? 'sk-none'}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen3-reranker',
          query,
          documents,
        }),
        signal: AbortSignal.timeout(FLEET_TIMEOUT_MS),
      });

      const body = (await response.json()) as RerankResponse;
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(Array.isArray(body.results), JSON.stringify(body)).toBe(true);
      expect(body.results!.length).toBeGreaterThanOrEqual(2);

      const byIndex = new Map<number, RerankResult>();
      for (const result of body.results!) {
        expect(typeof result.index).toBe('number');
        expect(typeof result.relevance_score).toBe('number');
        byIndex.set(result.index as number, result);
      }

      const score0 = byIndex.get(0)?.relevance_score;
      const score1 = byIndex.get(1)?.relevance_score;
      expect(typeof score0).toBe('number');
      expect(typeof score1).toBe('number');
      expect(score0!, `doc0=${score0} doc1=${score1}`).toBeGreaterThan(score1!);

      const ordered = [...body.results!].sort(
        (a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)
      );
      expect(ordered[0]?.index).toBe(0);
    },
    FLEET_TIMEOUT_MS
  );

  it('manifest modelRevision is SequenceClassification, not causal qwen3-reranker-0.6b', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      roles: { rerank: { modelRevision: string; litellmModelId: string } };
    };
    expect(manifest.roles.rerank.litellmModelId).toBe('qwen3-reranker');
    expect(manifest.roles.rerank.modelRevision).not.toBe('qwen3-reranker-0.6b');
    expect(manifest.roles.rerank.modelRevision).toBe('BAAI-bge-reranker-v2-m3-mlx-fp16');
  });
});
