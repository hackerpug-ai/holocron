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

/**
 * RN Hermes Blob often lacks arrayBuffer(). Prefer native method, else FileReader,
 * else Response body (Expo/fetch polyfills).
 */
export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
          return;
        }
        reject(new Error('FileReader did not produce ArrayBuffer'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsArrayBuffer(blob);
    });
  }
  if (typeof Response !== 'undefined') {
    return new Response(blob).arrayBuffer();
  }
  throw new Error('blobToArrayBuffer: no arrayBuffer/FileReader/Response available');
}

/** Run the authoritative init → PUT → finalize lifecycle for a native blob. */
export async function uploadBlobThroughLifecycle(input: UploadBlobInput): Promise<PlatformJson> {
  const bytes = await blobToArrayBuffer(input.blob);
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
  // Prefer raw bytes for PUT — RN Blob may not stream correctly.
  await putUpload(uploadId, bytes);
  return finalizeUpload(uploadId);
}

/**
 * Pure JS SHA-256 for Hermes / RN where crypto.subtle is missing.
 * Returns lowercase 64-hex digest of the full byte range.
 */
export function sha256HexPure(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Based on the FIPS 180-4 SHA-256 algorithm (compact, no deps).
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const bitLen = data.length * 8;
  const withPad = new Uint8Array((data.length + 9 + 63) & ~63);
  withPad.set(data);
  withPad[data.length] = 0x80;
  const view = new DataView(withPad.buffer);
  view.setUint32(withPad.length - 4, bitLen >>> 0, false);
  // high 32 bits of length (always 0 for < 512MB inputs we accept)
  view.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000), false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let i = 0; i < withPad.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint32Array([h0, h1, h2, h3, h4, h5, h6, h7]);
  return Array.from(out)
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

/** Compute a real SHA-256 digest (Web Crypto preferred, pure JS fallback for Hermes). */
export async function sha256HexOfBytes(bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // fall through to pure JS
    }
  }
  return sha256HexPure(bytes);
}
