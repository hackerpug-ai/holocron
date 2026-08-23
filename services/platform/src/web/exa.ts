/**
 * Exa web provider — search + contents/read.
 * Always requests date/author via contents; absent → null. Records costDollars when present.
 */
import { randomUUID } from 'node:crypto';
import { getSecretValue } from '../config/secrets.ts';
import type { WebCallLedger } from '../research/web-call-ledger.ts';
import { pickProviderDate } from './dates.ts';
import {
  fetchWithRetry,
  WEB_FETCH_NOT_OK,
  WEB_PROVIDER_HTTP_ERROR,
  WEB_PROVIDER_UNCONFIGURED,
  webError,
} from './http.ts';
import type { FetchedDocument, SearchHit, WebCallRecord, WebProviderName } from './types.ts';

const PROVIDER: WebProviderName = 'exa';
const SEARCH_URL = 'https://api.exa.ai/search';
const CONTENTS_URL = 'https://api.exa.ai/contents';
const SEARCH_TIMEOUT_MS = 20_000;
const READ_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveApiKey(): string {
  const key = getSecretValue('EXA_API_KEY');
  if (!key) throw webError(WEB_PROVIDER_UNCONFIGURED, 'EXA_API_KEY missing');
  return key;
}

function parseCostUsd(payload: unknown): number | null {
  if (!isRecord(payload)) return null;
  const cost = payload.costDollars;
  if (typeof cost === 'number' && Number.isFinite(cost)) return cost;
  if (isRecord(cost) && typeof cost.total === 'number' && Number.isFinite(cost.total)) {
    return cost.total;
  }
  return null;
}

export type ExaSearchOutcome = {
  hits: SearchHit[];
  call: WebCallRecord;
};

export type ExaReadOutcome = {
  document: FetchedDocument;
  call: WebCallRecord;
};

export async function exaSearch(opts: {
  query: string;
  runId: string;
  signal?: AbortSignal;
  ledger?: WebCallLedger;
  numResults?: number;
}): Promise<ExaSearchOutcome> {
  const apiKey = resolveApiKey();
  const requestUrl = SEARCH_URL;
  const executedAt = new Date().toISOString();
  const webCallId = randomUUID();
  const body = JSON.stringify({
    query: opts.query,
    numResults: opts.numResults ?? 5,
    type: 'auto',
    // Always request text + freshness so publishedDate/author can populate.
    contents: {
      text: { maxCharacters: 2000 },
      livecrawl: 'fallback',
    },
  });

  let httpStatus = 0;
  let latencyMs = 0;
  let hits: SearchHit[] = [];
  let errorCode: string | null = null;
  let bytes = 0;
  let costUsd: number | null = null;

  try {
    const result = await fetchWithRetry(requestUrl, {
      timeoutMs: SEARCH_TIMEOUT_MS,
      signal: opts.signal,
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });
    httpStatus = result.response.status;
    latencyMs = result.latencyMs;
    bytes = Buffer.byteLength(result.bodyText, 'utf8');

    if (!result.response.ok) {
      errorCode = WEB_PROVIDER_HTTP_ERROR;
      throw webError(WEB_PROVIDER_HTTP_ERROR, `HTTP ${httpStatus} from api.exa.ai`);
    }

    const payload: unknown = JSON.parse(result.bodyText);
    costUsd = parseCostUsd(payload);
    const results = isRecord(payload) && Array.isArray(payload.results) ? payload.results : [];
    const mapped: SearchHit[] = [];

    for (const raw of results) {
      if (!isRecord(raw)) continue;
      const url = typeof raw.url === 'string' ? raw.url : '';
      const title = typeof raw.title === 'string' ? raw.title : '';
      if (!url || !title) continue;

      const text = typeof raw.text === 'string' ? raw.text : '';
      const publishedAt = pickProviderDate({
        publishedDate: raw.publishedDate,
        publishedAt: raw.publishedAt,
        date: raw.date,
      });

      mapped.push({
        url,
        title,
        snippet: text.slice(0, 280),
        inlineContent: text.length > 0 ? text : null,
        publishedAt, // string | null — never undefined
        httpStatus: 200,
        provider: PROVIDER,
        costUsd,
        webCallId,
      });
    }
    hits = mapped;
  } catch (err) {
    if (!errorCode && err instanceof Error) {
      errorCode = err.message.split(':')[0] ?? 'WEB_PROVIDER_HTTP_ERROR';
    }
    throw err;
  } finally {
    const call: WebCallRecord = {
      webCallId,
      runId: opts.runId,
      provider: PROVIDER,
      capability: 'search',
      requestUrl,
      httpStatus,
      latencyMs,
      costUsd,
      executedAt,
    };
    if (opts.ledger) {
      await opts.ledger.record({
        call,
        query: opts.query,
        resultCount: hits.length,
        bytes,
        errorCode,
      });
    }
  }

  return {
    hits,
    call: {
      webCallId,
      runId: opts.runId,
      provider: PROVIDER,
      capability: 'search',
      requestUrl,
      httpStatus,
      latencyMs,
      costUsd,
      executedAt,
    },
  };
}

