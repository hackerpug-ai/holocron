/**
 * UNIT_TEST_JUSTIFIED: pure date/metadata parsing with zero I/O.
 */
import { describe, expect, it } from 'vitest';
import { pickProviderDate, resolvePublishedAt } from './dates.ts';

describe('dates.ts', () => {
  it('prefers publishedTime over date', () => {
    const iso = pickProviderDate({
      publishedTime: 'Wed, 10 Sep 2025 21:05:01 GMT',
      date: 'Jun 5, 2025',
    });
    expect(iso).toBe('2025-09-10T21:05:01.000Z');
  });

  it('returns null (never undefined) when absent', () => {
    const iso = pickProviderDate({});
    expect(iso).toBeNull();
    expect(iso).not.toBeUndefined();
  });

  it('reads article:published_time meta before body prose', () => {
    const html = `
      <html><head>
        <meta property="article:published_time" content="2024-03-15T12:00:00Z" />
      </head><body>
        <p>Updated yesterday and also on January 1, 1999 in the prose.</p>
      </body></html>
    `;
    expect(resolvePublishedAt({ html })).toBe('2024-03-15T12:00:00.000Z');
  });

  it('reads JSON-LD datePublished', () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Article","datePublished":"2023-11-01T08:30:00Z"}
      </script>
    `;
    expect(resolvePublishedAt({ html })).toBe('2023-11-01T08:30:00.000Z');
  });

  it('never invents now from empty input', () => {
    expect(resolvePublishedAt({})).toBeNull();
    expect(resolvePublishedAt({ html: '<p>no dates here</p>' })).toBeNull();
  });
});
