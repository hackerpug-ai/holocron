/** Public Cloudflare reader origin. Must stay in lockstep with app/zero/platform.ts. */
export const PUBLIC_DOCS_ORIGIN = 'https://docs.holocrnlib.com';

export function buildPublicShareUrl(shareToken: string): string {
  return `${PUBLIC_DOCS_ORIGIN}/d/${shareToken}`;
}
