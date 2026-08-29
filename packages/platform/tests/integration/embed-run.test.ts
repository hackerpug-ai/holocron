/**
 * search-2 — idempotent resumable embedRun (WHERE embedding IS NULL ... SKIP LOCKED).
 *
 * Covers AC-1..AC-4 / TC-1..TC-6 against real Postgres + live fleet document-mode embed.
 *
 * RED (search-4 seed): ReferenceError: embedRun is not defined
 * GREEN (search-2): all NULL passages filled with 1024-dim vectors; re-run is no-op;
 *   resume leaves already-done rows untouched; mid-batch fleet error commits prior work.
 *
 * NEGATIVE_CONTROL (would fail if):
 * - embedRun is a no-op leaving embeddings NULL
 * - embedRun stores a hardcoded zero vector / wrong dimension
 * - second run INSERTs duplicates or re-embeds non-null rows
 * - mid-batch failure rolls back already-committed passages (all-or-nothing)
 * - EmbedRunError is swallowed / not thrown
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron \
 *     pnpm vitest run packages/platform/tests/integration/embed-run.test.ts
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
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/search-2');
const LEGACY_EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/search-4');

const DOCUMENT_ID = 'doc_embed_run_001';
const CONTENT_HASH = 'search-4-embed-run-null-passages-v1';
const SEED_PASSAGE_COUNT = 3;
const EXPECTED_DIM = 1024;

function writeArtifact(name: string, body: unknown): string {
  for (const dir of [EVIDENCE_DIR, LEGACY_EVIDENCE_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(path, payload, 'utf8');
  writeFileSync(resolve(LEGACY_EVIDENCE_DIR, name), payload, 'utf8');
  return path;
}

type EmbedRunFn = (opts?: {
  databaseUrl?: string;
  embedFn?: (text: string, mode: 'query' | 'document') => Promise<number[]>;
}) => Promise<{ processed: number; remainingNull: number }>;

type EmbedRunErrorCtor = new (
  message: string,
  opts: { passageId: string; completed: number; cause?: unknown }
) => Error & { code: string; passageId: string; completed: number; name: string };

/**
 * Dynamically load embedRun so collection does not crash on missing module.
 * RED: ReferenceError: embedRun is not defined
 */
