/**
 * Shared platform URL helpers + Hono command client for Zero/Hono call sites
 * (union of S-REWRITE-02 URL helpers and S-REWRITE-04 hono_command targets).
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

// ── S-REWRITE-04: hono_command targets ──────────────────────────────────────

export type PlatformJson = Record<string, unknown>;

function assertPlatformConfigured(): { base: string; key: string } {
  const base = getMastraHost();
  const key = getRnApiKey();
  if (!base) {
    throw new Error('EXPO_PUBLIC_PLATFORM_URL is not set');
  }
  if (!key) {
    throw new Error('EXPO_PUBLIC_RN_API_KEY is not set');
  }
  return { base, key };
}

async function platformFetch(
  path: string,
  init: RequestInit & { json?: PlatformJson } = {}
): Promise<Response> {
  const { base, key } = assertPlatformConfigured();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${key}`);
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${base}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
}

/** POST /api/missions — toolbelt-add-from-url, whats-new-generate, etc. */
export async function postMission(body: {
  templateKey: string;
  goal: string;
  idempotencyKey: string;
  args?: PlatformJson;
}): Promise<PlatformJson> {
  const response = await platformFetch('/api/missions', {
    method: 'POST',
    json: body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`mission create failed: ${response.status} ${text}`);
  }
  return (await response.json()) as PlatformJson;
}

/** PATCH /api/conversations/:id — durable drawer rename. */
export async function renameConversation(id: string, title: string): Promise<PlatformJson> {
  const response = await platformFetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    json: { title },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`conversation rename failed: ${response.status} ${text}`);
  }
  return (await response.json()) as PlatformJson;
}

/** DELETE /api/conversations/:id — durable drawer delete. */
export async function deleteConversation(id: string): Promise<PlatformJson> {
  const response = await platformFetch(`/api/conversations/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`conversation delete failed: ${response.status} ${text}`);
  }
  return (await response.json()) as PlatformJson;
}

/** POST /api/documents/:id/import — durable article import append. */
export async function appendDocumentImport(id: string, text: string): Promise<PlatformJson> {
  const response = await platformFetch(`/api/documents/${id}/import`, {
    method: 'POST',
    json: { text },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`document import failed: ${response.status} ${body}`);
  }
  return (await response.json()) as PlatformJson;
}

/** POST /api/documents/:id/publish — durable document share token. */
export async function publishDocument(id: string): Promise<PlatformJson> {
  const response = await platformFetch(`/api/documents/${id}/publish`, {
    method: 'POST',
    json: {},
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`document publish failed: ${response.status} ${body}`);
  }
  return (await response.json()) as PlatformJson;
}

/** POST /api/uploads — improvement-upload-init */
export async function initUpload(body: {
  kind: 'improvement_image' | 'voice_artifact';
  targetId: string;
  idempotencyKey: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
  originalName?: string;
}): Promise<PlatformJson> {
  const response = await platformFetch('/api/uploads', {
    method: 'POST',
    json: body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`upload init failed: ${response.status} ${text}`);
  }
  return (await response.json()) as PlatformJson;
}

/** PUT /api/uploads/:id — binary body */
export async function putUpload(uploadId: string, body: Blob | ArrayBuffer): Promise<PlatformJson> {
  const response = await platformFetch(`/api/uploads/${uploadId}`, {
    method: 'PUT',
    body: body as BodyInit,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`upload put failed: ${response.status} ${text}`);
  }
  return (await response.json()) as PlatformJson;
}

/** POST /api/uploads/:id/finalize */
export async function finalizeUpload(uploadId: string): Promise<PlatformJson> {
  const response = await platformFetch(`/api/uploads/${uploadId}/finalize`, {
    method: 'POST',
    json: {},
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`upload finalize failed: ${response.status} ${text}`);
  }
  return (await response.json()) as PlatformJson;
}

export type UploadBlobInput = {
  kind: 'improvement_image' | 'voice_artifact';
  targetId: string;
  idempotencyKey: string;
  blob: Blob;
  mimeType?: string;
  originalName?: string;
};

/** Run the authoritative init → PUT → finalize lifecycle for a native blob. */
export async function uploadBlobThroughLifecycle(input: UploadBlobInput): Promise<PlatformJson> {
  const bytes = await input.blob.arrayBuffer();
  const sha256 = await sha256HexOfBytes(bytes);
  const mimeType = input.mimeType || input.blob.type || 'application/octet-stream';
  const init = await initUpload({
    kind: input.kind,
    targetId: input.targetId,
    idempotencyKey: input.idempotencyKey,
    sha256,
    byteLength: bytes.byteLength,
    mimeType,
    originalName: input.originalName,
  });
  const uploadId = String(init.uploadId ?? init.id ?? '');
  if (!uploadId) {
    throw new Error('upload init returned no upload id');
  }
  await putUpload(uploadId, input.blob);
  return finalizeUpload(uploadId);
}

/** Compute a real SHA-256 digest; fail closed when the runtime lacks Web Crypto. */
export async function sha256HexOfBytes(bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  throw new Error('SHA-256 is unavailable in this runtime');
}
