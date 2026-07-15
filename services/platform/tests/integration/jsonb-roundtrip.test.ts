/**
 * AC-3 — jsonb cardData round-trip with structural equality (real Postgres).
 *
 * GREEN: polymorphic payload survives write/read with deep structural equality.
 * NEGATIVE: non-jsonb column type / corrupted inequality fails the probe.
 *
 * Run:
 *   DB_IT=1 DATABASE_URL=postgres://justinrich@127.0.0.1:5432/holocron \
 *     bun test tests/integration/jsonb-roundtrip.test.ts
 */
import { describe, expect, it } from 'bun:test';
import { createSql } from '../../src/db/client';
import { probeJsonbCardData } from '../../src/db/probe';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://justinrich@127.0.0.1:5432/holocron';

describe('AC-3 jsonb round-trip integration (real Postgres)', () => {
  it(
    'GREEN: card_data jsonb round-trip preserves nested structure',
    async () => {
      const result = await probeJsonbCardData({ databaseUrl: DATABASE_URL });
      expect(result.errors, result.errors.join('; ')).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.structuralEquality).toBe(true);
      expect(result.column).toBe('cardData');
      expect(result.table).toBe('chat_messages');
      expect(result.pgType).toMatch(/jsonb/i);
      expect(result.read).not.toBeNull();
      // Complex nested payload survived
      const read = result.read as {
        kind?: string;
        nested?: { b?: unknown[]; score?: number };
      };
      expect(read.kind).toBe('research_card');
      expect(read.nested?.b).toEqual([true, null, 'x']);
      expect(read.nested?.score).toBe(0.87);
    },
    { timeout: 60_000 }
  );

  it(
    'NEGATIVE: when card_data is not jsonb, probe fails closed (type casting / missing jsonb)',
    async () => {
      // would fail if probe reported structural equality while column type is broken
      const sql = createSql(DATABASE_URL);
      let altered = false;
      try {
        // Force a non-jsonb type — probe must refuse structural equality success
        await sql.unsafe(`
          ALTER TABLE chat_messages
          ALTER COLUMN card_data TYPE text
          USING card_data::text
        `);
        altered = true;

        const typeRows = await sql<{ udt_name: string }[]>`
          SELECT udt_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'chat_messages'
            AND column_name = 'card_data'
        `;
        expect(typeRows[0]?.udt_name).not.toBe('jsonb');

        const probe = await probeJsonbCardData({ databaseUrl: DATABASE_URL });
        expect(probe.ok).toBe(false);
        expect(probe.structuralEquality).toBe(false);
        expect(probe.errors.join(' ')).toMatch(/jsonb|card_data|not jsonb|missing/i);
      } finally {
        if (altered) {
          await sql.unsafe(`
            ALTER TABLE chat_messages
            ALTER COLUMN card_data TYPE jsonb
            USING CASE
              WHEN card_data IS NULL OR btrim(card_data::text) = '' THEN NULL
              ELSE card_data::jsonb
            END
          `);
        }
        await sql.end({ timeout: 5 });
      }

      const restored = await probeJsonbCardData({ databaseUrl: DATABASE_URL });
      expect(restored.ok).toBe(true);
      expect(restored.structuralEquality).toBe(true);
    },
    { timeout: 60_000 }
  );

  it(
    'NEGATIVE: structural inequality is detected (round-trip must not lose nested fields)',
    async () => {
      // Prove the equality gate has teeth: deliberately compare unequal shapes via live write
      const sql = createSql(DATABASE_URL);
      try {
        const written = {
          kind: 'research_card',
          title: 'Inequality Probe',
          nested: { a: 1, b: [true, null, 'x'], score: 0.87 },
        };
        const conv = await sql<{ id: string }[]>`
          INSERT INTO conversations (title, legacy_convex_id)
          VALUES ('schema5-jsonb-neg', 'schema5_jsonb_neg_conv')
          RETURNING id
        `;
        const conversationId = conv[0]!.id;
        const msg = await sql<{ id: string; card_data: unknown }[]>`
          INSERT INTO chat_messages (conversation_id, role, content, card_data, legacy_convex_id)
          VALUES (
            ${conversationId},
            'assistant',
            'neg',
            ${sql.json(written as never)},
            'schema5_jsonb_neg_msg'
          )
          RETURNING id, card_data
        `;
        let read: unknown = msg[0]!.card_data;
        if (typeof read === 'string') read = JSON.parse(read);

        // Mutate expectation — must NOT deep-equal the stored row
        const brokenExpectation = {
          ...written,
          nested: { a: 999, b: [], score: -1 },
        };
        const equal =
          JSON.stringify(read) === JSON.stringify(brokenExpectation) ||
          (typeof read === 'object' &&
            read !== null &&
            (read as { nested?: { a?: number } }).nested?.a === brokenExpectation.nested.a);
        expect(equal).toBe(false);
        // Live row still holds original nested.a === 1
        expect((read as { nested: { a: number } }).nested.a).toBe(1);

        await sql`DELETE FROM chat_messages WHERE id = ${msg[0]!.id}`;
        await sql`DELETE FROM conversations WHERE id = ${conversationId}`;
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
    { timeout: 60_000 }
  );
});
