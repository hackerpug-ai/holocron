/**
 * Source origin resolution + shingle Jaccard collapse.
 * Zero model calls — deterministic heuristics only.
 */
import { createHash } from 'node:crypto';

const SYNDICATION_RES: RegExp[] = [
  /originally\s+published(?:\s+(?:on|at|by|in))?\s+([A-Za-z0-9][\w .,&'-]{1,80})/i,
  /\((Reuters|AP|AFP|UPI|Bloomberg|Associated Press)\)/i,
  /first\s+appeared\s+on\s+([A-Za-z0-9][\w .,&'-]{1,80})/i,
  /republished\s+from\s+([A-Za-z0-9][\w .,&'-]{1,80})/i,
  /according\s+to\s+a\s+press\s+release/i,
];

const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i;
const ARXIV_RE = /(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:)\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7})/i;

/** Multi-part public suffixes we treat as eTLD (no psl dependency). */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'co.jp',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'co.kr',
  'com.br',
  'com.cn',
  'co.in',
  'com.sg',
  'com.hk',
  'github.io',
  'gitlab.io',
]);

export function etldPlusOne(hostnameOrUrl: string): string {
  let host = hostnameOrUrl.trim().toLowerCase();
  try {
    if (host.includes('://')) host = new URL(host).hostname.toLowerCase();
  } catch {
    // keep as-is
  }
  host = host.replace(/\.$/, '').replace(/^www\./, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  if (MULTI_PART_SUFFIXES.has(lastThree) && parts.length >= 4) {
    return parts.slice(-4).join('.');
  }
  return lastTwo;
}

function metaUrl(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name|itemprop|rel)\\s*=\\s*["']${escaped}["'][^>]+(?:content|href)\\s*=\\s*["']([^"']+)["']`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+(?:content|href)\\s*=\\s*["']([^"']+)["'][^>]+(?:property|name|itemprop|rel)\\s*=\\s*["']${escaped}["']`,
      'i'
    ),
    new RegExp(`<link[^>]+rel\\s*=\\s*["']${escaped}["'][^>]+href\\s*=\\s*["']([^"']+)["']`, 'i'),
    new RegExp(`<link[^>]+href\\s*=\\s*["']([^"']+)["'][^>]+rel\\s*=\\s*["']${escaped}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export type OriginResolution = {
  originKey: string;
  sourceId: string;
  method: 'doi' | 'arxiv' | 'canonical' | 'syndication' | 'etld1';
  canonicalDomain: string;
};

export function resolveOrigin(opts: {
  finalUrl: string;
  html?: string | null;
  text?: string | null;
}): OriginResolution {
  const html = opts.html ?? '';
  const text = opts.text ?? '';
  const corpus = `${html}\n${text}`;
  const finalDomain = etldPlusOne(opts.finalUrl);

  const doi = corpus.match(DOI_RE)?.[0];
  if (doi) {
    const originKey = `doi:${doi.toLowerCase()}`;
    return finish(originKey, 'doi', finalDomain);
  }

  const arxiv = corpus.match(ARXIV_RE)?.[1] ?? opts.finalUrl.match(ARXIV_RE)?.[1];
  if (arxiv) {
    const originKey = `arxiv:${arxiv.toLowerCase()}`;
    return finish(originKey, 'arxiv', finalDomain);
  }

  const canonical =
    metaUrl(html, 'canonical') ?? metaUrl(html, 'og:url') ?? metaUrl(html, 'twitter:url');
  if (canonical) {
    try {
      const domain = etldPlusOne(canonical);
      return finish(`domain:${domain}`, 'canonical', domain);
    } catch {
      // fall through
    }
  }

  for (const re of SYNDICATION_RES) {
    const m = corpus.match(re);
    if (m) {
      const label = (m[1] ?? m[0]).trim().toLowerCase().replace(/\s+/g, ' ');
      if (label.includes('press release')) {
        return finish(`syndication:press-release:${finalDomain}`, 'syndication', finalDomain);
      }
      return finish(`syndication:${label}`, 'syndication', finalDomain);
    }
  }

  return finish(`domain:${finalDomain}`, 'etld1', finalDomain);
}

function finish(
  originKey: string,
  method: OriginResolution['method'],
  canonicalDomain: string
): OriginResolution {
  const sourceId = createHash('sha256').update(originKey).digest('hex').slice(0, 32);
  return { originKey, sourceId, method, canonicalDomain };
}

/** Word-level shingles of size n. */
export function shingles(text: string, n = 3): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  if (tokens.length < n) {
    if (tokens.length > 0) out.add(tokens.join(' '));
    return out;
  }
  for (let i = 0; i <= tokens.length - n; i++) {
    out.add(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter++;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Collapse near-duplicates when Jaccard ≥ threshold (default 0.8). */
export function shouldCollapseByShingle(textA: string, textB: string, threshold = 0.8): boolean {
  return jaccard(shingles(textA), shingles(textB)) >= threshold;
}
