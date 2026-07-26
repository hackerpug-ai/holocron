/**
 * S-UPLOAD-02 shared helpers — real Hono + Postgres + blob store for voice upload.
 * NEVER mocks upload endpoints, voice-sessions, or file_objects.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSql, type Sql } from '../../../services/platform/src/db/client';
import {
  DEFAULT_KEYS,
  type LiveService,
  PLATFORM_IT,
  REPO_ROOT,
  requireService,
  startLiveService,
} from '../service/harness';

export { PLATFORM_IT, REPO_ROOT, requireService };

export const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S-UPLOAD-02');
export const BLOB_ROOT = resolve(EVIDENCE_DIR, 'blob-store');

/** Deterministic conversation from seed:e2e (E2E Conversation Alpha). */
export const E2E_CONVERSATION_ID = '00000000-0000-4000-8000-0000000000e1';

export const DATABASE_URL = requireNonprodDatabaseUrl(
  process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod'
);

export const itLive = PLATFORM_IT ? it : it.skip;

function requireNonprodDatabaseUrl(url: string): string {
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (databaseName !== 'holocron_nonprod') {
    throw new Error(
      `S-UPLOAD-02 tests must target holocron_nonprod (got ${databaseName || '(empty)'})`
    );
  }
  return url;
}

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

export function runHolo(
  args: string[],
  env: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string } {
  const HOLO = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL,
    HOLO_BLOB_ROOT: BLOB_ROOT,
    ...env,
  };
  delete childEnv.DATABASE_URL_OWNER;
  const result = spawnSync('bun', [HOLO, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: childEnv,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export async function seedClearedFileObjects(): Promise<void> {
  const seed = runHolo(['seed:e2e', '--reset', '--json']);
  if (seed.status !== 0) {
    throw new Error(`seed:e2e --reset failed:\n${seed.stdout}\n${seed.stderr}`);
  }
}

export async function countFileObjects(sql: Sql): Promise<number> {
  const rows = await sql<Array<{ count: string }>>`
    SELECT count(*)::text AS count FROM file_objects
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function countOrphanUploadIntents(sql: Sql): Promise<number> {
  const rows = await sql<Array<{ count: string }>>`
    SELECT count(*)::text AS count
    FROM upload_intents
    WHERE status IS DISTINCT FROM 'finalized'
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function fileObjectsByHash(
  sql: Sql,
  contentHash: string
): Promise<Array<{ id: string; content_hash: string; mime_type: string | null }>> {
  return sql<Array<{ id: string; content_hash: string; mime_type: string | null }>>`
    SELECT id::text AS id, content_hash, mime_type
    FROM file_objects
    WHERE content_hash = ${contentHash}
  `;
}

/** Insert a durable voice_sessions row so upload kind=voice_artifact can attach. */
export async function insertVoiceSession(
  sql: Sql,
  conversationId: string = E2E_CONVERSATION_ID
): Promise<string> {
  const sessionId = crypto.randomUUID();
  await sql`
    INSERT INTO voice_sessions (id, conversation_id, started_at, turn_count)
    VALUES (${sessionId}::uuid, ${conversationId}::uuid, now(), 0)
  `;
  return sessionId;
}

export function configureClientEnv(baseUrl: string): void {
  process.env.EXPO_PUBLIC_PLATFORM_URL = baseUrl;
  process.env.EXPO_PUBLIC_PLATFORM_SITE_URL = baseUrl;
  process.env.EXPO_PUBLIC_RN_API_KEY = DEFAULT_KEYS.rn;
}

export async function startVoiceUploadService(): Promise<LiveService> {
  mkdirSync(BLOB_ROOT, { recursive: true });
  return startLiveService({
    databaseUrl: DATABASE_URL,
    extraEnv: {
      HOLO_BLOB_ROOT: BLOB_ROOT,
    },
    readyTimeoutMs: 30_000,
  });
}

export function openSql(): Sql {
  return createSql(DATABASE_URL);
}

export function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Minimal ID3-tagged payload so detectMimeFromBuffer returns audio/mpeg. */
export function audioFixtureBlob(label = 's-upload-02-voice-audio'): {
  blob: Blob;
  bytes: Buffer;
  contentHash: string;
  mimeType: string;
  originalName: string;
} {
  const bytes = Buffer.from(`ID3\x03\x00\x00\x00\x00\x00\x00${label}-${Date.now()}`);
  return {
    bytes,
    contentHash: sha256(bytes),
    mimeType: 'audio/mpeg',
    originalName: 'voice-artifact.mp3',
    blob: new Blob([toArrayBuffer(bytes)], { type: 'audio/mpeg' }),
  };
}

export { DEFAULT_KEYS, type LiveService, type Sql };
