/**
 * Source-text attestation: sha256(sourceText) → provenance metadata.
 * assertQuoteAttested enforces quote spans against attested sourceText.
 */
import { createHash } from 'node:crypto';
import { verifyQuote } from './quote-match.ts';

export type ProvenanceRecord = {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  provider: 'jina' | 'exa';
  acquisition: 'inline' | 'read';
  webCallId: string;
  byteLength: number;
};

export type ProvenanceStore = {
  attest(sourceText: string, meta: ProvenanceRecord): string;
  get(hash: string): ProvenanceRecord | undefined;
  has(hash: string): boolean;
};

export function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function createProvenanceStore(): ProvenanceStore {
  const map = new Map<string, ProvenanceRecord>();
  return {
    attest(sourceText: string, meta: ProvenanceRecord): string {
      const hash = sha256Text(sourceText);
      map.set(hash, {
        ...meta,
        byteLength: meta.byteLength || Buffer.byteLength(sourceText, 'utf8'),
      });
      return hash;
    },
    get(hash: string) {
      return map.get(hash);
    },
    has(hash: string) {
      return map.has(hash);
    },
  };
}

/**
 * Assert that `quote` is attested against `sourceText` that was previously recorded.
 * Throws RESEARCH_SOURCETEXT_NOT_ATTESTED or RESEARCH_QUOTE_SPAN_MISMATCH.
 */
export function assertQuoteAttested(opts: {
  quote: string;
  sourceText: string;
  store: ProvenanceStore;
  /** When true, require store.has(sha256(sourceText)). Default true. */
  requireAttestation?: boolean;
}): void {
  const requireAttestation = opts.requireAttestation ?? true;
  const hash = sha256Text(opts.sourceText);
  if (requireAttestation && !opts.store.has(hash)) {
    throw new Error('RESEARCH_SOURCETEXT_NOT_ATTESTED');
  }
  const check = verifyQuote(opts.quote, opts.sourceText, { allowLines: false });
  if (!check.ok) {
    throw new Error('RESEARCH_QUOTE_SPAN_MISMATCH');
  }
}