export async function exaRead(opts: {
  url: string;
  runId: string;
  signal?: AbortSignal;
  ledger?: WebCallLedger;
}): Promise<ExaReadOutcome> {
  const apiKey = resolveApiKey();
  const requestUrl = CONTENTS_URL;
  const executedAt = new Date().toISOString();
  const webCallId = randomUUID();
  const body = JSON.stringify({
    urls: [opts.url],
    text: { maxCharacters: 50_000 },
    livecrawl: 'fallback',
  });

  let httpStatus = 0;
  let latencyMs = 0;
  let errorCode: string | null = null;
  let bytes = 0;
  let costUsd: number | null = null;
  let document: FetchedDocument | null = null;

  try {
    const result = await fetchWithRetry(requestUrl, {
      timeoutMs: READ_TIMEOUT_MS,
      signal: opts.signal,
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });
    httpStatus = result.response.status;
    latencyMs = result.latencyMs;
    bytes = Buffer.byteLength(result.bodyText, 'utf8');

    if (!result.response.ok) {
      errorCode = WEB_PROVIDER_HTTP_ERROR;
      throw webError(WEB_PROVIDER_HTTP_ERROR, `HTTP ${httpStatus} from api.exa.ai/contents`);
    }

    const payload: unknown = JSON.parse(result.bodyText);
    costUsd = parseCostUsd(payload);
    const results = isRecord(payload) && Array.isArray(payload.results) ? payload.results : [];
    const raw = results[0];
    if (!isRecord(raw)) {
      // Check statuses for crawl failures / 404-like outcomes.
      const statuses = isRecord(payload) && Array.isArray(payload.statuses) ? payload.statuses : [];
      const st = statuses[0];
      const tag =
        isRecord(st) && typeof st.error === 'string'
          ? st.error
          : isRecord(st) && typeof st.status === 'string'
            ? st.status
            : 'missing';
      errorCode = WEB_FETCH_NOT_OK;
      throw webError(WEB_FETCH_NOT_OK, `contents ${tag} for ${opts.url}`);
    }

    const finalUrl = typeof raw.url === 'string' ? raw.url : opts.url;
    const sourceText = typeof raw.text === 'string' ? raw.text : '';
    if (!sourceText) {
      errorCode = WEB_FETCH_NOT_OK;
      throw webError(WEB_FETCH_NOT_OK, `empty content for ${finalUrl}`);
    }

    document = {
      url: opts.url,
      finalUrl,
      title: typeof raw.title === 'string' ? raw.title : '',
      sourceText,
      publishedAt: pickProviderDate({
        publishedDate: raw.publishedDate,
        publishedAt: raw.publishedAt,
        date: raw.date,
      }),
      httpStatus: 200,
      provider: PROVIDER,
      webCallId,
      costUsd,
      retrievedAt: executedAt,
      acquisition: 'read',
    };
  } catch (err) {
    if (!errorCode && err instanceof Error) {
      errorCode = err.message.split(':')[0] ?? 'WEB_PROVIDER_HTTP_ERROR';
    }
    throw err;
  } finally {
    const call: WebCallRecord = {
      webCallId,
      runId: opts.runId,
      provider: PROVIDER,
      capability: 'read',
      requestUrl,
      httpStatus,
      latencyMs,
      costUsd,
      executedAt,
    };
    if (opts.ledger) {
      await opts.ledger.record({
        call,
        url: opts.url,
        resultCount: document ? 1 : 0,
        bytes,
        errorCode,
      });
    }
  }

  if (!document) {
    throw webError(WEB_FETCH_NOT_OK, `read failed for ${opts.url}`);
  }

  return {
    document,
    call: {
      webCallId,
      runId: opts.runId,
      provider: PROVIDER,
      capability: 'read',
      requestUrl,
      httpStatus,
      latencyMs,
      costUsd,
      executedAt,
    },
  };
}
