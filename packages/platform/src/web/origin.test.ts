/**
 * UNIT_TEST_JUSTIFIED: pure origin/Jaccard/URL helpers with zero I/O / zero model calls.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './http.ts';
import {
  etldPlusOne,
  jaccard,
  resolveOrigin,
  shingles,
  shouldCollapseByShingle,
} from './origin.ts';

describe('origin.ts + normalizeUrl', () => {
  it('normalizeUrl strips tracking params, lowercases host, drops fragment/trailing slash', () => {
    expect(normalizeUrl('https://WWW.Example.COM/path/?utm_source=x&fbclid=1&keep=1#frag')).toBe(
      'https://www.example.com/path?keep=1'
    );
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('etldPlusOne handles multi-part suffixes', () => {
    expect(etldPlusOne('https://news.bbc.co.uk/article')).toBe('bbc.co.uk');
    expect(etldPlusOne('www.example.com')).toBe('example.com');
  });

  it('resolves DOI before domain', () => {
    const r = resolveOrigin({
      finalUrl: 'https://publisher.example/paper',
      text: 'See doi:10.1234/abcd.efgh for details',
    });
    expect(r.method).toBe('doi');
    expect(r.originKey.startsWith('doi:')).toBe(true);
    expect(r.sourceId).toHaveLength(32);
  });

  it('resolves arXiv id', () => {
    const r = resolveOrigin({
      finalUrl: 'https://arxiv.org/abs/2307.06435',
      html: '',
    });
    expect(r.method).toBe('arxiv');
    expect(r.originKey).toContain('2307.06435');
  });

  it('uses syndication regex', () => {
    const r = resolveOrigin({
      finalUrl: 'https://mirror.example/story',
      text: 'This story originally published by Reuters last night.',
    });
    expect(r.method).toBe('syndication');
  });

  it('falls back to eTLD+1', () => {
    const r = resolveOrigin({ finalUrl: 'https://blog.example.com/a' });
    expect(r.method).toBe('etld1');
    expect(r.canonicalDomain).toBe('example.com');
    expect(r.sourceId).toHaveLength(32);
  });

  it('Jaccard collapse at ≥ 0.8', () => {
    const a = 'The quick brown fox jumps over the lazy dog near the river bank today.';
    const b = 'The quick brown fox jumps over the lazy dog near the river bank tonight.';
    expect(shouldCollapseByShingle(a, a)).toBe(true);
    expect(jaccard(shingles(a), shingles(b))).toBeGreaterThan(0.5);
    expect(shouldCollapseByShingle(a, 'completely unrelated text about rockets')).toBe(false);
  });

  it('GUARD: origin.ts contains zero model-call symbols', () => {
    const src = readFileSync(resolve(import.meta.dirname, 'origin.ts'), 'utf8');
    expect(src).not.toMatch(/runFleetModelCall/);
    expect(src).not.toMatch(/extractStructured/);
    expect(src).not.toMatch(/createFleetChatModel/);
  });
});
