/**
 * WebProvider iface + Jina-primary / Exa-fallback ladder.
 *
 * Descend only on transport/quota (timeout, 429, 5xx, auth/unconfigured).
 * Zero results is honest — do NOT descend.
 * All rungs fail → WEB_PROVIDER_EXHAUSTED naming each cause.
 */
import type { WebCallLedger } from '../research/web-call-ledger.ts';
import { DocumentCache } from './cache.ts';
import { exaRead, exaSearch } from './exa.ts';
import {
  isTransportOrQuotaError,
  WEB_FETCH_NOT_OK,
  WEB_PROVIDER_EXHAUSTED,
  webError,
} from './http.ts';
import { jinaRead, jinaSearch } from './jina.ts';
import {
  type FetchedDocument,
  INLINE_CONTENT_MIN_CHARS as INLINE_MIN,
  type LadderCause,
  type LadderTraceEntry,
  type SearchHit,
  type SearchResult,
  type WebCallRecord,
  type WebProviderName,
} from './types.ts';

export type WebProvider = {
  readonly name: WebProviderName;
  search(opts: {
    query: string;
    runId: string;
    signal?: AbortSignal;
    ledger?: WebCallLedger;
  }): Promise<{ hits: SearchHit[]; call: WebCallRecord }>;
  read(opts: {
    url: string;
    runId: string;
    signal?: AbortSignal;
    ledger?: WebCallLedger;
  }): Promise<{ document: FetchedDocument; call: WebCallRecord }>;
};

export const jinaProvider: WebProvider = {
  name: 'jina',
  search: jinaSearch,
  read: jinaRead,
};

export const exaProvider: WebProvider = {
  name: 'exa',
  search: exaSearch,
  read: exaRead,
};

export type LadderOptions = {
  runId: string;
  signal?: AbortSignal;
  ledger?: WebCallLedger;
  providers?: WebProvider[];
};

function toCause(provider: WebProviderName, err: unknown): LadderCause {
  const message = err instanceof Error ? err.message : String(err);
  const code = message.split(':')[0] ?? 'WEB_PROVIDER_HTTP_ERROR';
  return { provider, code, message };
}

/**
 * Search with Jina → Exa ladder.
 * Returns empty hits without descending when the primary returns [].
 */
export async function ladderSearch(query: string, opts: LadderOptions): Promise<SearchResult> {
  const providers = opts.providers ?? [jinaProvider, exaProvider];
  const ladderTrace: LadderTraceEntry[] = [];
  const calls: WebCallRecord[] = [];
  const causes: LadderCause[] = [];

  for (const provider of providers) {
    try {
      const outcome = await provider.search({
        query,
        runId: opts.runId,
        signal: opts.signal,
        ledger: opts.ledger,
      });
      calls.push(outcome.call);

      if (outcome.hits.length === 0) {
        ladderTrace.push({
          provider: provider.name,
          capability: 'search',
          outcome: 'empty',
          resultCount: 0,
        });
        // Honest empty — do not descend.
        return {
          hits: [],
          calls,
          ladderTrace,
          provider: provider.name,
        };
      }

      ladderTrace.push({
        provider: provider.name,
        capability: 'search',
        outcome: 'ok',
        resultCount: outcome.hits.length,
      });
      return {
        hits: outcome.hits,
        calls,
        ladderTrace,
        provider: provider.name,
      };
    } catch (err) {
      const cause = toCause(provider.name, err);
      causes.push(cause);
      ladderTrace.push({
        provider: provider.name,
        capability: 'search',
        outcome: 'transport_error',
        cause,
      });
      if (!isTransportOrQuotaError(err)) {
        // Non-transport (e.g. programmer error) — fail closed immediately.
        throw err;
      }
      // Descend to next rung.
    }
  }

  const detail = causes.map((c) => `${c.provider}=${c.code}`).join('; ');
  throw webError(WEB_PROVIDER_EXHAUSTED, detail || 'no providers configured');
}

/**
 * Whether a search hit already carries enough inline content to skip a read.
 */
