/**
 * Cell 5 — OTel trace
 *
 * Wires Observability with MastraStorageExporter over @mastra/pg,
 * runs one agent/workflow call, queries the trace store from Postgres —
 * asserts ≥1 span persisted.
 */
import type { Mastra } from '@mastra/core/mastra';

export interface OtelCellResult {
  ok: boolean;
  otelSpans?: number;
  traceId?: string;
  error?: string;
}

export async function runOtelCell(mastra: Mastra): Promise<OtelCellResult> {
  try {
    // The Mastra instance has Observability wired with MastraStorageExporter.
    // After the agent/workflow cells have run, spans should be persisted to Postgres.
    //
    // The MastraStorageExporter batches spans and flushes periodically.
    // We wait for the batch to flush, then query the observability domain.

    // Wait for the exporter's batch flush (maxBatchWaitMs default is ~5s)
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
