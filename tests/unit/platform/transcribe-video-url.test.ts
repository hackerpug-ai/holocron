/**
 * AC coverage for the `transcribe_video_url` tool core (imp-research-video-transcription-1787606941).
 *
 * AC-1 captioned video → caption text, no API key, no Deepgram call.
 * AC-2 caption-less video → clean "no captions" result, never crashes.
 * AC-3 URL validation — http/https allow-list + reject loopback/private/link-local.
 * AC-4 no secrets — error output never contains the caller's full URL.
 *
 * These tests exercise services/platform/src/transcripts/service.ts through an
 * injected fetch seam (deterministic — no network in the unit lane).
 */
import { describe, expect, it } from 'vitest';
import { getSchemasForAllConsumers, listTools } from '@/services/platform/src/tools/registry';
import {
  extractVideoId,
  type HttpFetch,
  isLoopbackOrPrivateHost,
  redactUrl,
  transcribeVideoUrl,
} from '@/services/platform/src/transcripts/service';

// ── fixtures ─────────────────────────────────────────────────────────

const WATCH_URL = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

function watchPageHtml(tracks: Array<{ baseUrl: string; languageCode: string; kind: string }>) {
  const captionTracks = tracks
    .map((t) => `{"baseUrl":"${t.baseUrl}","languageCode":"${t.languageCode}","kind":"${t.kind}"}`)
    .join(',');
  return `<!doctype html><html><body><script>
    var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[${captionTracks}]}}};
  </script></body></html>`;
}

const JSON3_TRACK = JSON.stringify({
  events: [{ segs: [{ utf8: 'Hello' }, { utf8: ' world' }] }, { segs: [{ utf8: 'Second line' }] }],
});

