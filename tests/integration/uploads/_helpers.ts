/**
 * S-UPLOAD-01 shared helpers — real Hono + Postgres + blob store.
 * No mocks of upload endpoints or file_objects.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

export const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S-UPLOAD-01');
export const BLOB_ROOT = resolve(EVIDENCE_DIR, 'blob-store');
export const FIXTURE_JPG = resolve(EVIDENCE_DIR, 'test-fixture.jpg');
export const FIXTURE_WIDTH = 800;
export const FIXTURE_HEIGHT = 600;

/** Deterministic open improvement from seed:e2e (e2eUuid('e', 1)). */
export const E2E_IMPROVEMENT_OPEN_ID = '00000000-0000-4000-8000-e00000000001';

export const DATABASE_URL = requireNonprodDatabaseUrl(
  process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod'
);

export const itLive = PLATFORM_IT ? it : it.skip;

function requireNonprodDatabaseUrl(url: string): string {
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (databaseName !== 'holocron_nonprod') {
    throw new Error(
      `S-UPLOAD-01 tests must target holocron_nonprod (got ${databaseName || '(empty)'})`
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

export function ensureFixtureJpg(): { path: string; bytes: Buffer; contentHash: string } {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  if (!existsSync(FIXTURE_JPG)) {
    throw new Error(
      `Missing fixture at ${FIXTURE_JPG}. Place an 800x600 JPEG there (HOLO_UPLOAD_FIXTURE_PATH).`
    );
  }
  const bytes = readFileSync(FIXTURE_JPG);
  return { path: FIXTURE_JPG, bytes, contentHash: sha256(bytes) };
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
    HOLO_UPLOAD_FIXTURE_PATH: FIXTURE_JPG,
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

export async function fileObjectsByHash(
  sql: Sql,
  contentHash: string
): Promise<Array<{ id: string; content_hash: string; byte_size: number | null }>> {
  return sql<Array<{ id: string; content_hash: string; byte_size: number | null }>>`
    SELECT id::text AS id, content_hash, byte_size
    FROM file_objects
    WHERE content_hash = ${contentHash}
  `;
}

export function configureClientEnv(baseUrl: string): void {
  process.env.EXPO_PUBLIC_PLATFORM_URL = baseUrl;
  process.env.EXPO_PUBLIC_PLATFORM_SITE_URL = baseUrl;
  process.env.EXPO_PUBLIC_RN_API_KEY = DEFAULT_KEYS.rn;
  process.env.HOLO_UPLOAD_FIXTURE_PATH = FIXTURE_JPG;
}

export async function startUploadService(): Promise<LiveService> {
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

export function fixtureBlob(bytes: Buffer): Blob {
  return new Blob([toArrayBuffer(bytes)], { type: 'image/jpeg' });
}

export { DEFAULT_KEYS, type LiveService, type Sql };
