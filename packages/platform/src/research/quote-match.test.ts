/**
 * UNIT_TEST_JUSTIFIED: pure string matching with zero I/O.
 */
import { describe, expect, it } from 'vitest';
import { MIN_QUOTE_CHARS, normalizeQuote, verifyQuote } from './quote-match.ts';

describe('normalizeQuote', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeQuote('  a\n\tb   c  ')).toBe('a b c');
  });

  it('treats undefined as empty', () => {
    expect(normalizeQuote(undefined)).toBe('');
  });
});

describe('verifyQuote', () => {
  const source = 'alpha beta gamma delta epsilon';

  it('admits exact normalized match', () => {
    const result = verifyQuote('alpha   beta\ngamma', source, { allowLines: false });
    expect(result).toEqual({ ok: true, mode: 'exact' });
  });

  it('rejects short quotes', () => {
    expect(verifyQuote('short', source)).toEqual({ ok: false, mode: null });
    expect(MIN_QUOTE_CHARS).toBe(12);
  });

  it('rejects when allowLines is false even if lines would match', () => {
    // Two long lines that each appear, but full normalized quote does not.
    const lineQuote = 'alpha beta gamma\ndelta epsilon';
    const withGap = 'alpha beta gamma EXTRA delta epsilon';
    expect(verifyQuote(lineQuote, withGap, { allowLines: false })).toEqual({
      ok: false,
      mode: null,
    });
    expect(verifyQuote(lineQuote, withGap, { allowLines: true })).toEqual({
      ok: true,
      mode: 'lines',
    });
  });

  it('rejects fabricated quote', () => {
    expect(verifyQuote('this quote is not in the source text at all', source)).toEqual({
      ok: false,
      mode: null,
    });
  });
});
