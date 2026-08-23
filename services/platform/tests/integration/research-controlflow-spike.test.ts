/**
 * R-00 — Wave 0 control-flow spike against real PostgresStore (Mastra 1.50.1).
 *
 * Proves .dountil, .foreach({ concurrency }), bail(), cancel()/abortSignal,
 * and ~100KB state snapshot persistence into mastra_workflow_snapshot.
 *
 * Fail-closed: beforeAll THROWS if PLATFORM_IT unset, Postgres unreachable,
 * or DATABASE_URL does not target holocron_nonprod. No it.skip / itLive.
 *
 * Run:
 *   PLATFORM_IT=1 \
 *   DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   FLEET_URL=http://127.0.0.1:4545/v1 \
 *   pnpm vitest run --project integration \
 *     services/platform/tests/integration/research-controlflow-spike.test.ts
 */
import { connect as netConnect } from 'node:net';
import { Mastra } from '@mastra/core/mastra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client';
import { createStorage } from '../../src/mastra';
import {
  clearIterationCounts,
  createBailSpikeWorkflow,
  createDountilSpikeWorkflow,
  createForeachSpikeWorkflow,
  createSnapshotSpikeWorkflow,
  ensureSpikeSidefxTable,
  getIterationCounts,
  SPIKE_SIDEFX_TABLE,
  setSpikeSql,
} from '../../src/research/__spike__/controlflow.spike';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PREFIX = `r00-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function assertNonprodUrl(url: string): void {
  let pathname = '';
  try {
    pathname = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL: ${url}`);
  }
  if (pathname !== 'holocron_nonprod' && !url.includes('holocron_nonprod')) {
    throw new Error(
      `DATABASE_URL must target holocron_nonprod (got pathname=${pathname || '<empty>'} url=${url})`
    );
  }
}

function parsePgUrl(url: string): { host: string; port: number } {
  const u = new URL(url);
  return { host: u.hostname || '127.0.0.1', port: u.port ? Number(u.port) : 5432 };
}

function probePostgresTcp(url: string, timeoutMs = 2000): Promise<void> {
  const { host, port } = parsePgUrl(url);
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Postgres TCP timeout ${host}:${port}`));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Postgres unreachable at ${host}:${port}: ${err.message}`));
    });
  });
}

function maxOverlap(intervals: Array<{ startedAt: number; finishedAt: number }>): number {
  const events: Array<{ t: number; d: number }> = [];
  for (const iv of intervals) {
    events.push({ t: iv.startedAt, d: 1 });
    events.push({ t: iv.finishedAt, d: -1 });
  }
  events.sort((a, b) => (a.t === b.t ? a.d - b.d : a.t - b.t));
  let cur = 0;
  let max = 0;
  for (const e of events) {
    cur += e.d;
    if (cur > max) max = cur;
  }
  return max;
}

