/**
 * Real network capture for inference router integration tests.
 *
 * Wraps globalThis.fetch and records every outbound URL/host.
 * NEVER returns a hard-coded zero — counts only real traffic.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './harness';

export type CaptureRow = {
  host: string;
  url: string;
  method: string;
  at: number;
};

export type NetworkCapture = {
  rows: CaptureRow[];
  countForHost: (hostFragment: string) => number;
  anthropicCount: () => number;
  fleetCount: () => number;
  restore: () => void;
  snapshot: () => CaptureRow[];
};

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  const withUrl = input as { url?: string };
  return withUrl.url ?? String(input);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * Install a real fetch spy. Call restore() in finally / afterEach.
 */
export function installNetworkCapture(): NetworkCapture {
  const rows: CaptureRow[] = [];
  const origFetch = globalThis.fetch;

  globalThis.fetch = (async (
    input: Parameters<typeof origFetch>[0],
    init?: Parameters<typeof origFetch>[1]
  ) => {
    const url = urlOf(input as RequestInfo | URL);
    const method =
      (init?.method ??
        (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')) ||
      'GET';
    rows.push({
      host: hostOf(url),
      url,
      method: String(method).toUpperCase(),
      at: Date.now(),
    });
    return origFetch(input as RequestInfo, init as RequestInit);
  }) as typeof globalThis.fetch;

  return {
    rows,
    countForHost(hostFragment: string) {
      const needle = hostFragment.toLowerCase();
      return rows.filter(
        (r) => r.host.toLowerCase().includes(needle) || r.url.toLowerCase().includes(needle)
      ).length;
    },
    anthropicCount() {
      return this.countForHost('api.anthropic.com');
    },
    fleetCount() {
      return rows.filter(
        (r) =>
          r.url.includes(':4545') || r.host.includes('127.0.0.1') || r.host.includes('localhost')
      ).length;
    },
    restore() {
      globalThis.fetch = origFetch;
    },
    snapshot() {
      return rows.map((r) => ({ ...r }));
    },
  };
}

export function writeInferArtifact(name: string, body: unknown): string {
  const dir = resolve(REPO_ROOT, '.tmp/infer-1');
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}