export function needsRead(hit: SearchHit, minChars: number = INLINE_MIN): boolean {
  const inline = hit.inlineContent;
  if (inline == null) return true;
  if (inline.length < minChars) return true;
  // Heuristic truncation markers.
  if (/\.\.\.\s*$/.test(inline) || /\[truncated\]/i.test(inline)) return true;
  return false;
}

/**
 * Conditional read: use inline content when sufficient; otherwise provider.read().
 */
export async function acquireDocument(
  hit: SearchHit,
  opts: LadderOptions & { cache?: DocumentCache }
): Promise<{
  document: FetchedDocument;
  call: WebCallRecord | null;
  acquisition: 'inline' | 'read';
}> {
  if (!needsRead(hit)) {
    const retrievedAt = new Date().toISOString();
    return {
      document: {
        url: hit.url,
        finalUrl: hit.url,
        title: hit.title,
        sourceText: hit.inlineContent ?? '',
        publishedAt: hit.publishedAt,
        httpStatus: hit.httpStatus ?? 200,
        provider: hit.provider,
        webCallId: hit.webCallId,
        costUsd: hit.costUsd,
        retrievedAt,
        acquisition: 'inline',
      },
      call: null,
      acquisition: 'inline',
    };
  }

  const readOnce = async (): Promise<{ document: FetchedDocument; call: WebCallRecord }> => {
    const providers = opts.providers ?? [jinaProvider, exaProvider];
    // Prefer the hit's own provider first, then the rest of the ladder.
    const ordered = [
      ...providers.filter((p) => p.name === hit.provider),
      ...providers.filter((p) => p.name !== hit.provider),
    ];
    const causes: LadderCause[] = [];
    for (const provider of ordered) {
      try {
        return await provider.read({
          url: hit.url,
          runId: opts.runId,
          signal: opts.signal,
          ledger: opts.ledger,
        });
      } catch (err) {
        const cause = toCause(provider.name, err);
        causes.push(cause);
        if (
          !isTransportOrQuotaError(err) &&
          !(err instanceof Error && err.message.startsWith(`${WEB_FETCH_NOT_OK}:`))
        ) {
          throw err;
        }
        // For WEB_FETCH_NOT_OK on a specific URL, do not silently invent content —
        // try next provider once, then surface.
        if (err instanceof Error && err.message.startsWith(`${WEB_FETCH_NOT_OK}:`)) {
          // Still try fallback provider for transport-equivalent miss; if last, rethrow.
          if (provider === ordered[ordered.length - 1]) throw err;
          continue;
        }
        if (provider === ordered[ordered.length - 1]) {
          const detail = causes.map((c) => `${c.provider}=${c.code}`).join('; ');
          throw webError(WEB_PROVIDER_EXHAUSTED, detail);
        }
      }
    }
    throw webError(WEB_PROVIDER_EXHAUSTED, 'read ladder empty');
  };

  if (opts.cache) {
    // Cache shares in-flight promise per normalized URL; wrap to recover call metadata.
    // Call ledger still fires inside provider.read.
    const document = await opts.cache.get(hit.url);
    return { document, call: null, acquisition: 'read' };
  }

  const outcome = await readOnce();
  return { document: outcome.document, call: outcome.call, acquisition: 'read' };
}

export function createRunDocumentCache(opts: LadderOptions): DocumentCache {
  return new DocumentCache(async (url) => {
    const providers = opts.providers ?? [jinaProvider, exaProvider];
    const causes: LadderCause[] = [];
    for (const provider of providers) {
      try {
        const outcome = await provider.read({
          url,
          runId: opts.runId,
          signal: opts.signal,
          ledger: opts.ledger,
        });
        return outcome.document;
      } catch (err) {
        causes.push(toCause(provider.name, err));
        if (!isTransportOrQuotaError(err)) {
          if (err instanceof Error && err.message.startsWith(`${WEB_FETCH_NOT_OK}:`)) {
            throw err;
          }
          throw err;
        }
      }
    }
    const detail = causes.map((c) => `${c.provider}=${c.code}`).join('; ');
    throw webError(WEB_PROVIDER_EXHAUSTED, detail);
  });
}

export { INLINE_MIN as INLINE_CONTENT_MIN_CHARS };