describe('R-00 research controlflow spike (Mastra 1.50.1 + PostgresStore)', () => {
  let sql: Sql;
  let mastra: Mastra;
  let storage: ReturnType<typeof createStorage>;

  beforeAll(async () => {
    if (!PLATFORM_IT) {
      throw new Error('PLATFORM_IT=1 required for R-00 controlflow spike — refusing skip-to-green');
    }
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL required for R-00 controlflow spike');
    }
    assertNonprodUrl(DATABASE_URL);
    await probePostgresTcp(DATABASE_URL);

    sql = createSql(DATABASE_URL, { max: 4 });
    setSpikeSql(sql);
    await ensureSpikeSidefxTable(sql);

    storage = createStorage();
    mastra = new Mastra({
      storage,
      workflows: {
        dountilSpike: createDountilSpikeWorkflow(),
        foreachSpike: createForeachSpikeWorkflow(),
        bailSpike: createBailSpikeWorkflow(),
        snapshotSpike: createSnapshotSpikeWorkflow(),
      },
    });
  }, 30_000);

  afterAll(async () => {
    try {
      if (sql) {
        await sql`DELETE FROM ${sql(SPIKE_SIDEFX_TABLE)} WHERE prefix LIKE ${`${PREFIX}%`}`;
        await sql`DELETE FROM mastra_workflow_snapshot WHERE run_id LIKE ${`${PREFIX}%`}`;
        await sql.end({ timeout: 5 });
      }
    } finally {
      setSpikeSql(undefined);
      if (mastra) {
        await Promise.race([
          mastra.shutdown(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('mastra.shutdown timed out')), 15_000)
          ),
        ]).catch(() => undefined);
      }
    }
  }, 30_000);

  it('AC-1: dountil runs exactly 3 iterations and records iterationCount sequence', async () => {
    const prefix = `${PREFIX}-dountil`;
    clearIterationCounts(prefix);

    const wf = mastra.getWorkflow('dountilSpike');
    const run = await wf.createRun({ runId: `${prefix}-run` });
    const result = await run.start({
      inputData: { prefix, n: 0, stop: false },
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    const out = result.result as {
      n: number;
      stop: boolean;
      iterationCounts: number[];
    };
    expect(out.n).toBe(3);
    expect(out.stop).toBe(true);

    const recorded = getIterationCounts(prefix);
    expect(recorded, `iterationCount sequence observed=${JSON.stringify(recorded)}`).toHaveLength(
      3
    );
    // Mastra 1.50.1 dountil condition receives 1-based iterationCount: [1, 2, 3].
    expect(
      recorded,
      `AC-1 observed iterationCount sequence (1-based): ${JSON.stringify(recorded)}`
    ).toEqual([1, 2, 3]);
    expect(out.iterationCounts).toEqual([1, 2, 3]);
    // eslint-disable-next-line no-console
    console.log(`AC-1 iterationCount sequence (1-based)=${JSON.stringify(recorded)}`);
  }, 60_000);

  it('AC-2: foreach concurrency≤2 and output order matches input order', async () => {
    const prefix = `${PREFIX}-foreach`;
    const wf = mastra.getWorkflow('foreachSpike');
    const run = await wf.createRun({ runId: `${prefix}-run` });
    const result = await run.start({
      inputData: { prefix, count: 6, sleepMs: 250 },
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    const items = result.result as Array<{
      i: number;
      startedAt: number;
      finishedAt: number;
      abortObserved: boolean;
    }>;
    expect(items).toHaveLength(6);
    expect(items.map((x) => x.i)).toEqual([0, 1, 2, 3, 4, 5]);

    const overlap = maxOverlap(items);
    expect(
      overlap,
      `max overlapping foreach intervals was ${overlap} (stamps=${JSON.stringify(items)})`
    ).toBeLessThanOrEqual(2);
    expect(overlap).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('AC-3: cancel mid-foreach — abortSignal observed OR documented limitation', async () => {
    const prefix = `${PREFIX}-foreach-abort`;
    const wf = mastra.getWorkflow('foreachSpike');
    const run = await wf.createRun({ runId: `${prefix}-run` });

    const startPromise = run.start({
      inputData: { prefix, count: 6, sleepMs: 400 },
    });

    // Let at least one concurrent child enter its sleep window.
    await new Promise((r) => setTimeout(r, 150));
    await run.cancel();

    const result = await startPromise;

    const sidefxRows = await sql`
      SELECT payload->>'i' AS i, (payload->>'abortObserved')::boolean AS abort_observed
      FROM ${sql(SPIKE_SIDEFX_TABLE)}
      WHERE prefix = ${prefix} AND kind = 'foreach-child'
      ORDER BY (payload->>'i')::int ASC
    `;
    const fromResult =
      result && 'result' in result && Array.isArray(result.result)
        ? (result.result as Array<{ i: number; abortObserved: boolean }>)
        : undefined;
    const items =
      fromResult ??
      sidefxRows.map((row) => ({
        i: Number(row.i),
        abortObserved: Boolean(row.abort_observed),
      }));

    const abortObservedCount = items.filter((x) => x.abortObserved).length;

    if (abortObservedCount > 0) {
      expect(abortObservedCount).toBeGreaterThan(0);
      expect(result.status === 'canceled' || result.status === 'success').toBe(true);
      // eslint-disable-next-line no-console
      console.log(
        `AC-3 abortObserved=${abortObservedCount}/${items.length} status=${result.status}`
      );
    } else {
      // Durable limitation record: cancel completed but in-flight children did not
      // observe abortSignal.aborted under Mastra 1.50.1 process-local cancel().
      expect(
        items.every((x) => x.abortObserved === false),
        `AC-3 LIMITATION: cancel finished with status=${result.status}; abortObserved all false; items=${JSON.stringify(items)}`
      ).toBe(true);
      expect(
        ['canceled', 'success', 'failed'].includes(result.status),
        `AC-3 cancel completed with status=${result.status}`
      ).toBe(true);
      // eslint-disable-next-line no-console
      console.log(
        `AC-3 LIMITATION: abortObserved all false; cancel status=${result.status}; items=${items.length}`
      );
    }
  }, 60_000);

  it('AC-4: bail() yields recorded status + payload; downstream side-effect absent', async () => {
    const prefix = `${PREFIX}-bail`;
    await sql`DELETE FROM ${sql(SPIKE_SIDEFX_TABLE)} WHERE prefix = ${prefix}`;

    const wf = mastra.getWorkflow('bailSpike');
    const run = await wf.createRun({ runId: `${prefix}-run` });
    const result = await run.start({
      inputData: { prefix },
    });

    // Assert the ACTUAL status Mastra 1.50.1 records (observed: often remapped to 'success').
    const actualStatus = result.status;
    expect(
      actualStatus === 'bailed' || actualStatus === 'success',
      `AC-4 unexpected bail status=${actualStatus}; full=${JSON.stringify(result)}`
    ).toBe(true);

    const payload = (result as { result?: { reason?: string; payload?: { ok?: boolean } } }).result;

    expect(payload, `AC-4 bail status=${actualStatus}`).toBeTruthy();
    expect(payload).toMatchObject({ reason: 'replay', payload: { ok: true } });
    // eslint-disable-next-line no-console
    console.log(`AC-4 bail status=${actualStatus} payload=${JSON.stringify(payload)}`);

    const downstream = await sql`
      SELECT kind FROM ${sql(SPIKE_SIDEFX_TABLE)}
      WHERE prefix = ${prefix} AND kind = 'bail-downstream'
    `;
    expect(downstream, 'downstream side-effect must be absent after bail').toHaveLength(0);
  }, 60_000);

  it('AC-5: ~100KB dountil state persists >50_000 snapshot bytes', async () => {
    const prefix = `${PREFIX}-snapshot`;
    const runId = `${prefix}-run`;

    const wf = mastra.getWorkflow('snapshotSpike');
    const run = await wf.createRun({ runId });
    const result = await run.start({
      inputData: { prefix, n: 0, stop: false },
      initialState: { chunks: [] },
    });

    expect(result.status).toBe('success');

    const rows = await sql<{ bytes: number }[]>`
      SELECT pg_column_size(snapshot) AS bytes
      FROM mastra_workflow_snapshot
      WHERE run_id = ${runId}
    `;
    expect(rows.length).toBeGreaterThan(0);
    const bytes = Number(rows[0]?.bytes ?? 0);
    expect(bytes, `AC-5 measured snapshot bytes=${bytes} (need > 50000)`).toBeGreaterThan(50_000);
    // eslint-disable-next-line no-console
    console.log(`AC-5 measured snapshot bytes=${bytes}`);
  }, 90_000);
});
