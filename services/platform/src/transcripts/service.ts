/**
 * Caption-fetch core for the `transcribe_video_url` tool
 * (imp-research-video-transcription-1787606941).
 *
 * Port of the retired Python YouTube-caption microservice: resolve a YouTube
 * video's caption track and return plain-text captions with no API key and no
 * third-party transcription call.
 *
 * kb: no fallback for caption-less videos — a video with no captions returns a
 *     clean NO_CAPTIONS result (upgrade path = add the existing Deepgram helper
 *     in queue/jobs-handlers/audio-transcript-job-processor.ts later).
 */

const WATCH_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export type CaptionKind = 'manual' | 'asr';

export type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind: CaptionKind;
};

export type CaptionMetadata = {
  videoId: string;
  language: string;
  kind: CaptionKind | 'unknown';
  wordCount: number;
  charCount: number;
  entryCount: number;
  preview: string;
};

export type TranscribeErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_HOST'
  | 'NO_CAPTIONS'
  | 'FETCH_FAILED'
  | 'PARSE_FAILED';

export type TranscribeOutcome =
  | { ok: true; transcript: string; metadata: CaptionMetadata }
  | { ok: false; error: TranscribeErrorCode; message: string };

/** Minimal fetch seam — the real global fetch satisfies this interface. */
export type HttpFetchResult = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

export type HttpFetch = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> }
) => Promise<HttpFetchResult>;

// ── URL validation (AC-3) ────────────────────────────────────────────

/**
 * True when a hostname resolves to loopback, a private range, or link-local.
 * Guards against SSRF: the tool fetches the caller-supplied URL, so it must
 * never be able to reach the host's own services.
 */
export function isLoopbackOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // RFC 1918
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
    if (a === 192 && b === 168) return true; // RFC 1918
    // Broadcast / multicast are not valid unicast targets.
    if (a === 255) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (host.includes(':')) {
    const norm = host;
    if (norm === '::' || norm === '::1') return true; // unspecified / loopback
    if (/^fe[89ab]/i.test(norm)) return true; // link-local
    if (/^f[cd]/i.test(norm)) return true; // unique-local (private)
    return false;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true; // mDNS / local-only
  }
  return false;
}

/** Strip query/fragment so caller secrets never surface in errors (AC-4). */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '***';
  }
}

function validatePublicUrl(
  raw: string
): { ok: true; url: URL } | { ok: false; error: TranscribeErrorCode; message: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'INVALID_URL', message: 'url is not parseable' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'INVALID_URL', message: 'url scheme must be http or https' };
  }
  if (isLoopbackOrPrivateHost(url.hostname)) {
    return {
      ok: false,
      error: 'INVALID_URL',
      message: 'url resolves to a loopback, private, or link-local host',
    };
  }
  return { ok: true, url };
}

// ── video id extraction ──────────────────────────────────────────────

const YT_HOSTS = /(^|\.)youtube\.com$|^youtube\.nocookie\.com$|^youtu\.be$/i;

/** Extract a YouTube video id from the supported URL forms, else null. */
export function extractVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (!YT_HOSTS.test(host)) return null;
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  }
  const path = url.pathname;
  const segs = path.split('/').filter(Boolean);
  if (segs[0] === 'embed' || segs[0] === 'shorts' || segs[0] === 'v' || segs[0] === 'live') {
    const id = segs[1];
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  }
  if (path === '/watch') {
    const id = url.searchParams.get('v');
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  }
  return null;
}

// ── caption-track resolution ─────────────────────────────────────────

/**
 * Extract `ytInitialPlayerResponse` JSON from a watch page via brace matching
 * (nested objects make a naive non-greedy regex insufficient).
 */
