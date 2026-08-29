/**
 * UNIT_TEST_JUSTIFIED: pure offset slicing / component filter, zero I/O.
 */
import { describe, expect, it } from 'vitest';
import { materializeClaims } from './claims.ts';
import { freezeComponents } from './components.ts';
import { normalizeQuote } from './quote-match.ts';

describe('materializeClaims', () => {
  const frozen = freezeComponents(['mechanisms', 'outcomes']);
  const passage =
    'Alpha mechanisms include insulin signaling. Outcomes improve fasting glucose over twelve weeks.';

  it('slices quote from stored offsets and whitespace-normalizes to exact match', () => {
    const start = passage.indexOf('insulin signaling');
    const end = start + 'insulin signaling'.length;
    const claims = materializeClaims({
      passageText: passage,
      frozen,
      raw: [
        {
          claimText: 'Insulin signaling is a mechanism',
          component: 'mechanisms',
          quoteStart: start,
          quoteEnd: end,
        },
      ],
    });
    expect(claims).toHaveLength(1);
    expect(claims[0]?.quote).toBe('insulin signaling');
    expect(normalizeQuote(claims[0]?.quote)).toBe(normalizeQuote(passage.slice(start, end)));
    expect(normalizeQuote(passage).includes(normalizeQuote(claims[0]?.quote))).toBe(true);
  });

  it('drops out-of-range offsets', () => {
    const claims = materializeClaims({
      passageText: passage,
      frozen,
      raw: [
        {
          claimText: 'bad',
          component: 'mechanisms',
          quoteStart: 0,
          quoteEnd: passage.length + 10,
        },
      ],
    });
    expect(claims).toHaveLength(0);
  });

  it('drops component not in frozen set', () => {
    const start = 0;
    const end = Math.min(passage.length, 40);
    const claims = materializeClaims({
      passageText: passage,
      frozen,
      raw: [
        {
          claimText: 'foreign component',
          component: 'not-a-component',
          quoteStart: start,
          quoteEnd: end,
        },
      ],
    });
    expect(claims).toHaveLength(0);
  });
});
