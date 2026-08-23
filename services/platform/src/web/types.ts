/** Shared web-acquisition types. publishedDate/publishedAt are present-or-null, never undefined. */

export type WebProviderName = 'jina' | 'exa';

export type WebCapability = 'search' | 'read';

export type WebCallRecord = {
  webCallId: string;
  runId: string;
  provider: WebProviderName;
  capability: WebCapability;
  requestUrl: string;
  httpStatus: number;
  latencyMs: number;
  costUsd: number | null;
  executedAt: string;
};

export type CapturedSource = {
  sourceId: string;
  canonicalDomain: string;
  url: string;
  publishedDate: string | null;
  retrievedAt: string;
  sourceText: string;
  provider: WebProviderName;
  webCallId: string;
};

export type SearchHit = {
  url: string;
  title: string;
  snippet: string;
  inlineContent: string | null;
  publishedAt: string | null;
  httpStatus: number | null;
  provider: WebProviderName;
  costUsd: number | null;
  webCallId: string;
};

export type FetchedDocument = {
  url: string;
  finalUrl: string;
  title: string;
  sourceText: string;
  publishedAt: string | null;
  httpStatus: number;
  provider: WebProviderName;
  webCallId: string;
  costUsd: number | null;
  retrievedAt: string;
  acquisition: 'inline' | 'read';
};

export type LadderCause = {
  provider: WebProviderName;
  code: string;
  message: string;
};

export type LadderTraceEntry = {
  provider: WebProviderName;
  capability: WebCapability;
  outcome: 'ok' | 'empty' | 'transport_error';
  cause?: LadderCause;
  resultCount?: number;
};

export type SearchResult = {
  hits: SearchHit[];
  calls: WebCallRecord[];
  ladderTrace: LadderTraceEntry[];
  provider: WebProviderName | null;
};

export type ReadResult = {
  document: FetchedDocument;
  call: WebCallRecord;
};

/** Threshold for treating inline content as sufficient (chars). */
export const INLINE_CONTENT_MIN_CHARS = 1200;
