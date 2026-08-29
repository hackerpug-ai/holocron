/**
 * Fulcrum quote verification — PURE.
 *
 * Wraps the canonical quote matcher in exact mode ONLY (`allowLines: false`):
 * a quote assembled from non-adjacent fragments must never verify. The gate
 * calls this against the persisted `sources.normalized_text` fetch artifact —
 * NEVER against caller-supplied snippet text, so self-citation cannot pass.
 *
 * Zero I/O, zero model client, zero model roles, no database imports.
 */
import { verifyQuote as matchQuote } from '../../research/quote-match.ts';

export function verifyQuote(quote: string, normalizedText: string): boolean {
  return matchQuote(quote, normalizedText, { allowLines: false }).ok;
}