function jsonResponse(
  body: string,
  status = 200
): { ok: boolean; status: number; text(): Promise<string> } {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

function recordingFetch(routes: Record<string, string>): { fetchFn: HttpFetch; calls: string[] } {
  const calls: string[] = [];
  const fetchFn: HttpFetch = async (url) => {
    calls.push(url);
    const body = routes[url];
    if (body === undefined) return { ok: false, status: 404, text: async () => '' };
    return jsonResponse(body);
  };
  return { fetchFn, calls };
}

// ── AC-3: URL validation ─────────────────────────────────────────────

describe('isLoopbackOrPrivateHost', () => {
  it('rejects loopback IPv4', () => {
    expect(isLoopbackOrPrivateHost('127.0.0.1')).toBe(true);
    expect(isLoopbackOrPrivateHost('127.8.9.10')).toBe(true);
  });

  it('rejects private IPv4 ranges', () => {
    expect(isLoopbackOrPrivateHost('10.0.0.1')).toBe(true);
    expect(isLoopbackOrPrivateHost('172.16.0.1')).toBe(true);
    expect(isLoopbackOrPrivateHost('172.31.255.255')).toBe(true);
    expect(isLoopbackOrPrivateHost('192.168.1.1')).toBe(true);
  });

  it('rejects link-local IPv4', () => {
    expect(isLoopbackOrPrivateHost('169.254.169.254')).toBe(true);
  });

  it('rejects loopback / link-local / unique-local IPv6', () => {
    expect(isLoopbackOrPrivateHost('::1')).toBe(true);
    expect(isLoopbackOrPrivateHost('fe80::1')).toBe(true);
    expect(isLoopbackOrPrivateHost('fd00::1')).toBe(true);
  });

  it('rejects localhost hostnames', () => {
    expect(isLoopbackOrPrivateHost('localhost')).toBe(true);
    expect(isLoopbackOrPrivateHost('api.internal.local')).toBe(true);
  });

  it('accepts public hosts', () => {
    expect(isLoopbackOrPrivateHost('www.youtube.com')).toBe(false);
    expect(isLoopbackOrPrivateHost('youtu.be')).toBe(false);
    expect(isLoopbackOrPrivateHost('8.8.8.8')).toBe(false);
  });
});

describe('extractVideoId', () => {
  it('extracts from the common YouTube URL forms', () => {
    expect(extractVideoId(new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))).toBe(
      'dQw4w9WgXcQ'
    );
    expect(extractVideoId(new URL('https://youtu.be/dQw4w9WgXcQ'))).toBe('dQw4w9WgXcQ');
    expect(extractVideoId(new URL('https://www.youtube.com/embed/dQw4w9WgXcQ'))).toBe(
      'dQw4w9WgXcQ'
    );
    expect(extractVideoId(new URL('https://www.youtube.com/shorts/dQw4w9WgXcQ'))).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('returns null for a non-YouTube host', () => {
    expect(extractVideoId(new URL('https://example.com/watch?v=abc'))).toBeNull();
  });
});

describe('redactUrl', () => {
  it('strips query and fragment', () => {
    const redacted = redactUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s#foo');
    expect(redacted).not.toContain('dQw4w9WgXcQ');
    expect(redacted).not.toContain('t=10s');
    expect(redacted).toBe('https://www.youtube.com/watch');
  });
});

// ── tool wiring (registry identity across agent/workflow/mcp) ──────

describe('transcribe_video_url tool wiring', () => {
  it('is registered with a single shared schema instance across all consumers', () => {
    const ids = listTools().map((row) => row.id);
    expect(ids).toContain('transcribe_video_url');

    const { identity } = getSchemasForAllConsumers('transcribe_video_url');
    expect(identity).toBe(true);
  });
});

// ── AC-1 + AC-2: caption fetch core ──────────────────────────────────

describe('transcribeVideoUrl', () => {
  it('AC-1: returns caption text for a captioned video, no API key, no Deepgram', async () => {
    const trackUrl = 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en&fmt=json3';
    const routes: Record<string, string> = {
      [WATCH_URL('dQw4w9WgXcQ')]: watchPageHtml([
        { baseUrl: trackUrl, languageCode: 'en', kind: '' },
      ]),
      [trackUrl]: JSON3_TRACK,
    };
    const { fetchFn, calls } = recordingFetch(routes);

    const outcome = await transcribeVideoUrl('https://youtu.be/dQw4w9WgXcQ', { fetchFn });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.transcript).toContain('Hello world');
    expect(outcome.transcript).toContain('Second line');
    expect(outcome.metadata.videoId).toBe('dQw4w9WgXcQ');
    expect(outcome.metadata.language).toBe('en');
    expect(outcome.metadata.wordCount).toBeGreaterThan(0);
    expect(outcome.metadata.preview.length).toBeLessThanOrEqual(500);

    // No third-party call — only the watch page and the caption track (never Deepgram).
    expect(calls).toHaveLength(2);
    expect(calls.every((u) => !u.includes('deepgram'))).toBe(true);
  });

  it('AC-2: caption-less video returns a clean NO_CAPTIONS result, never crashes', async () => {
    const routes: Record<string, string> = {
      [WATCH_URL('nocaps1')]: watchPageHtml([]),
    };
    const { fetchFn } = recordingFetch(routes);

    const outcome = await transcribeVideoUrl('https://www.youtube.com/watch?v=nocaps1', {
      fetchFn,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.error).toBe('NO_CAPTIONS');
    expect(outcome.message).toMatch(/captions/i);
  });

  it('AC-3: rejects loopback / private / non-http URLs before any network call', async () => {
    const { fetchFn, calls } = recordingFetch({});

    const loopback = await transcribeVideoUrl('http://127.0.0.1/watch?v=abc', { fetchFn });
    expect(loopback.ok).toBe(false);
    if (loopback.ok) throw new Error('expected failure');
    expect(loopback.error).toBe('INVALID_URL');

    const privateHost = await transcribeVideoUrl('http://10.0.0.5/foo', { fetchFn });
    expect(privateHost.ok).toBe(false);
    if (privateHost.ok) throw new Error('expected failure');
    expect(privateHost.error).toBe('INVALID_URL');

    const ftp = await transcribeVideoUrl('ftp://www.youtube.com/watch?v=abc', { fetchFn });
    expect(ftp.ok).toBe(false);
    if (ftp.ok) throw new Error('expected failure');
    expect(ftp.error).toBe('INVALID_URL');

    // No network call was ever attempted.
    expect(calls).toHaveLength(0);
  });

  it('AC-4: error output never contains the caller full URL', async () => {
    const routes: Record<string, string> = {
      [WATCH_URL('nocaps2')]: watchPageHtml([]),
    };
    const { fetchFn } = recordingFetch(routes);
    const fullUrl = 'https://www.youtube.com/watch?v=nocaps2&si=SECRETTOKEN123';

    const outcome = await transcribeVideoUrl(fullUrl, { fetchFn });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    // The secret query token must never leak into the message.
    expect(outcome.message).not.toContain('SECRETTOKEN123');
    expect(outcome.message).not.toContain(fullUrl);
  });
});
