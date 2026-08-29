/**
 * Publication-date extraction. Prefer structured signals over body prose.
 * Never invent "now". Returns ISO-ish string or null.
 */

const META_NAMES = [
  'article:published_time',
  'og:published_time',
  'datePublished',
  'pubdate',
  'publishdate',
  'publication_date',
  'DC.date.issued',
  'parsely-pub-date',
] as const;

function coerceIso(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.valueOf())) return null;
  // Reject clearly nonsensical years (body-prose "page 2020" noise).
  const year = d.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return d.toISOString();
}

/** Prefer publishedTime over date (Jina/search providers). */
export function pickProviderDate(fields: {
  publishedTime?: unknown;
  date?: unknown;
  publishedDate?: unknown;
  publishedAt?: unknown;
}): string | null {
  const candidates = [fields.publishedTime, fields.publishedDate, fields.publishedAt, fields.date];
  for (const c of candidates) {
    if (typeof c === 'string' || typeof c === 'number') {
      const iso = coerceIso(String(c));
      if (iso) return iso;
    }
  }
  return null;
}

function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${escaped}["'][^>]+content\\s*=\\s*["']([^"']+)["']`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+(?:property|name|itemprop)\\s*=\\s*["']${escaped}["']`,
      'i'
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractJsonLdDates(html: string): string | null {
  const blocks = html.match(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!blocks) return null;
  for (const block of blocks) {
    const inner = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>\s*$/i, '');
    try {
      const parsed: unknown = JSON.parse(inner);
      const found = walkJsonLd(parsed);
      if (found) return found;
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null;
}

function walkJsonLd(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkJsonLd(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    for (const key of ['datePublished', 'dateCreated', 'uploadDate']) {
      if (typeof rec[key] === 'string') {
        const iso = coerceIso(rec[key] as string);
        if (iso) return iso;
      }
    }
    if (rec['@graph']) {
      const found = walkJsonLd(rec['@graph']);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Resolve publishedAt from provider fields first, then HTML metadata / JSON-LD.
 * Never scans body prose for free-floating dates.
 */
export function resolvePublishedAt(opts: {
  providerFields?: {
    publishedTime?: unknown;
    date?: unknown;
    publishedDate?: unknown;
    publishedAt?: unknown;
  };
  html?: string | null;
}): string | null {
  const fromProvider = pickProviderDate(opts.providerFields ?? {});
  if (fromProvider) return fromProvider;

  const html = opts.html ?? '';
  if (!html) return null;

  for (const name of META_NAMES) {
    const raw = metaContent(html, name);
    const iso = coerceIso(raw);
    if (iso) return iso;
  }

  return extractJsonLdDates(html);
}
