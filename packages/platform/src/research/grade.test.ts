/**
 * UNIT_TEST_JUSTIFIED: pure clamp/corroboration/penalty math with zero I/O.
 * Ceiling comes from shipped sourceTier (social → 2).
 */
import { describe, expect, it } from 'vitest';
import { corroborationBonusForSet, gradeEvidence } from './grade.ts';
import { sourceTier } from './source-tier.ts';

const LONG = 'x'.repeat(500);
const SHORT = 'short text';

describe('gradeEvidence', () => {
  it('social URL ceiling is 2 via shipped sourceTier', () => {
    expect(sourceTier({ url: 'https://www.reddit.com/r/science/comments/abc' })).toBe(2);
    expect(sourceTier({ url: 'https://x.com/someone/status/1' })).toBe(2);
  });

  it('Reddit URL cannot exceed grade 2 even with high modelProposal + corroboration', () => {
    const set = [
      {
        sourceId: 'src-a',
        canonicalDomain: 'reddit.com',
        url: 'https://www.reddit.com/r/science/comments/abc',
        publishedAt: '2024-01-01T00:00:00Z',
        text: LONG,
        modelProposal: 5,
      },
      {
        sourceId: 'src-b',
        canonicalDomain: 'example.org',
        url: 'https://example.org/paper',
        publishedAt: '2024-01-01T00:00:00Z',
        text: LONG,
        modelProposal: 5,
      },
    ];
    const reddit = set[0];
    if (!reddit) throw new Error('expected reddit candidate');
    const result = gradeEvidence(reddit, set);
    expect(result.tierCeiling).toBe(2);
    expect(result.grade).toBeLessThanOrEqual(2);
    expect(result.grade).toBe(2);
  });

  it('corroborationBonus is +1 only with ≥2 sourceIds AND ≥2 domains', () => {
    expect(
      corroborationBonusForSet([
        { sourceId: 'a', canonicalDomain: 'a.com' },
        { sourceId: 'b', canonicalDomain: 'b.com' },
      ])
    ).toBe(1);
    expect(
      corroborationBonusForSet([
        { sourceId: 'a', canonicalDomain: 'a.com' },
        { sourceId: 'a', canonicalDomain: 'a.com' },
      ])
    ).toBe(0);
    expect(
      corroborationBonusForSet([
        { sourceId: 'a', canonicalDomain: 'a.com' },
        { sourceId: 'b', canonicalDomain: 'a.com' },
      ])
    ).toBe(0);
  });

  it('publishedAt null and short text each apply −1 penalty', () => {
    const candidate = {
      sourceId: 'src-1',
      canonicalDomain: 'nature.com',
      url: 'https://www.nature.com/articles/x',
      publishedAt: null,
      text: SHORT,
      modelProposal: 5,
    };
    const result = gradeEvidence(candidate, [candidate]);
    // tier 4 (nature.com), no corroboration, penalties 2 → clamp to 2
    expect(result.tierCeiling).toBe(4);
    expect(result.penalties).toBe(2);
    expect(result.grade).toBe(2);
  });

  it('modelProposal can only lower (min with ceiling)', () => {
    const candidate = {
      sourceId: 'src-1',
      canonicalDomain: 'nist.gov',
      url: 'https://www.nist.gov/page',
      publishedAt: '2024-06-01T00:00:00Z',
      text: LONG,
      modelProposal: 2,
    };
    const result = gradeEvidence(candidate, [candidate]);
    expect(result.tierCeiling).toBe(5);
    expect(result.grade).toBe(2);
  });

  it('corroboration bonus cannot push above tierCeiling', () => {
    const set = [
      {
        sourceId: 'src-a',
        canonicalDomain: 'reddit.com',
        url: 'https://reddit.com/r/x',
        publishedAt: '2024-01-01T00:00:00Z',
        text: LONG,
        modelProposal: 2,
      },
      {
        sourceId: 'src-b',
        canonicalDomain: 'example.com',
        url: 'https://example.com/y',
        publishedAt: '2024-01-01T00:00:00Z',
        text: LONG,
        modelProposal: 3,
      },
    ];
    const reddit = set[0];
    if (!reddit) throw new Error('expected reddit candidate');
    const a = gradeEvidence(reddit, set);
    expect(a.tierCeiling).toBe(2);
    expect(a.corroborationBonus).toBe(1);
    expect(a.grade).toBeLessThanOrEqual(2);
  });
});
