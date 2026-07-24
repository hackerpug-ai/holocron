/**
 * Shared platform URL helpers for Zero/Hono call sites (S-REWRITE-02).
 * Share links MUST target the Mastra /article/ host — never .convex.site.
 */

function rawPlatformUrl(): string {
  return process.env.EXPO_PUBLIC_PLATFORM_SITE_URL ?? process.env.EXPO_PUBLIC_PLATFORM_URL ?? '';
}

/** Strip trailing slash; reject legacy Convex hosts. */
export function getMastraHost(): string {
  const trimmed = rawPlatformUrl().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.includes('.convex.site') || trimmed.includes('.convex.cloud')) {
    console.warn(
      '[platform] EXPO_PUBLIC_PLATFORM_* points at a Convex host; share URLs must use the Mastra host'
    );
  }
  return trimmed;
}

/** Build a public article share URL on the Mastra host. */
export function buildArticleShareUrl(shareToken: string): string {
  const host = getMastraHost();
  if (!host) {
    throw new Error(
      'Mastra host not configured (EXPO_PUBLIC_PLATFORM_SITE_URL / EXPO_PUBLIC_PLATFORM_URL)'
    );
  }
  if (host.includes('.convex.site') || host.includes('.convex.cloud')) {
    throw new Error('Share URL host must not be a Convex domain');
  }
  return `${host}/article/${shareToken}`;
}

/** Resolve a blob-backed audio URL for narration playback. */
export function buildBlobAudioUrl(blobId: string | null | undefined): string | null {
  if (!blobId) return null;
  const host = getMastraHost();
  if (!host) return null;
  // Blob ids are content hashes (sha256 hex) served at GET /blobs/:id
  return `${host}/blobs/${blobId}`;
}

/** Live platform base URL (reads env each call). */
export function getPlatformUrl(): string {
  return getMastraHost();
}

/** RN scoped API key for Hono commands. */
export function getRnApiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_RN_API_KEY;
}

/** @deprecated Prefer getPlatformUrl() — kept for call-site brevity. */
export const platformUrl = getMastraHost();
/** @deprecated Prefer getRnApiKey(). */
export const rnApiKey = process.env.EXPO_PUBLIC_RN_API_KEY;
