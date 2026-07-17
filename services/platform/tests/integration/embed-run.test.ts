/**
 * search-4 AC-4 — RED: idempotent re-embed (empty embedRun).
 *
 * Seeds real Postgres passages with NULL embeddings in beforeAll.
 * Fails with ReferenceError: embedRun is not defined until search-2 lands.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - Test does not assert on the duplicate-count after re-run (trivially passes)
 * - Test mocks embedRun as a no-op returning undefined (false green)
 * - Test crashes at import without running the idempotency assertion
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts
 *
 * RED state: ReferenceError: embedRun is not defined
 * GREEN state (search-2): two embedRun() calls, row count stable, no duplicates
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client';
import { resolveDatabaseUrl } from '../../src/db/connection';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 300_000;
const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout: number = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/search-4');

const DOCUMENT_ID = 'doc_embed_run_001';
const CONTENT_HASH = 'search-4-embed-run-null-passages-v1';
const SEED_PASSAGE_COUNT = 3;

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

/**
 * Dynamically load embedRun() so collection does not crash on missing module.
 * RED: ReferenceError: embedRun is not defined
 */
async function loadEmbedRun(): Promise<(opts?: { databaseUrl?: string }) => Promise<unknown>> {
  const modPath = ['../../src/inference', 'embed-run'].join('/');
  try {
    const mod = (await import(modPath)) as {
      embedRun?: (opts?: { databaseUrl?: string }) => Promise<unknown>;
    };
    if (typeof mod.embedRun !== 'function') {
      throw new ReferenceError('embedRun is not defined');
    }
    return mod.embedRun.bind(mod);
  } catch (err) {
    if (
      err instanceof ReferenceError ||
      (err instanceof Error &&
        (/Cannot find|Failed to resolve|Cannot resolve|ERR_MODULE_NOT_FOUND/i.test(err.message) ||
          err.message.includes('embedRun is not defined')))
    ) {
      const refErr = new ReferenceError('embedRun is not defined');
      refErr.cause = err instanceof ReferenceError ? err.cause : err;
      throw refErr;
    }
    throw err;
  }
}