async function loadEmbedRunModule(): Promise<{
  embedRun: EmbedRunFn;
  EmbedRunError: EmbedRunErrorCtor;
}> {
  const modPath = ['../../src/inference', 'embed-run'].join('/');
  try {
    const mod = (await import(modPath)) as {
      embedRun?: EmbedRunFn;
      EmbedRunError?: EmbedRunErrorCtor;
    };
    if (typeof mod.embedRun !== 'function') {
      throw new ReferenceError('embedRun is not defined');
    }
    if (typeof mod.EmbedRunError !== 'function') {
      throw new ReferenceError('EmbedRunError is not defined');
    }
    return {
      embedRun: mod.embedRun.bind(mod),
      EmbedRunError: mod.EmbedRunError,
    };
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

async function loadRealEmbed(): Promise<
  (text: string, mode: 'query' | 'document') => Promise<number[]>
> {
  const modPath = ['../../src/inference', 'embed'].join('/');
  const mod = (await import(modPath)) as {
    embed?: (text: string, mode: 'query' | 'document') => Promise<number[]>;
  };
  if (typeof mod.embed !== 'function') {
    throw new Error('embed() helper from search-1 is required for embed-run tests');
  }
  return mod.embed.bind(mod);
}

type PassageRow = {
  id: string;
  ordinal: number;
  embedding: string | null;
  dims: number | null;
};

async function fetchFixturePassages(sql: Sql, sourceId: string): Promise<PassageRow[]> {
  return sql<PassageRow[]>`
    SELECT
      id::text AS id,
      ordinal,
      CASE WHEN embedding IS NULL THEN NULL ELSE embedding::text END AS embedding,
      CASE WHEN embedding IS NULL THEN NULL ELSE vector_dims(embedding) END AS dims
    FROM passages
    WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
    ORDER BY ordinal
  `;
}

async function countFixture(
  sql: Sql,
  sourceId: string
): Promise<{ count: number; nulls: number; dim1024: number; dupes: number }> {
  const rows = await sql<{ count: string; nulls: string; dim1024: string; dupes: string }[]>`
    SELECT
      count(*)::text AS count,
      count(*) FILTER (WHERE embedding IS NULL)::text AS nulls,
      count(*) FILTER (
        WHERE embedding IS NOT NULL AND vector_dims(embedding) = ${EXPECTED_DIM}
      )::text AS dim1024,
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
  return {
    count: Number(rows[0]?.count ?? 0),
    nulls: Number(rows[0]?.nulls ?? -1),
    dim1024: Number(rows[0]?.dim1024 ?? -1),
    dupes: Number(rows[0]?.dupes ?? -1),
  };
}

async function seedNullPassages(sql: Sql): Promise<{ sourceId: string; passageIds: string[] }> {
  const sourceRows = await sql<{ id: string }[]>`
    INSERT INTO sources (source_kind, content_hash, title, document_id, metadata_json)
    VALUES (
      'document',
      ${CONTENT_HASH},
      'search-2 embed-run null-embedding seed',
      ${DOCUMENT_ID},
      ${sql.json({ purpose: 'search-2-embed-run', task: 'search-2' })}
    )
    ON CONFLICT (content_hash) DO UPDATE
      SET title = EXCLUDED.title,
          document_id = EXCLUDED.document_id
    RETURNING id::text AS id
  `;
  const sourceId = sourceRows[0]?.id;
  if (!sourceId) throw new Error('embed-run seed source must insert');

  await sql`
    DELETE FROM passages
    WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
  `;

  const texts = [
    'Passage 0: Qwen3 embedding document-mode vectors live on passages.',
    'Passage 1: Idempotent re-embed selects WHERE embedding IS NULL FOR UPDATE SKIP LOCKED.',
    'Passage 2: A second embedRun must not insert duplicate (documentId, ordinal) pairs.',
  ];
  const passageIds: string[] = [];
  for (let ordinal = 0; ordinal < SEED_PASSAGE_COUNT; ordinal++) {
    const passageText = texts[ordinal];
    if (passageText === undefined) {
      throw new Error(`missing seed text for ordinal ${ordinal}`);
    }
    const rows = await sql<{ id: string }[]>`
      INSERT INTO passages (
        source_id, document_id, ordinal, text, situating_header, embedding, metadata_json
      )
      VALUES (
        ${sourceId},
        ${DOCUMENT_ID},
        ${ordinal},
        ${passageText},
        ${`embed-run seed · ordinal ${ordinal}`},
        NULL,
        ${sql.json({ purpose: 'search-2-embed-run', ordinal })}
      )
      RETURNING id::text AS id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error(`passage ordinal ${ordinal} insert returned no id`);
    passageIds.push(id);
  }

  return { sourceId, passageIds };
}

describe('search-2: embedRun idempotent resumable re-embed', () => {
  let sql: Sql | null = null;
  let sourceId: string | null = null;
  let passageIds: string[] = [];
  let seeded = false;
  let databaseUrl = '';

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });

    // Owner/raw connection: holocron_app lacks DELETE on passages for re-seed.
    databaseUrl = resolveDatabaseUrl({ preferHolocron: true });
    sql = createSql(databaseUrl);

    const seed = await seedNullPassages(sql);
    sourceId = seed.sourceId;
    passageIds = seed.passageIds;

    const stats = await countFixture(sql, sourceId);
    expect(stats.nulls).toBe(SEED_PASSAGE_COUNT);
    expect(stats.count).toBe(SEED_PASSAGE_COUNT);
    seeded = true;

    writeArtifact('AC-seed-null-passages.json', {
      sourceId,
      documentId: DOCUMENT_ID,
      passageIds,
      nullEmbeddingCount: stats.nulls,
      seeded,
    });
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
      sql = null;
    }
  });

  itLive('AC-1/AC-2 TC-1..TC-3: fill NULL embeddings + idempotent second run', async () => {
    expect(seeded, 'beforeAll must seed NULL-embedding passages').toBe(true);
    expect(passageIds.length).toBe(SEED_PASSAGE_COUNT);
    if (!sql || !sourceId) throw new Error('sql client missing after seed');

    // Ensure clean NULL start for this combined AC-1/AC-2 case.
    await sql`
      UPDATE passages
      SET embedding = NULL
      WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
    `;

    const { embedRun } = await loadEmbedRunModule();

    // AC-1: first run fills all NULL embeddings with real 1024-dim fleet vectors.
    // Job is table-wide (WHERE embedding IS NULL) — other fixtures may also be filled.
    const first = await embedRun({ databaseUrl });
    expect(first.processed, 'must process at least the 3 fixture rows').toBeGreaterThanOrEqual(
      SEED_PASSAGE_COUNT
    );
    expect(first.remainingNull, 'global NULL embeddings must be 0 after full run').toBe(0);

    const afterFirst = await countFixture(sql, sourceId);
    expect(afterFirst.nulls, 'TC-1: fixture NULL embedding count must be 0').toBe(0);
    expect(afterFirst.dim1024, 'TC-2: every fixture embedding dims === 1024').toBe(
      SEED_PASSAGE_COUNT
    );
    expect(afterFirst.count).toBe(SEED_PASSAGE_COUNT);

    const rowsAfterFirst = await fetchFixturePassages(sql, sourceId);
    for (const row of rowsAfterFirst) {
      expect(row.embedding, `ordinal ${row.ordinal} embedding must be non-null`).toBeTruthy();
      expect(row.dims).toBe(EXPECTED_DIM);
    }

    writeArtifact('AC-1-green-fill-nulls.json', {
      first,
      afterFirst,
      dims: rowsAfterFirst.map((r) => ({ ordinal: r.ordinal, dims: r.dims })),
    });

    // AC-2: second run is idempotent — no new rows, no re-processing.
    const second = await embedRun({ databaseUrl });
    expect(second.processed, 'second run must process zero rows (all non-null)').toBe(0);
    expect(second.remainingNull).toBe(0);

    const afterSecond = await countFixture(sql, sourceId);
    expect(afterSecond.count, 'TC-3: row count unchanged on second run').toBe(SEED_PASSAGE_COUNT);
    expect(afterSecond.nulls).toBe(0);
    expect(afterSecond.dupes, 'no duplicate (documentId, ordinal) pairs').toBe(0);

    writeArtifact('AC-2-green-idempotent-rerun.json', {
      second,
      afterSecond,
    });
  });

  itLive('AC-3 TC-4: resume after interruption does not re-embed completed rows', async () => {
    expect(seeded).toBe(true);
    if (!sql || !sourceId) throw new Error('sql client missing');

    // Reset to NULL then embed only ordinal 0 (simulate interruption after 1 of 3).
    await sql`
      UPDATE passages
      SET embedding = NULL
      WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
    `;

    const realEmbed = await loadRealEmbed();
    const passages = await fetchFixturePassages(sql, sourceId);
    const ordinal0 = passages.find((p) => p.ordinal === 0);
    expect(ordinal0, 'ordinal 0 must exist').toBeTruthy();
    if (!ordinal0) throw new Error('ordinal 0 missing');

    const textRows = await sql<{ text: string }[]>`
      SELECT text FROM passages WHERE id = ${ordinal0.id}::uuid
    `;
    const text0 = textRows[0]?.text;
    if (!text0) throw new Error('ordinal 0 text missing');

    const vector0 = await realEmbed(text0, 'document');
    expect(vector0.length).toBe(EXPECTED_DIM);
    const vectorLiteral = `[${vector0.join(',')}]`;
    await sql`
      UPDATE passages
      SET embedding = ${vectorLiteral}::vector
      WHERE id = ${ordinal0.id}::uuid
    `;

    const beforeResume = await countFixture(sql, sourceId);
    expect(beforeResume.nulls).toBe(2);
    expect(beforeResume.count).toBe(SEED_PASSAGE_COUNT);

    const snapshot0 = await fetchFixturePassages(sql, sourceId);
    const emb0Before = snapshot0.find((p) => p.ordinal === 0)?.embedding;
    expect(emb0Before).toBeTruthy();

    const { embedRun } = await loadEmbedRunModule();
    const resume = await embedRun({ databaseUrl });
    expect(resume.processed).toBe(2);
    expect(resume.remainingNull).toBe(0);

    const afterResume = await countFixture(sql, sourceId);
    expect(afterResume.nulls).toBe(0);
    expect(afterResume.count, 'row count still 3').toBe(SEED_PASSAGE_COUNT);
    expect(afterResume.dupes, 'TC-4: zero duplicate (documentId, ordinal) pairs').toBe(0);

    const afterRows = await fetchFixturePassages(sql, sourceId);
    const emb0After = afterRows.find((p) => p.ordinal === 0)?.embedding;
    expect(emb0After, 'ordinal 0 embedding unchanged').toBe(emb0Before);
    for (const row of afterRows) {
      expect(row.dims).toBe(EXPECTED_DIM);
    }

    writeArtifact('AC-3-green-resume.json', {
      resume,
      afterResume,
      ordinal0Unchanged: emb0After === emb0Before,
    });
  });

  itLive(
    'AC-4 TC-5/TC-6: mid-batch fleet error commits completed + throws EmbedRunError',
    async () => {
      expect(seeded).toBe(true);
      if (!sql || !sourceId) throw new Error('sql client missing');

      await sql`
      UPDATE passages
      SET embedding = NULL
      WHERE source_id = ${sourceId} AND document_id = ${DOCUMENT_ID}
    `;

      const realEmbed = await loadRealEmbed();
      let callCount = 0;
      const flakyEmbed = async (text: string, mode: 'query' | 'document') => {
        callCount += 1;
        if (callCount === 1) {
          // Real fleet document-mode embed for passage 0 — must commit before failure.
          return realEmbed(text, mode);
        }
        // Simulate fleet 500 on the next passage.
        throw new Error('fleet embed endpoint returned 500 (simulated mid-batch failure)');
      };

      const { embedRun, EmbedRunError } = await loadEmbedRunModule();

      let thrown: unknown;
      try {
        await embedRun({ databaseUrl, embedFn: flakyEmbed });
      } catch (err) {
        thrown = err;
      }

      expect(thrown, 'TC-5: must throw EmbedRunError').toBeInstanceOf(EmbedRunError);
      const err = thrown as InstanceType<EmbedRunErrorCtor>;
      expect(err.name).toBe('EmbedRunError');
      expect(err.code).toBe('EMBED_RUN_ERROR');
      expect(err.completed, 'one passage completed before failure').toBe(1);
      expect(err.passageId, 'failed passage id must be set').toBeTruthy();

      const afterFail = await countFixture(sql, sourceId);
      expect(afterFail.count).toBe(SEED_PASSAGE_COUNT);
      // TC-6: passage embedded before failure carries non-null embedding.
      expect(afterFail.nulls, 'exactly 2 remain NULL for resume').toBe(2);
      expect(afterFail.dim1024, 'exactly 1 committed 1024-dim vector').toBe(1);

      const rows = await fetchFixturePassages(sql, sourceId);
      const byOrdinal = new Map(rows.map((r) => [r.ordinal, r]));
      expect(byOrdinal.get(0)?.embedding, 'ordinal 0 committed (NOT NULL)').toBeTruthy();
      expect(byOrdinal.get(0)?.dims).toBe(EXPECTED_DIM);
      expect(byOrdinal.get(1)?.embedding, 'ordinal 1 still NULL').toBeNull();
      expect(byOrdinal.get(2)?.embedding, 'ordinal 2 still NULL for resume').toBeNull();

      // Resume after fleet recovery must finish the remaining two without duplicates.
      const resume = await embedRun({ databaseUrl });
      expect(resume.processed).toBe(2);
      expect(resume.remainingNull).toBe(0);
      const finalStats = await countFixture(sql, sourceId);
      expect(finalStats.nulls).toBe(0);
      expect(finalStats.dim1024).toBe(SEED_PASSAGE_COUNT);
      expect(finalStats.dupes).toBe(0);

      writeArtifact('AC-4-green-mid-batch-error.json', {
        error: {
          name: err.name,
          code: err.code,
          passageId: err.passageId,
          completed: err.completed,
          message: err.message,
        },
        afterFail,
        resume,
        finalStats,
      });
    }
  );
});
