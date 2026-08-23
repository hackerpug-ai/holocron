/**
 * Live executor repairs: finite vector scores, delete-with-content, missing
 * transcript ids fail closed, unshare_document is registered and executable.
 *
 * PLATFORM_IT=1 DATABASE_URL=postgres://… pnpm vitest run --project integration \
 *   services/platform/tests/integration/mcp-tool-repairs.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { executePostgresMcpTool } from '../../src/mcp/executor';
import { listTools } from '../../src/tools/registry';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const NS = `mcp-repair-${Date.now().toString(36)}`;

describe('MCP tool repairs', () => {
  let sql: Sql | undefined;
  const created: { sources: string[]; contents: string[]; documents: string[]; jobs: string[] } = {
    sources: [],
    contents: [],
    documents: [],
    jobs: [],
  };

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    sql = createSql(DATABASE_URL);
  });

  afterAll(async () => {
    if (!sql) return;
    try {
      if (created.jobs.length)
        await sql`DELETE FROM transcript_jobs WHERE id = ANY(${created.jobs}::uuid[])`;
      if (created.contents.length)
        await sql`DELETE FROM subscription_content WHERE id = ANY(${created.contents}::uuid[])`;
      if (created.sources.length)
        await sql`DELETE FROM subscription_sources WHERE id = ANY(${created.sources}::uuid[])`;
      if (created.documents.length)
        await sql`DELETE FROM documents WHERE id = ANY(${created.documents}::uuid[])`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('registers unshare_document on the shared 45-tool surface', () => {
    const ids = listTools().map((row) => row.id);
    expect(ids).toContain('unshare_document');
    expect(ids).toContain('remove_subscription');
    expect(ids).toContain('search_vector');
    expect(ids).toContain('regenerate_transcript');
  });

  itLive('search_vector returns finite scores including a zero query vector', async () => {
    if (!sql) throw new Error('Postgres required');
    const vec = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 0.2 : 0.01));
    const lit = `[${vec.join(',')}]`;
    const sourceId = randomUUID();
    await sql`
      INSERT INTO sources (id, source_kind, title)
      VALUES (${sourceId}::uuid, 'other', ${`${NS}-source`})
    `;
    await sql`
      INSERT INTO passages (id, source_id, text, embedding)
      VALUES (${randomUUID()}::uuid, ${sourceId}, ${`${NS}-passage`}, ${lit}::vector)
    `;
    const zeros = Array.from({ length: 1024 }, () => 0);
    const result = (await executePostgresMcpTool('search_vector', {
      embedding: zeros,
      limit: 3,
    })) as { results: Array<{ score?: unknown }>; totalResults: number };
    expect(result.totalResults).toBeGreaterThan(0);
    for (const row of result.results) {
      expect(Number.isFinite(Number(row.score))).toBe(true);
    }
    await sql`DELETE FROM passages WHERE text = ${`${NS}-passage`}`;
    await sql`DELETE FROM sources WHERE title = ${`${NS}-source`}`;
  });

  itLive('remove_subscription deletes a source that still has content rows', async () => {
    if (!sql) throw new Error('Postgres required');
    const sourceId = randomUUID();
    const contentRowId = randomUUID();
    created.sources.push(sourceId);
    created.contents.push(contentRowId);
    await sql`
      INSERT INTO subscription_sources (id, source_type, identifier, name)
      VALUES (${sourceId}::uuid, 'github', ${`${NS}-src`}, ${NS})
    `;
    await sql`
      INSERT INTO subscription_content (id, source_id, content_id, title, url)
      VALUES (${contentRowId}::uuid, ${sourceId}::uuid, ${`${NS}-cid`}, ${NS}, 'https://example.com/mcp-repair')
    `;
    const result = (await executePostgresMcpTool('remove_subscription', {
      subscriptionId: sourceId,
    })) as { deleted: boolean };
    expect(result.deleted).toBe(true);
    const leftoverSource =
      await sql`SELECT count(*)::int AS n FROM subscription_sources WHERE id = ${sourceId}::uuid`;
    const leftoverContent =
      await sql`SELECT count(*)::int AS n FROM subscription_content WHERE source_id = ${sourceId}::uuid`;
    expect(Number(leftoverSource[0]?.n ?? -1)).toBe(0);
    expect(Number(leftoverContent[0]?.n ?? -1)).toBe(0);
  });

  itLive('regenerate_transcript fails closed for an unknown content id', async () => {
    await expect(
      executePostgresMcpTool('regenerate_transcript', {
        contentId: `missing-${NS}`,
      })
    ).rejects.toThrow(/NOT_FOUND: content does not exist/);
  });

  itLive('regenerate_transcript queues a job for a real content id', async () => {
    if (!sql) throw new Error('Postgres required');
    const sourceId = randomUUID();
    const contentRowId = randomUUID();
    const contentId = `${NS}-video`;
    created.sources.push(sourceId);
    created.contents.push(contentRowId);
    await sql`
      INSERT INTO subscription_sources (id, source_type, identifier, name)
      VALUES (${sourceId}::uuid, 'github', ${`${NS}-regen`}, ${NS})
    `;
    await sql`
      INSERT INTO subscription_content (id, source_id, content_id, title, url)
      VALUES (${contentRowId}::uuid, ${sourceId}::uuid, ${contentId}, ${NS}, 'https://example.com/mcp-repair-video')
    `;
    const result = (await executePostgresMcpTool('regenerate_transcript', {
      contentId,
    })) as { success: boolean; data?: { jobId?: string; created?: boolean } };
    expect(result.success).toBe(true);
    expect(result.data?.created).toBe(true);
    if (result.data?.jobId) created.jobs.push(result.data.jobId);
    const job = await sql`SELECT status FROM transcript_jobs WHERE content_id = ${contentId}`;
    expect(job[0]?.status).toBe('pending');
  });

  itLive('unshare_document revokes a public share on a real row', async () => {
    if (!sql) throw new Error('Postgres required');
    const documentId = randomUUID();
    created.documents.push(documentId);
    await sql`
      INSERT INTO documents (id, title, content, status, is_public, share_token)
      VALUES (${documentId}::uuid, ${`${NS}-doc`}, 'repair body', 'draft', true, ${`mcp-${NS}`})
    `;
    const result = (await executePostgresMcpTool('unshare_document', {
      documentId,
    })) as { documentId: string; isPublic: boolean };
    expect(result.documentId).toBe(documentId);
    expect(result.isPublic).toBe(false);
    const row =
      await sql`SELECT is_public AS pub, share_token AS tok FROM documents WHERE id = ${documentId}::uuid`;
    expect(row[0]?.pub).toBe(false);
    expect(row[0]?.tok).toBeNull();
  });
});
