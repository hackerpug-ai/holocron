/**
 * Fetch wrapper: timeout, backoff+jitter (max 3), abort, redacted errors.
 * Never include API keys in any error / log / thrown string.
 */

export const WEB_PROVIDER_TIMEOUT = 'WEB_PROVIDER_TIMEOUT';
export const WEB_PROVIDER_HTTP_ERROR = 'WEB_PROVIDER_HTTP_ERROR';
export const WEB_FETCH_NOT_OK = 'WEB_FETCH_NOT_OK';
export const WEB_PROVIDER_UNCONFIGURED = 'WEB_PROVIDER_UNCONFIGURED';
export const WEB_PROVIDER_EXHAUSTED = 'WEB_PROVIDER_EXHAUSTED';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
]);

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._\-+=/]+/gi,
  /x-api-key["'\s:=]+[A-Za-z0-9._\-+=/]+/gi,
  /api[_-]?key["'\s:=]+[A-Za-z0-9._\-+=/]+/gi,
  /jina_[A-Za-z0-9]+/gi,
  /exa-[A-Za-z0-9_-]+/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}

export function webError(code: string, detail: string): Error {
  return new Error(`${code}: ${redactSecrets(detail)}`);
}

/** Normalize URL for cache keys: lowercase host, drop fragment/trailing slash, strip tracking params. */
export function normalizeUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw.trim().toLowerCase();
  }
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  const kept = new URLSearchParams();
  for (const [k, v] of parsed.searchParams.entries()) {
    if (!TRACKING_PARAMS.has(k.toLowerCase())) kept.append(k, v);
  }
  const qs = kept.toString();
  parsed.search = qs ? `?${qs}` : '';
  let path = parsed.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  parsed.pathname = path;
  return parsed.toString();
}

export type FetchWithRetryOptions = {
  timeoutMs: number;
  signal?: AbortSignal;
  maxAttempts?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
};

export type FetchWithRetryResult = {
  response: Response;
  bodyText: string;
  latencyMs: number;
  attempts: number;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffMs(attempt: number): number {
  const base = 250 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 200);
  return base + jitter;
}

/**
 * Idempotent GET-friendly fetch with timeout + exponential backoff+jitter (max 3 attempts).
 * Throws WEB_PROVIDER_TIMEOUT / WEB_PROVIDER_HTTP_ERROR with redacted messages.
 */
export async function fetchWithRetry(
  url: string,
  opts: FetchWithRetryOptions
): Promise<FetchWithRetryResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const method = opts.method ?? 'GET';
  let lastError: Error | null = null;
  const started = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw webError(WEB_PROVIDER_TIMEOUT, 'aborted before attempt');
    }
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort(opts.signal?.reason);
    opts.signal?.addEventListener('abort', onOuterAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('timeout')), opts.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: opts.headers,
        body: opts.body,
        signal: controller.signal,
      });
      const bodyText = await response.text();
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onOuterAbort);

      if (isRetryableStatus(response.status) && attempt < maxAttempts - 1) {
        lastError = webError(
          WEB_PROVIDER_HTTP_ERROR,
          `HTTP ${response.status} from ${safeHost(url)}`
        );
        await sleep(backoffMs(attempt), opts.signal);
        continue;
      }

      return {
        response,
        bodyText,
        latencyMs: Date.now() - started,
        attempts: attempt + 1,
      };
    } catch (err) {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onOuterAbort);
      const msg = err instanceof Error ? err.message : String(err);
      const timedOut =
        msg.includes('timeout') ||
        (err instanceof Error && err.name === 'AbortError' && !opts.signal?.aborted);
      lastError = timedOut
        ? webError(WEB_PROVIDER_TIMEOUT, `timeout after ${opts.timeoutMs}ms (${safeHost(url)})`)
        : webError(WEB_PROVIDER_HTTP_ERROR, `${msg} (${safeHost(url)})`);
      if (attempt < maxAttempts - 1 && !opts.signal?.aborted) {
        await sleep(backoffMs(attempt), opts.signal);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? webError(WEB_PROVIDER_HTTP_ERROR, `exhausted retries (${safeHost(url)})`);
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown-host';
  }
}

/** True when a transport/quota failure should descend the ladder. */
export function isTransportOrQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  return (
    m.startsWith(`${WEB_PROVIDER_TIMEOUT}:`) ||
    m.startsWith(`${WEB_PROVIDER_HTTP_ERROR}:`) ||
    m.startsWith(`${WEB_PROVIDER_UNCONFIGURED}:`) ||
    /\bHTTP (401|403|429|5\d\d)\b/.test(m)
  );
}
