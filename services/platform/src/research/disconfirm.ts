/**
 * Code-templated disconfirmation probe.
 * Query string is authored HERE — never by a model.
 * Real ladderSearch; persist probe; disconfirmationResolved iff probe completed
 * without transport error.
 */
import { randomUUID } from 'node:crypto';
import type { Sql } from '../db/client.ts';
import { type LadderOptions, ladderSearch } from '../web/provider.ts';
import type { SearchHit, WebCallRecord } from '../web/types.ts';
import {
  createMemoryWebCallLedger,
  createWebCallLedger,
  type WebCallLedger,
} from './web-call-ledger.ts';

/** Canonical disconfirmation query template — grep-stable; not model-authored. */
export const DISCONFIRM_QUERY_TEMPLATE =
  '"{claim}" (criticism OR refuted OR retracted OR "failed to replicate" OR debunked OR "no evidence")' as const;

export function buildDisconfirmQuery(claimText: string): string {
  const claim = claimText.trim().replace(/"/g, "'");
  return DISCONFIRM_QUERY_TEMPLATE.replace('{claim}', claim);
}

export type DisconfirmProbeRecord = {
  probeId: string;
  runId: string;
  claimId: string;
  claimText: string;
  query: string;
  status: 'completed' | 'failed' | 'aborted';
  errorCode: string | null;
  hitCount: number;
  hits: Array<{ url: string; title: string; snippet: string }>;
  webCallIds: string[];
  completedAt: string;
};

export type DisconfirmResult = {
  probe: DisconfirmProbeRecord;
  /** True iff probe record exists and completed without transport error. */
  disconfirmationResolved: boolean;
  calls: WebCallRecord[];
};

export type DisconfirmProbeStore = {
  persist(probe: DisconfirmProbeRecord): Promise<void>;
  get(probeId: string): Promise<DisconfirmProbeRecord | undefined>;
  listByRun(runId: string): Promise<DisconfirmProbeRecord[]>;
};

/** In-memory probe store (also used when sql is unavailable). */
export function createMemoryDisconfirmProbeStore(): DisconfirmProbeStore & {
  rows: DisconfirmProbeRecord[];
} {
  const rows: DisconfirmProbeRecord[] = [];
  return {
    rows,
    async persist(probe) {
      const idx = rows.findIndex((r) => r.probeId === probe.probeId);
      if (idx >= 0) rows[idx] = probe;
      else rows.push(probe);
    },
    async get(probeId) {
      return rows.find((r) => r.probeId === probeId);
    },
    async listByRun(runId) {
      return rows.filter((r) => r.runId === runId);
    },
  };
}

/**
 * Persist probes into research_web_calls (call_kind=search, branchId=disconfirm)
 * plus an in-memory/index store for structured retrieval.
 */
export function createSqlDisconfirmProbeStore(
  sql: Sql,
  memory: DisconfirmProbeStore & {
    rows: DisconfirmProbeRecord[];
  } = createMemoryDisconfirmProbeStore()
): DisconfirmProbeStore & { rows: DisconfirmProbeRecord[] } {
  return {
    rows: memory.rows,
    async persist(probe) {
      await memory.persist(probe);
      // Durable breadcrumb: one web_calls row tagged as disconfirm probe.
      // session_id left null — probes are not mission sessions; branch_id carries
      // disconfirm:<claimId> and source_id carries claimId for retrieval.
      await sql`
        INSERT INTO research_web_calls (
          id,
          session_id,
          branch_id,
          provider,
          call_kind,
          query,
          http_status,
          result_count,
          error_code,
          source_id
        ) VALUES (
          ${probe.probeId}::uuid,
          ${null}::uuid,
          ${`disconfirm:${probe.claimId}`},
          ${'jina'},
          ${'search'},
          ${probe.query},
          ${probe.status === 'completed' ? 200 : null},
          ${probe.hitCount},
          ${probe.errorCode},
          ${probe.claimId}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    },
    async get(probeId) {
      return memory.get(probeId);
    },
    async listByRun(runId) {
      return memory.listByRun(runId);
    },
  };
}

export async function runDisconfirmationProbe(opts: {
  runId: string;
  claimId: string;
  claimText: string;
  signal?: AbortSignal;
  ledger?: WebCallLedger;
  store?: DisconfirmProbeStore;
  /** Test seam — inject search. */
  search?: (
    query: string,
    ladderOpts: LadderOptions
  ) => Promise<{ hits: SearchHit[]; calls: WebCallRecord[] }>;
}): Promise<DisconfirmResult> {
  const query = buildDisconfirmQuery(opts.claimText);
  // Grep proof: DISCONFIRM_QUERY_TEMPLATE lives in this file as a string literal.
  const probeId = randomUUID();
  const store = opts.store ?? createMemoryDisconfirmProbeStore();
  const ledger = opts.ledger ?? createMemoryWebCallLedger();
  const search = opts.search ?? ladderSearch;

  if (opts.signal?.aborted) {
    const probe: DisconfirmProbeRecord = {
      probeId,
      runId: opts.runId,
      claimId: opts.claimId,
      claimText: opts.claimText,
      query,
      status: 'aborted',
      errorCode: 'ABORT_SIGNAL',
      hitCount: 0,
      hits: [],
      webCallIds: [],
      completedAt: new Date().toISOString(),
    };
    await store.persist(probe);
    return { probe, disconfirmationResolved: false, calls: [] };
  }

  try {
    const result = await search(query, {
      runId: opts.runId,
      signal: opts.signal,
      ledger,
    });
    const probe: DisconfirmProbeRecord = {
      probeId,
      runId: opts.runId,
      claimId: opts.claimId,
      claimText: opts.claimText,
      query,
      status: 'completed',
      errorCode: null,
      hitCount: result.hits.length,
      hits: result.hits.slice(0, 10).map((h) => ({
        url: h.url,
        title: h.title,
        snippet: h.snippet,
      })),
      webCallIds: result.calls.map((c) => c.webCallId),
      completedAt: new Date().toISOString(),
    };
    await store.persist(probe);
    return {
      probe,
      disconfirmationResolved: true,
      calls: result.calls,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const aborted = opts.signal?.aborted || /abort/i.test(message) || message.includes('ABORT');
    const probe: DisconfirmProbeRecord = {
      probeId,
      runId: opts.runId,
      claimId: opts.claimId,
      claimText: opts.claimText,
      query,
      status: aborted ? 'aborted' : 'failed',
      errorCode: message.split(':')[0]?.slice(0, 120) ?? 'DISCONFIRM_SEARCH_FAILED',
      hitCount: 0,
      hits: [],
      webCallIds: [],
      completedAt: new Date().toISOString(),
    };
    await store.persist(probe);
    return { probe, disconfirmationResolved: false, calls: [] };
  }
}

export { createWebCallLedger };
