/**
 * AC-5 — replication readiness: zero_pub excludes vectors/evidence; REPLICA IDENTITY set.
 *
 * GREEN: wal_level=logical, zero_pub present, passages excluded, no embedding published.
 * NEGATIVE: adding passages to zero_pub / wrong replica identity fails getReplStatus.
 *
 * Run:
 *   DB_IT=1 DATABASE_URL=postgres://justinrich@127.0.0.1:5432/holocron \
 *     bun test tests/integration/replication-ready.test.ts
 */
import { describe, expect, it } from 'bun:test';
import { createSql } from '../../src/db/client';
import { getReplStatus } from '../../src/db/repl-status';
import {
  ZERO_PUB_EXCLUDED_COLUMN,
  ZERO_PUB_EXCLUDED_TABLES,
  ZERO_PUB_NAME,
  ZERO_PUB_TABLE_NAMES,
} from '../../src/db/schema/zero-pub';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://justinrich@127.0.0.1:5432/holocron';

describe('AC-5 replication readiness integration (real Postgres)', () => {
  it(
    'GREEN: zero_pub correct — no passages/vectors; REPLICA IDENTITY DEFAULT; wal logical',
    async () => {
      const result = await getReplStatus({ databaseUrl: DATABASE_URL });
      expect(result.errors, result.errors.join('; ')).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.walLevel).toBe('logical');
      expect(result.walLevelOk).toBe(true);
      expect(result.publicationName).toBe(ZERO_PUB_NAME);
      expect(result.publicationExists).toBe(true);
      expect(result.publishedTables.length).toBeGreaterThan(0);
      expect(result.forbiddenPresent).toEqual([]);
      expect(result.embeddingColumnsPublished).toEqual([]);
      expect(result.missingExpected).toEqual([]);

      const names = result.publishedTables.map((t) => t.table);
      expect(names).not.toContain('passages');
      expect(names).not.toContain('sources');
      expect(names).not.toContain('claims');
      for (const excluded of ZERO_PUB_EXCLUDED_TABLES) {
        expect(names.includes(excluded)).toBe(false);
      }
      for (const expected of ZERO_PUB_TABLE_NAMES) {
        expect(names.includes(expected)).toBe(true);
      }
      for (const t of result.publishedTables) {
        expect(t.replicaIdentity).toBe('DEFAULT');
        expect(t.singleColumnUuidPk).toBe(true);
        expect(t.ok).toBe(true);
        if (t.publishedColumns) {
          expect(t.publishedColumns.includes(ZERO_PUB_EXCLUDED_COLUMN)).toBe(false);
        }
      }
    },
    { timeout: 90_000 }
  );

  it(
    'NEGATIVE: adding passages to zero_pub makes repl:status fail closed',
    async () => {
      // would fail if gate stayed green while forbidden evidence table is published
      const sql = createSql(DATABASE_URL);
      let added = false;
      try {
        // Confirm passages exists and is currently unpublished
        const exists = await sql<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'passages'
          ) AS exists
        `;
        expect(exists[0]?.exists).toBe(true);

        await sql.unsafe(`ALTER PUBLICATION ${ZERO_PUB_NAME} ADD TABLE passages`);
        added = true;

        const pub = await sql<{ tablename: string }[]>`
          SELECT tablename FROM pg_publication_tables
          WHERE pubname = ${ZERO_PUB_NAME} AND tablename = 'passages'
        `;
        expect(pub.length).toBe(1);

        const result = await getReplStatus({ databaseUrl: DATABASE_URL });
        expect(result.ok).toBe(false);
        expect(
          result.forbiddenPresent.includes('passages') ||
            result.errors.some((e) => /passages|forbidden|embedding/i.test(e))
        ).toBe(true);
      } finally {
        if (added) {
          // Postgres has no IF EXISTS for ALTER PUBLICATION ... DROP TABLE
          try {
            await sql.unsafe(`ALTER PUBLICATION ${ZERO_PUB_NAME} DROP TABLE passages`);
          } catch {
            // already removed
          }
        }
        await sql.end({ timeout: 5 });
      }

      const restored = await getReplStatus({ databaseUrl: DATABASE_URL });
      expect(restored.ok, restored.errors.join('; ')).toBe(true);
      expect(restored.forbiddenPresent).toEqual([]);
    },
    { timeout: 90_000 }
  );

  it(
    'NEGATIVE: REPLICA IDENTITY NOTHING on a published table fails repl:status',
    async () => {
      // would fail if missing REPLICA IDENTITY still passed the gate
      const sql = createSql(DATABASE_URL);
      let changed = false;
      try {
        await sql.unsafe('ALTER TABLE conversations REPLICA IDENTITY NOTHING');
        changed = true;

        const result = await getReplStatus({ databaseUrl: DATABASE_URL });
        expect(result.ok).toBe(false);
        const conv = result.publishedTables.find((t) => t.table === 'conversations');
        expect(conv).toBeDefined();
        expect(conv!.replicaIdentity).toBe('NOTHING');
        expect(conv!.ok).toBe(false);
        expect(result.errors.join(' ')).toMatch(/conversations|REPLICA IDENTITY/i);
      } finally {
        if (changed) {
          await sql.unsafe('ALTER TABLE conversations REPLICA IDENTITY DEFAULT');
        }
        await sql.end({ timeout: 5 });
      }

      const restored = await getReplStatus({ databaseUrl: DATABASE_URL });
      expect(restored.ok, restored.errors.join('; ')).toBe(true);
      const conv = restored.publishedTables.find((t) => t.table === 'conversations');
      expect(conv?.replicaIdentity).toBe('DEFAULT');
    },
    { timeout: 90_000 }
  );
});
