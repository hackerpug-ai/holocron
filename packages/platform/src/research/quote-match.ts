/**
 * Canonical quote matcher for research evidence + assimilate citation gates.
 *
 * Whitespace normalization (collapse runs of whitespace to a single space, then
 * trim) is a justified loosening: formatting differences are not fabrication.
 *
 * `lines` mode admits when every substantive line of the quote appears somewhere
 * in the source. The evidence gate MUST NOT use lines mode — it would admit a
 * quote assembled from non-adjacent fragments.
 */

export const MIN_QUOTE_CHARS = 12;

export function normalizeQuote(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function substantiveLines(quote: string): string[] {
  return quote
    .split('\n')
    .map((l) => normalizeQuote(l))
    .filter((n) => n.replace(/ /g, '').length >= MIN_QUOTE_CHARS);
}

export function verifyQuote(
  quote: string,
  sourceText: string,
  opts?: { allowLines?: boolean }
): { ok: boolean; mode: 'exact' | 'lines' | null } {
  const nq = normalizeQuote(quote);
  if (nq.replace(/ /g, '').length < MIN_QUOTE_CHARS) {
    return { ok: false, mode: null };
  }
  const body = normalizeQuote(sourceText);
  if (body.includes(nq)) {
    return { ok: true, mode: 'exact' };
  }
  if (opts?.allowLines) {
    const parts = substantiveLines(quote);
    if (parts.length >= 2 && parts.every((p) => body.includes(p))) {
      return { ok: true, mode: 'lines' };
    }
  }
  return { ok: false, mode: null };
}
