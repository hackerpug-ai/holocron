/**
 * Hono platform client for command-style writes that are not Zero mutators
 * (per 13-client-data-contract.yaml: hono_command targets).
 */

const platformUrl = process.env.EXPO_PUBLIC_PLATFORM_URL;
const rnApiKey = process.env.EXPO_PUBLIC_RN_API_KEY;

export type PlatformJson = Record<string, unknown>;

function assertPlatformConfigured(): { base: string; key: string } {
  if (!platformUrl) {
    throw new Error('EXPO_PUBLIC_PLATFORM_URL is not set');
  }
  if (!rnApiKey) {
    throw new Error('EXPO_PUBLIC_RN_API_KEY is not set');
  }
  return { base: platformUrl.replace(/\/$/, ''), key: rnApiKey };
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

/** Simple hex sha256 via SubtleCrypto when available; otherwise a stable stand-in for e2e. */
export async function sha256HexOfBytes(bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for environments without SubtleCrypto — not cryptographically strong.
  let h = 0;
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) h = (Math.imul(31, h) + view[i]) | 0;
  return h.toString(16).padStart(64, '0').slice(0, 64);
}