function extractYtInitialPlayerResponse(html: string): unknown {
  const marker = 'ytInitialPlayerResponse';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const eq = html.indexOf('=', idx);
  if (eq === -1) return null;
  const start = html.indexOf('{', eq);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseCaptionTracks(html: string): CaptionTrack[] {
  const json = extractYtInitialPlayerResponse(html);
  if (!json || typeof json !== 'object') return [];
  const captions = (json as { captions?: unknown }).captions;
  const renderer = (captions as { playerCaptionsTracklistRenderer?: unknown })
    ?.playerCaptionsTracklistRenderer;
  const tracks = (renderer as { captionTracks?: unknown[] } | undefined)?.captionTracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.flatMap((t) => {
    if (!t || typeof t !== 'object') return [];
    const baseUrl = (t as { baseUrl?: unknown }).baseUrl;
    if (typeof baseUrl !== 'string' || baseUrl.length === 0) return [];
    const languageCode = (t as { languageCode?: unknown }).languageCode;
    const kind = (t as { kind?: unknown }).kind;
    return [
      {
        baseUrl,
        languageCode: typeof languageCode === 'string' ? languageCode : '',
        kind: kind === 'asr' ? 'asr' : 'manual',
      },
    ];
  });
}

/** Prefer manual English, then ASR English, then any manual, then any ASR. */
function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack {
  const manualEn = tracks.find((t) => t.kind === 'manual' && t.languageCode === 'en');
  if (manualEn) return manualEn;
  const asrEn = tracks.find((t) => t.kind === 'asr' && t.languageCode === 'en');
  if (asrEn) return asrEn;
  const manual = tracks.find((t) => t.kind === 'manual');
  if (manual) return manual;
  const asr = tracks.find((t) => t.kind === 'asr');
  if (asr) return asr;
  return tracks[0];
}

// ── caption-track parsing ────────────────────────────────────────────

function decodeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
}

function parseCaptionTrack(raw: string): { lines: string[] } | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    // XML timedtext: <text ...>line</text>
    const lines: string[] = [];
    for (const m of trimmed.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)) {
      const text = decodeXml((m[1] ?? '').replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
      if (text) lines.push(text);
    }
    return lines.length > 0 ? { lines } : null;
  }
  // JSON3: {"events":[{"segs":[{"utf8":"text"}]}]}
  try {
    const json = JSON.parse(trimmed) as {
      events?: Array<{ segs?: Array<{ utf8?: string }> }>;
    };
    const events = Array.isArray(json.events) ? json.events : [];
    const lines: string[] = [];
    for (const ev of events) {
      const segs = Array.isArray(ev.segs) ? ev.segs : [];
      const text = segs
        .map((s) => (typeof s.utf8 === 'string' ? s.utf8 : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) lines.push(text);
    }
    return lines.length > 0 ? { lines } : null;
  } catch {
    return null;
  }
}

// ── public API ───────────────────────────────────────────────────────

const defaultFetch: HttpFetch = (url, init) =>
  fetch(url, { signal: init?.signal, headers: init?.headers });

export async function transcribeVideoUrl(
  rawUrl: string,
  opts?: { fetchFn?: HttpFetch; signal?: AbortSignal }
): Promise<TranscribeOutcome> {
  const fetchFn = opts?.fetchFn ?? defaultFetch;

  const validation = validatePublicUrl(rawUrl);
  if (!validation.ok) return validation;

  const videoId = extractVideoId(validation.url);
  if (!videoId) {
    return {
      ok: false,
      error: 'UNSUPPORTED_HOST',
      message: 'could not extract a YouTube video id from the provided URL',
    };
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let page: HttpFetchResult;
  try {
    page = await fetchFn(watchUrl, {
      signal: opts?.signal,
      headers: { 'user-agent': WATCH_USER_AGENT },
    });
  } catch {
    return { ok: false, error: 'FETCH_FAILED', message: 'could not fetch the watch page' };
  }
  if (!page.ok) {
    return {
      ok: false,
      error: 'FETCH_FAILED',
      message: `watch page fetch failed (HTTP ${page.status})`,
    };
  }

  const tracks = parseCaptionTracks(await page.text());
  if (tracks.length === 0) {
    return { ok: false, error: 'NO_CAPTIONS', message: 'this video has no captions available' };
  }
  const track = pickCaptionTrack(tracks);

  let trackResp: HttpFetchResult;
  try {
    trackResp = await fetchFn(track.baseUrl, {
      signal: opts?.signal,
      headers: { 'user-agent': WATCH_USER_AGENT },
    });
  } catch {
    return { ok: false, error: 'FETCH_FAILED', message: 'could not fetch the caption track' };
  }
  if (!trackResp.ok) {
    return {
      ok: false,
      error: 'FETCH_FAILED',
      message: `caption track fetch failed (HTTP ${trackResp.status})`,
    };
  }

  const parsed = parseCaptionTrack(await trackResp.text());
  if (!parsed) {
    return { ok: false, error: 'PARSE_FAILED', message: 'could not parse the caption track' };
  }

  const transcript = parsed.lines.join('\n');
  const metadata: CaptionMetadata = {
    videoId,
    language: track.languageCode,
    kind: track.kind,
    wordCount: transcript.split(/\s+/).filter(Boolean).length,
    charCount: transcript.length,
    entryCount: parsed.lines.length,
    preview: transcript.slice(0, 500),
  };
  return { ok: true, transcript, metadata };
}
