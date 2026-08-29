/**
 * R-00 Wave 0 spike — factory builders for Mastra 1.50.1 control-flow proofs.
 *
 * Workflows (registered by tests onto a PostgresStore-backed Mastra):
 *   - dountilSpike   — loop until n === 3; record iterationCount sequence
 *   - foreachSpike   — 6 items @ concurrency 2 with wall-clock stamps + abortSignal
 *   - bailSpike      — first step bail(); downstream must not run
 *   - snapshotSpike  — 6-iter dountil appending ~17KB state per iter (~100KB ledger)
 *
 * Real z.object schemas only — never z.custom / z.any().
 */
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import type { Sql } from '../../db/client';

export const SPIKE_SIDEFX_TABLE = 'research_controlflow_spike_sidefx';

/** Process-local iterationCount ledger keyed by run prefix (loop condition has no setState). */
const iterationCountLedger = new Map<string, number[]>();

export function clearIterationCounts(prefix: string): void {
  iterationCountLedger.set(prefix, []);
}

export function getIterationCounts(prefix: string): number[] {
  return [...(iterationCountLedger.get(prefix) ?? [])];
}

function recordIterationCount(prefix: string, iterationCount: number): void {
  const existing = iterationCountLedger.get(prefix) ?? [];
  existing.push(iterationCount);
  iterationCountLedger.set(prefix, existing);
}

