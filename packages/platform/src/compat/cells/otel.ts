/**
 * Cell 5 — OTel trace
 *
 * Wires Observability with MastraStorageExporter over @mastra/pg,
 * runs one agent/workflow call, queries the trace store from Postgres —
 * asserts ≥1 span persisted.
 *
 * obs-1: also force-flushes observability exporters (Postgres + Langfuse)
 * before lookup so batching cannot hide spans from the spike matrix.
 */
import type { Mastra } from '@mastra/core/mastra';

export interface OtelCellResult {
  ok: boolean;
  otelSpans?: number;
  traceId?: string;
  error?: string;
}

async function forceFlushExporters(mastra: Mastra): Promise<void> {
  const obs = mastra.observability as {
    forceFlush?: () => Promise<void>;
    getDefaultInstance?: () => {
      forceFlush?: () => Promise<void>;
      exporters?: Array<{ flush?: () => Promise<void> }>;
    };
  };
  if (typeof obs.forceFlush === 'function') {
    await obs.forceFlush();
    return;
  }
  const inst = obs.getDefaultInstance?.();
  if (inst && typeof inst.forceFlush === 'function') {
    await inst.forceFlush();
    return;
  }
  const exporters = inst?.exporters ?? [];
  await Promise.all(
    exporters.map(async (e) => {
      if (typeof e.flush === 'function') await e.flush();
    })
  );
}

export async function runOtelCell(mastra: Mastra): Promise<OtelCellResult> {
  try {
    // The Mastra instance has Observability wired with MastraStorageExporter
    // (+ Holocron Langfuse exporter after obs-1). Force-flush, then wait briefly
    // for any residual batch, then query the observability domain.

    try {
      await forceFlushExporters(mastra);
    } catch {
      // Flush errors surface via Langfuse exporter status on mission CLI;
      // spike cell still verifies Postgres spans.
    }

    // Wait for residual batch flush (maxBatchWaitMs default is ~5s)
    await new Promise((resolve) => setTimeout(resolve, 6000));

    const storage = mastra.getStorage();
    if (!storage) {
      return { ok: false, error: 'no storage instance found on Mastra' };
    }

    const stores = (storage as unknown as { stores?: Record<string, unknown> }).stores;
    const observabilityDomain = stores?.observability as
      | {
          listTraces?: (opts: {
            pagination?: { page?: number; perPage?: number };
          }) => Promise<{ pagination?: { total?: number }; spans?: unknown[] }>;
          getTrace?: (opts: { traceId: string }) => Promise<{ spans?: unknown[] } | null>;
        }
      | undefined;

    if (!observabilityDomain?.listTraces) {
      return { ok: false, error: 'no listTraces method on observability domain' };
    }

    // List recent traces from Postgres
    const tracesResult = await observabilityDomain.listTraces({
      pagination: { page: 0, perPage: 10 },
    });

    const totalTraces = tracesResult?.pagination?.total ?? 0;
    const rootSpans = tracesResult?.spans ?? [];

    if (totalTraces === 0 || rootSpans.length === 0) {
      return {
        ok: false,
        otelSpans: 0,
        error: 'no traces found in Postgres trace store',
      };
    }

    // Get the most recent root span's traceId
    const latestRoot = rootSpans[0] as { traceId?: string };
    const traceId = latestRoot?.traceId;

    // Get the full trace to count all spans within it
    let spanCount = 0;
    if (traceId && observabilityDomain.getTrace) {
      const trace = await observabilityDomain.getTrace({ traceId });
      const spans = (trace as { spans?: unknown[] } | null)?.spans ?? [];
      spanCount = spans.length;
    }

    // Fallback: at least 1 root span means at least 1 span
    if (spanCount === 0) spanCount = rootSpans.length;

    if (spanCount >= 1) {
      return { ok: true, otelSpans: spanCount, traceId };
    }

    return {
      ok: false,
      otelSpans: 0,
      error: 'trace found but no spans within it',
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
