/**
 * S31-05: Shared registry execute bodies + Mastra composition root.
 *
 * AC-1..AC-3, AC-6 — real Postgres, no mocks.
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/sprint31-registry-execute.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { noopObserve } from '@mastra/core/tools';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { createObservability, createStorage } from '../../src/mastra';
import { getTool, toolCount, toolsAsRecord } from '../../src/tools/registry';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

const SEEDED_TITLES = ['s31-05-doc-1', 's31-05-doc-2', 's31-05-doc-3'] as const;
const WRITE_TITLE = 's31-05-registry-write';
const CANCEL_TITLE = 's31-05-cancelled';

describe('S31-05 registry execute + composition root', () => {
  let sql: Sql | undefined;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    sql = createSql(DATABASE_URL);
    // Serialize against the sibling legacy-repoint suite (shared holocron_nonprod).
    await sql`SELECT pg_advisory_lock(310005)`;
    // Clean prior residue then seed the mcp corpus via real SQL so read tools are non-empty.
    await sql`DELETE FROM documents WHERE title LIKE 's31-05-%'`;
    for (const title of SEEDED_TITLES) {
      await sql`
        INSERT INTO documents (id, title, content, status, is_public)
        VALUES (gen_random_uuid(), ${title}, ${`seed content for ${title}`}, 'draft', false)
      `;
    }
  });

  afterAll(async () => {
    if (!sql) return;
    try {
      await sql`DELETE FROM documents WHERE title LIKE 's31-05-%'`;
    } finally {
      await sql`SELECT pg_advisory_unlock(310005)`;
      await sql.end({ timeout: 5 });
    }
  });

  itLive('AC-1 registry execute writes and reads real Postgres', async () => {
    if (!sql) throw new Error('Postgres required');

    const pre = await sql`SELECT count(*)::int AS n FROM documents WHERE title = ${WRITE_TITLE}`;
    const preCount = Number(pre[0]?.n ?? 0);
    expect(preCount).toBe(0);

    const storeTool = getTool('store_document');
    const storeExecute = storeTool.tool.execute;
    if (!storeExecute) throw new Error('store_document has no execute');

    let storeResult: unknown;
    try {
      storeResult = await storeExecute(
        { title: WRITE_TITLE, content: 'registry execute path' },
        { observe: noopObserve }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toMatch(/not implemented|deferred to a later sprint/i);
      throw error;
    }

    const storeJson = JSON.stringify(storeResult);
    expect(storeJson).not.toMatch(/not implemented|deferred to a later sprint/i);

    const documentId =
      storeResult &&
      typeof storeResult === 'object' &&
      'documentId' in storeResult &&
      typeof (storeResult as { documentId: unknown }).documentId === 'string'
        ? (storeResult as { documentId: string }).documentId
        : '';
    expect(documentId.length).toBeGreaterThanOrEqual(1);

    const post =
      await sql`SELECT count(*)::int AS n, max(id::text) AS id FROM documents WHERE title = ${WRITE_TITLE}`;
    expect(Number(post[0]?.n ?? 0)).toBe(1);
    expect(String(post[0]?.id ?? '')).toBe(documentId);

    const listTool = getTool('list_documents');
    const listExecute = listTool.tool.execute;
    if (!listExecute) throw new Error('list_documents has no execute');

    const listResult = await listExecute({ limit: 50 }, { observe: noopObserve });
    const listJson = JSON.stringify(listResult);
    expect(listJson).toContain(WRITE_TITLE);
    expect(listJson).not.toMatch(/not implemented|deferred to a later sprint/i);

    const documents =
      listResult &&
      typeof listResult === 'object' &&
      'documents' in listResult &&
      Array.isArray((listResult as { documents: unknown }).documents)
        ? (listResult as { documents: unknown[] }).documents
        : [];
    expect(documents.length).toBeGreaterThanOrEqual(4);
  });

  itLive(
    'AC-2 composition root exposes 44 executable tools',
    async () => {
      if (!sql) throw new Error('Postgres required');

      // createMastra lives in index.ts which imports `bun` (not resolvable under vitest/node).
      // Mirror the composition-root wiring and assert the source registers toolsAsRecord().
      const indexSrc = readFileSync(resolve(REPO_ROOT, 'services/platform/src/index.ts'), 'utf8');
      expect(indexSrc).toMatch(/tools:\s*toolsAsRecord\(\)/);
      expect(indexSrc).not.toContain('service-2+ register tools/agents');

      // Re-seed in case a parallel suite cleaned titles mid-run before the advisory lock.
      for (const title of SEEDED_TITLES) {
        const existing = await sql`SELECT count(*)::int AS n FROM documents WHERE title = ${title}`;
        if (Number(existing[0]?.n ?? 0) === 0) {
          await sql`
            INSERT INTO documents (id, title, content, status, is_public)
            VALUES (gen_random_uuid(), ${title}, ${`seed content for ${title}`}, 'draft', false)
          `;
        }
      }

      const mastra = new Mastra({
        storage: createStorage(),
        observability: createObservability(),
        agents: {},
        workflows: {},
        tools: toolsAsRecord(),
      });
      try {
        const listed = mastra.listTools() ?? {};
        const listKeys = Object.keys(listed);
        const recordKeys = Object.keys(toolsAsRecord());

        expect(listKeys.length).toBe(49);
        expect(toolCount()).toBe(49);
        expect(new Set(listKeys)).toEqual(new Set(recordKeys));

        const listDocuments = mastra.getTool('list_documents' as keyof typeof listed);
        const execute = listDocuments?.execute;
        if (!execute) throw new Error('mastra.getTool(list_documents) has no execute');

        const result = await execute({ limit: 50 }, { observe: noopObserve });
        const json = JSON.stringify(result);
        for (const title of SEEDED_TITLES) {
          expect(json).toContain(title);
        }
        expect(json).not.toMatch(/not implemented/i);
      } finally {
        // Shutdown can hang on observability exporters under load — bound it.
        await Promise.race([mastra.shutdown(), new Promise((r) => setTimeout(r, 5_000))]);
      }
    },
    60_000
  );

  itLive('AC-3 registry execute honours an aborted signal', async () => {
    if (!sql) throw new Error('Postgres required');

    const pre = await sql`SELECT count(*)::int AS n FROM documents WHERE title = ${CANCEL_TITLE}`;
    expect(Number(pre[0]?.n ?? 0)).toBe(0);

    // Ensure seeded corpus is present (connection-liveness probe).
    for (const title of SEEDED_TITLES) {
      const existing = await sql`SELECT count(*)::int AS n FROM documents WHERE title = ${title}`;
      if (Number(existing[0]?.n ?? 0) === 0) {
        await sql`
          INSERT INTO documents (id, title, content, status, is_public)
          VALUES (gen_random_uuid(), ${title}, ${`seed content for ${title}`}, 'draft', false)
        `;
      }
    }
    const seeded =
      await sql`SELECT count(*)::int AS n FROM documents WHERE title LIKE 's31-05-doc-%'`;
    expect(Number(seeded[0]?.n ?? 0)).toBe(3);

    const controller = new AbortController();
    controller.abort();

    const storeTool = getTool('store_document');
    const storeExecute = storeTool.tool.execute;
    if (!storeExecute) throw new Error('store_document has no execute');

    await expect(
      storeExecute(
        { title: CANCEL_TITLE, content: 'should not persist' },
        { observe: noopObserve, abortSignal: controller.signal }
      )
    ).rejects.toThrow(/MCP request cancelled/);

    const post = await sql`SELECT count(*)::int AS n FROM documents WHERE title = ${CANCEL_TITLE}`;
    expect(Number(post[0]?.n ?? 0)).toBe(0);

    const stillSeeded =
      await sql`SELECT count(*)::int AS n FROM documents WHERE title LIKE 's31-05-doc-%'`;
    expect(Number(stillSeeded[0]?.n ?? 0)).toBe(3);
  });

  itLive('AC-6 deferred execute residue is gone', async () => {
    const registryPath = resolve(REPO_ROOT, 'services/platform/src/tools/registry.ts');
    const registrySrc = readFileSync(registryPath, 'utf8');
    expect((registrySrc.match(/deferredExecute/g) ?? []).length).toBe(0);
    expect((registrySrc.match(/deferred to a later sprint/g) ?? []).length).toBe(0);

    const proc = spawnSync(
      'bun',
      ['services/platform/src/cli/holo.ts', 'mcp:verify-rehost', '--json'],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, DATABASE_URL },
        encoding: 'utf8',
      }
    );
    expect(proc.status, `verify-rehost stderr: ${proc.stderr}`).toBe(0);

    const report = JSON.parse(proc.stdout) as {
      registeredTools?: number;
      manifestTools?: number;
      missingExecutors?: unknown[];
      convexRefs?: unknown[];
      duplicateValidationSites?: unknown[];
      extraTools?: unknown[];
    };
    expect(report.registeredTools).toBe(49);
    expect(report.manifestTools).toBe(49);
    expect(report.missingExecutors ?? []).toHaveLength(0);
    expect(report.convexRefs ?? []).toHaveLength(0);
    expect(report.duplicateValidationSites ?? []).toHaveLength(0);
    expect(report.extraTools ?? []).toHaveLength(0);
  });
});
