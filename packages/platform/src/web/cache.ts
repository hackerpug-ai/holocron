/**
 * Per-run Map<normalizedUrl, Promise<FetchedDocument>> — concurrent reads share one in-flight promise.
 */
import { normalizeUrl } from './http.ts';
import type { FetchedDocument } from './types.ts';

export type DocumentFetcher = (url: string) => Promise<FetchedDocument>;

export class DocumentCache {
  private readonly inflight = new Map<string, Promise<FetchedDocument>>();

  constructor(private readonly fetchDocument: DocumentFetcher) {}

  /** Number of distinct normalized keys currently cached / in-flight. */
  get size(): number {
    return this.inflight.size;
  }

  clear(): void {
    this.inflight.clear();
  }

  get(url: string): Promise<FetchedDocument> {
    const key = normalizeUrl(url);
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = this.fetchDocument(url).catch((err) => {
      // Allow a later retry after a failed fetch for the same URL.
      this.inflight.delete(key);
      throw err;
    });
    this.inflight.set(key, promise);
    return promise;
  }
}
