/**
 * React Native-compatible streaming fetch for WhatWG `eventsource`.
 *
 * RN's global `fetch` often returns a body without `getReader()`, which makes
 * `eventsource@3` fail with "Invalid response body, expected a web ReadableStream".
 * This adapter uses XHR progressive download (`onprogress`) and enqueues bytes
 * into a web ReadableStream so token events arrive live mid-stream.
 *
 * Still a real network request to the platform SSE endpoint — never mocked.
 */

// Ensure ReadableStream exists (Hermes / older RN).
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('web-streams-polyfill/polyfill');
} catch {
  // already present
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      out[key] = value;
    }
    return out;
  }
  return { ...(headers as Record<string, string>) };
}

function encodeChunk(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  // Minimal UTF-8 encoder fallback
  const utf8: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let charCode = text.charCodeAt(i);
    if (charCode < 0x80) utf8.push(charCode);
    else if (charCode < 0x800) {
      utf8.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8.push(0xe0 | (charCode >> 12), 0x80 | ((charCode >> 6) & 0x3f), 0x80 | (charCode & 0x3f));
    } else {
      i++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (text.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charCode >> 18),
        0x80 | ((charCode >> 12) & 0x3f),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f)
      );
    }
  }
  return Uint8Array.from(utf8);
}

/**
 * Streaming fetch implementation suitable for `new EventSource(url, { fetch })`.
 * Always uses XHR progressive download on this path so token events land live
 * even when RN `fetch` returns a non-streaming body (no getReader).
 */
export function rnSseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return xhrStreamingFetch(input, init);
}

function xhrStreamingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

  const method = (init?.method ?? 'GET').toUpperCase();
  const headerRecord = headersToRecord(init?.headers);

  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let byteOffset = 0;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
      cancel() {
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
      },
    });

    const abort = () => {
      try {
        xhr.abort();
      } catch {
        /* ignore */
      }
    };

    if (init?.signal) {
      if (init.signal.aborted) {
        abort();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      init.signal.addEventListener('abort', () => {
        abort();
        if (!settled) {
          settled = true;
          reject(new DOMException('Aborted', 'AbortError'));
        } else {
          try {
            streamController?.error(new DOMException('Aborted', 'AbortError'));
          } catch {
            /* ignore */
          }
        }
      });
    }

    xhr.open(method, url, true);
    xhr.timeout = 0;
    for (const [key, value] of Object.entries(headerRecord)) {
      try {
        xhr.setRequestHeader(key, value);
      } catch {
        /* forbidden headers */
      }
    }

    const flushProgress = () => {
      const text = xhr.responseText ?? '';
      if (text.length <= byteOffset || !streamController) return;
      const chunk = text.slice(byteOffset);
      byteOffset = text.length;
      try {
        streamController.enqueue(encodeChunk(chunk));
      } catch {
        /* stream closed */
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED && !settled) {
        settled = true;
        const contentType =
          xhr.getResponseHeader('content-type') || 'text/event-stream; charset=utf-8';
        const headers = new Headers({ 'content-type': contentType });
        resolve(
          new Response(stream, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers,
          })
        );
      }
    };

    xhr.onprogress = () => {
      flushProgress();
    };

    xhr.onload = () => {
      flushProgress();
      try {
        streamController?.close();
      } catch {
        /* ignore */
      }
    };

    xhr.onerror = () => {
      const err = new TypeError('Network request failed');
      if (!settled) {
        settled = true;
        reject(err);
      } else {
        try {
          streamController?.error(err);
        } catch {
          /* ignore */
        }
      }
    };

    xhr.onabort = () => {
      const err = new DOMException('Aborted', 'AbortError');
      if (!settled) {
        settled = true;
        reject(err);
      } else {
        try {
          streamController?.error(err);
        } catch {
          /* ignore */
        }
      }
    };

    try {
      xhr.send(typeof init?.body === 'string' ? init.body : null);
    } catch (err) {
      if (!settled) {
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}
