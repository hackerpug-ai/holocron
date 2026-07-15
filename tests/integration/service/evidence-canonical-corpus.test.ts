/**
 * AC-4 / TC-4 (T-PLAT-004, T-DATA-022): canonical corpus has exactly one sources
 * table and one passages table; passages.source_id FK references sources.
 *
 * NEGATIVE CONTROL (would fail if):
 * - duplicate passages tables (shadow corpus split)
 * - sources/passages missing
 * - passages.source_id FK missing
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-canonical-corpus.test.ts
 */
import { beforeAll, describe, expect } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  ensureMigrated,
  itLive,
  writeEvidenceArtifact,
} from './evidence-harness';

describe('AC-4: canonical corpus shape (one sources + one passages + FK)', () => {
  beforeAll(() => {
    if (!process.env.PLATFORM_IT) return;
    ensureMigrated();
  });

  itLive(
    'information_schema: one sources, one passages, FK passages.source_id → sources',
    async () => {
      const { getCanonicalCorpusShape } = await import(
        '../../../services/platform/src/db/evidence/index'
      );
      const shape = await getCanonicalCorpusShape({ databaseUrl: DEFAULT_DATABASE_URL });

      const { createSql } = await import('../../../services/platform/src/db/client');
      const sql = createSql(DEFAULT_DATABASE_URL);
      try {
        // Referenced table via constraint_column_usage
        const fkRefs = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema = ccu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'passages'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'source_id'
          AND ccu.table_name = 'sources'
      `;

        // RED-ish: prove we are not looking at a split corpus (duplicate table names)
        const allCorpus = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND (
            table_name IN ('sources', 'passages')
            OR table_name LIKE '%passages%'
            OR table_name LIKE '%sources%'
          )
        ORDER BY table_name
      `;
        writeEvidenceArtifact('AC-4-red-against-start.txt', {
          note: 'would fail if duplicate corpus tables present',
          corpus_like_tables: allCorpus.map((r) => r.table_name),
        });

        const green = {
          must_observe: {
            "information_schema.tables COUNT for name='sources'": shape.sourcesTableCount,
            "information_schema.tables COUNT for name='passages'": shape.passagesTableCount,
            'passages FOREIGN KEY COUNT on source_id': shape.passagesSourceFkCount,
            "FK references COUNT WHERE referenced table = 'sources'": Number(fkRefs[0]?.count ?? 0),
            passagesSourceIdColumn: shape.passagesSourceIdColumn,
            passagesSourceIdNotNull: shape.passagesSourceIdNotNull,
          },
        };
        writeEvidenceArtifact('AC-4-green.txt', green);

        expect(shape.sourcesTableCount).toBe(1);
        expect(shape.passagesTableCount).toBe(1);
        expect(shape.passagesSourceIdColumn).toBe(true);
        expect(shape.passagesSourceIdNotNull).toBe(true);
        expect(shape.passagesSourceFkCount).toBe(1);
        expect(Number(fkRefs[0]?.count ?? 0)).toBe(1);
        expect(allCorpus.filter((t) => t.table_name === 'passages')).toHaveLength(1);
        expect(allCorpus.filter((t) => t.table_name === 'sources')).toHaveLength(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
  );
});