describe('search-4 AC-4: idempotent re-embed (RED)', () => {
  let sql: Sql | null = null;
  let sourceId: string | null = null;
  let passageIds: string[] = [];
  let seeded = false;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });

    // Owner/raw connection: holocron_app lacks DELETE on passages for re-seed.
    const databaseUrl = resolveDatabaseUrl({ preferHolocron: true });
    sql = createSql(databaseUrl);

    const sourceRows = await sql<{ id: string }[]>`
      INSERT INTO sources (source_kind, content_hash, title, document_id, metadata_json)
      VALUES (
        'document',
        ${CONTENT_HASH},
        'search-4 embed-run null-embedding seed',
        ${DOCUMENT_ID},
        ${sql.json({ purpose: 'search-4-embed-run', task: 'search-4' })}
      )
      ON CONFLICT (content_hash) DO UPDATE
        SET title = EXCLUDED.title,
            document_id = EXCLUDED.document_id
      RETURNING id::text AS id
    `;
    sourceId = sourceRows[0]?.id ?? null;
    expect(sourceId, 'embed-run seed source must insert').toBeTruthy();

    // Reset this fixture's passages so each RED run starts with NULL embeddings.
    await sql`
      DELETE FROM passages
      WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
    `;

    const texts = [
      'Passage 0: Qwen3 embedding document-mode vectors live on passages.',
      'Passage 1: Idempotent re-embed selects WHERE embedding IS NULL FOR UPDATE SKIP LOCKED.',
      'Passage 2: A second embedRun must not insert duplicate (documentId, ordinal) pairs.',
    ];
    passageIds = [];
    for (let ordinal = 0; ordinal < SEED_PASSAGE_COUNT; ordinal++) {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO passages (
          source_id, document_id, ordinal, text, situating_header, embedding, metadata_json
        )
        VALUES (
          ${sourceId},
          ${DOCUMENT_ID},
          ${ordinal},
          ${texts[ordinal]},
          ${`embed-run seed · ordinal ${ordinal}`},
          NULL,
          ${sql.json({ purpose: 'search-4-embed-run', ordinal })}
        )
        RETURNING id::text AS id
      `;
      const id = rows[0]?.id;
      expect(id, `passage ordinal ${ordinal} must insert`).toBeTruthy();
      if (!id) throw new Error(`passage ordinal ${ordinal} insert returned no id`);
      passageIds.push(id);
    }

    const nullCountRows = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM passages
      WHERE source_id = ${sourceId}
        AND document_id = ${DOCUMENT_ID}
        AND embedding IS NULL
    `;
    const nullCount = Number(nullCountRows[0]?.count ?? 0);
    expect(nullCount).toBe(SEED_PASSAGE_COUNT);
    seeded = true;

    writeArtifact('AC-4-seed-null-passages.json', {
      sourceId,
      documentId: DOCUMENT_ID,
      passageIds,
      nullEmbeddingCount: nullCount,
      seeded,
    });
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
      sql = null;
    }
  });

  itLive('re-embed adds no duplicates', async () => {
    expect(seeded, 'beforeAll must seed NULL-embedding passages').toBe(true);
    expect(passageIds.length).toBe(SEED_PASSAGE_COUNT);

    let caught: unknown;
    try {
      const embedRun = await loadEmbedRun();

      // First run fills NULL embeddings.
      await embedRun();

      if (!sql) throw new Error('sql client missing after seed');

      const afterFirst = await sql<{ count: string; nulls: string }[]>`
        SELECT
          count(*)::text AS count,
          count(*) FILTER (WHERE embedding IS NULL)::text AS nulls
        FROM passages
        WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
      `;
      const rowCountAfterFirst = Number(afterFirst[0]?.count ?? 0);
      const nullsAfterFirst = Number(afterFirst[0]?.nulls ?? -1);
      expect(nullsAfterFirst, 'after first embedRun all embeddings must be non-null').toBe(0);
      expect(rowCountAfterFirst).toBe(SEED_PASSAGE_COUNT);

      // Second run must be idempotent — no new rows, no re-insert duplicates.
      await embedRun();

      const afterSecond = await sql<{ count: string; nulls: string; dupes: string }[]>`
        SELECT
          count(*)::text AS count,
          count(*) FILTER (WHERE embedding IS NULL)::text AS nulls,
          (
            SELECT count(*)::text FROM (
              SELECT document_id, ordinal
              FROM passages
              WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
              GROUP BY document_id, ordinal
              HAVING count(*) > 1
            ) d
          ) AS dupes
        FROM passages
        WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
      `;
      const rowCountAfterSecond = Number(afterSecond[0]?.count ?? 0);
      const nullsAfterSecond = Number(afterSecond[0]?.nulls ?? -1);
      const duplicatePairs = Number(afterSecond[0]?.dupes ?? -1);

      expect(rowCountAfterSecond, 're-embed must not insert extra passage rows').toBe(
        SEED_PASSAGE_COUNT
      );
      expect(nullsAfterSecond).toBe(0);
      expect(duplicatePairs, 're-embed adds no duplicates').toBe(0);

      writeArtifact('AC-4-green-idempotent-re-embed.json', {
        rowCountAfterFirst,
        rowCountAfterSecond,
        nullsAfterFirst,
        nullsAfterSecond,
        duplicatePairs,
      });
    } catch (err) {
      caught = err;
      writeArtifact('AC-4-red-against-start.txt', {
        test: 're-embed adds no duplicates',
        error:
          caught instanceof Error ? { name: caught.name, message: caught.message } : String(caught),
        RED_state: true,
        must_observe: 'ReferenceError: embedRun is not defined',
        seeded,
        passageIds,
      });
      if (caught instanceof ReferenceError) {
        expect(caught.message).toMatch(/embedRun is not defined/);
        throw caught;
      }
      throw caught;
    }
  });
});
