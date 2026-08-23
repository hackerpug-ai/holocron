/**
 * Wave-2 T7 — rerankCandidates client against live fleet + real Postgres telemetry.
 *
 * No fetch mocks. No it.skip. Requires PLATFORM_IT=1, holocron_nonprod, FLEET_URL.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     FLEET_URL=http://127.0.0.1:4545/v1 \
 *     pnpm vitest run --project integration \
 *     services/platform/tests/integration/research-rerank-client.test.ts
 */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client.ts';
import {
  RERANK_BATCH_SIZE,
  RoleUnavailableError,
  rerankCandidates,
} from '../../src/inference/rerank.ts';
import { scanFleetClientBypass } from '../../src/inference/telemetry.ts';

const SRC_ROOT = resolve(import.meta.dirname, '../../src');

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 180_000;
const FLEET_URL = process.env.FLEET_URL?.trim() ?? '';
const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? '';

beforeAll(() => {
  if (!PLATFORM_IT) {
    throw new Error('research-rerank-client requires PLATFORM_IT=1 (live fleet rerank; no mocks)');
  }
  if (!DATABASE_URL.includes('holocron_nonprod')) {
    throw new Error(
      `research-rerank-client requires DATABASE_URL pointing at holocron_nonprod; got ${DATABASE_URL || '(missing)'}`
    );
  }
  if (!FLEET_URL) {
    throw new Error('research-rerank-client requires FLEET_URL (already includes /v1)');
  }
});

