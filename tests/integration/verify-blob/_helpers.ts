/**
 * S-UPLOAD-03 helpers — real Postgres + blob store for holo verify:blob.
 * NEVER mocks file_objects, upload_intents, or CAS storage.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BlobStore } from '../../../services/platform/src/blob/store.ts';
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

export const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S-UPLOAD-03');
export const BLOB_ROOT = resolve(EVIDENCE_DIR, 'blob-store');
export const FIXTURE_JPG = resolve(EVIDENCE_DIR, 'test-fixture.jpg');
export const E2E_IMPROVEMENT_OPEN_ID = '00000000-0000-4000-8000-e00000000001';

export const DATABASE_URL = requireNonprodDatabaseUrl(
  process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod'
);

export const itLive = PLATFORM_IT ? it : it.skip;

function requireNonprodDatabaseUrl(url: string): string {
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (databaseName !== 'holocron_nonprod') {
    throw new Error(
      `S-UPLOAD-03 tests must target holocron_nonprod (got ${databaseName || '(empty)'})`
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
      `Missing fixture at ${FIXTURE_JPG}. Place an 800x600 JPEG (HOLO_UPLOAD_FIXTURE_PATH).`
    );
  }
  const bytes = readFileSync(FIXTURE_JPG);
  return { path: FIXTURE_JPG, bytes, contentHash: sha256(bytes) };
}

export function runHolo(
  args: string[],
  env: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string; combined: string } {
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
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}${stderr}`,
  };
}

export async function seedClearedFileObjects(): Promise<void> {
  const seed = runHolo(['seed:e2e', '--reset', '--json']);
  if (seed.status !== 0) {
    throw new Error(`seed:e2e --reset failed:\n${seed.combined}`);
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

export function configureClientEnv(baseUrl: string): void {
  process.env.EXPO_PUBLIC_PLATFORM_URL = baseUrl;
  process.env.EXPO_PUBLIC_PLATFORM_SITE_URL = baseUrl;
  process.env.EXPO_PUBLIC_RN_API_KEY = DEFAULT_KEYS.rn;
  process.env.HOLO_UPLOAD_FIXTURE_PATH = FIXTURE_JPG;
}

/** Authoritative init → PUT → finalize of the seeded fixture via the client lifecycle. */
export async function uploadFixtureThroughLifecycle(options: {
  baseUrl: string;
  targetId?: string;
  idempotencyKey?: string;
}): Promise<{ contentHash: string; fileObjectId: string; byteSize: number }> {
  configureClientEnv(options.baseUrl);
  const fixture = ensureFixtureJpg();
  const { uploadImprovementImage } = await import('../../../hooks/use-image-upload');
  const targetId = options.targetId ?? E2E_IMPROVEMENT_OPEN_ID;
  const idempotencyKey =
    options.idempotencyKey ??
    `s-upload-03-verify-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const ab = fixture.bytes.buffer.slice(
    fixture.bytes.byteOffset,
    fixture.bytes.byteOffset + fixture.bytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: 'image/jpeg' });
  const result = await uploadImprovementImage({
    targetId,
    idempotencyKey,
    blob,
    mimeType: 'image/jpeg',
    originalName: 'test-fixture.jpg',
  });

  // Prove CAS bytes exist under the test blob root (same root verify:blob reads).
  const store = new BlobStore(BLOB_ROOT);
  if (!store.exists(result.contentHash)) {
    throw new Error(`CAS blob missing after finalize: ${result.contentHash}`);
  }
  return {
    contentHash: result.contentHash,
    fileObjectId: result.fileObjectId,
    byteSize: fixture.bytes.byteLength,
  };
}

/** Insert a non-finalized upload_intent row to force --orphans fail-closed. */
export async function insertStagedOrphan(sql: Sql): Promise<string> {
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO upload_intents (
      kind, target_id, idempotency_key, declared_sha256, declared_byte_length,
      declared_mime_type, original_name, status, staged_path
    ) VALUES (
      'improvement_image',
      ${E2E_IMPROVEMENT_OPEN_ID}::uuid,
      ${`orphan-probe-${Date.now()}`},
      ${'0'.repeat(64)},
      1,
      'image/jpeg',
      'orphan.jpg',
      'initiated',
      NULL
    )
    RETURNING id::text AS id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error('failed to insert staged orphan upload_intent');
  return id;
}

export { DEFAULT_KEYS, type LiveService, type Sql };