export async function ensureSpikeSidefxTable(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS research_controlflow_spike_sidefx (
      id bigserial PRIMARY KEY,
      prefix text NOT NULL,
      kind text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS research_controlflow_spike_sidefx_prefix_idx
    ON research_controlflow_spike_sidefx (prefix)
  `;
}

async function insertSidefx(
  sql: Sql | undefined,
  prefix: string,
  kind: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!sql) return;
  await sql`
    INSERT INTO research_controlflow_spike_sidefx (prefix, kind, payload)
    VALUES (${prefix}, ${kind}, ${sql.json(payload)})
  `;
}

// ── shared schemas ────────────────────────────────────────────
const dountilInputSchema = z.object({
  prefix: z.string().min(1),
  n: z.number().int().nonnegative(),
  stop: z.boolean(),
});

const dountilOutputSchema = z.object({
  prefix: z.string().min(1),
  n: z.number().int().nonnegative(),
  stop: z.boolean(),
  iterationCounts: z.array(z.number().int()),
});

const foreachInputSchema = z.object({
  prefix: z.string().min(1),
  count: z.number().int().positive(),
  sleepMs: z.number().int().positive(),
});

const foreachItemSchema = z.object({
  i: z.number().int().nonnegative(),
  prefix: z.string().min(1),
  sleepMs: z.number().int().positive(),
});

const foreachChildOutputSchema = z.object({
  i: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative(),
  abortObserved: z.boolean(),
});

const bailInputSchema = z.object({
  prefix: z.string().min(1),
});

const bailPayloadSchema = z.object({
  reason: z.literal('replay'),
  payload: z.object({ ok: z.literal(true) }),
});

const bailDownstreamOutputSchema = z.object({
  ran: z.literal(true),
  prefix: z.string().min(1),
});

const snapshotStateSchema = z.object({
  chunks: z.array(z.string()),
});

const PAD_CHUNK_BYTES = 17_000;

function makePadChunk(iteration: number): string {
  // High-entropy padding: JSONB compresses repetitive ASCII to near-nothing
  // (observed: 6×17KB of 'X' → ~2.6KB pg_column_size). Vary every byte.
  const chars: string[] = [];
  let seed = (iteration + 1) * 1_000_003;
  for (let i = 0; i < PAD_CHUNK_BYTES; i++) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    chars.push(String.fromCharCode(33 + (seed % 94)));
  }
  return chars.join('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Optional SQL handle for durable side-effects (bail downstream proof, foreach abort stamps).
 * Tests call setSpikeSql before runs that need DB side-effects.
 */
let spikeSql: Sql | undefined;

export function setSpikeSql(sql: Sql | undefined): void {
  spikeSql = sql;
}

// ── a) dountilSpike ───────────────────────────────────────────
export function createDountilSpikeWorkflow() {
  const loopStep = createStep({
    id: 'dountil-loop',
    inputSchema: dountilInputSchema,
    outputSchema: dountilOutputSchema,
    execute: async ({ inputData }) => {
      const n = inputData.n + 1;
      const stop = n === 3;
      return {
        prefix: inputData.prefix,
        n,
        stop,
        // Placeholder — finalize step rewrites from the condition ledger after the loop ends.
        iterationCounts: [],
      };
    },
  });

  const finalizeStep = createStep({
    id: 'dountil-finalize',
    inputSchema: dountilOutputSchema,
    outputSchema: dountilOutputSchema,
    execute: async ({ inputData }) => ({
      ...inputData,
      iterationCounts: getIterationCounts(inputData.prefix),
    }),
  });

  return createWorkflow({
    id: 'dountil-spike',
    inputSchema: dountilInputSchema,
    outputSchema: dountilOutputSchema,
  })
    .dountil(loopStep, async ({ inputData, iterationCount }) => {
      const prefix = inputData?.prefix;
      if (typeof prefix === 'string' && prefix.length > 0) {
        recordIterationCount(prefix, iterationCount);
      }
      // dountil: condition true → stop looping
      return Boolean(inputData?.stop) || (inputData?.n ?? 0) >= 3;
    })
    .then(finalizeStep)
    .commit();
}

// ── b) foreachSpike ───────────────────────────────────────────
export function createForeachSpikeWorkflow() {
  const seedStep = createStep({
    id: 'foreach-seed',
    inputSchema: foreachInputSchema,
    outputSchema: z.array(foreachItemSchema),
    execute: async ({ inputData }) => {
      return Array.from({ length: inputData.count }, (_, i) => ({
        i,
        prefix: inputData.prefix,
        sleepMs: inputData.sleepMs,
      }));
    },
  });

  const childStep = createStep({
    id: 'foreach-child',
    inputSchema: foreachItemSchema,
    outputSchema: foreachChildOutputSchema,
    execute: async ({ inputData, abortSignal }) => {
      const startedAt = Date.now();
      await sleep(inputData.sleepMs);
      const finishedAt = Date.now();
      const abortObserved = Boolean(abortSignal?.aborted);
      const out = {
        i: inputData.i,
        startedAt,
        finishedAt,
        abortObserved,
      };
      await insertSidefx(spikeSql, inputData.prefix, 'foreach-child', out);
      return out;
    },
  });

  return createWorkflow({
    id: 'foreach-spike',
    inputSchema: foreachInputSchema,
    outputSchema: z.array(foreachChildOutputSchema),
  })
    .then(seedStep)
    .foreach(childStep, { concurrency: 2 })
    .commit();
}

// ── c) bailSpike ──────────────────────────────────────────────
export function createBailSpikeWorkflow() {
  const bailStep = createStep({
    id: 'bail-first',
    inputSchema: bailInputSchema,
    outputSchema: bailPayloadSchema,
    execute: async ({ bail }) => {
      return bail({ reason: 'replay' as const, payload: { ok: true as const } });
    },
  });

  const downstreamStep = createStep({
    id: 'bail-downstream',
    inputSchema: bailPayloadSchema,
    outputSchema: bailDownstreamOutputSchema,
    execute: async ({ inputData, getInitData }) => {
      const init = getInitData<{ prefix: string }>();
      const prefix = init?.prefix ?? 'unknown';
      await insertSidefx(spikeSql, prefix, 'bail-downstream', {
        ran: true,
        reason: inputData.reason,
      });
      return { ran: true as const, prefix };
    },
  });

  return createWorkflow({
    id: 'bail-spike',
    inputSchema: bailInputSchema,
    outputSchema: bailPayloadSchema,
  })
    .then(bailStep)
    .then(downstreamStep)
    .commit();
}

// ── d) snapshotSpike ──────────────────────────────────────────
export function createSnapshotSpikeWorkflow() {
  const loopStep = createStep({
    id: 'snapshot-loop',
    inputSchema: dountilInputSchema,
    outputSchema: dountilOutputSchema,
    stateSchema: snapshotStateSchema,
    execute: async ({ inputData, state, setState }) => {
      const n = inputData.n + 1;
      const prevChunks = state?.chunks ?? [];
      await setState({
        chunks: [...prevChunks, makePadChunk(n)],
      });
      return {
        prefix: inputData.prefix,
        n,
        stop: n >= 6,
        iterationCounts: [],
      };
    },
  });

  return createWorkflow({
    id: 'snapshot-spike',
    inputSchema: dountilInputSchema,
    outputSchema: dountilOutputSchema,
    stateSchema: snapshotStateSchema,
  })
    .dountil(loopStep, async ({ inputData }) => {
      return (inputData?.n ?? 0) >= 6;
    })
    .commit();
}
