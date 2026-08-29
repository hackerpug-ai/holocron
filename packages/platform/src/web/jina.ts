/**
 * Jina web provider — search (s.jina.ai) + read (r.jina.ai).
 * Maps date AND publishedTime AND content AND httpStatus (unlike executor asJinaSearchItem).
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

const PROVIDER: WebProviderName = 'jina';
const SEARCH_TIMEOUT_MS = 20_000;
const READ_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveApiKey(): string {
  const key = getSecretValue('JINA_API_KEY');
  if (!key) throw webError(WEB_PROVIDER_UNCONFIGURED, 'JINA_API_KEY missing');
  return key;
}

function assertItemHttpOk(httpStatus: unknown, url: string): number {
  const status = typeof httpStatus === 'number' ? httpStatus : Number(httpStatus);
  if (!Number.isFinite(status) || status !== 200) {
    throw webError(WEB_FETCH_NOT_OK, `item httpStatus=${String(httpStatus)} for ${url}`);
  }
  return status;
}

export type JinaSearchOutcome = {
  hits: SearchHit[];
  call: WebCallRecord;
};

export type JinaReadOutcome = {
  document: FetchedDocument;
  call: WebCallRecord;
};

export async function jinaSearch(opts: {
  query: string;
  runId: string;
  signal?: AbortSignal;
  ledger?: WebCallLedger;
  num?: number;
}): Promise<JinaSearchOutcome> {
  const apiKey = resolveApiKey();
  const requestUrl = `https://s.jina.ai/?q=${encodeURIComponent(opts.query)}`;
  const executedAt = new Date().toISOString();
  const webCallId = randomUUID();

  let httpStatus = 0;
  let latencyMs = 0;
  let hits: SearchHit[] = [];
  let errorCode: string | null = null;
  let bytes = 0;

  try {
    const result = await fetchWithRetry(requestUrl, {
      timeoutMs: SEARCH_TIMEOUT_MS,
      signal: opts.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'X-Return-Format': 'json',
      },
    });
    httpStatus = result.response.status;
    latencyMs = result.latencyMs;
    bytes = Buffer.byteLength(result.bodyText, 'utf8');

    // Auth/quota/5xx = transport (ladder descends). Soft empty (e.g. 422 + no data)
    // is an honest zero-hit response — do not throw / do not descend.
    if (!result.response.ok) {
      const descend =
        httpStatus === 401 || httpStatus === 403 || httpStatus === 429 || httpStatus >= 500;
      if (descend) {
        errorCode = WEB_PROVIDER_HTTP_ERROR;
        throw webError(WEB_PROVIDER_HTTP_ERROR, `HTTP ${httpStatus} from s.jina.ai`);
      }
      // Non-descend soft failure: parse body if present; otherwise treat as [].
      let softData: unknown[] = [];
      try {
        const softPayload: unknown = JSON.parse(result.bodyText);
        softData = isRecord(softPayload) && Array.isArray(softPayload.data) ? softPayload.data : [];
      } catch {
        softData = [];
      }
      if (softData.length === 0) {
        hits = [];
        httpStatus = result.response.status;
      } else {
        errorCode = WEB_PROVIDER_HTTP_ERROR;
        throw webError(WEB_PROVIDER_HTTP_ERROR, `HTTP ${httpStatus} from s.jina.ai`);
      }
    } else {
      const payload: unknown = JSON.parse(result.bodyText);
      const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
      const limit = opts.num ?? data.length;
      const mapped: SearchHit[] = [];

      for (const raw of data.slice(0, limit)) {
        if (!isRecord(raw)) continue;
        const url = typeof raw.url === 'string' ? raw.url : '';
        const title = typeof raw.title === 'string' ? raw.title : '';
        if (!url || !title) continue;

        // Reject error pages at the search boundary — never become sources.
        try {
          assertItemHttpOk(raw.httpStatus, url);
        } catch (err) {
          if (err instanceof Error && err.message.startsWith(`${WEB_FETCH_NOT_OK}:`)) {
            continue;
          }
          throw err;
        }

        const content = typeof raw.content === 'string' ? raw.content : '';
        const description = typeof raw.description === 'string' ? raw.description : '';
        const publishedAt = pickProviderDate({
          publishedTime: raw.publishedTime,
          date: raw.date,
        });

        mapped.push({
          url,
          title,
          snippet: description || content.slice(0, 280),
          inlineContent: content.length > 0 ? content : null,
          publishedAt,
          httpStatus: 200,
          provider: PROVIDER,
          costUsd: null,
          webCallId,
        });
      }
      hits = mapped;
    }
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
      costUsd: null,
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

  const call: WebCallRecord = {
    webCallId,
    runId: opts.runId,
    provider: PROVIDER,
    capability: 'search',
    requestUrl,
    httpStatus,
    latencyMs,
    costUsd: null,
    executedAt,
  };
  return { hits, call };
}

export async function jinaRead(opts: {
  url: string;
  runId: string;
  signal?: AbortSignal;
  ledger?: WebCallLedger;
}): Promise<JinaReadOutcome> {
  const apiKey = resolveApiKey();
  const requestUrl = `https://r.jina.ai/${opts.url}`;
  const executedAt = new Date().toISOString();
  const webCallId = randomUUID();

  let httpStatus = 0;
  let latencyMs = 0;
  let errorCode: string | null = null;
  let bytes = 0;
  let document: FetchedDocument | null = null;

  try {
    const result = await fetchWithRetry(requestUrl, {
      timeoutMs: READ_TIMEOUT_MS,
      signal: opts.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'X-Return-Format': 'json',
      },
    });
    httpStatus = result.response.status;
    latencyMs = result.latencyMs;
    bytes = Buffer.byteLength(result.bodyText, 'utf8');

    // URL-level failures (404/422/etc.) are WEB_FETCH_NOT_OK — not ladder-descend transport errors.
    // Auth/quota (401/403/429) and 5xx remain WEB_PROVIDER_HTTP_ERROR so the ladder can descend.
    if (!result.response.ok) {
      const descend =
        httpStatus === 401 || httpStatus === 403 || httpStatus === 429 || httpStatus >= 500;
      errorCode = descend ? WEB_PROVIDER_HTTP_ERROR : WEB_FETCH_NOT_OK;
      throw webError(
        errorCode,
        descend ? `HTTP ${httpStatus} from r.jina.ai` : `HTTP ${httpStatus} fetching ${opts.url}`
      );
    }

    const payload: unknown = JSON.parse(result.bodyText);
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
    if (!data) {
      errorCode = WEB_FETCH_NOT_OK;
      throw webError(WEB_FETCH_NOT_OK, `empty data for ${opts.url}`);
    }

    const finalUrl = typeof data.url === 'string' ? data.url : opts.url;
    // Prefer explicit item httpStatus; fall back to transport 200 only when absent.
    const itemStatus = assertItemHttpOk(
      data.httpStatus !== undefined && data.httpStatus !== null ? data.httpStatus : 200,
      finalUrl
    );
    const sourceText = typeof data.content === 'string' ? data.content : '';
    if (!sourceText) {
      errorCode = WEB_FETCH_NOT_OK;
      throw webError(WEB_FETCH_NOT_OK, `empty content for ${finalUrl}`);
    }

    document = {
      url: opts.url,
      finalUrl,
      title: typeof data.title === 'string' ? data.title : '',
      sourceText,
      publishedAt: pickProviderDate({
        publishedTime: data.publishedTime,
        date: data.date,
      }),
      httpStatus: itemStatus,
      provider: PROVIDER,
      webCallId,
      costUsd: null,
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
      costUsd: null,
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

  const call: WebCallRecord = {
    webCallId,
    runId: opts.runId,
    provider: PROVIDER,
    capability: 'read',
    requestUrl,
    httpStatus,
    latencyMs,
    costUsd: null,
    executedAt,
  };
  return { document, call };
}
