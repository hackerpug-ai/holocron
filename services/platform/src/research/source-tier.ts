/**
 * Deterministic source-tier scoring. No model calls.
 * social/unknown ceiling 2; .gov / .edu / arxiv / doi → 5.
 */
import { etldPlusOne } from '../web/origin.ts';

export type SourceTierInput = {
  url: string;
  originKey?: string | null;
  canonicalDomain?: string | null;
};

const SOCIAL_HOSTS = new Set([
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'reddit.com',
  'threads.net',
  'linkedin.com',
  'youtube.com',
  'youtu.be',
  'medium.com',
  'substack.com',
  'blogspot.com',
  'wordpress.com',
  'tumblr.com',
]);

/**
 * Returns an integer tier in [1, 5].
 * Higher = more authoritative for evidence ranking.
 */
export function sourceTier(input: SourceTierInput): number {
  const origin = (input.originKey ?? '').toLowerCase();
  if (origin.startsWith('doi:') || origin.startsWith('arxiv:')) return 5;

  const domain = (
    input.canonicalDomain ??
    (() => {
      try {
        return etldPlusOne(input.url);
      } catch {
        return '';
      }
    })()
  ).toLowerCase();

  if (!domain) return 1;

  if (
    domain.endsWith('.gov') ||
    domain.endsWith('.gov.uk') ||
    domain.endsWith('.edu') ||
    domain.endsWith('.ac.uk') ||
    domain === 'arxiv.org' ||
    domain.endsWith('.arxiv.org')
  ) {
    return 5;
  }

  if (domain.endsWith('.org') || domain.endsWith('.int') || domain.endsWith('.mil')) {
    return 4;
  }

  // Known reference / docs hosts.
  if (
    domain === 'huggingface.co' ||
    domain === 'github.com' ||
    domain === 'wikipedia.org' ||
    domain.endsWith('.wikipedia.org') ||
    domain === 'nature.com' ||
    domain === 'science.org' ||
    domain === 'acm.org' ||
    domain === 'ieee.org'
  ) {
    return 4;
  }

  if (SOCIAL_HOSTS.has(domain) || [...SOCIAL_HOSTS].some((h) => domain.endsWith(`.${h}`))) {
    return 2;
  }

  // Generic commercial / unknown — ceiling 2 for unknown social-adjacent; otherwise 3.
  if (domain.endsWith('.com') || domain.endsWith('.net') || domain.endsWith('.io')) {
    return 3;
  }

  return 2;
}
