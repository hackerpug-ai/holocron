/**
 * Sprint 16 public article gate: real Postgres, filesystem blob, and Hono HTTP.
 * Run with PLATFORM_IT=1 against holocron_nonprod.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BlobStore } from '../../../services/platform/src/blob/store';
import { createSql, type Sql } from '../../../services/platform/src/db/client';
import { type LiveService, PLATFORM_IT, startLiveService } from './harness';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const EVIDENCE_DIR = resolve('.tmp/sprint-16-public-article');
const BLOB_ROOT = resolve(EVIDENCE_DIR, 'blobs');
const GOLDEN = resolve('services/platform/tests/fixtures/public-article/convex-era.html');

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('Sprint 16 public article', () => {
  let sql: Sql | undefined;
  let service: LiveService | undefined;
  let shareToken = '';
  let privateToken = '';
  let fileObjectId = '';
  let blobHash = '';
  const content =
    '# Public article\n\nA byte-comparable article body with [a link](https://example.com).';

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    rmSync(BLOB_ROOT, { recursive: true, force: true });
    sql = createSql(DATABASE_URL);
    shareToken = `s16-public-${Date.now()}`;
    privateToken = `s16-private-${Date.now()}`;
    const documentId = crypto.randomUUID();
    const privateId = crypto.randomUUID();
    const bytes = Buffer.from('sprint-16-public-asset');
    blobHash = sha256(bytes);
    const blob = new BlobStore(BLOB_ROOT);
    await blob.put(bytes, { filename: 'asset.txt' });
    const file = await sql<{ id: string }[]>`
      INSERT INTO file_objects (content_hash, mime_type, byte_size, storage_path, original_name)
      VALUES (${blobHash}, 'text/plain', ${bytes.length}, ${blob.resolvePath(blobHash)}, 'asset.txt')
      RETURNING id
    `;
    fileObjectId = file[0]?.id ?? '';
    await sql`
      INSERT INTO documents (id, title, content, category, status, date, research_type, is_public, share_token)
      VALUES (${documentId}::uuid, 'Public article', ${content}, 'gate', 'published', '2026-07-18T12:00:00Z', 'test', true, ${shareToken}),
             (${privateId}::uuid, 'Private article', ${content}, 'gate', 'draft', '2026-07-18T12:00:00Z', 'test', false, ${privateToken})
    `;
    await sql`
      INSERT INTO document_assets (document_id, file_object_id)
      VALUES (${documentId}, ${fileObjectId})
    `;
    service = await startLiveService({
      databaseUrl: DATABASE_URL,
      extraEnv: { HOLO_BLOB_ROOT: BLOB_ROOT },
    });
  }, 30_000);

  afterAll(async () => {
    await service?.stop();
    if (sql) {
      await sql`DELETE FROM document_assets WHERE document_id IN (SELECT id::text FROM documents WHERE share_token LIKE 's16-%')`;
      await sql`DELETE FROM documents WHERE share_token LIKE 's16-%'`;
      await sql`DELETE FROM file_objects WHERE content_hash = ${blobHash}`;
      await sql.end({ timeout: 5 });
    }
  });

  itLive('returns byte-comparable public HTML and preserves the compatibility path', async () => {
    const response = await fetch(`${service?.baseUrl}/article/${shareToken}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toBe(readFileSync(GOLDEN, 'utf8'));
    expect(html).toContain('<title>Public article</title>');
  });

  itLive('returns 404 for private and unknown share tokens', async () => {
    expect((await fetch(`${service?.baseUrl}/article/${privateToken}`)).status).toBe(404);
    expect((await fetch(`${service?.baseUrl}/article/never-public`)).status).toBe(404);
  });

  itLive('serves linked assets only through the public article capability', async () => {
    const response = await fetch(
      `${service?.baseUrl}/article/${shareToken}/assets/${fileObjectId}`
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toBe('sprint-16-public-asset');
    expect(
      (await fetch(`${service?.baseUrl}/article/${privateToken}/assets/${fileObjectId}`)).status
    ).toBe(404);
    if (!sql) throw new Error('Sprint 16 SQL client missing');
    await sql`UPDATE documents SET is_public = false WHERE share_token = ${shareToken}`;
    expect((await fetch(`${service?.baseUrl}/article/${shareToken}`)).status).toBe(404);
    expect(
      (await fetch(`${service?.baseUrl}/article/${shareToken}/assets/${fileObjectId}`)).status
    ).toBe(404);
  });
});