describe('research-rerank-client (PLATFORM_IT)', () => {
  it(
    'TC-1: rerankCandidates scores RRF strictly above bananas',
    async () => {
      const runId = randomUUID();
      const out = await rerankCandidates({
        query: 'reciprocal rank fusion',
        candidates: [
          { id: 'rrf', text: 'RRF combines rankings from multiple retrievers' },
          { id: 'bananas', text: 'Bananas are yellow' },
        ],
        runId,
        databaseUrl: DATABASE_URL,
      });

      expect(out.degraded).toBe(false);
      expect(out.batches).toBe(1);
      expect(out.results.length).toBe(2);

      const byId = new Map(out.results.map((r) => [r.id, r]));
      const rrf = byId.get('rrf');
      const bananas = byId.get('bananas');
      expect(rrf, JSON.stringify(out.results)).toBeTruthy();
      expect(bananas, JSON.stringify(out.results)).toBeTruthy();
      expect(
        rrf!.relevanceScore,
        `rrf=${rrf!.relevanceScore} bananas=${bananas!.relevanceScore}`
      ).toBeGreaterThan(bananas!.relevanceScore);
      expect(out.results[0]?.id).toBe('rrf');

      console.log(
        JSON.stringify({
          tc: 'TC-1',
          runId,
          scores: { rrf: rrf!.relevanceScore, bananas: bananas!.relevanceScore },
          batches: out.batches,
          totalTokens: out.totalTokens,
        })
      );
    },
    FLEET_TIMEOUT_MS
  );

  it(
    'TC-2: success path writes inference_telemetry status=success wall_ms>0',
    async () => {
      const runId = randomUUID();
      const out = await rerankCandidates({
        query: 'reciprocal rank fusion',
        candidates: [
          { id: 'rrf', text: 'RRF combines rankings from multiple retrievers' },
          { id: 'bananas', text: 'Bananas are yellow' },
        ],
        runId,
        stepId: 'rerank-tc2',
        databaseUrl: DATABASE_URL,
      });
      expect(out.degraded).toBe(false);

      const sql = createSql(DATABASE_URL);
      try {
        const rows = await sql<
          Array<{
            status: string;
            wall_ms: number;
            role: string;
            provider: string;
            model_id: string | null;
          }>
        >`
          SELECT status, wall_ms, role, provider, model_id
          FROM inference_telemetry
          WHERE run_id = ${runId}
          ORDER BY created_at ASC
        `;
        expect(rows.length, JSON.stringify(rows)).toBeGreaterThanOrEqual(1);
        const row = rows[0]!;
        expect(row.status).toBe('success');
        expect(row.wall_ms).toBeGreaterThan(0);
        expect(row.role).toBe('rerank');
        expect(row.provider).toBe('fleet');
        expect(row.model_id).toBe('qwen3-reranker');
        console.log(JSON.stringify({ tc: 'TC-2', runId, row }));
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    FLEET_TIMEOUT_MS
  );

  it(
    'TC-3: 40 candidates → ceil(40/32) batches with globally merged non-increasing scores',
    async () => {
      const runId = randomUUID();
      const candidates = Array.from({ length: 40 }, (_, i) => {
        if (i === 0) {
          return { id: `doc-${i}`, text: 'Reciprocal rank fusion merges multiple ranked lists' };
        }
        if (i === 17) {
          return { id: `doc-${i}`, text: 'RRF is a rank aggregation method used in hybrid search' };
        }
        return { id: `doc-${i}`, text: `Unrelated filler document about bananas number ${i}` };
      });

      const out = await rerankCandidates({
        query: 'reciprocal rank fusion hybrid search',
        candidates,
        runId,
        databaseUrl: DATABASE_URL,
      });

      expect(out.batches).toBe(Math.ceil(40 / RERANK_BATCH_SIZE));
      expect(out.batches).toBe(2);
      expect(out.degraded).toBe(false);
      expect(out.results.length).toBe(40);

      for (let i = 1; i < out.results.length; i++) {
        expect(
          out.results[i - 1]!.relevanceScore,
          `scores must be non-increasing at ${i - 1}->${i}: ${out.results
            .map((r) => r.relevanceScore)
            .join(',')}`
        ).toBeGreaterThanOrEqual(out.results[i]!.relevanceScore);
      }

      const topIds = out.results.slice(0, 2).map((r) => r.id);
      expect(topIds).toEqual(expect.arrayContaining(['doc-0', 'doc-17']));

      console.log(
        JSON.stringify({
          tc: 'TC-3',
          runId,
          batches: out.batches,
          top: out.results.slice(0, 5),
        })
      );
    },
    FLEET_TIMEOUT_MS
  );

  it(
    'TC-4: mode required + dead endpointOverride throws RoleUnavailableError and records error telemetry',
    async () => {
      const runId = randomUUID();
      let thrown: unknown;
      try {
        await rerankCandidates({
          query: 'reciprocal rank fusion',
          candidates: [
            { id: 'rrf', text: 'RRF combines rankings from multiple retrievers' },
            { id: 'bananas', text: 'Bananas are yellow' },
          ],
          runId,
          stepId: 'rerank-tc4',
          databaseUrl: DATABASE_URL,
          mode: 'required',
          endpointOverride: 'http://127.0.0.1:9',
        });
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(RoleUnavailableError);
      const roleErr = thrown as RoleUnavailableError;
      expect(roleErr.role).toBe('rerank');

      const sql = createSql(DATABASE_URL);
      try {
        const rows = await sql<
          Array<{ status: string; wall_ms: number; role: string; error_code: string | null }>
        >`
          SELECT status, wall_ms, role, error_code
          FROM inference_telemetry
          WHERE run_id = ${runId}
          ORDER BY created_at ASC
        `;
        expect(rows.length, JSON.stringify(rows)).toBeGreaterThanOrEqual(1);
        const row = rows[0]!;
        expect(row.status).toBe('error');
        expect(row.wall_ms).toBeGreaterThan(0);
        expect(row.role).toBe('rerank');
        expect(row.error_code).toBeTruthy();
        console.log(JSON.stringify({ tc: 'TC-4', runId, row, message: roleErr.message }));
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    FLEET_TIMEOUT_MS
  );

  it('bypass guard still passes after adding rerank client', () => {
    const scan = scanFleetClientBypass({ srcRoot: SRC_ROOT });
    expect(scan.ok, JSON.stringify(scan.violations)).toBe(true);
    expect(scan.violations).toEqual([]);
  });
});
